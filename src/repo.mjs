import { execFileSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline/promises';
import { AUTO_MODE_FILE } from './profile.mjs';

/**
 * @param {string} cwd
 * @returns {string} la raíz del repo git que contiene `cwd`.
 * @throws {Error} si `cwd` no está dentro de un repo git.
 */
export const repoRoot = (cwd) => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`${cwd} no está dentro de un repo git.`);
  }
};

/**
 * Rutas de los archivos que lee o escribe la herramienta, relativas a la raíz.
 *
 * @param {string} root
 * @param {{ docPath: string }} config
 */
export const repoPaths = (root, config) => {
  const doc = path.resolve(root, config.docPath);
  if (path.isAbsolute(config.docPath) || !doc.startsWith(`${root}${path.sep}`)) {
    throw new Error(`docPath tiene que ser una ruta relativa dentro del repo, no "${config.docPath}".`);
  }
  return paths(root, doc);
};

/**
 * @param {string} root
 * @param {string} doc ruta absoluta del documento, ya validada.
 */
const paths = (root, doc) => ({
  root,
  settings: path.join(root, '.claude', 'settings.json'),
  localSettings: path.join(root, '.claude', 'settings.local.json'),
  config: path.join(root, '.claude', 'repo-guard.config.json'),
  manifest: path.join(root, '.claude', 'repo-guard.manifest.json'),
  autoMode: path.join(root, AUTO_MODE_FILE),
  packageJson: path.join(root, 'package.json'),
  doc,
});

/**
 * Pregunta sí/no por la terminal. Sin terminal no pregunta y responde que no.
 *
 * @param {string} question
 * @returns {Promise<boolean>}
 */
export const confirm = async (question) => {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [s/N] `);
    return /^(s|si|sí|y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
};
