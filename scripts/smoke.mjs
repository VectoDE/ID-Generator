// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

// Runs the built core (dist/index.mjs) once per format. CI uses it to prove the package works on Node, Deno and Bun
// without Node-only APIs: node scripts/smoke.mjs | deno run scripts/smoke.mjs | bun scripts/smoke.mjs
import {
  createPatternGenerator,
  createSnowflake,
  inspectId,
  isUlid,
  isUuid,
  nanoid,
  presets,
  ulid,
  uuidv4,
  uuidv7,
} from '../dist/index.mjs';

const check = (label, condition) => {
  if (!condition) {
    throw new Error(`Smoke test failed: ${label}`);
  }
  console.log(`ok  ${label}`);
};

check('uuid v4', isUuid(uuidv4(), 4));
check('uuid v7', inspectId(uuidv7()).version === 7);
check('ulid', isUlid(ulid()));
check('nanoid', /^[\w-]{21}$/.test(nanoid()));

const snowflake = createSnowflake({ workerId: 7 });
check('snowflake', snowflake.parse(snowflake.next()).workerId === 7);

const invoices = createPatternGenerator({ ...presets.invoice });
const [first, second] = await invoices.generateMany(2);
check('pattern sequence', first.endsWith('-00001') && second.endsWith('-00002'));

const club = createPatternGenerator({ ...presets.club });
const id = await club.generate({ club: 'hknet', role: '1-2', area: '1234', year: '2024' });
check('club preset', id === 'HKNET#1-2/1234-2024' && club.parse(id)?.area === '1234');
