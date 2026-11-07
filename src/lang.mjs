/**
 * El idioma de la terminal: `--lang`, después `CLAUDE_REPO_GUARD_LANG` y, si no
 * hay ninguno, español. `LANG` y `LC_ALL` no se leen.
 *
 * @typedef {'es' | 'en'} Lang
 */

export const LANG_ENV = 'CLAUDE_REPO_GUARD_LANG';

/** Un `--lang` o `CLAUDE_REPO_GUARD_LANG` que no es `es` ni `en`. */
export class LangError extends Error {
  /**
   * @param {string} source de dónde vino el valor.
   * @param {string} value
   */
  constructor(source, value) {
    super(`${source}: ${value}`);
    this.source = source;
    this.value = value;
  }
}

/**
 * @param {string | undefined} flag el valor de `--lang`, si vino.
 * @param {Record<string, string | undefined>} env
 * @returns {Lang}
 * @throws {LangError} si el valor no es `es` ni `en`.
 */
export const resolveLang = (flag, env) => {
  const fromEnv = env[LANG_ENV]?.trim() === '' ? undefined : env[LANG_ENV];
  const source = flag !== undefined ? '--lang' : LANG_ENV;
  const value = flag ?? fromEnv;
  if (value === undefined) return 'es';
  const lang = value.trim().toLowerCase();
  if (lang !== 'es' && lang !== 'en') throw new LangError(source, value);
  return lang;
};

/**
 * Saca `--lang x` o `--lang=x` de los argumentos.
 *
 * @param {string[]} argv
 * @returns {{ flag: string | undefined, rest: string[] }} el valor (vacío si falta) y los demás argumentos.
 */
export const takeLang = (argv) => {
  let flag;
  const rest = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--lang') {
      flag = argv[index + 1] ?? '';
      index++;
    } else if (arg.startsWith('--lang=')) {
      flag = arg.slice('--lang='.length);
    } else {
      rest.push(arg);
    }
  }
  return { flag, rest };
};
