// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { ConfigurationError, IdGeneratorError, assertInteger } from './errors.js';

// getRandomValues fills at most 65536 bytes per call (Web Crypto limit).
const MAX_CHUNK = 65_536;

const webCrypto = (): Crypto => {
  const api = globalThis.crypto as Crypto | undefined;
  if (typeof api?.getRandomValues !== 'function') {
    throw new IdGeneratorError(
      'CRYPTO_UNAVAILABLE',
      'Web Crypto (globalThis.crypto.getRandomValues) is not available in this environment.'
    );
  }
  return api;
};

/** Cryptographically secure random bytes from Web Crypto. */
export const randomBytes = (length: number): Uint8Array => {
  assertInteger('length', length, 0, Number.MAX_SAFE_INTEGER);
  const bytes = new Uint8Array(length);
  const api = webCrypto();
  for (let offset = 0; offset < length; offset += MAX_CHUNK) {
    api.getRandomValues(bytes.subarray(offset, Math.min(offset + MAX_CHUNK, length)));
  }
  return bytes;
};

// Web Crypto calls cost far more than the bytes they return, so small requests are served from a shared pool.
const POOL_SIZE = 4096;
const MAX_POOLED = 256;
let pool: Uint8Array = new Uint8Array(0);
let poolOffset = 0;

/**
 * Like {@link randomBytes}, but small requests come from a pool that is refilled 4 KiB at a time. The returned bytes
 * are never handed out again, so callers may change them.
 */
export const pooledRandomBytes = (length: number): Uint8Array => {
  if (length > MAX_POOLED) {
    return randomBytes(length);
  }
  if (poolOffset + length > pool.length) {
    // A new array instead of refilling the old one: slices handed out earlier must keep their values.
    pool = randomBytes(POOL_SIZE);
    poolOffset = 0;
  }
  poolOffset += length;
  return pool.subarray(poolOffset - length, poolOffset);
};

/** Checks that an alphabet has 2 to 256 distinct characters and returns them as an array. */
export const parseAlphabet = (alphabet: string): string[] => {
  const characters = Array.from(alphabet);
  if (characters.length < 2 || characters.length > 256) {
    throw new ConfigurationError('INVALID_OPTION', 'The alphabet needs 2 to 256 characters.', {
      option: 'alphabet',
    });
  }
  if (new Set(characters).size !== characters.length) {
    throw new ConfigurationError('INVALID_OPTION', 'The alphabet must not repeat characters.', {
      option: 'alphabet',
    });
  }
  return characters;
};

/**
 * Random string over the given characters without modulo bias: random bytes are masked to the next power of two
 * and values outside the alphabet are thrown away, so every character is equally likely.
 */
export const randomFromCharacters = (characters: readonly string[], size: number): string => {
  assertInteger('size', size, 0, 65_536);
  const mask = (2 << (31 - Math.clz32((characters.length - 1) | 1))) - 1;
  // Draw a little more than needed so most strings finish in one round.
  const step = Math.ceil((1.6 * mask * size) / characters.length);
  let result = '';
  // Counted separately: characters outside the BMP take two UTF-16 units in `result`.
  let count = 0;
  while (count < size) {
    for (const byte of pooledRandomBytes(step)) {
      const character = characters[byte & mask];
      if (character !== undefined) {
        result += character;
        count += 1;
        if (count === size) {
          break;
        }
      }
    }
  }
  return result;
};

/** Random string from an alphabet given as a string, see {@link randomFromCharacters}. */
export const randomString = (alphabet: string, size: number): string =>
  randomFromCharacters(parseAlphabet(alphabet), size);
