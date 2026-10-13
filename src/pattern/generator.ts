// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { ConfigurationError, ValidationError, assertInteger } from '../errors.js';
import { MemorySequenceStore } from '../stores/memory.js';
import type { SequenceStore } from '../stores/types.js';
import { parsePattern, tokenNames, type Segment } from './parser.js';
import { escapeRegExp } from './regex.js';
import {
  builtInTokens,
  isComputedToken,
  type TokenContext,
  type TokenDefinition,
  type TokenValue,
  type ValueToken,
} from './tokens.js';

export type TokenValues = Readonly<Record<string, TokenValue | undefined>>;

export interface PatternGeneratorOptions {
  /** The ID layout, e.g. `INV-{year}-{seq:5}`. */
  pattern: string;
  /** Own tokens, or replacements for built-in ones. Tokens in the pattern without a definition read from values. */
  tokens?: Readonly<Record<string, TokenDefinition>>;
  /** Where `{seq}` counters are kept. Default: a new in-memory store. */
  store?: SequenceStore;
  /**
   * Which counter `{seq}` uses. A function gets the values you passed, overridden by the resolved text of every other
   * token (normalized and defaulted), e.g. `(values) => String(values.club)` for one counter per club or
   * `(values) => String(values.year)` for one per year. Default: the pattern itself.
   */
  scope?: string | ((values: TokenValues) => string);
  /** Date tokens in UTC (default) or in the local time zone. */
  utc?: boolean;
  /** Clock for date tokens. Defaults to the current time. */
  now?: () => Date;
  /** Last step, e.g. `(id) => id.toLowerCase()`. */
  transform?: (id: string, values: TokenValues) => string;
  /** Rejects IDs longer than this. Default 256. */
  maxLength?: number;
}

export interface TokenInfo {
  name: string;
  /** `computed` tokens make their own text, `value` tokens come from the values you pass. */
  kind: 'computed' | 'value';
  builtIn: boolean;
  required: boolean;
  description: string | undefined;
}

export interface TokenPreview {
  name: string;
  value?: string;
  error?: string;
}

export interface PreviewResult {
  /** The ID that `generate()` would return now, or undefined when a token has an error. */
  id: string | undefined;
  tokens: TokenPreview[];
}

export interface PatternGenerator {
  readonly pattern: string;
  /** Tokens of the pattern in order of first appearance. */
  readonly tokens: readonly TokenInfo[];
  /** Builds one ID. Takes the next sequence number only when the rest of the ID, transform and length are valid. */
  generate(values?: TokenValues): Promise<string>;
  /** Builds several IDs one after another: `count` IDs from the same values, or one per entry. */
  generateMany(input: number | readonly TokenValues[], values?: TokenValues): Promise<string[]>;
  /** Shows what `generate()` would produce, per token, without using up a sequence number. */
  preview(values?: TokenValues): Promise<PreviewResult>;
  /** Reads token values back out of an ID; null when the ID does not fit the pattern. */
  parse(id: string): Record<string, string> | null;
  /** True when the ID fits the pattern. */
  matches(id: string): boolean;
}

interface ResolvedToken {
  name: string;
  definition: TokenDefinition;
  builtIn: boolean;
  isValid: (value: string) => boolean;
}

type TokenSegment = Segment & { type: 'token' };

// Same name and argument means same text within one ID; {date:YYYY} and {date:MM} stay separate.
const segmentKey = (segment: TokenSegment): string => `${segment.name}:${segment.arg ?? ''}`;

// Also matches line breaks, like the values that generate() accepts.
const ANY = String.raw`[\s\S]+?`;

const toText = (name: string, value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'bigint') {
    return String(value);
  }
  throw new ValidationError('INVALID_VALUE', `The value for "${name}" must be a string or a number.`, {
    token: name,
  });
};

// A RegExp in `validate` must match the whole value, so it is anchored once up front.
const compileValidator = (validate: ValueToken['validate']): ((value: string) => boolean) => {
  if (validate === undefined) {
    return () => true;
  }
  if (validate instanceof RegExp) {
    const anchored = new RegExp(`^(?:${validate.source})$`, validate.flags.replaceAll(/[gy]/g, ''));
    return (value) => anchored.test(value);
  }
  return validate;
};

const resolveValueToken = (
  name: string,
  token: ValueToken,
  isValid: (value: string) => boolean,
  context: TokenContext
): string => {
  // Own properties only: a token named like an Object.prototype member must not read that member.
  let raw = Object.hasOwn(context.values, name) ? context.values[name] : undefined;
  if (raw === undefined || raw === '') {
    raw = typeof token.default === 'function' ? token.default(context) : token.default;
  }
  if (raw === undefined || raw === '') {
    if (token.required === false) {
      return '';
    }
    throw new ValidationError('MISSING_VALUE', `Missing value for "${name}".`, { token: name });
  }
  const text = token.normalize ? token.normalize(toText(name, raw)) : toText(name, raw);
  if (!isValid(text)) {
    throw new ValidationError('INVALID_VALUE', `The value "${text}" is not valid for "${name}".`, {
      token: name,
      value: text,
    });
  }
  return text;
};

const matcherFor = (token: ResolvedToken, arg: string | undefined): string => {
  const { match } = token.definition;
  if (typeof match === 'function') {
    return match(arg);
  }
  return match ?? ANY;
};

/** Creates a generator for IDs that follow your own pattern. */
export const createPatternGenerator = (options: PatternGeneratorOptions): PatternGenerator => {
  // Checked at runtime as well, for callers without TypeScript.
  const raw: unknown = options;
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigurationError('INVALID_OPTION', 'createPatternGenerator needs an options object.');
  }
  const segments: Segment[] = parsePattern(options.pattern);
  const names = tokenNames(segments);
  const store = options.store ?? new MemorySequenceStore();
  const utc = options.utc ?? true;
  const now = options.now ?? (() => new Date());
  const maxLength = assertInteger('maxLength', options.maxLength ?? 256, 1, 65_536);
  const custom = options.tokens ?? {};

  const tokens = new Map<string, ResolvedToken>(
    names.map((name) => {
      const own = Object.hasOwn(custom, name) ? custom[name] : undefined;
      const builtIn = own === undefined && Object.hasOwn(builtInTokens, name) ? builtInTokens[name] : undefined;
      const definition: TokenDefinition = own ?? builtIn ?? {};
      const isValid = isComputedToken(definition) ? () => true : compileValidator(definition.validate);
      return [name, { name, definition, builtIn: builtIn !== undefined, isValid }];
    })
  );

  // Arguments are fixed by the pattern, so bad ones fail here instead of at the first ID.
  for (const segment of segments) {
    if (segment.type === 'token') {
      const { definition } = tokens.get(segment.name)!;
      if (isComputedToken(definition)) {
        definition.check?.(segment.arg);
      } else if (segment.arg !== undefined) {
        throw new ConfigurationError('INVALID_PATTERN', `{${segment.name}} takes no argument.`, {
          token: segment.name,
        });
      }
    }
  }

  const scopeFor = (values: TokenValues): string => {
    const scope = typeof options.scope === 'function' ? options.scope(values) : (options.scope ?? options.pattern);
    if (typeof scope !== 'string' || scope.length === 0) {
      throw new ValidationError('INVALID_VALUE', 'The sequence scope must be a non-empty string.');
    }
    return scope;
  };

  const tokenSegments = segments.filter((segment): segment is TokenSegment => segment.type === 'token');
  const uniqueSegments = [...new Map(tokenSegments.map((segment) => [segmentKey(segment), segment])).values()];
  const isLate = (segment: TokenSegment) => {
    const { definition } = tokens.get(segment.name)!;
    return isComputedToken(definition) && definition.late === true;
  };
  const earlySegments = uniqueSegments.filter((segment) => !isLate(segment));
  const lateSegments = uniqueSegments.filter((segment) => isLate(segment));

  const resolveSegments = async (values: TokenValues, preview: boolean) => {
    const date = now();
    const results = new Map<string, string>();
    const errors = new Map<string, string>();

    // What the scope function sees: the values passed in, overridden by the resolved (normalized, defaulted) text
    // of every token resolved so far, so " ops " and "OPS" share one counter. Object.fromEntries keeps "__proto__"
    // an ordinary key.
    const resolvedValues = (): TokenValues => {
      const resolved = new Map<string, string>();
      for (const segment of earlySegments) {
        const text = results.get(segmentKey(segment));
        if (text !== undefined && !resolved.has(segment.name)) {
          resolved.set(segment.name, text);
        }
      }
      return Object.fromEntries([...Object.entries(values), ...resolved]);
    };

    // One number per ID: the first call reads it, later calls within the same ID get the same promise.
    const sequenceSource = (peek: boolean) => {
      let value: Promise<number> | undefined;
      return () => {
        value ??= Promise.resolve().then(() => {
          const scope = scopeFor(resolvedValues());
          return peek ? store.peek(scope) : store.next(scope);
        });
        return value;
      };
    };

    const run = async (
      segment: TokenSegment,
      target: Map<string, string>,
      sequence: () => Promise<number>
    ): Promise<void> => {
      const { definition, isValid } = tokens.get(segment.name)!;
      const context: TokenContext = { arg: segment.arg, values, date, utc, sequence };
      try {
        target.set(
          segmentKey(segment),
          isComputedToken(definition)
            ? await definition.resolve(context)
            : resolveValueToken(segment.name, definition, isValid, context)
        );
      } catch (error) {
        if (!preview) {
          throw error;
        }
        errors.set(segment.name, error instanceof Error ? error.message : String(error));
      }
    };

    const peekSequence = sequenceSource(true);
    await Promise.all(earlySegments.map((segment) => run(segment, results, peekSequence)));
    if (preview) {
      await Promise.all(lateSegments.map((segment) => run(segment, results, peekSequence)));
      return { results, errors };
    }
    // Late tokens (the sequence) take their number only after the rest of the ID is known to be valid: a dry run
    // with the peeked number checks transform and maxLength first, so a rejected ID never leaves a gap.
    if (lateSegments.length > 0) {
      const trial = new Map(results);
      await Promise.all(lateSegments.map((segment) => run(segment, trial, peekSequence)));
      assemble(trial, values);
      const nextSequence = sequenceSource(false);
      await Promise.all(lateSegments.map((segment) => run(segment, results, nextSequence)));
    }
    return { results, errors };
  };

  // Defined after resolveSegments but only called once a generator exists, so it is always initialized.
  const assemble = (results: Map<string, string>, values: TokenValues): string => {
    const raw = segments
      .map((segment) => (segment.type === 'literal' ? segment.value : results.get(segmentKey(segment))!))
      .join('');
    const id = options.transform ? options.transform(raw, values) : raw;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ValidationError('INVALID_VALUE', 'The pattern produced an empty ID.');
    }
    if (id.length > maxLength) {
      throw new ValidationError('INVALID_VALUE', `The ID is longer than ${maxLength} characters.`, {
        length: id.length,
      });
    }
    return id;
  };

  const assertValues = (values: unknown): void => {
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      throw new ValidationError('INVALID_VALUE', 'Values must be an object.');
    }
  };

  const generate = async (values: TokenValues = {}): Promise<string> => {
    assertValues(values);
    const { results } = await resolveSegments(values, false);
    return assemble(results, values);
  };

  // Built lazily: patterns that are only generated never pay for the regular expression.
  // Named groups (t0, t1, ...) so capturing groups inside a custom `match` cannot shift the values, and named
  // backreferences so a digit after a repeated token is never read as part of the reference.
  let parser: { regex: RegExp; groups: string[] } | undefined;
  const buildParser = () => {
    const groups: string[] = [];
    const seen = new Map<string, string>();
    let source = '';
    for (const segment of segments) {
      const group = segment.type === 'token' ? seen.get(segmentKey(segment)) : undefined;
      if (segment.type === 'literal') {
        source += escapeRegExp(segment.value);
      } else if (group === undefined) {
        const name = `t${groups.length}`;
        groups.push(segment.name);
        seen.set(segmentKey(segment), name);
        source += `(?<${name}>${matcherFor(tokens.get(segment.name)!, segment.arg)})`;
      } else {
        source += String.raw`\k<${group}>`;
      }
    }
    return { regex: new RegExp(`^${source}$`, 'u'), groups };
  };

  const parse = (id: string): Record<string, string> | null => {
    if (typeof id !== 'string' || id.length > maxLength) {
      return null;
    }
    parser ??= buildParser();
    const match = parser.regex.exec(id);
    if (!match) {
      return null;
    }
    const parsed = new Map<string, string>();
    // The first occurrence of a name wins when it appears with different arguments.
    for (const [index, name] of parser.groups.entries()) {
      if (!parsed.has(name)) {
        parsed.set(name, match.groups?.[`t${index}`] ?? '');
      }
    }
    return Object.fromEntries(parsed);
  };

  return {
    pattern: options.pattern,
    tokens: [...tokens.values()].map(({ name, definition, builtIn }) => ({
      name,
      kind: isComputedToken(definition) ? 'computed' : 'value',
      builtIn,
      required: isComputedToken(definition) ? true : definition.required !== false,
      description: definition.description,
    })),
    generate,
    async generateMany(input, values = {}) {
      const raw: unknown =
        typeof input === 'number'
          ? Array.from({ length: assertInteger('count', input, 0, 1_000_000) }, () => values)
          : input;
      if (!Array.isArray(raw)) {
        throw new ValidationError('INVALID_VALUE', 'generateMany needs a count or an array of values.');
      }
      const list = raw as readonly TokenValues[];
      // One after another, so sequence numbers follow the order of the input.
      return list.reduce<Promise<string[]>>(async (previous, entry) => {
        const ids = await previous;
        ids.push(await generate(entry));
        return ids;
      }, Promise.resolve([]));
    },
    async preview(values = {}) {
      assertValues(values);
      const { results, errors } = await resolveSegments(values, true);
      const previews: TokenPreview[] = names.map((name) => {
        const error = errors.get(name);
        if (error !== undefined) {
          return { name, error };
        }
        const first = tokenSegments.find((segment) => segment.name === name)!;
        return { name, value: results.get(segmentKey(first)) ?? '' };
      });
      let id: string | undefined;
      if (errors.size === 0) {
        try {
          id = assemble(results, values);
        } catch {
          // A failing transform or a too long ID leaves the id empty; the tokens are still listed.
          id = undefined;
        }
      }
      return { id, tokens: previews };
    },
    parse,
    matches: (id) => parse(id) !== null,
  };
};
