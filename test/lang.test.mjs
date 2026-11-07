import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { KURO, banner, blockOptions } from '../src/banner.mjs';
import { main } from '../src/cli.mjs';
import { resolveLang, takeLang } from '../src/lang.mjs';
import { en } from '../src/texts/en.mjs';
import { es } from '../src/texts/es.mjs';

let root;
let output;
const realWrite = { out: process.stdout.write, err: process.stderr.write };
const run = (args, env = {}) => main(args, root, env);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-guard-lang-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, 'package.json'), '{ "name": "demo" }\n');
  output = '';
  process.stdout.write = (chunk) => ((output += chunk), true);
  process.stderr.write = (chunk) => ((output += chunk), true);
});

afterEach(() => {
  process.stdout.write = realWrite.out;
  process.stderr.write = realWrite.err;
  fs.rmSync(root, { recursive: true, force: true });
});

// Todas las claves de un catálogo, como rutas con puntos.
const keys = (value, prefix = '') =>
  Object.entries(value)
    .flatMap(([key, item]) => (typeof item === 'object' && item !== null && !Array.isArray(item) ? keys(item, `${prefix}${key}.`) : [`${prefix}${key}`]))
    .sort();

// Palabras que delatan un texto en español en la salida en inglés.
const SPANISH = /\b(Listo|Revisa|está|archivo|revisiones|instalado|falta|corre|Uso|Opciones|nuevo|todo)\b/i;

test('el idioma es --lang, si no CLAUDE_REPO_GUARD_LANG, si no español; LANG no se lee', () => {
  assert.equal(resolveLang(undefined, {}), 'es');
  assert.equal(resolveLang(undefined, { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }), 'es');
  assert.equal(resolveLang(undefined, { CLAUDE_REPO_GUARD_LANG: 'en' }), 'en');
  assert.equal(resolveLang(undefined, { CLAUDE_REPO_GUARD_LANG: ' ' }), 'es');
  assert.equal(resolveLang('es', { CLAUDE_REPO_GUARD_LANG: 'en' }), 'es');
  assert.equal(resolveLang('EN', {}), 'en');
  assert.throws(() => resolveLang('fr', {}), (error) => error.source === '--lang' && error.value === 'fr');
  assert.throws(() => resolveLang(undefined, { CLAUDE_REPO_GUARD_LANG: 'pt' }), (error) => error.source === 'CLAUDE_REPO_GUARD_LANG');
});

test('--lang se saca de los argumentos en sus dos formas', () => {
  assert.deepEqual(takeLang(['apply', '--lang', 'en', '--yes']), { flag: 'en', rest: ['apply', '--yes'] });
  assert.deepEqual(takeLang(['--lang=en', 'doctor']), { flag: 'en', rest: ['doctor'] });
  assert.deepEqual(takeLang(['apply', '--lang']), { flag: '', rest: ['apply'] });
  assert.deepEqual(takeLang(['apply']), { flag: undefined, rest: ['apply'] });
});

test('los dos catálogos tienen las mismas claves', () => {
  assert.deepEqual(keys(en), keys(es));
  for (const key of keys(es)) {
    const pick = (catalog) => key.split('.').reduce((node, part) => node[part], catalog);
    assert.equal(typeof pick(en), typeof pick(es), key);
    if (typeof pick(es) === 'function') assert.equal(pick(en).length, pick(es).length, key);
  }
});

test('--help está completo en los dos idiomas', async () => {
  await run(['--help']);
  const spanish = output;
  output = '';
  await run(['--help', '--lang', 'en']);
  assert.match(spanish, /^claude-repo-guard: barandas/);
  assert.match(output, /^claude-repo-guard: Claude Code guardrails/);
  for (const option of ['apply', 'uninstall', 'doctor', '--dry-run', '--yes', '--repo', '--json', '--lang', 'CLAUDE_REPO_GUARD_LANG', 'NO_COLOR']) {
    assert.ok(spanish.includes(option), `falta ${option} en español`);
    assert.ok(output.includes(option), `falta ${option} en inglés`);
  }
  assert.doesNotMatch(output, SPANISH);
  assert.equal(spanish.split('\n').length, output.split('\n').length, 'las dos ayudas tienen las mismas líneas');
});

test('apply y doctor salen enteros en inglés con --lang en, y con la variable', async () => {
  assert.equal(await run(['apply', '--dry-run', '--lang', 'en']), 0);
  assert.match(output, /\(new\)/);
  assert.match(output, /\[ok\] --dry-run mode: nothing was written\./);
  assert.match(output, /claude-repo-guard apply --yes/);
  output = '';
  assert.equal(await run(['apply', '--yes'], { CLAUDE_REPO_GUARD_LANG: 'en' }), 0);
  assert.match(output, /\[ok\] Done: \d+ files\./);
  assert.doesNotMatch(output.replace(/^ {2}[+-].*$/gm, ''), SPANISH);
  output = '';
  assert.equal(await run(['doctor', '--repo', '--lang', 'en']), 0);
  assert.match(output, /✓ Version: v/);
  assert.match(output, /\[ok\] All good: \d+ checks\./);
  assert.doesNotMatch(output, SPANISH);
});

test('apply y doctor terminan con el bloque en español por defecto', async () => {
  await run(['apply', '--yes']);
  assert.match(output, /\[ok\] Listo: \d+ archivos\.\n\n {2}Revisa el diff y haz commit\.\n\n$/);
  output = '';
  fs.rmSync(path.join(root, '.claude', 'repo-guard.auto-mode.json'));
  assert.equal(await run(['doctor', '--repo']), 1);
  assert.match(output, /✗ Contexto del modo auto: no coincide/);
  assert.match(output, /\[!\] 1 de \d+ revisiones fallan\.\n\n$/);
});

test('doctor --json sigue en español aunque la terminal hable inglés', async () => {
  await run(['apply', '--yes']);
  output = '';
  await run(['doctor', '--repo', '--json', '--lang', 'en']);
  const checks = JSON.parse(output);
  assert.equal(checks[0].name, 'Versión');
  assert.ok(checks.some((check) => check.name === 'Contexto del modo auto' && check.detail === 'al día'));
});

test('los errores también salen en inglés', async () => {
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), '{ "allowDomains": [] }\n');
  assert.equal(await run(['apply', '--lang', 'en']), 1);
  assert.match(output, /\[!\] .*unknown option "allowDomains"\. The options are:/);
  output = '';
  assert.equal(await run(['nope', '--lang', 'en']), 1);
  assert.match(output, /\[!\] Unknown command "nope"\./);
});

test('un idioma desconocido falla y lo dice en los dos idiomas', async () => {
  assert.equal(await run(['doctor', '--lang', 'fr']), 1);
  assert.match(output, /--lang acepta es o en, no "fr"/);
  assert.match(output, /--lang accepts es or en, not "fr"/);
  output = '';
  assert.equal(await run(['doctor'], { CLAUDE_REPO_GUARD_LANG: 'pt' }), 1);
  assert.match(output, /CLAUDE_REPO_GUARD_LANG acepta es o en/);
});

const DONE = { mood: 'ok', title: 'Listo: 3 archivos.', lines: ['Revisa el diff y haz commit.'], next: { label: 'Para escribirlos:', command: 'claude-repo-guard apply --yes' } };

test('KURO es el dibujo de issue-flow, byte a byte', () => {
  assert.equal(KURO.join('\n'), ['    ▄█████▄', ' ≋≋██▀▀▀▀▀██', '    █ ▄  ▄ █   ╱', '    ▀█▄▄▄▄█▀  ╱'].join('\n'));
});

test('con Kuro, el texto empieza en la fila 1 y la columna 26', () => {
  const literal =
    '\n' +
    '    ▄█████▄\n' +
    ' ≋≋██▀▀▀▀▀██' + ' '.repeat(14) + '[ok] Listo: 3 archivos.\n' +
    '    █ ▄  ▄ █   ╱\n' +
    '    ▀█▄▄▄▄█▀  ╱' + ' '.repeat(11) + 'Revisa el diff y haz commit.\n' +
    '\n' +
    ' '.repeat(26) + 'Para escribirlos:\n' +
    ' '.repeat(28) + 'claude-repo-guard apply --yes\n' +
    '\n';
  assert.equal(banner(DONE, { art: true, color: false }), literal);
});

test('sin Kuro no hay dibujo y el texto va con dos espacios', () => {
  assert.equal(
    banner(DONE, { art: false, color: false }),
    '\n  [ok] Listo: 3 archivos.\n\n  Revisa el diff y haz commit.\n\n  Para escribirlos:\n    claude-repo-guard apply --yes\n\n',
  );
});

test('el color solo aparece si se pide, y cada tono tiene su marca', () => {
  assert.ok(!banner(DONE, { art: true, color: false }).includes('\x1b'));
  const colored = banner(DONE, { art: true, color: true });
  assert.ok(colored.includes('\x1b[32m[ok]'));
  assert.ok(colored.includes('\x1b[1mclaude-repo-guard apply --yes'));
  assert.ok(banner({ mood: 'error', title: 'x' }, { art: false, color: true }).includes('\x1b[31m[!]'));
  assert.ok(banner({ mood: 'question', title: 'x' }, { art: false, color: false }).includes('[?] x'));
});

test('Kuro solo en una terminal; NO_COLOR quita el color', () => {
  assert.deepEqual(blockOptions('stdout', { isTTY: true }, {}), { art: true, color: true });
  assert.deepEqual(blockOptions('stdout', { isTTY: true }, { NO_COLOR: '1' }), { art: true, color: false });
  assert.deepEqual(blockOptions('stdout', { isTTY: false }, {}), { art: false, color: false });
  assert.deepEqual(blockOptions('stderr', {}, {}), { art: false, color: false });
});
