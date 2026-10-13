// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

export { ConfigurationError, IdGeneratorError, ValidationError, type IdGeneratorErrorCode } from './errors.js';
export { inspectId, type InspectResult } from './inspect.js';
export { alphabets, collisionProbability, customAlphabet, nanoid, type CollisionOptions } from './nanoid.js';
export {
  createPatternGenerator,
  type PatternGenerator,
  type PatternGeneratorOptions,
  type PreviewResult,
  type TokenInfo,
  type TokenPreview,
  type TokenValues,
} from './pattern/generator.js';
export { parsePattern, type LiteralSegment, type Segment, type TokenSegment } from './pattern/parser.js';
export { presets, type PatternPreset, type PresetName } from './pattern/presets.js';
export {
  builtInTokens,
  type ComputedToken,
  type TokenContext,
  type TokenDefinition,
  type TokenValue,
  type ValueToken,
} from './pattern/tokens.js';
export { randomBytes, randomString } from './random.js';
export {
  DEFAULT_SNOWFLAKE_EPOCH,
  createSnowflake,
  parseSnowflake,
  type SnowflakeGenerator,
  type SnowflakeLayout,
  type SnowflakeOptions,
  type SnowflakeParts,
} from './snowflake.js';
export { MemorySequenceStore } from './stores/memory.js';
export type { SequenceStore, SequenceStoreOptions } from './stores/types.js';
export { CROCKFORD_BASE32, createUlid, isUlid, ulid, ulidTimestamp, type UlidOptions } from './ulid.js';
export {
  MAX_UUID,
  NIL_UUID,
  createUuidV7,
  isUuid,
  uuidVersion,
  uuidv4,
  uuidv7,
  uuidv7Timestamp,
  type UuidV7Options,
} from './uuid.js';
