import { readJson } from './files.mjs';

/**
 * Opciones por repo. Viven en `.claude/repo-guard.config.json`, que `install`
 * crea con estos valores la primera vez. Se editan a mano y se vuelve a correr
 * `install` para aplicarlas.
 *
 * @typedef {{
 *   allowedDomains: string[],
 *   allowWrite: string[],
 *   protectedPaths: string[],
 *   environment: string[],
 *   integrationBranch: string,
 *   localBinding: boolean,
 *   weakerNetworkIsolation: boolean,
 *   docPath: string,
 * }} Config
 */

/** @type {Config} */
export const DEFAULT_CONFIG = {
  allowedDomains: [],
  allowWrite: [],
  protectedPaths: ['/.husky/**'],
  environment: [],
  integrationBranch: '',
  localBinding: true,
  weakerNetworkIsolation: false,
  docPath: 'docs/development/claude-repo-guard.md',
};

const KEYS = Object.keys(DEFAULT_CONFIG);

const kind = (value) => (Array.isArray(value) ? 'array' : typeof value);

const KIND_NAMES = { array: 'una lista', string: 'un texto', boolean: 'true o false' };

/**
 * @param {string} file
 * @returns {{ config: Config, exists: boolean }}
 * @throws {Error} si el archivo trae claves desconocidas o de otro tipo.
 */
export const readConfig = (file) => {
  const json = readJson(file);
  for (const [key, value] of Object.entries(json.data)) {
    if (!KEYS.includes(key)) throw new Error(`${file}: no conozco la opción "${key}". Las opciones son: ${KEYS.join(', ')}.`);
    const expected = kind(DEFAULT_CONFIG[key]);
    if (kind(value) !== expected) throw new Error(`${file}: "${key}" debe ser ${KIND_NAMES[expected]}.`);
  }
  if (json.data.docPath !== undefined && !json.data.docPath.endsWith('.md')) {
    throw new Error(`${file}: "docPath" tiene que terminar en .md.`);
  }
  return { config: { ...DEFAULT_CONFIG, ...json.data }, exists: json.exists };
};
