// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { ConfigurationError } from '../errors.js';

export interface LiteralSegment {
  type: 'literal';
  value: string;
}

export interface TokenSegment {
  type: 'token';
  /** Token name, e.g. `seq` in `{seq:4}`. */
  name: string;
  /** Text after the first colon, e.g. `4` in `{seq:4}`; undefined when there is none. */
  arg: string | undefined;
}

export type Segment = LiteralSegment | TokenSegment;

const TOKEN_NAME = /^[A-Za-z_]\w*$/;
const MAX_PATTERN_LENGTH = 1024;

const invalid = (pattern: string, message: string, position?: number): ConfigurationError =>
  new ConfigurationError('INVALID_PATTERN', position === undefined ? message : `${message} (at position ${position})`, {
    pattern,
    position,
  });

const parseToken = (pattern: string, body: string, position: number): TokenSegment => {
  const colon = body.indexOf(':');
  const name = (colon === -1 ? body : body.slice(0, colon)).trim();
  if (!TOKEN_NAME.test(name)) {
    throw invalid(
      pattern,
      `"${name}" is not a valid token name; use letters, digits and underscores, starting with a letter`,
      position
    );
  }
  return { type: 'token', name, arg: colon === -1 ? undefined : body.slice(colon + 1) };
};

// Position of the "}" that closes the token opened at `start`; a missing one or a nested "{" is an error.
const closingBrace = (pattern: string, start: number): number => {
  const end = pattern.indexOf('}', start + 1);
  const nextOpen = pattern.indexOf('{', start + 1);
  if (end === -1 || (nextOpen !== -1 && nextOpen < end)) {
    throw invalid(pattern, 'Unclosed "{"; write "{{" for a literal brace', start);
  }
  return end;
};

const isEscapedBrace = (pattern: string, index: number): boolean => {
  const character = pattern.charAt(index);
  return (character === '{' || character === '}') && pattern.charAt(index + 1) === character;
};

/**
 * Splits a pattern into literal text and tokens. `{name}` and `{name:arg}` are tokens, `{{` and `}}` stand for
 * literal braces.
 */
export const parsePattern = (pattern: string): Segment[] => {
  const raw: unknown = pattern;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw invalid(typeof raw === 'string' ? raw : typeof raw, 'The pattern must be a non-empty string.');
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw invalid(pattern.slice(0, 40), `The pattern may have at most ${MAX_PATTERN_LENGTH} characters.`);
  }

  const segments: Segment[] = [];
  let literal = '';
  let index = 0;
  const flushLiteral = () => {
    if (literal) {
      segments.push({ type: 'literal', value: literal });
      literal = '';
    }
  };

  while (index < pattern.length) {
    const character = pattern.charAt(index);
    if (isEscapedBrace(pattern, index)) {
      literal += character;
      index += 2;
    } else if (character === '{') {
      const end = closingBrace(pattern, index);
      flushLiteral();
      segments.push(parseToken(pattern, pattern.slice(index + 1, end), index));
      index = end + 1;
    } else if (character === '}') {
      throw invalid(pattern, 'Unexpected "}"; write "}}" for a literal brace', index);
    } else {
      literal += character;
      index += 1;
    }
  }
  flushLiteral();
  return segments;
};

/** Distinct token names in order of first appearance. */
export const tokenNames = (segments: readonly Segment[]): string[] => [
  ...new Set(segments.filter((segment) => segment.type === 'token').map((segment) => segment.name)),
];
