// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from 'vitest';
import { alphabets, collisionProbability, customAlphabet, nanoid } from '../src/nanoid.js';

describe('nanoid', () => {
  it('makes 21 URL-safe characters by default', () => {
    expect(nanoid()).toMatch(/^[\w-]{21}$/);
    expect(nanoid(8)).toHaveLength(8);
    expect(new Set(Array.from({ length: 1000 }, () => nanoid())).size).toBe(1000);
  });

  it('ships alphabets without duplicates', () => {
    for (const alphabet of Object.values(alphabets)) {
      expect(new Set(alphabet).size).toBe(alphabet.length);
    }
    expect(alphabets.urlSafe).toHaveLength(64);
    expect(alphabets.readable).not.toMatch(/[01258BILOSUVZ]/);
  });
});

describe('customAlphabet', () => {
  it('uses the given characters and default size', () => {
    const make = customAlphabet(alphabets.readable, 10);
    expect(make()).toMatch(/^[34679ACDEFGHJKMNPQRTWXY]{10}$/);
    expect(make(4)).toHaveLength(4);
  });

  it('rejects bad alphabets and sizes', () => {
    expect(() => customAlphabet('a')).toThrow(/2 to 256/);
    expect(() => customAlphabet('ab', 0)).toThrow(/size/);
  });
});

describe('collisionProbability', () => {
  it('follows the birthday bound', () => {
    // 2 IDs from a 2-character space of size 1: 1/2.
    expect(collisionProbability({ alphabetSize: 2, size: 1, count: 2 })).toBeCloseTo(1 - Math.exp(-0.5), 10);
    expect(collisionProbability({ alphabetSize: 10, size: 4, count: 1 })).toBe(0);
    expect(collisionProbability({ alphabetSize: 10, size: 4, count: 0 })).toBe(0);
  });

  it('stays accurate for tiny and huge spaces', () => {
    const nano = collisionProbability({ alphabetSize: 64, size: 21, count: 1e9 });
    expect(nano).toBeGreaterThan(0);
    expect(nano).toBeLessThan(1e-18);
    expect(collisionProbability({ alphabetSize: 10, size: 2, count: 1e6 })).toBe(1);
  });

  it('validates its input', () => {
    expect(() => collisionProbability({ alphabetSize: 1, size: 4, count: 2 })).toThrow(/alphabetSize/);
    expect(() => collisionProbability({ alphabetSize: 10, size: 0, count: 2 })).toThrow(/size/);
    expect(() => collisionProbability({ alphabetSize: 10, size: 4, count: -1 })).toThrow(/count/);
    expect(() => collisionProbability({ alphabetSize: 10, size: 4, count: Number.NaN })).toThrow(/count/);
  });
});
