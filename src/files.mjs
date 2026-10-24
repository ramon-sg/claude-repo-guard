import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ exists: boolean, data: Record<string, unknown>, indent: string | number, newline: boolean }} JsonFile
 */

/**
 * Lee un JSON recordando su sangría y si termina en salto de línea, para
 * reescribirlo sin cambiar el formato del repo.
 *
 * @param {string} file
 * @returns {JsonFile}
 * @throws {Error} si el archivo existe pero no es JSON válido.
 */
export const readJson = (file) => {
  if (!fs.existsSync(file)) return { exists: false, data: {}, indent: 2, newline: true };
  const text = fs.readFileSync(file, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} no es JSON válido: ${error.message}`);
  }
  const indentMatch = text.match(/^[ \t]+(?=")/m);
  return { exists: true, data, indent: indentMatch ? indentMatch[0] : 2, newline: text.endsWith('\n') };
};

/**
 * @param {JsonFile} json
 * @returns {string} el contenido serializado con el formato original.
 */
export const formatJson = (json) => `${JSON.stringify(json.data, null, json.indent)}${json.newline ? '\n' : ''}`;

/**
 * Escribe un archivo creando los directorios que falten.
 *
 * @param {string} file
 * @param {string} content
 */
export const writeFile = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

/**
 * @param {string} file
 * @returns {string} el contenido, o '' si no existe.
 */
export const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

/**
 * Diff de líneas para mostrar antes de escribir. Los archivos que toca la
 * herramienta son chicos, así que basta con una LCS directa.
 *
 * @param {string} before
 * @param {string} after
 * @returns {string[]} líneas con prefijo "+ ", "- " o "  "; solo las que cambian y una de contexto.
 */
export const lineDiff = (before, after) => {
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n');
  const b = after === '' ? [] : after.replace(/\n$/, '').split('\n');
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: ' ', text: a[i] });
      i += 1;
      j += 1;
    } else if (j < b.length && (i >= a.length || table[i][j + 1] >= table[i + 1][j])) {
      lines.push({ kind: '+', text: b[j] });
      j += 1;
    } else {
      lines.push({ kind: '-', text: a[i] });
      i += 1;
    }
  }
  const near = (index) => lines.slice(Math.max(0, index - 1), index + 2).some((line) => line.kind !== ' ');
  return lines.filter((line, index) => line.kind !== ' ' || near(index)).map((line) => `${line.kind} ${line.text}`);
};
