// Throughput of every generator and a uniqueness check, measured against the build in dist/.
// Run with: npm run bench
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import {
  FileSequenceStore,
  createPatternGenerator,
  createSnowflake,
  nanoid,
  presets,
  ulid,
  uuidv4,
  uuidv7,
} from '../dist/node.mjs';

const ROUND_MS = 200;
const ROUNDS = 5;

// Runs `task` `batch` times. Synchronous tasks run without await, so the microtask queue does not distort them;
// asynchronous ones run one after another.
const runBatch = (task, batch, isAsync) => {
  if (isAsync) {
    return Array.from({ length: batch }).reduce((previous) => previous.then(task), Promise.resolve());
  }
  for (let index = 0; index < batch; index += 1) {
    task();
  }
  return Promise.resolve();
};

// Operations per second of one round: repeats batches until ROUND_MS has passed.
const round = async (task, batch, isAsync, start = performance.now(), operations = 0) => {
  await runBatch(task, batch, isAsync);
  const done = operations + batch;
  const elapsed = performance.now() - start;
  return elapsed < ROUND_MS ? round(task, batch, isAsync, start, done) : (done / elapsed) * 1000;
};

// Runs `step` for each item strictly one after another and collects the results.
const sequence = (items, step) =>
  items.reduce(async (previous, item) => [...(await previous), await step(item)], Promise.resolve([]));

// Median of several rounds after a warm-up round, which is less sensitive to background load than one long run.
const measure = async (task, batch = 1000) => {
  const isAsync = task() instanceof Promise;
  const [, ...results] = await sequence(Array.from({ length: ROUNDS + 1 }), () => round(task, batch, isAsync));
  const median = results.toSorted((a, b) => a - b)[Math.floor(ROUNDS / 2)] ?? 0;
  return Math.round(median);
};

const snowflake = createSnowflake();
const invoices = createPatternGenerator({ ...presets.invoice });
const club = createPatternGenerator({ ...presets.club });
const clubValues = { club: 'HKNET', role: '1-2', area: '1234' };
const statePath = join(tmpdir(), `id-generator-bench-${randomUUID()}.json`);
const fileInvoices = createPatternGenerator({ ...presets.invoice, store: new FileSequenceStore({ path: statePath }) });

const cases = [
  ['crypto.randomUUID (baseline)', () => randomUUID()],
  ['uuidv4()', () => uuidv4()],
  ['uuidv7()', () => uuidv7()],
  ['ulid()', () => ulid()],
  ['nanoid()', () => nanoid()],
  ['snowflake.next()', () => snowflake.next()],
  ['pattern INV-{year}-{seq:5}, memory store', () => invoices.generate()],
  ['pattern club preset', () => club.generate(clubValues)],
  ['pattern INV-{year}-{seq:5}, file store', () => fileInvoices.generate(), 20],
];

console.log(`Node ${process.version} on ${process.platform}/${process.arch}\n`);
const rows = await sequence(cases, async ([name, task, batch]) => ({
  generator: name,
  'ops/s': (await measure(task, batch)).toLocaleString('en-US'),
}));
console.table(rows);
await rm(statePath, { force: true });
await rm(`${statePath}.lock`, { force: true });

// One million IDs per format, all distinct.
const COUNT = 1_000_000;
for (const [name, make] of [
  ['uuidv7', uuidv7],
  ['ulid', () => ulid()],
  ['nanoid', () => nanoid()],
  ['snowflake', () => snowflake.next()],
]) {
  const seen = new Set();
  for (let index = 0; index < COUNT; index += 1) {
    seen.add(make());
  }
  const status = seen.size === COUNT ? 'all unique' : `${COUNT - seen.size} DUPLICATES`;
  console.log(`${name}: ${COUNT.toLocaleString('en-US')} IDs, ${status}`);
  if (seen.size !== COUNT) {
    process.exitCode = 1;
  }
}
