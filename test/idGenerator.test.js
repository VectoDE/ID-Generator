const test = require('node:test');
const assert = require('node:assert/strict');
const { IDGenerator } = require('../src');

test('generates identifier using default pattern', () => {
  const generator = new IDGenerator();
  const id = generator.generate({
    club: 'HKNET',
    role: '1-2',
    area: '1234',
    year: 2024,
  });
  assert.equal(id, 'HKNET#1-2/1234-2024');
});

test('throws when required token missing', () => {
  const generator = new IDGenerator();
  assert.throws(
    () => generator.generate({ club: 'HKNET', role: '1-2', year: 2024 }),
    /Missing required token "area"/,
  );
});

test('supports sequences with padding', () => {
  const generator = new IDGenerator({
    pattern: '{club}-{sequence}',
    sequence: { enabled: true, padTo: 3 },
    tokens: {
      ...require('../src/config/defaultConfig').defaultTokens,
    },
  });

  const first = generator.generate({ club: 'HKNET', role: 'A', area: '1', year: 2024 });
  const second = generator.generate({ club: 'HKNET', role: 'A', area: '1', year: 2024 });

  assert.equal(first, 'HKNET-001');
  assert.equal(second, 'HKNET-002');
});

test('batch generation returns multiple ids', () => {
  const generator = new IDGenerator({
    pattern: '{club}-{sequence}',
  });

  const ids = generator.generateBatch([
    { club: 'A', role: 'r', area: '1', year: 2024 },
    { club: 'A', role: 'r', area: '1', year: 2024 },
  ]);

  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test('preview surfaces errors without throwing', () => {
  const generator = new IDGenerator();
  const preview = generator.preview({ club: 'A' });
  assert.equal(preview.club, 'A');
  assert.match(preview.role.error, /Missing required token/);
});

test('allows pattern updates at runtime', () => {
  const generator = new IDGenerator();
  generator.setPattern('{club}-{year}');
  const id = generator.generate({ club: 'HKNET', role: 'A', area: '1', year: 2024 });
  assert.equal(id, 'HKNET-2024');
});

