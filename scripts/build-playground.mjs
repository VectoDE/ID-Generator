// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

// Bundles the playground into playground/dist. With --serve it rebuilds on change and serves on http://localhost:5173.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('../playground/', import.meta.url));
const outdir = `${root}dist`;
const serve = process.argv.includes('--serve');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
// _headers carries the security headers for Cloudflare Pages.
await Promise.all(
  ['index.html', 'styles.css', '_headers'].map((file) => copyFile(`${root}${file}`, `${outdir}/${file}`))
);

const options = {
  entryPoints: [`${root}src/main.ts`],
  outfile: `${outdir}/main.js`,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !serve,
  sourcemap: serve,
  legalComments: 'none',
  logLevel: 'info',
};

if (serve) {
  const context = await esbuild.context(options);
  await context.watch();
  // HTML and CSS are copied once; restart after changing them.
  const { port } = await context.serve({ servedir: outdir, port: 5173, host: '127.0.0.1' });
  console.log(`Playground on http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
