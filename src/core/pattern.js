const { InvalidConfigurationError } = require('../utils/errors');

const TOKEN_REGEX = /\{([^}]+)\}/g;

function compilePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.trim().length === 0) {
    throw new InvalidConfigurationError('Pattern must be a non-empty string.');
  }

  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = TOKEN_REGEX.exec(pattern)) !== null) {
    const [rawMatch, rawName] = match;
    const index = match.index;
    if (index > lastIndex) {
      segments.push({ type: 'literal', value: pattern.slice(lastIndex, index) });
    }

    const name = rawName.trim();
    if (!name) {
      throw new InvalidConfigurationError(
        `Encountered empty token placeholder in pattern "${pattern}".`,
      );
    }

    segments.push({ type: 'token', name });
    lastIndex = index + rawMatch.length;
  }

  if (lastIndex < pattern.length) {
    segments.push({ type: 'literal', value: pattern.slice(lastIndex) });
  }

  return segments;
}

function extractTokensFromPattern(pattern) {
  const tokens = new Set();
  let match;
  while ((match = TOKEN_REGEX.exec(pattern)) !== null) {
    const tokenName = match[1].trim();
    if (tokenName) {
      tokens.add(tokenName);
    }
  }
  return Array.from(tokens);
}

module.exports = {
  compilePattern,
  extractTokensFromPattern,
};
