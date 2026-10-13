// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { ConfigurationError, assertInteger } from './errors.js';
import { parseAlphabet, randomFromCharacters } from './random.js';

/** Ready-made alphabets for {@link nanoid} and {@link customAlphabet}. */
export const alphabets = {
  /** URL-safe, 64 characters (same set as NanoID). */
  urlSafe: 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict',
  numbers: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  alphanumeric: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  /** Upper case and digits without characters that are easy to confuse (0/O, 1/I/L, 2/Z, 5/S, 8/B, U/V). */
  readable: '34679ACDEFGHJKMNPQRTWXY',
} as const;

const DEFAULT_SIZE = 21;
const urlSafeCharacters = Array.from(alphabets.urlSafe);

/** Short random ID, 21 URL-safe characters by default (about 126 bits, comparable to UUID v4). */
export const nanoid = (size: number = DEFAULT_SIZE): string => randomFromCharacters(urlSafeCharacters, size);

/** Returns a generator for random IDs over your own alphabet and default length. */
export const customAlphabet = (alphabet: string, defaultSize: number = DEFAULT_SIZE): ((size?: number) => string) => {
  const characters = parseAlphabet(alphabet);
  assertInteger('size', defaultSize, 1, 65_536);
  return (size = defaultSize) => randomFromCharacters(characters, size);
};

export interface CollisionOptions {
  /** Number of distinct characters. */
  alphabetSize: number;
  /** Characters per ID. */
  size: number;
  /** How many IDs will exist. */
  count: number;
}

/**
 * Chance that at least two of `count` random IDs are equal (birthday bound). Computed in log space, so it also works
 * for ID spaces far beyond 2^53.
 */
export const collisionProbability = ({ alphabetSize, size, count }: CollisionOptions): number => {
  assertInteger('alphabetSize', alphabetSize, 2, 256);
  assertInteger('size', size, 1, 65_536);
  if (!Number.isFinite(count) || count < 0) {
    throw new ConfigurationError('INVALID_OPTION', 'count must be a positive number.', {
      option: 'count',
      value: count,
    });
  }
  if (count < 2) {
    return 0;
  }
  // p = 1 - exp(-n(n-1) / 2N) with N = alphabetSize^size
  const exponent = Math.log(count) + Math.log(count - 1) - Math.LN2 - size * Math.log(alphabetSize);
  return -Math.expm1(-Math.exp(exponent));
};
