const IDGenerator = require('./core/idGenerator');
const { defaultOptions, defaultPattern, defaultTokens } = require('./config/defaultConfig');

function createIDGenerator(options = {}) {
  return new IDGenerator(options);
}

module.exports = {
  IDGenerator,
  createIDGenerator,
  defaultOptions,
  defaultPattern,
  defaultTokens,
};
