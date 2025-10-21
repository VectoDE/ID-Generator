const { defaultOptions } = require('../config/defaultConfig');
const { compilePattern, extractTokensFromPattern } = require('./pattern');
const {
  InvalidConfigurationError,
  ValidationError,
} = require('../utils/errors');

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeOptions(base = {}, override = {}) {
  const result = {};
  const keys = new Set([
    ...Object.keys(isPlainObject(base) ? base : {}),
    ...Object.keys(isPlainObject(override) ? override : {}),
  ]);

  for (const key of keys) {
    const baseValue = isPlainObject(base) ? base[key] : undefined;
    const overrideValue = isPlainObject(override) ? override[key] : undefined;

    if (isPlainObject(baseValue) || isPlainObject(overrideValue)) {
      result[key] = mergeOptions(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue;
    } else {
      result[key] = baseValue;
    }
  }

  return result;
}

class IDGenerator {
  constructor(options = {}) {
    this.config = mergeOptions(defaultOptions, options);
    this.sequenceCounters = new Map();
    this.updatePattern(this.config.pattern);
    this.ensureTokenConfiguration();
  }

  updatePattern(pattern) {
    this.pattern = pattern;
    this.patternSegments = compilePattern(pattern);
    this.patternTokenNames = extractTokensFromPattern(pattern);
  }

  ensureTokenConfiguration() {
    if (!isPlainObject(this.config.tokens)) {
      throw new InvalidConfigurationError('Token configuration must be a plain object.');
    }

    for (const tokenName of this.patternTokenNames) {
      const definition = this.config.tokens[tokenName];
      if (!definition) {
        throw new InvalidConfigurationError(
          `Pattern references token "${tokenName}" but no configuration was provided for it.`,
        );
      }
    }
  }

  describeTokens() {
    return this.patternTokenNames.map((name) => ({
      name,
      ...(this.config.tokens[name] ?? {}),
    }));
  }

  registerToken(name, definition) {
    if (!name || typeof name !== 'string') {
      throw new InvalidConfigurationError('Token name must be a non-empty string.');
    }
    if (!isPlainObject(definition)) {
      throw new InvalidConfigurationError('Token definition must be a plain object.');
    }

    this.config.tokens[name] = {
      ...(this.config.tokens[name] ?? {}),
      ...definition,
    };

    if (!this.patternTokenNames.includes(name)) {
      this.patternTokenNames.push(name);
    }
  }

  setPattern(pattern) {
    this.updatePattern(pattern);
    this.ensureTokenConfiguration();
  }

  nextSequence(scope = this.config.sequence.scope) {
    if (!this.config.sequence?.enabled) {
      throw new InvalidConfigurationError('Sequence generator is disabled.');
    }
    const key = scope ?? 'global';
    const current = this.sequenceCounters.get(key) ?? 0;
    const next = current + 1;
    this.sequenceCounters.set(key, next);
    const padTo = Number.parseInt(this.config.sequence.padTo, 10) || 0;
    const raw = String(next);
    return padTo > 0 ? raw.padStart(padTo, '0') : raw;
  }

  resetSequence(scope) {
    if (scope === undefined) {
      this.sequenceCounters.clear();
      return;
    }
    this.sequenceCounters.delete(scope);
  }

  resolveTokenValue(tokenName, payload, context) {
    const definition = this.config.tokens[tokenName];
    if (!definition) {
      throw new InvalidConfigurationError(`Token "${tokenName}" is not configured.`);
    }

    const runtimeOverrides = context.runtime?.tokens ?? {};
    let value = runtimeOverrides[tokenName];

    if (value === undefined) {
      value = payload[tokenName];
    }

    if ((value === undefined || value === null || value === '') && typeof definition.generator === 'function') {
      value = definition.generator({ ...context, tokenName });
    }

    if (value === undefined || value === null || value === '') {
      if (definition.required) {
        throw new ValidationError(`Missing required token "${tokenName}".`, {
          token: tokenName,
        });
      }
      return '';
    }

    if (typeof definition.normalize === 'function') {
      value = definition.normalize(value, { ...context, tokenName });
    }

    if (definition.validate && !definition.validate(value, { ...context, tokenName })) {
      throw new ValidationError(`Token "${tokenName}" failed validation.`, {
        token: tokenName,
        value,
      });
    }

    if (typeof definition.transform === 'function') {
      value = definition.transform(value, { ...context, tokenName });
    }

    return value;
  }

  buildIdFromTokens(tokens) {
    let result = '';
    for (const segment of this.patternSegments) {
      if (segment.type === 'literal') {
        result += segment.value;
      } else if (segment.type === 'token') {
        const tokenValue = tokens[segment.name];
        if (tokenValue === undefined) {
          throw new InvalidConfigurationError(
            `Token "${segment.name}" was not resolved during ID generation.`,
          );
        }
        result += tokenValue;
      }
    }
    return result;
  }

  generate(payload = {}, runtime = {}) {
    if (!isPlainObject(payload)) {
      throw new ValidationError('Payload must be a plain object.');
    }
    if (runtime && !isPlainObject(runtime)) {
      throw new ValidationError('Runtime options must be a plain object.');
    }

    const context = {
      generator: this,
      runtime,
      payload,
      timestamp: runtime.timestamp ?? new Date(),
      sequenceScope: runtime.sequenceScope ?? this.config.sequence.scope,
    };

    const tokenValues = {};
    for (const tokenName of this.patternTokenNames) {
      tokenValues[tokenName] = this.resolveTokenValue(tokenName, payload, context);
    }

    const id = this.buildIdFromTokens(tokenValues);
    const finalize = runtime.finalize ?? this.config.finalize;
    return typeof finalize === 'function' ? finalize(id, { ...context, tokens: tokenValues }) : id;
  }

  generateBatch(payloads, runtime = {}) {
    if (!Array.isArray(payloads)) {
      throw new ValidationError('Payloads must be an array.');
    }

    return payloads.map((payload, index) => {
      const sequenceScope =
        payload.sequenceScope ??
        runtime.sequenceScope ??
        (runtime.isolatedSequence ? `${this.config.sequence.scope}-${index}` : this.config.sequence.scope);

      return this.generate(
        payload,
        {
          ...runtime,
          sequenceScope,
          batchIndex: index,
        },
      );
    });
  }

  preview(payload = {}, runtime = {}) {
    const context = {
      generator: this,
      runtime,
      payload,
      timestamp: runtime.timestamp ?? new Date(),
      sequenceScope: runtime.sequenceScope ?? this.config.sequence.scope,
    };

    const tokens = {};
    for (const tokenName of this.patternTokenNames) {
      try {
        tokens[tokenName] = this.resolveTokenValue(tokenName, payload, context);
      } catch (error) {
        tokens[tokenName] = { error: error.message };
      }
    }
    return tokens;
  }
}

module.exports = IDGenerator;
