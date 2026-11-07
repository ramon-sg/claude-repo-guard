import { readJson } from './files.mjs';
import { fail } from './texts/index.mjs';

/**
 * Opciones por repo. Viven en `.claude/repo-guard.config.json`, que `apply`
 * crea con estos valores la primera vez. Se editan a mano y se vuelve a correr
 * `apply` para aplicarlas.
 *
 * @typedef {{
 *   allowedDomains: string[],
 *   allowWrite: string[],
 *   allowUnixSockets: string[],
 *   protectedPaths: string[],
 *   askCommands: string[],
 *   denyCommands: string[],
 *   environment: string[],
 *   integrationBranch: string,
 *   localBinding: boolean,
 *   weakerNetworkIsolation: boolean,
 *   bunCache: boolean,
 *   npmCache: boolean,
 *   docPath: string,
 * }} Config
 */

/** @type {Config} */
export const DEFAULT_CONFIG = {
  allowedDomains: [],
  allowWrite: [],
  allowUnixSockets: [],
  protectedPaths: ['/.husky/**'],
  askCommands: [],
  denyCommands: [],
  environment: [],
  integrationBranch: '',
  localBinding: true,
  weakerNetworkIsolation: false,
  bunCache: true,
  npmCache: true,
  docPath: 'docs/development/claude-repo-guard.md',
};

const KEYS = Object.keys(DEFAULT_CONFIG);

const kind = (value) => (Array.isArray(value) ? 'array' : typeof value);

/**
 * @param {string} file
 * @returns {{ config: Config, exists: boolean }}
 * @throws {Error} si el archivo trae claves desconocidas o de otro tipo.
 */
export const readConfig = (file) => {
  const json = readJson(file);
  for (const [key, value] of Object.entries(json.data)) {
    if (!KEYS.includes(key)) throw fail('unknownOption', file, key, KEYS.join(', '));
    const expected = kind(DEFAULT_CONFIG[key]);
    if (kind(value) !== expected) throw fail('wrongType', file, key, expected);
  }
  if (json.data.docPath !== undefined && !json.data.docPath.endsWith('.md')) {
    throw fail('docPathMd', file);
  }
  for (const key of ['askCommands', 'denyCommands']) {
    const invalid = (json.data[key] ?? []).find((command) => typeof command !== 'string' || command.trim() === '' || /[()]/.test(command));
    if (invalid !== undefined) {
      throw fail('commandParens', file, key, JSON.stringify(invalid));
    }
  }
  return { config: { ...DEFAULT_CONFIG, ...json.data }, exists: json.exists };
};
