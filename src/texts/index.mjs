import { en } from './en.mjs';
import { es } from './es.mjs';

/** @typedef {typeof es} Texts */

/**
 * @param {import('../lang.mjs').Lang} lang
 * @returns {Texts} los textos de la terminal en ese idioma.
 */
export const texts = (lang) => (lang === 'en' ? en : es);

/**
 * Un error que se puede decir en cualquier idioma: guarda la clave de
 * `errors` y sus valores. `message` queda en español.
 */
export class GuardError extends Error {
  /**
   * @param {keyof Texts['errors']} key
   * @param {unknown[]} args
   */
  constructor(key, args) {
    const text = es.errors[key];
    super(typeof text === 'function' ? text(...args) : text);
    this.key = key;
    this.args = args;
  }

  /**
   * @param {Texts} t
   * @returns {string} el mensaje en el idioma de `t`.
   */
  in(t) {
    const text = t.errors[this.key];
    return typeof text === 'function' ? text(...this.args) : text;
  }
}

/**
 * @param {keyof Texts['errors']} key
 * @param {...unknown} args
 * @returns {GuardError}
 */
export const fail = (key, ...args) => new GuardError(key, args);
