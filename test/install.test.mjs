import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { main } from '../src/cli.mjs';

const ORIGINAL_SETTINGS = `{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "echo hola" }] }]
  },
  "permissions": {
    "deny": ["Bash(rm -rf /)"]
  }
}
`;

const ORIGINAL_PACKAGE = `{
  "name": "demo",
  "scripts": {
    "test": "node --test"
  }
}
`;

let root;
let output;
const realWrite = { out: process.stdout.write, err: process.stderr.write };

const run = (...args) => main(args, root);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-guard-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), ORIGINAL_SETTINGS);
  fs.writeFileSync(path.join(root, 'package.json'), ORIGINAL_PACKAGE);
  output = '';
  process.stdout.write = (chunk) => ((output += chunk), true);
  process.stderr.write = (chunk) => ((output += chunk), true);
});

afterEach(() => {
  process.stdout.write = realWrite.out;
  process.stderr.write = realWrite.err;
  fs.rmSync(root, { recursive: true, force: true });
});

test('install fusiona sin pisar los hooks ni las reglas del repo', async () => {
  assert.equal(await run('install', '--yes'), 0);
  const settings = json('.claude/settings.json');
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'echo hola');
  assert.deepEqual(settings.permissions.deny, ['Bash(rm -rf /)', 'Edit(/.husky/**)']);
  assert.equal(settings.sandbox.enabled, true);
  assert.equal(settings.sandbox.failIfUnavailable, true);
  assert.equal(settings.sandbox.allowUnsandboxedCommands, false);
  assert.ok(settings.sandbox.network.allowedDomains.includes('registry.npmjs.org'));
  assert.equal(settings.autoMode, undefined, 'autoMode no va en los settings del repo: Claude no lo lee de ahí');
});

test('install agrega los scripts, el contexto del modo auto y el documento', async () => {
  await run('install', '--yes');
  const { scripts } = json('package.json');
  assert.equal(scripts.test, 'node --test');
  assert.equal(scripts['claude:auto'], 'claude --settings .claude/repo-guard.auto-mode.json --permission-mode auto');
  assert.match(scripts['claude:free'], /--settings '\{"sandbox":\{"enabled":false\}\}' --dangerously-skip-permissions$/);
  assert.equal(json('.claude/repo-guard.auto-mode.json').autoMode.environment[0], '$defaults');
  assert.match(read('docs/development/claude-repo-guard.md'), /# Barandas de Claude Code en este repo/);
  assert.ok(exists('.claude/repo-guard.config.json'));
});

test('install dos veces no cambia nada la segunda', async () => {
  await run('install', '--yes');
  const before = read('.claude/settings.json') + read('package.json');
  output = '';
  assert.equal(await run('install', '--yes'), 0);
  assert.match(output, /ya está al día/);
  assert.equal(read('.claude/settings.json') + read('package.json'), before);
});

test('doctor da verde tras install y rojo si falta una regla', async () => {
  await run('install', '--yes');
  assert.equal(await run('doctor'), 0);
  const settings = json('.claude/settings.json');
  delete settings.sandbox.failIfUnavailable;
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(settings));
  output = '';
  assert.equal(await run('doctor'), 1);
  assert.match(output, /sandbox\.failIfUnavailable/);
});

test('doctor avisa si no está instalado', async () => {
  assert.equal(await run('doctor'), 1);
  assert.match(output, /no está instalado/);
});

test('un cambio en la configuración se aplica y lo quitado se quita', async () => {
  await run('install', '--yes');
  const config = json('.claude/repo-guard.config.json');
  config.allowedDomains = ['pypi.org'];
  config.integrationBranch = 'staging';
  config.docPath = 'docs/agentes.md';
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify(config, null, 2));
  await run('install', '--yes');
  assert.ok(json('.claude/settings.json').sandbox.network.allowedDomains.includes('pypi.org'));
  assert.match(json('.claude/repo-guard.auto-mode.json').autoMode.allow[1], /staging/);
  assert.ok(exists('docs/agentes.md'));
  assert.ok(!exists('docs/development/claude-repo-guard.md'), 'el documento viejo se borra');

  config.allowedDomains = [];
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify(config, null, 2));
  await run('install', '--yes');
  assert.ok(!json('.claude/settings.json').sandbox.network.allowedDomains.includes('pypi.org'));
});

test('uninstall deja el repo byte a byte como estaba', async () => {
  await run('install', '--yes');
  assert.equal(await run('uninstall', '--yes'), 0);
  assert.equal(read('.claude/settings.json'), ORIGINAL_SETTINGS);
  assert.equal(read('package.json'), ORIGINAL_PACKAGE);
  for (const file of ['.claude/repo-guard.auto-mode.json', '.claude/repo-guard.config.json', '.claude/repo-guard.manifest.json', 'docs/development/claude-repo-guard.md']) {
    assert.ok(!exists(file), `${file} se borra`);
  }
});

test('uninstall conserva un "scripts" vacío que ya estaba, y borra el que creó', async () => {
  const empty = '{\n  "name": "demo",\n  "scripts": {}\n}\n';
  fs.writeFileSync(path.join(root, 'package.json'), empty);
  await run('install', '--yes');
  await run('uninstall', '--yes');
  assert.equal(read('package.json'), empty);

  const none = '{\n  "name": "demo"\n}\n';
  fs.writeFileSync(path.join(root, 'package.json'), none);
  await run('install', '--yes');
  await run('uninstall', '--yes');
  assert.equal(read('package.json'), none);
});

test('uninstall respeta lo que se agregó a mano después', async () => {
  await run('install', '--yes');
  const settings = json('.claude/settings.json');
  settings.sandbox.network.allowedDomains.push('mi-dominio.cl');
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  await run('uninstall', '--yes');
  assert.deepEqual(json('.claude/settings.json').sandbox, { network: { allowedDomains: ['mi-dominio.cl'] } });
});

test('uninstall borra settings.json si lo creó install, y las carpetas que quedan vacías', async () => {
  fs.rmSync(path.join(root, '.claude', 'settings.json'));
  await run('install', '--yes');
  assert.ok(exists('.claude/settings.json'));
  await run('uninstall', '--yes');
  assert.ok(!exists('.claude'));
  assert.ok(!exists('docs'));
  assert.ok(exists('package.json'));
});

test('install no pisa un script del repo con el mismo nombre', async () => {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { 'claude:free': 'otra cosa' } }));
  assert.equal(await run('install', '--yes'), 1);
  assert.match(output, /ya tiene un script "claude:free" distinto/);
  assert.ok(!exists('.claude/repo-guard.manifest.json'), 'no escribe nada si hay conflicto');
});

test('--dry-run muestra los cambios sin escribir', async () => {
  assert.equal(await run('install', '--dry-run'), 0);
  assert.match(output, /\+ docs\/development\/claude-repo-guard\.md \(nuevo\)/);
  assert.ok(!exists('.claude/repo-guard.manifest.json'));
  assert.equal(read('.claude/settings.json'), ORIGINAL_SETTINGS);
});

test('sin terminal y sin --yes no escribe', async () => {
  assert.equal(await run('install'), 1);
  assert.ok(!exists('.claude/repo-guard.manifest.json'));
});

test('docPath fuera del repo se rechaza', async () => {
  for (const docPath of ['../fuera.md', '/tmp/fuera.md']) {
    fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ docPath }));
    output = '';
    assert.equal(await run('install', '--yes'), 1);
    assert.match(output, /ruta relativa dentro del repo/);
  }
});

test('una opción desconocida en la configuración falla con un mensaje claro', async () => {
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ allowDomains: [] }));
  assert.equal(await run('install', '--yes'), 1);
  assert.match(output, /no conozco la opción "allowDomains"/);
});
