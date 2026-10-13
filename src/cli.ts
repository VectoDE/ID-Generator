#!/usr/bin/env node

// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import process from 'node:process';
import { runCli } from './cli/run.js';

// `idgen uuid -n 100000 | head -1` closes the pipe early; that is a normal end, not a crash.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') {
    throw error;
  }
  process.exit(0);
});

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
});
