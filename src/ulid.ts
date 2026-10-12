import { ConfigurationError, IdGeneratorError, ValidationError } from './errors.js';
import { randomFromCharacters } from './random.js';

/** Crockford's Base32: no I, L, O or U, so IDs are easy to read aloud and copy. */
export const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CHARACTERS = Array.from(CROCKFORD_BASE32);
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const MAX_TIME = 2 ** 48 - 1;
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

const encodeTime = (time: number): string => {
  if (!Number.isSafeInteger(time) || time < 0 || time > MAX_TIME) {
    throw new ConfigurationError('INVALID_OPTION', 'ULID time must be milliseconds from 0 to 2^48 - 1.', { time });
  }
  let rest = time;
  let encoded = '';
  for (let index = 0; index < TIME_LENGTH; index += 1) {
    encoded = CHARACTERS[rest % 32]! + encoded;
    rest = Math.floor(rest / 32);
  }
  return encoded;
};

// Adds one to a Base32 string; returns null when every character is already the highest digit.
const increment = (value: string): string | null => {
  const digits = Array.from(value);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const position = CROCKFORD_BASE32.indexOf(digits[index]!);
    if (position < 31) {
      digits[index] = CHARACTERS[position + 1]!;
      return digits.join('');
    }
    digits[index] = CHARACTERS[0]!;
  }
  return null;
};

export interface UlidOptions {
  /** Clock in milliseconds since the Unix epoch. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Within the same millisecond the random part counts up by one instead of being drawn again, so IDs keep their
   * order. Default `true`.
   */
  monotonic?: boolean;
}

/** Creates a ULID source with its own state. */
export const createUlid = (options: UlidOptions = {}): ((time?: number) => string) => {
  const now = options.now ?? Date.now;
  const monotonic = options.monotonic ?? true;
  let lastTime = -1;
  let lastRandom = '';

  return (time?: number) => {
    const current = time ?? Math.floor(now());
    // Encoded first: a broken clock throws here without touching the state, so the next call still works.
    const encoded = encodeTime(current);
    if (!monotonic || time !== undefined) {
      return encoded + randomFromCharacters(CHARACTERS, RANDOM_LENGTH);
    }
    if (current > lastTime) {
      lastTime = current;
      lastRandom = randomFromCharacters(CHARACTERS, RANDOM_LENGTH);
    } else {
      const next = increment(lastRandom);
      if (next === null) {
        throw new IdGeneratorError('SEQUENCE_OVERFLOW', 'More ULIDs in one millisecond than the random part allows.');
      }
      lastRandom = next;
    }
    return encodeTime(lastTime) + lastRandom;
  };
};

/**
 * ULID: 26 characters, sortable by creation time, 80 random bits. Pass a time in milliseconds to build one for a
 * given moment (not monotonic then).
 */
export const ulid: (time?: number) => string = createUlid();

/** True for a well-formed ULID (case-insensitive). */
export const isUlid = (value: unknown): value is string => typeof value === 'string' && ULID_PATTERN.test(value);

/** Creation time stored in a ULID. */
export const ulidTimestamp = (value: string): Date => {
  if (!isUlid(value)) {
    throw new ValidationError('INVALID_VALUE', 'Not a ULID.', { value });
  }
  let time = 0;
  for (const character of value.slice(0, TIME_LENGTH).toUpperCase()) {
    time = time * 32 + CROCKFORD_BASE32.indexOf(character);
  }
  return new Date(time);
};
