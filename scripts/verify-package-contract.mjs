import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const require = createRequire(import.meta.url);

function assertExports(module, label) {
  assert.equal(typeof module.optimizeImage, 'function', `${label}: optimizeImage`);
  assert.equal(typeof module.optimizeImages, 'function', `${label}: optimizeImages`);
  assert.equal(typeof module.ImageSlimError, 'function', `${label}: ImageSlimError`);

  const error = new module.ImageSlimError('ABORTED', 'contract check');
  assert.equal(error.code, 'ABORTED');
  assert.equal(error.name, 'ImageSlimError');
}

const distFiles = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
  'dist/worker/image-slim.worker.js',
];

for (const file of distFiles) {
  assert.ok(existsSync(resolve(file)), `Missing build artifact: ${file}`);
}

const esm = await import(pathToFileURL(resolve('dist/index.js')).href);
assertExports(esm, 'esm');

const cjs = require(resolve('dist/index.cjs'));
assertExports(cjs, 'cjs');

assert.equal(typeof globalThis.document, 'undefined', 'Contract check requires no DOM.');
process.stdout.write('Package contract verified (ESM, CJS, SSR import).\n');
