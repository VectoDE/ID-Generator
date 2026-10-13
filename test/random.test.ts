// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it, vi } from 'vitest';
import { IdGeneratorError } from '../src/errors.js';
import { parseAlphabet, pooledRandomBytes, randomBytes, randomFromCharacters, randomString } from '../src/random.js';

describe('randomBytes', () => {
  it('returns the requested number of bytes, also beyond the 64 KiB Web Crypto limit', () => {
    expect(randomBytes(0)).toHaveLength(0);
    expect(randomBytes(16)).toHaveLength(16);
    const large = randomBytes(70_000);
    expect(large).toHaveLength(70_000);
    // The tail is filled too, not left at zero.
    expect(large.subarray(65_536).some((byte) => byte !== 0)).toBe(true);
  });

  it('rejects negative or fractional lengths', () => {
    expect(() => randomBytes(-1)).toThrow(/integer/);
    expect(() => randomBytes(1.5)).toThrow(/integer/);
  });

  it('fails clearly without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => randomBytes(4)).toThrow(IdGeneratorError);
    try {
      randomBytes(4);
    } catch (error) {
      expect((error as IdGeneratorError).code).toBe('CRYPTO_UNAVAILABLE');
    }
  });
});

describe('pooledRandomBytes', () => {
  it('never hands out the same bytes twice, also across refills', () => {
    const slices = Array.from({ length: 600 }, () => pooledRandomBytes(16));
    const seen = new Set(slices.map((slice) => slice.join(',')));
    expect(seen.size).toBe(600);
    // Changing one slice leaves the others alone.
    const [first, second] = slices;
    const before = second!.join(',');
    first!.fill(0);
    expect(second!.join(',')).toBe(before);
  });

  it('serves large requests directly', () => {
    expect(pooledRandomBytes(1000)).toHaveLength(1000);
    expect(pooledRandomBytes(0)).toHaveLength(0);
  });
});

describe('alphabets', () => {
  it('accepts 2 to 256 distinct characters', () => {
    expect(parseAlphabet('ab')).toEqual(['a', 'b']);
    expect(() => parseAlphabet('a')).toThrow(/2 to 256/);
    expect(() => parseAlphabet('abca')).toThrow(/repeat/);
    const tooLong = Array.from({ length: 257 }, (_, index) => String.fromCodePoint(0x4e00 + index)).join('');
    expect(() => parseAlphabet(tooLong)).toThrow(/2 to 256/);
  });

  it('counts characters, not UTF-16 units', () => {
    const value = randomString('😀😎', 5);
    expect(Array.from(value)).toHaveLength(5);
  });
});

describe('randomFromCharacters', () => {
  it('only uses the given characters and returns the exact size', () => {
    const value = randomString('xyz', 500);
    expect(value).toMatch(/^[xyz]{500}$/);
    expect(randomFromCharacters(['a', 'b'], 0)).toBe('');
  });

  it('spreads characters evenly (no modulo bias)', () => {
    // 10 characters do not divide 256; a modulo would favour the first six.
    const counts = new Map<string, number>();
    for (const character of randomString('0123456789', 60_000)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      // Expected 6000 each; ±600 is about eight standard deviations.
      expect(count).toBeGreaterThan(5_400);
      expect(count).toBeLessThan(6_600);
    }
  });
});
