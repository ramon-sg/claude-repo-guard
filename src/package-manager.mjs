import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './files.mjs';

/** @typedef {'pnpm' | 'bun' | 'npm'} PackageManager */

const LOCKFILES = /** @type {const} */ ([
  ['pnpm-lock.yaml', 'pnpm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
]);

/**
 * Gestor de paquetes del repo: primero el campo `packageManager` de
 * `package.json`, luego el lockfile y, si no hay ninguno, npm. Otro gestor
 * (yarn) cae en npm: `npm run` corre los scripts igual.
 *
 * @param {string} packageJson ruta de `package.json`.
 * @returns {PackageManager | null} `null` si el repo no tiene `package.json`.
 */
export const detectPackageManager = (packageJson) => {
  if (!fs.existsSync(packageJson)) return null;
  const declared = readJson(packageJson).data.packageManager;
  const name = typeof declared === 'string' ? declared.split('@')[0] : '';
  if (name === 'pnpm' || name === 'bun') return name;
  if (name) return 'npm';
  const root = path.dirname(packageJson);
  const found = LOCKFILES.find(([file]) => fs.existsSync(path.join(root, file)));
  return found ? found[1] : 'npm';
};

/**
 * @param {PackageManager} manager
 * @param {string} script
 * @returns {string} cómo se corre `script` con ese gestor.
 */
export const runScript = (manager, script) => (manager === 'pnpm' ? `pnpm ${script}` : `${manager} run ${script}`);
