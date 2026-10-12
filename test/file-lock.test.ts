// Races between processes sharing a FileSequenceStore, replayed by hooking into the file system calls.
import * as fs from 'node:fs/promises';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSequenceStore } from '../src/stores/file.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), readFile: vi.fn(actual.readFile) };
});

const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let directory: string;
let path: string;
let lock: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'id-generator-lock-'));
  path = join(directory, 'state.json');
  lock = `${path}.lock`;
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const makeStale = async (content: string) => {
  await writeFile(lock, content);
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
};

describe('FileSequenceStore lock races', () => {
  it('refuses to write after losing the lock and keeps the counters', async () => {
    const store = new FileSequenceStore({ path });
    expect(await store.next('a')).toBe(1);
    let lockReads = 0;
    vi.mocked(fs.readFile).mockImplementation(async (file, options) => {
      // The first lock read is the ownership check right before writing.
      if (file === lock && ++lockReads === 1) {
        return 'another-process';
      }
      return actual.readFile(file, options as never);
    });
    await expect(store.next('a')).rejects.toMatchObject({ code: 'STORE_LOCKED' });
    expect(JSON.parse(await actual.readFile(path, 'utf8'))).toEqual({ version: 1, counters: { a: 1 } });
    expect(await readdir(directory)).toEqual(['state.json']);
  });

  it('puts back a fresh lock that another waiter created in the meantime', async () => {
    await makeStale('crashed');
    vi.mocked(fs.rename).mockImplementationOnce(async (from, to) => {
      // Another waiter removed the stale lock and took a fresh one just before this rename.
      await actual.writeFile(lock, 'fresh-owner');
      return actual.rename(from, to);
    });
    const store = new FileSequenceStore({ path, lockTimeoutMs: 80 });
    await expect(store.next('a')).rejects.toMatchObject({ code: 'STORE_LOCKED' });
    expect(await readFile(lock, 'utf8')).toBe('fresh-owner');
    expect((await readdir(directory)).filter((name) => name.endsWith('.stale'))).toEqual([]);
  });

  it('leaves a newer lock alone when the moved one cannot go back', async () => {
    await makeStale('crashed');
    vi.mocked(fs.rename).mockImplementationOnce(async (from, to) => {
      await actual.writeFile(lock, 'fresh-owner');
      await actual.rename(from, to);
      // A third process takes the free lock before the fresh one is put back.
      await actual.writeFile(lock, 'third-owner');
    });
    const store = new FileSequenceStore({ path, lockTimeoutMs: 80 });
    await expect(store.next('a')).rejects.toMatchObject({ code: 'STORE_LOCKED' });
    expect(await readFile(lock, 'utf8')).toBe('third-owner');
    expect((await readdir(directory)).filter((name) => name.endsWith('.stale'))).toEqual([]);
  });

  it('tries again when the stale lock disappears before it is moved', async () => {
    await makeStale('crashed');
    vi.mocked(fs.rename).mockImplementationOnce(async (from) => {
      await actual.rm(from);
      throw Object.assign(new Error('gone'), { code: 'ENOENT' });
    });
    expect(await new FileSequenceStore({ path }).next('a')).toBe(1);
  });

  it('retries a rename that Windows refuses for a moment', async () => {
    const store = new FileSequenceStore({ path });
    vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EPERM' }));
    expect(await store.next('a')).toBe(1);
  });

  it('gives up after repeated rename failures and cleans up', async () => {
    const store = new FileSequenceStore({ path });
    vi.mocked(fs.rename).mockRejectedValue(Object.assign(new Error('busy'), { code: 'EBUSY' }));
    await expect(store.next('a')).rejects.toMatchObject({ code: 'EBUSY' });
    expect(await readdir(directory)).toEqual([]);
  });
});
