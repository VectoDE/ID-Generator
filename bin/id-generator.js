#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const process = require('process');
const { IDGenerator } = require('../src');

function printHelp() {
  const helpMessage = `\nID Generator CLI\n================\n\nUsage:\n  id-generator --club <name> --role <id> --area <code> --year <yyyy> [options]\n\nOptions:\n  --pattern <pattern>         Custom pattern using {club}, {role}, {area}, {year}, {sequence}, {random}\n  --config <file>             Path to JSON configuration overriding generator defaults\n  --count <number>            Generate multiple identifiers in one run\n  --sequence-scope <scope>    Custom scope for sequence counters\n  --isolated-sequence         Use isolated sequence counters per generated ID in batch mode\n  --describe                  Print token configuration and exit\n  --preview                   Show resolved token values without generating an ID\n  --help                      Display this message\n\nExamples:\n  id-generator --club HKNET --role 1-2 --area 1234 --year 2024\n  id-generator --club HKNET --role 1-2 --area 1234 --year 2024 --pattern "{club}-{area}-{sequence}" --count 3\n`;
  process.stdout.write(helpMessage);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function loadConfig(configPath) {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuration file not found at ${resolved}`);
  }
  const data = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(data);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || Object.keys(args).length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const generatorOptions = {};
  if (args.config) {
    Object.assign(generatorOptions, loadConfig(args.config));
  }

  if (args.pattern) {
    generatorOptions.pattern = args.pattern;
  }

  const generator = new IDGenerator(generatorOptions);

  if (args.describe) {
    const tokens = generator.describeTokens();
    process.stdout.write(`${JSON.stringify(tokens, null, 2)}\n`);
    return;
  }

  const payload = {
    club: args.club,
    role: args.role,
    area: args.area,
    year: args.year,
  };

  const runtime = {
    sequenceScope: args['sequence-scope'],
    isolatedSequence: Boolean(args['isolated-sequence']),
  };

  if (args.preview) {
    const preview = generator.preview(payload, runtime);
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return;
  }

  const count = Number.parseInt(args.count ?? '1', 10);
  if (Number.isNaN(count) || count <= 0) {
    process.stderr.write('Count must be a positive integer.\n');
    process.exit(1);
  }

  try {
    if (count === 1) {
      const id = generator.generate(payload, runtime);
      process.stdout.write(`${id}\n`);
    } else {
      const ids = generator.generateBatch(
        Array.from({ length: count }, () => ({ ...payload })),
        { ...runtime, isolatedSequence: args['isolated-sequence'] },
      );
      ids.forEach((id) => process.stdout.write(`${id}\n`));
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Unexpected error: ${error.message}\n`);
    process.exit(1);
  }
}
