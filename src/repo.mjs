import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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
 * @param {string} target
 * @returns {string} la ruta real del ancestro existente más cercano de `target`.
 */
const realAncestor = (target) => {
  let current = target;
  while (!fs.existsSync(current)) current = path.dirname(current);
  return fs.realpathSync(current);
};

/**
 * Resuelve una ruta relativa del repo y comprueba que quede dentro de él.
 *
 * Toda ruta que la herramienta lee, escribe o borra pasa por acá, también las
 * que vienen de la configuración o del manifiesto: los dos viajan en el repo y
 * cualquiera puede cambiarlos en un PR.
 *
 * @param {string} root
 * @param {unknown} relative
 * @param {string} label para el mensaje de error.
 * @returns {string} la ruta absoluta.
 * @throws {Error} si es absoluta, sale del repo (también vía enlaces simbólicos) o es un enlace simbólico.
 */
export const safeRepoFile = (root, relative, label) => {
  const reject = () => new Error(`${label} tiene que ser una ruta relativa dentro del repo, no ${JSON.stringify(relative)}.`);
  if (typeof relative !== 'string' || relative === '' || path.isAbsolute(relative)) throw reject();
  const realRoot = fs.realpathSync(root);
  const absolute = path.resolve(realRoot, relative);
  if (!absolute.startsWith(`${realRoot}${path.sep}`)) throw reject();
  const ancestor = realAncestor(path.dirname(absolute));
  if (ancestor !== realRoot && !ancestor.startsWith(`${realRoot}${path.sep}`)) throw reject();
  if (fs.existsSync(absolute) && fs.lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`${label} (${relative}) es un enlace simbólico: no lo toco.`);
  }
  return absolute;
};

/**
 * Rutas de los archivos que lee o escribe la herramienta.
 *
 * @param {string} root
 * @param {{ docPath: string }} config
 */
export const repoPaths = (root, config) => ({
  root,
  settings: safeRepoFile(root, '.claude/settings.json', '.claude/settings.json'),
  config: safeRepoFile(root, '.claude/repo-guard.config.json', 'La configuración'),
  manifest: safeRepoFile(root, '.claude/repo-guard.manifest.json', 'El manifiesto'),
  autoMode: safeRepoFile(root, AUTO_MODE_FILE, AUTO_MODE_FILE),
  packageJson: safeRepoFile(root, 'package.json', 'package.json'),
  doc: safeRepoFile(root, config.docPath, 'docPath'),
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
