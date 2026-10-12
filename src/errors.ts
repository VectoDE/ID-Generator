/** Machine-readable reason attached to every error this package throws. */
export type IdGeneratorErrorCode =
  | 'CRYPTO_UNAVAILABLE'
  | 'INVALID_OPTION'
  | 'INVALID_PATTERN'
  | 'MISSING_VALUE'
  | 'INVALID_VALUE'
  | 'CLOCK_OVERFLOW'
  | 'SEQUENCE_OVERFLOW'
  | 'STORE_LOCKED'
  | 'STORE_CORRUPT';

/** Base class; `code` tells callers what went wrong without parsing the message. */
export class IdGeneratorError extends Error {
  readonly code: IdGeneratorErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: IdGeneratorErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'IdGeneratorError';
    this.code = code;
    this.details = details;
  }
}

/** A generator or store was configured with values it cannot work with. */
export class ConfigurationError extends IdGeneratorError {
  constructor(code: IdGeneratorErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
    this.name = 'ConfigurationError';
  }
}

/** Input for a single ID was missing or did not pass validation. */
export class ValidationError extends IdGeneratorError {
  constructor(code: IdGeneratorErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
    this.name = 'ValidationError';
  }
}

export const assertInteger = (name: string, value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ConfigurationError('INVALID_OPTION', `${name} must be an integer from ${min} to ${max}.`, {
      option: name,
      value,
    });
  }
  return value;
};
