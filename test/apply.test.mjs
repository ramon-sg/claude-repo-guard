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

const NPM_CACHE = ['~/.npm/_cacache', '~/.npm/_npx'];

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

test('apply fusiona sin pisar los hooks ni las reglas del repo', async () => {
  assert.equal(await run('apply', '--yes'), 0);
  const settings = json('.claude/settings.json');
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'echo hola');
  assert.deepEqual(settings.permissions.deny, ['Bash(rm -rf /)', 'Edit(/.husky/**)']);
  assert.equal(settings.sandbox.enabled, true);
  assert.equal(settings.sandbox.failIfUnavailable, undefined, 'con failIfUnavailable la sesión en la nube no arranca');
  assert.equal(settings.sandbox.allowUnsandboxedCommands, false);
  assert.ok(settings.sandbox.network.allowedDomains.includes('registry.npmjs.org'));
  assert.deepEqual(settings.sandbox.filesystem.allowWrite, ['/private/var/folders', ...NPM_CACHE], 'mktemp de macOS escribe ahí aunque TMPDIR diga otra cosa; npx, en la caché de npm');
  assert.equal(settings.autoMode, undefined, 'autoMode no va en los settings del repo: Claude no lo lee de ahí');
});

test('apply agrega los scripts, el contexto del modo auto y el documento', async () => {
  await run('apply', '--yes');
  const { scripts } = json('package.json');
  assert.equal(scripts.test, 'node --test');
  assert.equal(scripts['claude:auto'], 'claude --settings .claude/repo-guard.auto-mode.json --permission-mode auto');
  assert.match(scripts['claude:free'], /--settings '\{"sandbox":\{"enabled":false\}\}' --dangerously-skip-permissions$/);
  assert.equal(json('.claude/repo-guard.auto-mode.json').autoMode.environment[0], '$defaults');
  assert.match(read('docs/development/claude-repo-guard.md'), /# Barandas de Claude Code en este repo/);
  assert.ok(exists('.claude/repo-guard.config.json'));
});

const writePackage = (extra) => fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', ...extra }, null, 2));
const touch = (file) => fs.writeFileSync(path.join(root, file), '');
const doc = () => read('docs/development/claude-repo-guard.md');

test('el documento usa bun si el repo tiene bun.lock', async () => {
  touch('bun.lock');
  await run('apply', '--yes');
  assert.match(doc(), /`bun run claude:auto`/);
  assert.match(doc(), /`bun run claude:free`/);
  assert.doesNotMatch(doc(), /pnpm/);
  assert.equal(await run('doctor', '--repo'), 0);
});

test('el documento usa bun si packageManager dice bun, aunque haya otro lockfile', async () => {
  writePackage({ packageManager: 'bun@1.4.2' });
  touch('package-lock.json');
  await run('apply', '--yes');
  assert.match(doc(), /`bun run claude:auto`/);
});

test('el documento usa npm con package-lock.json o sin lockfile', async () => {
  await run('apply', '--yes');
  assert.match(doc(), /`npm run claude:auto`/);
  assert.doesNotMatch(doc(), /pnpm/);

  touch('package-lock.json');
  await run('apply', '--yes');
  assert.match(doc(), /`npm run claude:free`/);
});

test('el documento usa pnpm y avisa de pnpm install con pnpm-lock.yaml', async () => {
  touch('pnpm-lock.yaml');
  await run('apply', '--yes');
  assert.match(doc(), /`pnpm claude:auto`/);
  assert.match(doc(), /`pnpm install` no funciona dentro del sandbox/);
});

test('con bun el sandbox abre la caché de bun y el documento avisa del riesgo', async () => {
  touch('bun.lock');
  await run('apply', '--yes');
  assert.deepEqual(json('.claude/settings.json').sandbox.filesystem.allowWrite, ['/private/var/folders', ...NPM_CACHE, '~/.bun/install/cache']);
  assert.match(doc(), /La caché de bun \(`~\/.bun\/install\/cache`\) está abierta/);
  assert.equal(await run('doctor', '--repo'), 0);

  await run('uninstall', '--yes');
  assert.equal(read('.claude/settings.json'), ORIGINAL_SETTINGS);
});

test('sin bun el sandbox no abre la caché de bun', async () => {
  touch('pnpm-lock.yaml');
  await run('apply', '--yes');
  assert.ok(!json('.claude/settings.json').sandbox.filesystem.allowWrite.includes('~/.bun/install/cache'));
  assert.doesNotMatch(doc(), /caché de bun/);
});

test('bunCache: false cierra la caché de bun y el documento dice que bun install no funciona', async () => {
  touch('bun.lock');
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ bunCache: false }));
  await run('apply', '--yes');
  assert.deepEqual(json('.claude/settings.json').sandbox.filesystem.allowWrite, ['/private/var/folders', ...NPM_CACHE]);
  assert.match(doc(), /`bun install` no funciona dentro del sandbox/);
  assert.equal(await run('doctor', '--repo'), 0);
});

test('la caché de npm se abre en todo repo, aunque use bun, y el documento avisa del riesgo', async () => {
  touch('bun.lock');
  await run('apply', '--yes');
  assert.ok(NPM_CACHE.every((dir) => json('.claude/settings.json').sandbox.filesystem.allowWrite.includes(dir)));
  assert.match(doc(), /La caché de npm \(`~\/.npm\/_cacache` y `~\/.npm\/_npx`\) está abierta/);
});

test('npmCache: false cierra la caché de npm y el documento dice que npx no funciona', async () => {
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ npmCache: false }));
  await run('apply', '--yes');
  assert.deepEqual(json('.claude/settings.json').sandbox.filesystem.allowWrite, ['/private/var/folders']);
  assert.match(doc(), /`npx` de un paquete que no está en el repo no funciona dentro del sandbox/);
  assert.equal(await run('doctor', '--repo'), 0);
});

test('el documento avisa que git no puede tocar las skills ni los settings dentro del sandbox', async () => {
  await run('apply', '--yes');
  assert.match(doc(), /un `git merge`, `git pull` o `git switch` que cambia `.agents\/skills\/`, `.claude\/skills` o `.claude\/settings.json` falla con `Operation not permitted`.*desde tu terminal/);
});

test('apply dos veces no cambia nada la segunda', async () => {
  await run('apply', '--yes');
  const before = read('.claude/settings.json') + read('package.json');
  output = '';
  assert.equal(await run('apply', '--yes'), 0);
  assert.match(output, /ya está al día/);
  assert.equal(read('.claude/settings.json') + read('package.json'), before);
});

test('doctor da verde tras apply y rojo si falta una regla', async () => {
  await run('apply', '--yes');
  assert.equal(await run('doctor', '--repo'), 0);
  const settings = json('.claude/settings.json');
  delete settings.sandbox.allowUnsandboxedCommands;
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(settings));
  output = '';
  assert.equal(await run('doctor', '--repo'), 1);
  assert.match(output, /sandbox\.allowUnsandboxedCommands/);
});

test('install ya no existe: falla sin escribir y dice que ahora es apply', async () => {
  assert.equal(await run('install', '--yes'), 1);
  assert.match(output, /ahora se llama "apply"/);
  assert.ok(!exists('.claude/repo-guard.manifest.json'));
});

test('el documento y doctor dicen apply, no install', async () => {
  await run('apply', '--yes');
  assert.match(doc(), /claude-repo-guard apply`/);
  assert.doesNotMatch(doc(), /claude-repo-guard install/);

  const manifestFile = path.join(root, '.claude', 'repo-guard.manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestFile, 'utf8')), version: '0.0.1' }));
  output = '';
  assert.equal(await run('doctor', '--repo'), 1);
  assert.match(output, /instalado con v0\.0\.1.*corre `npx github:ramon-sg\/claude-repo-guard#v\d+\.\d+\.\d+ apply`/);
});

test('doctor marca failIfUnavailable porque rompe las sesiones en la nube', async () => {
  await run('apply', '--yes');
  const settings = json('.claude/settings.json');
  settings.sandbox.failIfUnavailable = true;
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(settings));
  assert.equal(await run('doctor', '--repo'), 1);
  assert.match(output, /quita sandbox\.failIfUnavailable/);
});

test('aplicar sobre la v0.1.0 quita el failIfUnavailable que ella puso', async () => {
  await run('apply', '--yes');
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const manifestFile = path.join(root, '.claude', 'repo-guard.manifest.json');
  const settings = json('.claude/settings.json');
  settings.sandbox.failIfUnavailable = true;
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.settingsOperations.push({ op: 'set', path: ['sandbox', 'failIfUnavailable'], value: true, had: false });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  await run('apply', '--yes');
  assert.equal(json('.claude/settings.json').sandbox.failIfUnavailable, undefined);
  output = '';
  assert.equal(await run('doctor', '--repo'), 0);
});

test('doctor avisa si no está instalado', async () => {
  assert.equal(await run('doctor', '--repo'), 1);
  assert.match(output, /no está instalado/);
});

test('un cambio en la configuración se aplica y lo quitado se quita', async () => {
  await run('apply', '--yes');
  const config = json('.claude/repo-guard.config.json');
  config.allowedDomains = ['pypi.org'];
  config.integrationBranch = 'staging';
  config.docPath = 'docs/agentes.md';
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify(config, null, 2));
  await run('apply', '--yes');
  assert.ok(json('.claude/settings.json').sandbox.network.allowedDomains.includes('pypi.org'));
  assert.match(json('.claude/repo-guard.auto-mode.json').autoMode.allow[1], /staging/);
  assert.ok(exists('docs/agentes.md'));
  assert.ok(!exists('docs/development/claude-repo-guard.md'), 'el documento viejo se borra');

  config.allowedDomains = [];
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify(config, null, 2));
  await run('apply', '--yes');
  assert.ok(!json('.claude/settings.json').sandbox.network.allowedDomains.includes('pypi.org'));
});

test('allowWrite y allowUnixSockets llegan al sandbox y al documento', async () => {
  fs.writeFileSync(
    path.join(root, '.claude', 'repo-guard.config.json'),
    JSON.stringify({ allowWrite: ['~/.cleanqueen'], allowUnixSockets: ['/var/run/docker.sock'] }),
  );
  await run('apply', '--yes');
  const { sandbox } = json('.claude/settings.json');
  assert.deepEqual(sandbox.filesystem.allowWrite, ['/private/var/folders', ...NPM_CACHE, '~/.cleanqueen']);
  assert.deepEqual(sandbox.network.allowUnixSockets, ['/var/run/docker.sock']);
  const doc = read('docs/development/claude-repo-guard.md');
  assert.match(doc, /El socket de Docker está abierto/);
  assert.match(doc, /`~\/.cleanqueen`/);
  assert.equal(await run('doctor', '--repo'), 0);

  await run('uninstall', '--yes');
  assert.equal(read('.claude/settings.json'), ORIGINAL_SETTINGS);
});

test('sin allowUnixSockets no se abre ningún socket y el documento lo dice', async () => {
  await run('apply', '--yes');
  assert.equal(json('.claude/settings.json').sandbox.network.allowUnixSockets, undefined);
  assert.match(read('docs/development/claude-repo-guard.md'), /Docker queda bloqueado/);
});

test('askCommands y denyCommands se vuelven reglas de permisos y se quitan al desinstalar', async () => {
  fs.writeFileSync(
    path.join(root, '.claude', 'repo-guard.config.json'),
    JSON.stringify({ askCommands: ['git reset --hard', 'kubectl delete'], denyCommands: ['helm uninstall'] }),
  );
  await run('apply', '--yes');
  const { permissions } = json('.claude/settings.json');
  assert.deepEqual(permissions.ask, ['Bash(git reset --hard*)', 'Bash(kubectl delete*)']);
  assert.deepEqual(permissions.deny, ['Bash(rm -rf /)', 'Edit(/.husky/**)', 'Bash(helm uninstall*)']);
  const doc = read('docs/development/claude-repo-guard.md');
  assert.match(doc, /Qué pasa con los comandos que piden confirmación/);
  assert.match(doc, /`Bash\(helm uninstall\*\)`/);
  assert.equal(await run('doctor', '--repo'), 0);

  await run('uninstall', '--yes');
  assert.equal(read('.claude/settings.json'), ORIGINAL_SETTINGS);
});

test('un comando con paréntesis en askCommands se rechaza', async () => {
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ askCommands: ['Bash(git push)'] }));
  assert.equal(await run('apply', '--yes'), 1);
  assert.match(output, /sin paréntesis/);
});

test('uninstall deja el repo byte a byte como estaba', async () => {
  await run('apply', '--yes');
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
  await run('apply', '--yes');
  await run('uninstall', '--yes');
  assert.equal(read('package.json'), empty);

  const none = '{\n  "name": "demo"\n}\n';
  fs.writeFileSync(path.join(root, 'package.json'), none);
  await run('apply', '--yes');
  await run('uninstall', '--yes');
  assert.equal(read('package.json'), none);
});

test('uninstall respeta lo que se agregó a mano después', async () => {
  await run('apply', '--yes');
  const settings = json('.claude/settings.json');
  settings.sandbox.network.allowedDomains.push('mi-dominio.cl');
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  await run('uninstall', '--yes');
  assert.deepEqual(json('.claude/settings.json').sandbox, { network: { allowedDomains: ['mi-dominio.cl'] } });
});

test('uninstall borra settings.json si lo creó install, y las carpetas que quedan vacías', async () => {
  fs.rmSync(path.join(root, '.claude', 'settings.json'));
  await run('apply', '--yes');
  assert.ok(exists('.claude/settings.json'));
  await run('uninstall', '--yes');
  assert.ok(!exists('.claude'));
  assert.ok(!exists('docs'));
  assert.ok(exists('package.json'));
});

test('apply no pisa un script del repo con el mismo nombre', async () => {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { 'claude:free': 'otra cosa' } }));
  assert.equal(await run('apply', '--yes'), 1);
  assert.match(output, /ya tiene un script "claude:free" distinto/);
  assert.ok(!exists('.claude/repo-guard.manifest.json'), 'no escribe nada si hay conflicto');
});

test('--dry-run muestra los cambios sin escribir', async () => {
  assert.equal(await run('apply', '--dry-run'), 0);
  assert.match(output, /\+ docs\/development\/claude-repo-guard\.md \(nuevo\)/);
  assert.ok(!exists('.claude/repo-guard.manifest.json'));
  assert.equal(read('.claude/settings.json'), ORIGINAL_SETTINGS);
});

test('sin terminal y sin --yes no escribe', async () => {
  assert.equal(await run('apply'), 1);
  assert.ok(!exists('.claude/repo-guard.manifest.json'));
});

test('docPath fuera del repo se rechaza', async () => {
  for (const docPath of ['../fuera.md', '/tmp/fuera.md']) {
    fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ docPath }));
    output = '';
    assert.equal(await run('apply', '--yes'), 1);
    assert.match(output, /ruta relativa dentro del repo/);
  }
});

test('un manifiesto alterado no puede borrar archivos fuera de lo generado', async () => {
  const outside = path.join(path.dirname(root), `${path.basename(root)}-victima.md`);
  fs.writeFileSync(outside, 'no me borres');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'código');
  await run('apply', '--yes');
  const manifestFile = path.join(root, '.claude', 'repo-guard.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

  for (const evil of [`../${path.basename(outside)}`, outside, 'src/index.js']) {
    fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, files: [evil] }));
    output = '';
    assert.equal(await run('uninstall', '--yes'), 1, `rechaza ${evil}`);
  }
  assert.equal(fs.readFileSync(outside, 'utf8'), 'no me borres');
  assert.ok(exists('src/index.js'));
  fs.rmSync(outside);
});

test('no escribe a través de un enlace simbólico', async () => {
  const outside = path.join(path.dirname(root), `${path.basename(root)}-destino.md`);
  fs.writeFileSync(outside, 'original');
  fs.mkdirSync(path.join(root, 'docs', 'development'), { recursive: true });
  fs.symlinkSync(outside, path.join(root, 'docs', 'development', 'claude-repo-guard.md'));
  assert.equal(await run('apply', '--yes'), 1);
  assert.match(output, /enlace simbólico/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'original');
  fs.rmSync(outside);
});

test('una opción desconocida en la configuración falla con un mensaje claro', async () => {
  fs.writeFileSync(path.join(root, '.claude', 'repo-guard.config.json'), JSON.stringify({ allowDomains: [] }));
  assert.equal(await run('apply', '--yes'), 1);
  assert.match(output, /no conozco la opción "allowDomains"/);
});
