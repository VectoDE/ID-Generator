# ID Generator

Enterprise-ready identifier generation toolkit for Node.js. The project ships with a configurable engine, batch processing helpers, a zero-dependency CLI, and a test-suite powered by the Node.js test runner.

## Key Features

- **Configurable patterns** – compose identifiers with tokens such as `{club}`, `{role}`, `{area}`, `{year}`, `{sequence}`, and `{random}`.
- **Normalization and validation** – built-in normalization helpers keep identifiers clean and consistent. Custom validation hooks are supported.
- **Sequence management** – maintain scoped counters with padding, reset helpers, and runtime overrides.
- **Batch generation** – generate large batches of identifiers while retaining deterministic sequencing.
- **CLI utility** – generate identifiers from the terminal, inspect token configuration, and preview token resolution.
- **Zero external dependencies** – works out of the box with Node.js ≥ 18.

## Getting Started

```bash
npm install
npm run test
```

> The project does not require third-party packages, so `npm install` simply creates the lockfile on first run.

## Programmatic Usage

```js
const { createIDGenerator } = require('id-generator');

const generator = createIDGenerator({
  pattern: '{club}#{role}/{area}-{year}-{sequence}',
  sequence: { padTo: 4, scope: 'club' },
});

const payload = {
  club: 'HKNET',
  role: '1-2',
  area: '1234',
  year: 2024,
};

const identifier = generator.generate(payload);
console.log(identifier); // HKNET#1-2/1234-2024-0001
```

### Batch Processing

```js
const batch = generator.generateBatch([
  payload,
  { ...payload, role: '2-3' },
]);

console.log(batch);
// [ 'HKNET#1-2/1234-2024-0002', 'HKNET#2-3/1234-2024-0003' ]
```

### Preview Tokens

```js
console.log(generator.preview({ club: 'HKNET' }));
// {
//   club: 'HKNET',
//   role: { error: 'Missing required token "role".' },
//   area: { error: 'Missing required token "area".' },
//   year: { error: 'Missing required token "year".' }
// }
```

### Custom Tokens

```js
const generator = createIDGenerator({
  pattern: '{club}-{region}-{sequence}',
  tokens: {
    ...require('./src/config/defaultConfig').defaultTokens,
    region: {
      required: true,
      normalize: (value) => String(value).toUpperCase(),
    },
  },
});

const id = generator.generate({
  club: 'HKNET',
  role: '1-2',
  area: '1234',
  year: 2024,
  region: 'emea',
});

console.log(id); // HKNET-EMEA-0001
```

## Command Line Interface

```
id-generator --club HKNET --role 1-2 --area 1234 --year 2024
```

### CLI Options

| Option | Description |
| ------ | ----------- |
| `--pattern <pattern>` | Override the pattern for the current run. |
| `--config <file>` | Load generator options from a JSON file. |
| `--count <number>` | Generate multiple identifiers at once. |
| `--sequence-scope <scope>` | Override the sequence scope. |
| `--isolated-sequence` | Use isolated sequence scopes per identifier in batch mode. |
| `--describe` | Print configured tokens. |
| `--preview` | Show resolved token values without producing an identifier. |
| `--help` | Display CLI documentation. |

Example configuration file (`generator.config.json`):

```json
{
  "pattern": "{club}-{area}-{sequence}-{random}",
  "sequence": { "padTo": 3 },
  "finalize": null
}
```

```
id-generator --config generator.config.json --club HKNET --role 1-2 --area 1234 --year 2024 --count 3
```

## Testing

Run the test suite via the Node.js test runner:

```bash
npm test
```

## Folder Structure

```
├── bin/                  # CLI entry point
├── examples/             # Programmatic usage samples
├── src/
│   ├── config/           # Default configuration and token definitions
│   ├── core/             # Identifier engine
│   └── utils/            # Helpers and error definitions
├── test/                 # Node.js test runner suites
├── index.js              # Package entry point
└── package.json
```

## License

BSD 3-Clause License. See [LICENSE](./LICENSE) for details.
