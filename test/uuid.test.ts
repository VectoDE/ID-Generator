import { describe, expect, it, vi } from 'vitest';
import { MAX_UUID, NIL_UUID, createUuidV7, isUuid, uuidVersion, uuidv4, uuidv7, uuidv7Timestamp } from '../src/uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv4', () => {
  it('produces version 4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, uuidv4));
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(id).toMatch(V4);
    }
  });

  it('builds them from random bytes when crypto.randomUUID is missing', () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });
    expect(uuidv4()).toMatch(V4);
  });
});

describe('uuidv7', () => {
  it('stores the creation time', () => {
    const generate = createUuidV7({ now: () => Date.UTC(2026, 9, 12, 8, 30) });
    const id = generate();
    expect(id).toMatch(V7);
    expect(uuidv7Timestamp(id).toISOString()).toBe('2026-10-12T08:30:00.000Z');
    expect(uuidv7()).toMatch(V7);
  });

  it('keeps creation order within one millisecond', () => {
    const generate = createUuidV7({ now: () => 1_700_000_000_000 });
    const ids = Array.from({ length: 5000 }, generate);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
    expect(new Set(ids).size).toBe(5000);
  });

  it('stays ordered when the clock goes back', () => {
    const times = [2_000, 1_000, 1_500];
    const generate = createUuidV7({ now: () => times.shift() ?? 3_000 });
    const ids = [generate(), generate(), generate(), generate()];
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
    expect(uuidv7Timestamp(ids[1]!).getTime()).toBe(2_000);
  });

  it('borrows the next millisecond when the 12-bit counter runs out', () => {
    const generate = createUuidV7({ now: () => 5_000 });
    const ids = Array.from({ length: 4097 }, generate);
    expect(uuidv7Timestamp(ids.at(-1)!).getTime()).toBe(5_001);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it('rejects clocks outside the 48-bit range', () => {
    expect(() => createUuidV7({ now: () => -1 })()).toThrow(/clock/);
    expect(() => createUuidV7({ now: () => 2 ** 48 })()).toThrow(/clock/);
    expect(() => createUuidV7({ now: () => Number.NaN })()).toThrow(/clock/);
  });
});

describe('UUID helpers', () => {
  it('recognises versions', () => {
    const v4 = uuidv4();
    const v7 = uuidv7();
    expect(isUuid(v4)).toBe(true);
    expect(isUuid(v4.toUpperCase())).toBe(true);
    expect(isUuid(v4, 4)).toBe(true);
    expect(isUuid(v4, 7)).toBe(false);
    expect(isUuid(v7, 7)).toBe(true);
    expect(uuidVersion(v7)).toBe(7);
    expect(uuidVersion('nope')).toBeUndefined();
  });

  it('rejects malformed values', () => {
    expect(isUuid(42)).toBe(false);
    expect(isUuid(NIL_UUID)).toBe(false);
    expect(isUuid(MAX_UUID)).toBe(false);
    expect(isUuid('01234567-89ab-4def-0123-456789abcdef')).toBe(false);
    expect(isUuid(`${uuidv4()}x`)).toBe(false);
    expect(() => uuidv7Timestamp(uuidv4())).toThrow(/UUID v7/);
  });
});
