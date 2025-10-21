const {
  normalizeClubName,
  normalizeRoleId,
  normalizeArea,
  ensureYear,
  randomAlphanumeric,
} = require('../utils/normalization');

const defaultPattern = '{club}#{role}/{area}-{year}';

const defaultTokens = {
  club: {
    required: true,
    normalize: normalizeClubName,
    description: 'Normalized club or organization identifier.',
  },
  role: {
    required: true,
    normalize: normalizeRoleId,
    description: 'Role identifier or code.',
  },
  area: {
    required: true,
    normalize: normalizeArea,
    description: 'Geographical or organizational area indicator.',
  },
  year: {
    required: true,
    normalize: ensureYear,
    description: 'Four digit year representation.',
  },
  sequence: {
    required: false,
    generator: (context) => context.generator.nextSequence(context.sequenceScope),
    description: 'Sequential number scoped by configuration.',
  },
  random: {
    required: false,
    generator: () => randomAlphanumeric(6),
    description: 'Random alphanumeric suffix for uniqueness.',
  },
};

const defaultOptions = {
  pattern: defaultPattern,
  tokens: defaultTokens,
  sequence: {
    enabled: true,
    padTo: 4,
    scope: 'global',
  },
  finalize: (id) => id,
};

module.exports = {
  defaultPattern,
  defaultTokens,
  defaultOptions,
};
