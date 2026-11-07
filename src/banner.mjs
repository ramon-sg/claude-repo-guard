/**
 * El bloque de los mensajes finales: un título con su marca, unas líneas y el
 * comando siguiente, con Kuro (la mascota de issue-flow) al lado si la terminal
 * puede mostrarlo. Copia el de issue-flow (`src/banner.ts`).
 *
 * @typedef {'ok' | 'error' | 'question'} Mood
 * @typedef {{
 *   mood: Mood,
 *   title: string,
 *   lines?: string[],
 *   next?: { label: string, command: string },
 * }} Block
 */

/** Kuro, el dibujo del issue #49 de issue-flow, sin espacios al final. */
export const KURO = ['    ▄█████▄', ' ≋≋██▀▀▀▀▀██', '    █ ▄  ▄ █   ╱', '    ▀█▄▄▄▄█▀  ╱'];

/** Columna donde empieza el texto al lado de Kuro. */
const TEXT_COLUMN = 26;
/** Sangría del texto sin Kuro. */
const INDENT = 2;

const MARKS = { ok: '[ok]', error: '[!]', question: '[?]' };
const MOOD_COLOR = { ok: 32, error: 31, question: 33 };

const paint = (text, code, on) => (on ? `\x1b[${code}m${text}\x1b[0m` : text);
const width = (text) => [...text].length;

/**
 * Arma un bloque. Los valores no se cortan: un comando para copiar queda entero.
 *
 * @param {Block} block
 * @param {{ art: boolean, color: boolean }} options
 * @returns {string} el texto, con una línea en blanco antes y después.
 */
export const banner = (block, { art, color }) => {
  const text = [`${paint(MARKS[block.mood], MOOD_COLOR[block.mood], color)} ${paint(block.title, MOOD_COLOR[block.mood], color)}`];
  if (block.lines?.length) text.push('', ...block.lines);
  if (block.next) text.push('', block.next.label, `  ${paint(block.next.command, 1, color)}`);

  const out = [];
  if (art) {
    // Kuro ocupa las filas 0 a 3 y el texto empieza en la fila 1.
    const total = Math.max(KURO.length, text.length + 1);
    for (let row = 0; row < total; row++) {
      const left = KURO[row] ?? '';
      const right = text[row - 1];
      out.push(right === undefined ? left : left + ' '.repeat(TEXT_COLUMN - width(left)) + right);
    }
  } else {
    for (const line of text) out.push(line === '' ? '' : ' '.repeat(INDENT) + line);
  }
  return `\n${out.map((line) => line.trimEnd()).join('\n')}\n\n`;
};

/**
 * Kuro y el color solo en una terminal; `NO_COLOR` quita el color.
 *
 * @param {'stdout' | 'stderr'} stream
 * @param {{ isTTY?: boolean }} [target]
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ art: boolean, color: boolean }}
 */
export const blockOptions = (stream, target = process[stream], env = process.env) => {
  const terminal = Boolean(target.isTTY);
  return { art: terminal, color: terminal && !env.NO_COLOR };
};

/**
 * Escribe un bloque en stdout, o en stderr si es un error.
 *
 * @param {Block} block
 * @param {'stdout' | 'stderr'} [stream]
 */
export const show = (block, stream = block.mood === 'error' ? 'stderr' : 'stdout') => {
  process[stream].write(banner(block, blockOptions(stream)));
};
