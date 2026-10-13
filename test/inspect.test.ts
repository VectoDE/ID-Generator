// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { ConfigurationError, IdGeneratorError, ValidationError, assertInteger } from '../src/errors.js';
import { inspectId } from '../src/inspect.js';
import * as node from '../src/node.js';
import { createUlid } from '../src/ulid.js';
import { MAX_UUID, NIL_UUID, createUuidV7, uuidv4 } from '../src/uuid.js';

describe('inspectId', () => {
  const at = Date.UTC(2026, 9, 12);

  it('recognises UUIDs and reads the v7 time', () => {
    expect(inspectId(uuidv4())).toEqual({ type: 'uuid', version: 4 });
    expect(inspectId(createUuidV7({ now: () => at })())).toEqual({ type: 'uuid', version: 7, timestamp: new Date(at) });
    expect(inspectId(NIL_UUID)).toEqual({ type: 'uuid' });
    expect(inspectId(MAX_UUID.toUpperCase())).toEqual({ type: 'uuid' });
  });

  it('recognises ULIDs', () => {
    expect(inspectId(createUlid({ now: () => at })())).toEqual({ type: 'ulid', timestamp: new Date(at) });
  });

  it('returns unknown for anything else', () => {
    expect(inspectId('INV-2026-00001')).toEqual({ type: 'unknown' });
    expect(inspectId(42 as unknown as string)).toEqual({ type: 'unknown' });
  });
});

describe('errors', () => {
  it('carry a code, details and a name', () => {
    const error = new ValidationError('MISSING_VALUE', 'Missing', { token: 'a' });
    expect(error).toBeInstanceOf(IdGeneratorError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'ValidationError', code: 'MISSING_VALUE', details: { token: 'a' } });
    expect(new ConfigurationError('INVALID_OPTION', 'x').name).toBe('ConfigurationError');
    expect(new IdGeneratorError('STORE_LOCKED', 'x')).toMatchObject({ name: 'IdGeneratorError', details: {} });
  });

  it('checks integer ranges', () => {
    expect(assertInteger('n', 3, 1, 5)).toBe(3);
    expect(() => assertInteger('n', 6, 1, 5)).toThrow('n must be an integer from 1 to 5.');
    expect(() => assertInteger('n', '3', 1, 5)).toThrow(ConfigurationError);
    expect(() => assertInteger('n', 1.5, 1, 5)).toThrow(ConfigurationError);
  });
});

describe('entry points', () => {
  it('keep Node-only code out of the core entry', () => {
    expect(core).not.toHaveProperty('FileSequenceStore');
    expect(node.FileSequenceStore).toBeTypeOf('function');
    for (const name of Object.keys(core)) {
      expect(node).toHaveProperty(name);
    }
  });
});
