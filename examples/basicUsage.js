const { createIDGenerator } = require('../src');

const generator = createIDGenerator({
  sequence: {
    enabled: true,
    padTo: 5,
    scope: 'club',
  },
});

const payload = {
  club: 'HKNET',
  role: '1-2',
  area: '1234',
  year: 2024,
};

console.log('Preview:', generator.preview(payload));
console.log('Generated ID:', generator.generate(payload));
console.log('Batch:', generator.generateBatch([payload, payload, payload]));
