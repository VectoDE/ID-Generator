import { ConfigurationError } from '../errors.js';
import { alphabets, nanoid } from '../nanoid.js';
import { randomString } from '../random.js';
import { CROCKFORD_BASE32, ulid } from '../ulid.js';
import { uuidv4, uuidv7 } from '../uuid.js';
import { assertDateFormat, dateFormatMatcher, formatDate } from './date.js';

/** Values a caller may pass for a token. */
export type TokenValue = string | number | bigint;

export interface TokenContext {
  /** Text after the colon in the pattern, e.g. `4` in `{seq:4}`. */
  readonly arg: string | undefined;
  /** All values passed to `generate()`. */
  readonly values: Readonly<Record<string, TokenValue | undefined>>;
  /** One moment for the whole ID, so `{year}` and `{date}` always agree. */
  readonly date: Date;
  /** Whether date tokens use UTC (default) or local time. */
  readonly utc: boolean;
  /**
   * Sequence number for this ID. The first call takes the next number from the store (in a preview it only peeks);
   * further calls within the same ID return the same number.
   */
  readonly sequence: () => Promise<number>;
}

/** A token whose text is computed, like `{seq}` or `{uuid}`. */
export interface ComputedToken {
  description?: string;
  resolve(context: TokenContext): string | Promise<string>;
  /**
   * Regular expression source for what `resolve` returns, used by `parse()` and `matches()`. Receives the argument
   * from the pattern. Defaults to a non-greedy match of anything.
   */
  match?: string | ((arg: string | undefined) => string);
  /**
   * Resolve this token after all other tokens. Built-in `{seq}` uses it so a failing value does not use up a
   * sequence number.
   */
  late?: boolean;
  /** Called once when a pattern uses the token, to reject bad arguments early. */
  check?: (arg: string | undefined) => void;
}

/** A token filled from the values passed to `generate()`, like `{club}`. */
export interface ValueToken {
  description?: string;
  /** Throw when no value is given and there is no default. Default `true`. */
  required?: boolean;
  /** Used when no value is given. */
  default?: TokenValue | ((context: TokenContext) => TokenValue);
  /** Cleans the value up, e.g. trims and upper-cases it. Runs before `validate`. */
  normalize?: (value: string) => string;
  /** Rejects values that do not fit. A RegExp must match the whole normalized value. */
  validate?: RegExp | ((value: string) => boolean);
  /**
   * Regular expression source for the value, used by `parse()` and `matches()`. Default: anything, non-greedy. Set it
   * when you parse untrusted input with several value tokens in a row, so matching stays fast.
   */
  match?: string;
}

export type TokenDefinition = ComputedToken | ValueToken;

export const isComputedToken = (token: TokenDefinition): token is ComputedToken =>
  typeof (token as ComputedToken).resolve === 'function';

const lengthArg = (token: string, arg: string | undefined, fallback: number, max = 256): number => {
  if (arg === undefined || arg === '') {
    return fallback;
  }
  const length = Number(arg);
  if (!Number.isInteger(length) || length < 1 || length > max) {
    throw new ConfigurationError('INVALID_PATTERN', `{${token}:${arg}} needs a length from 1 to ${max}.`, {
      token,
      arg,
    });
  }
  return length;
};

const noArg = (token: string) => (arg: string | undefined) => {
  if (arg !== undefined) {
    throw new ConfigurationError('INVALID_PATTERN', `{${token}} takes no argument.`, { token, arg });
  }
};

const RANDOM_ALPHABET = alphabets.uppercase + alphabets.numbers;
const UUID_MATCH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Tokens every pattern can use without configuration. A token of the same name in `tokens` replaces them. */
export const builtInTokens: Readonly<Record<string, ComputedToken>> = {
  seq: {
    description: 'Counter from the sequence store; {seq:4} pads it to 4 digits.',
    late: true,
    check: (arg) => lengthArg('seq', arg, 0, 32),
    resolve: async ({ arg, sequence }) => String(await sequence()).padStart(lengthArg('seq', arg, 0, 32), '0'),
    match: (arg) => (arg ? String.raw`\d{${lengthArg('seq', arg, 0, 32)},}` : String.raw`\d+`),
  },
  random: {
    description: 'Random upper-case letters and digits; {random:8} sets the length (default 6).',
    check: (arg) => lengthArg('random', arg, 6),
    resolve: ({ arg }) => randomString(RANDOM_ALPHABET, lengthArg('random', arg, 6)),
    match: (arg) => `[A-Z0-9]{${lengthArg('random', arg, 6)}}`,
  },
  date: {
    description: 'Date and time; {date:YYYY-MM-DD} sets the format (default YYYYMMDD).',
    check: (arg = 'YYYYMMDD') => {
      assertDateFormat(arg);
    },
    resolve: ({ arg = 'YYYYMMDD', date, utc }) => formatDate(date, arg, utc),
    match: (arg = 'YYYYMMDD') => dateFormatMatcher(arg),
  },
  year: {
    description: 'Four-digit year.',
    check: noArg('year'),
    resolve: ({ date, utc }) => formatDate(date, 'YYYY', utc),
    match: String.raw`\d{4}`,
  },
  month: {
    description: 'Two-digit month.',
    check: noArg('month'),
    resolve: ({ date, utc }) => formatDate(date, 'MM', utc),
    match: String.raw`\d{2}`,
  },
  day: {
    description: 'Two-digit day of the month.',
    check: noArg('day'),
    resolve: ({ date, utc }) => formatDate(date, 'DD', utc),
    match: String.raw`\d{2}`,
  },
  timestamp: {
    description: 'Unix time in milliseconds.',
    check: noArg('timestamp'),
    resolve: ({ date }) => String(date.getTime()),
    match: String.raw`\d+`,
  },
  uuid: {
    description: 'Random UUID v4.',
    check: noArg('uuid'),
    resolve: () => uuidv4(),
    match: UUID_MATCH,
  },
  uuid7: {
    description: 'Time-ordered UUID v7.',
    check: noArg('uuid7'),
    resolve: () => uuidv7(),
    match: UUID_MATCH,
  },
  ulid: {
    description: 'ULID (26 characters, time-ordered).',
    check: noArg('ulid'),
    resolve: () => ulid(),
    match: `[${CROCKFORD_BASE32}]{26}`,
  },
  nanoid: {
    description: 'URL-safe random ID; {nanoid:10} sets the length (default 21).',
    check: (arg) => lengthArg('nanoid', arg, 21),
    resolve: ({ arg }) => nanoid(lengthArg('nanoid', arg, 21)),
    match: (arg) => `[A-Za-z0-9_-]{${lengthArg('nanoid', arg, 21)}}`,
  },
};
