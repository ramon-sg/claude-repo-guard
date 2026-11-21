import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RUNNER_FILE, RunnerFileError, chooseRunner, effectiveRunner, readRunnerConfig, setTool, writeRunnerConfig } from '@ramon-sg/runner';
import { readText } from './files.mjs';
import { safeRepoFile } from './repo.mjs';
import { fail } from './texts/index.mjs';

/** El nombre del paquete en npm, como va en `.agents/runner.json`. */
export const PACKAGE = '@ramon-sg/claude-repo-guard';

const MANIFEST = path.join('.claude', 'repo-guard.manifest.json');

/**
 * Cómo corre el guard en este repo. `legacy` es el modo de antes de
 * `runner.json` (`npx github:…`). `created`: esta corrida crea el archivo.
 *
 * @typedef {{ kind: 'legacy' } | { kind: 'runner', runner: 'bun' | 'node', created: boolean, warning: boolean }} Mode
 */

/**
 * @param {string} root
 * @returns {import('@ramon-sg/runner').RunnerConfig | null}
 * @throws {import('./texts/index.mjs').GuardError} si el archivo no sirve.
 */
const readConfig = (root) => {
  try {
    return readRunnerConfig(root);
  } catch (error) {
    if (error instanceof RunnerFileError) throw fail('runnerFile', error.message);
    throw error;
  }
};

/**
 * El modo, sin preguntar ni crear nada: para `doctor` y `uninstall`.
 *
 * @param {string} root
 * @returns {Mode}
 */
export const readMode = (root) => {
  const config = readConfig(root);
  return config === null ? { kind: 'legacy' } : { kind: 'runner', runner: effectiveRunner(config), created: false, warning: false };
};

/**
 * El modo para `apply`. Con `runner.json`, modo runner. Sin él, si hay
 * manifiesto, el repo se instaló en el modo viejo y ahí se queda (lo migra
 * agent-kitchen). Sin ninguno de los dos es una instalación nueva: se crea
 * `runner.json` con Bun si está, y si no, con Node (preguntando si se puede).
 *
 * @param {string} root
 * @param {{ ask?: () => Promise<'bun' | 'node' | null> }} options
 * @returns {Promise<Mode | null>} null si quien contestó eligió salir.
 */
export const resolveMode = async (root, { ask }) => {
  const config = readConfig(root);
  if (config !== null) return { kind: 'runner', runner: effectiveRunner(config), created: false, warning: false };
  if (fs.existsSync(path.join(root, MANIFEST))) return { kind: 'legacy' };
  const chosen = await chooseRunner({ ask });
  if (chosen === null) return null;
  return { kind: 'runner', runner: chosen.runner, created: true, warning: chosen.warning !== null };
};

/**
 * Corre `run` sobre una copia de esos archivos del repo, en un directorio
 * temporal, y devuelve cómo quedaron. Así se usan las funciones de la
 * biblioteca, que escriben en disco, sin escribir en el repo antes de
 * confirmar.
 *
 * @param {string} root
 * @param {string[]} files rutas relativas.
 * @param {(dir: string) => void} run
 * @returns {Record<string, string>} contenido final de cada archivo ('' si no existe).
 */
export const inTemp = (root, files, run) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-guard-'));
  try {
    for (const file of files) {
      const source = path.join(root, file);
      if (!fs.existsSync(source)) continue;
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(source, path.join(dir, file));
    }
    run(dir);
    return Object.fromEntries(files.map((file) => [file, readText(path.join(dir, file))]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * El cambio a `runner.json`: la entrada del guard en la versión que corre
 * (aunque baje: `apply` deja el repo como dice esta versión) y, si el archivo
 * es nuevo, el ejecutor elegido. Las demás entradas y claves no se tocan.
 *
 * @param {string} root
 * @param {Extract<Mode, { kind: 'runner' }>} mode
 * @param {string} version
 * @returns {import('./plan.mjs').Change}
 */
export const runnerChange = (root, mode, version) => {
  const file = safeRepoFile(root, RUNNER_FILE, RUNNER_FILE);
  const before = readText(file);
  const after = inTemp(root, [RUNNER_FILE], (dir) => {
    const current = readConfig(dir) ?? { runner: mode.created ? mode.runner : null, tools: {}, extra: {} };
    writeRunnerConfig(dir, setTool(current, PACKAGE, version, { allowLower: true }).config);
  })[RUNNER_FILE];
  return { file, before, after };
};
