import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IdGeneratorError } from '../src/errors.js';
import { createPatternGenerator } from '../src/pattern/generator.js';
import { FileSequenceStore } from '../src/stores/file.js';
import { MemorySequenceStore } from '../src/stores/memory.js';

describe('MemorySequenceStore', () => {
  it('counts per scope from the start value', () => {
    const store = new MemorySequenceStore({ start: 10 });
    expect(store.peek('a')).toBe(10);
    expect(store.next('a')).toBe(10);
    expect(store.next('a')).toBe(11);
    expect(store.next('b')).toBe(10);
    expect(store.snapshot()).toEqual({ a: 11, b: 10 });
    store.reset('a');
    expect(store.next('a')).toBe(10);
    store.reset();
    expect(store.snapshot()).toEqual({});
  });

  it('handles scope names like __proto__ as plain keys', () => {
    const store = new MemorySequenceStore();
    expect(store.next('__proto__')).toBe(1);
    expect(store.next('constructor')).toBe(1);
    expect(Object.keys(store.snapshot())).toEqual(['__proto__', 'constructor']);
  });

  it('stops at Number.MAX_SAFE_INTEGER', () => {
    const store = new MemorySequenceStore({ start: Number.MAX_SAFE_INTEGER });
    expect(store.next('a')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => store.next('a')).toThrow(/MAX_SAFE_INTEGER/);
    expect(() => new MemorySequenceStore({ start: -1 })).toThrow(/start/);
  });
});

describe('FileSequenceStore', () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'id-generator-'));
    path = join(directory, 'nested', 'state.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the file and continues where it left off', async () => {
    const store = new FileSequenceStore({ path });
    expect(await store.peek('a')).toBe(1);
    expect(await store.next('a')).toBe(1);
    expect(await store.next('a')).toBe(2);
    expect(await new FileSequenceStore({ path }).next('a')).toBe(3);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ version: 1, counters: { a: 3 } });
    expect(await store.snapshot()).toEqual({ a: 3 });
  });

  it('resets one scope or all', async () => {
    const store = new FileSequenceStore({ path, start: 0 });
    await store.next('a');
    await store.next('b');
    await store.reset('a');
    expect(await store.snapshot()).toEqual({ b: 0 });
    await store.reset();
    expect(await store.snapshot()).toEqual({});
  });

  it('gives every caller a unique number, also across instances', async () => {
    const stores = Array.from({ length: 4 }, () => new FileSequenceStore({ path }));
    const numbers = await Promise.all(Array.from({ length: 60 }, (_, index) => stores[index % 4]!.next('shared')));
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, index) => index + 1));
    // No temporary or lock files are left behind.
    expect(await readdir(join(directory, 'nested'))).toEqual(['state.json']);
  });

  it('stores __proto__ as an ordinary scope', async () => {
    const store = new FileSequenceStore({ path });
    await store.next('__proto__');
    await store.next('__proto__');
    expect(await new FileSequenceStore({ path }).snapshot()).toEqual(JSON.parse('{"__proto__":2}'));
  });

  it('removes a stale lock left by a crashed process', async () => {
    const store = new FileSequenceStore({ path, staleLockMs: 100 });
    await store.next('a');
    await writeFile(`${path}.lock`, '999999');
    const old = new Date(Date.now() - 60_000);
    await utimes(`${path}.lock`, old, old);
    expect(await store.next('a')).toBe(2);
  });

  it('times out while another process holds the lock', async () => {
    const store = new FileSequenceStore({ path, lockTimeoutMs: 60 });
    await store.next('a');
    await writeFile(`${path}.lock`, '1');
    const error = await store.next('a').catch((caught: unknown) => caught as IdGeneratorError);
    expect(error).toMatchObject({ code: 'STORE_LOCKED' });
    // The failed call does not block the next one.
    await rm(`${path}.lock`);
    expect(await store.next('a')).toBe(2);
  });

  it('refuses corrupt files instead of starting over', async () => {
    const store = new FileSequenceStore({ path });
    await store.next('a');
    for (const content of ['not json', '{"version":2,"counters":{}}', '{"version":1,"counters":{"a":-1}}', 'null']) {
      await writeFile(path, content);
      await expect(store.next('a')).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
      await expect(store.peek('a')).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    }
  });

  it('passes on unexpected file system errors', async () => {
    // A directory where the file should be.
    const store = new FileSequenceStore({ path: directory });
    await expect(store.peek('a')).rejects.toMatchObject({ code: expect.stringMatching(/EISDIR|EPERM|EACCES/) });
    await expect(store.next('a')).rejects.toBeDefined();
    expect(await readdir(directory)).toEqual([]);
  });

  it('stops at Number.MAX_SAFE_INTEGER', async () => {
    const store = new FileSequenceStore({ path, start: Number.MAX_SAFE_INTEGER });
    await store.next('a');
    await expect(store.next('a')).rejects.toMatchObject({ code: 'SEQUENCE_OVERFLOW' });
  });

  it('validates its options', () => {
    expect(() => new FileSequenceStore({ path: '' })).toThrow(/file path/);
    expect(() => new FileSequenceStore(undefined as never)).toThrow(/file path/);
    expect(() => new FileSequenceStore({ path, lockTimeoutMs: -1 })).toThrow(/lockTimeoutMs/);
    expect(() => new FileSequenceStore({ path, staleLockMs: 1 })).toThrow(/staleLockMs/);
  });

  it('works as the store of a pattern generator', async () => {
    const generator = createPatternGenerator({ pattern: 'T-{seq:3}', store: new FileSequenceStore({ path }) });
    expect(await generator.generateMany(2)).toEqual(['T-001', 'T-002']);
    const again = createPatternGenerator({ pattern: 'T-{seq:3}', store: new FileSequenceStore({ path }) });
    expect(await again.preview()).toMatchObject({ id: 'T-003' });
    expect(await again.generate()).toBe('T-003');
  });
});
