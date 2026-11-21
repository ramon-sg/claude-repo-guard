import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('el paquete publicado trae dist y nada del código fuente', () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' }));
  const files = packed.files.map((file) => file.path);
  for (const file of ['dist/claude-repo-guard.mjs', 'package.json', 'README.md', 'LICENSE']) {
    assert.ok(files.includes(file), `falta ${file}`);
  }
  const leaked = files.filter((file) => /^(src|test|scripts)\//.test(file));
  assert.deepEqual(leaked, []);
});

test('el package.json publicado no tiene dependencies y su bin es el de dist', () => {
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.equal(pkg.bin['claude-repo-guard'], 'dist/claude-repo-guard.mjs');
});

test('el empaquetado responde --version con la versión de package.json', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'dist', 'claude-repo-guard.mjs'), '--version'], { encoding: 'utf8' });
  assert.equal(out.trim(), pkg.version);
});
