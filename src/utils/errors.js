class IDGeneratorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class InvalidConfigurationError extends IDGeneratorError {
  constructor(message, details = {}) {
    super(message, details);
  }
}

class ValidationError extends IDGeneratorError {
  constructor(message, details = {}) {
    super(message, details);
  }
}

module.exports = {
  IDGeneratorError,
  InvalidConfigurationError,
  ValidationError,
};
