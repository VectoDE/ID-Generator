const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
const MULTIPLE_DELIMITERS = /-{2,}/g;

function normalizeClubName(club) {
  if (!club) return '';
  return String(club)
    .trim()
    .toUpperCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(MULTIPLE_DELIMITERS, '-')
    .replace(/^-|-$/g, '');
}

function normalizeRoleId(roleId) {
  if (!roleId) return '';
  return String(roleId)
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '-');
}

function normalizeArea(area) {
  if (!area) return '';
  return String(area)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function ensureYear(year) {
  const normalized = Number.parseInt(year, 10);
  if (Number.isNaN(normalized) || normalized < 0) {
    return '';
  }
  return normalized.toString().padStart(4, '0');
}

function randomAlphanumeric(length = 6) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * characters.length);
    result += characters[index];
  }
  return result;
}

module.exports = {
  normalizeClubName,
  normalizeRoleId,
  normalizeArea,
  ensureYear,
  randomAlphanumeric,
};
