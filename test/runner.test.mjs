import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { VERSION as RUNNER_VERSION } from '@ramon-sg/runner';
import { main, version } from '../src/cli.mjs';
import { es } from '../src/texts/es.mjs';
import { usePath } from './fake-bin.mjs';

const PKG = '@ramon-sg/claude-repo-guard';
const RUNNER_FILE = '.agents/runner.json';
const SCHEMA = `https://cdn.jsdelivr.net/npm/@ramon-sg/runner@${RUNNER_VERSION}/runner.schema.json`;

let root;
let output;
let restorePath;
const realWrite = { out: process.stdout.write, err: process.stderr.write };

const run = (...args) => main(args, root);
const file = (name) => path.join(root, name);
const exists = (name) => fs.existsSync(file(name));
const read = (name) => fs.readFileSync(file(name), 'utf8');
const json = (name) => JSON.parse(read(name));
const write = (name, content) => {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
};
const doc = () => read('docs/development/claude-repo-guard.md');

/** Cambia el PATH falso de este test. */
const machine = (which) => {
  restorePath();
  restorePath = usePath(which);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-guard-runner-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  restorePath = usePath({ bun: true, npm: true });
  output = '';
  process.stdout.write = (chunk) => ((output += chunk), true);
  process.stderr.write = (chunk) => ((output += chunk), true);
});

afterEach(() => {
  process.stdout.write = realWrite.out;
  process.stderr.write = realWrite.err;
  restorePath();
  fs.rmSync(root, { recursive: true, force: true });
});

test('instalación nueva con bun: crea runner.json con runner bun y la entrada del guard', async () => {
  assert.equal(await run('apply', '--yes'), 0);
  assert.deepEqual(json(RUNNER_FILE), { $schema: SCHEMA, runner: 'bun', tools: { [PKG]: version() } });
});

test('instalación nueva sin bun y sin terminal: runner node y el aviso', async () => {
  machine({ npm: true });
  assert.equal(await run('apply', '--yes'), 0);
  assert.equal(json(RUNNER_FILE).runner, 'node');
  assert.ok(output.includes(es.noBun), output);
});

test('modo viejo: apply con manifiesto y sin runner.json no crea runner.json', async () => {
  await run('apply', '--yes');
  fs.rmSync(file('.agents'), { recursive: true });
  assert.equal(await run('apply', '--yes'), 0);
  assert.equal(exists(RUNNER_FILE), false);
  assert.match(doc(), /npx github:ramon-sg\/claude-repo-guard/);
});

test('runner.json con otras herramientas y claves extra: solo cambia la entrada del guard', async () => {
  write(RUNNER_FILE, { runner: 'node', tools: { '@ramon-sg/issue-flow': '0.6.0', [PKG]: '0.0.1' }, foo: 1 });
  assert.equal(await run('apply', '--yes'), 0);
  const config = json(RUNNER_FILE);
  assert.equal(config.runner, 'node');
  assert.equal(config.foo, 1);
  assert.deepEqual(config.tools, { '@ramon-sg/issue-flow': '0.6.0', [PKG]: version() });
});

test('runner.json con una versión más nueva del guard la baja a la que corre', async () => {
  write(RUNNER_FILE, { tools: { [PKG]: '99.0.0' } });
  assert.equal(await run('apply', '--yes'), 0);
  assert.equal(json(RUNNER_FILE).tools[PKG], version());
  assert.equal(json(RUNNER_FILE).runner, undefined, 'no escribe runner si el archivo no lo decía');
});

for (const [label, content] of [
  ['JSON roto', '{ nope'],
  ['versión que no es exacta', { tools: { [PKG]: '^1.0.0' } }],
]) {
  test(`runner.json inválido (${label}): apply y doctor fallan con la ruta, sin traza`, async () => {
    write(RUNNER_FILE, content);
    for (const command of ['apply', 'doctor']) {
      output = '';
      assert.equal(await run(command, '--yes'), 1, command);
      assert.match(output, /\.agents\/runner\.json/, command);
      assert.doesNotMatch(output, /\n\s+at /, command);
    }
  });
}

test('--dry-run en modo runner no escribe runner.json', async () => {
  assert.equal(await run('apply', '--dry-run'), 0);
  assert.equal(exists(RUNNER_FILE), false);
  assert.match(output, /\.agents\/runner\.json \(nuevo\)/);
});
