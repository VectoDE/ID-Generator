import { describe, expect, it, vi } from 'vitest';
import { randomFromCharacters } from '../src/random.js';
import { CROCKFORD_BASE32, createUlid, isUlid, ulid, ulidTimestamp } from '../src/ulid.js';

vi.mock('../src/random.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/random.js')>();
  return { ...actual, randomFromCharacters: vi.fn(actual.randomFromCharacters) };
});

const FORMAT = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

describe('ulid', () => {
  it('has 26 Crockford Base32 characters and the creation time', () => {
    const id = createUlid({ now: () => Date.UTC(2026, 9, 12) })();
    expect(id).toMatch(FORMAT);
    expect(ulidTimestamp(id).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(ulid()).toMatch(FORMAT);
  });

  it('counts the random part up within one millisecond', () => {
    const generate = createUlid({ now: () => 1_000 });
    const ids = Array.from({ length: 1000 }, () => generate());
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
    expect(new Set(ids).size).toBe(1000);
    expect(ids.every((id) => id.startsWith(ids[0]!.slice(0, 10)))).toBe(true);
  });

  it('keeps the last time when the clock goes back', () => {
    const times = [5_000, 4_000];
    const generate = createUlid({ now: () => times.shift() ?? 6_000 });
    const [first, second] = [generate(), generate()];
    expect(second > first).toBe(true);
    expect(ulidTimestamp(second).getTime()).toBe(5_000);
  });

  it('draws fresh randomness when monotonic is off or a time is given', () => {
    const generate = createUlid({ now: () => 1_000, monotonic: false });
    expect(generate().slice(10)).not.toBe(generate().slice(10));
    const monotonic = createUlid();
    expect(ulidTimestamp(monotonic(123)).getTime()).toBe(123);
  });

  it('carries over and fails only when the random part is exhausted', () => {
    const generate = createUlid({ now: () => 1_000 });
    vi.mocked(randomFromCharacters).mockReturnValueOnce('ZZZZZZZZZZZZZZZY');
    const first = generate();
    expect(first.slice(10)).toBe('ZZZZZZZZZZZZZZZY');
    expect(generate().slice(10)).toBe('ZZZZZZZZZZZZZZZZ');
    expect(() => generate()).toThrow(/random part/);
  });

  it('increments with carry', () => {
    const generate = createUlid({ now: () => 2_000 });
    vi.mocked(randomFromCharacters).mockReturnValueOnce('000000000000000Z');
    generate();
    expect(generate().slice(10)).toBe('0000000000000010');
  });

  it('recovers after a broken clock reading', () => {
    const times = [-1, Number.NaN, 7_000];
    const generate = createUlid({ now: () => times.shift() ?? 7_000 });
    expect(() => generate()).toThrow(/ULID time/);
    expect(() => generate()).toThrow(/ULID time/);
    expect(ulidTimestamp(generate()).getTime()).toBe(7_000);
  });

  it('rejects times outside 48 bits', () => {
    expect(() => ulid(-1)).toThrow(/ULID time/);
    expect(() => ulid(2 ** 48)).toThrow(/ULID time/);
  });
});

describe('ULID helpers', () => {
  it('validates case-insensitively', () => {
    const id = ulid();
    expect(isUlid(id)).toBe(true);
    expect(isUlid(id.toLowerCase())).toBe(true);
    expect(ulidTimestamp(id.toLowerCase()).getTime()).toBe(ulidTimestamp(id).getTime());
    expect(isUlid('8ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false);
    expect(isUlid(null)).toBe(false);
    expect(() => ulidTimestamp('nope')).toThrow(/Not a ULID/);
    expect(CROCKFORD_BASE32).toHaveLength(32);
  });
});
