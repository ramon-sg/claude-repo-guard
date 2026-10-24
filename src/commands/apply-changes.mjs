import fs from 'node:fs';
import path from 'node:path';
import { lineDiff, writeFile } from '../files.mjs';
import { confirm } from '../repo.mjs';

/**
 * Borra los directorios que quedaron vacíos al quitar `file`, subiendo hasta la
 * raíz del repo (sin incluirla).
 *
 * @param {string} file
 * @param {string} root
 */
const removeEmptyParents = (file, root) => {
  let directory = path.dirname(file);
  while (directory.startsWith(`${root}${path.sep}`) && fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
    directory = path.dirname(directory);
  }
};

/**
 * Muestra los cambios, pide confirmación y los escribe.
 *
 * @param {import('../plan.mjs').Change[]} changes
 * @param {{ root: string, dryRun: boolean, yes: boolean, verb: string }} options
 * @returns {Promise<number>} código de salida.
 */
export const applyChanges = async (changes, { root, dryRun, yes, verb }) => {
  if (changes.length === 0) {
    process.stdout.write('No hay nada que cambiar: el repo ya está al día.\n');
    return 0;
  }

  for (const change of changes) {
    const name = path.relative(root, change.file);
    if (change.after === null) {
      process.stdout.write(`\n— ${name} (se borra)\n`);
      continue;
    }
    process.stdout.write(`\n${change.before === '' ? '+' : '~'} ${name}${change.before === '' ? ' (nuevo)' : ''}\n`);
    for (const line of lineDiff(change.before, change.after)) process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write('\n');

  if (dryRun) {
    process.stdout.write('Modo --dry-run: no se escribió nada.\n');
    return 0;
  }
  if (!yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write('No hay terminal para confirmar. Revisa los cambios con --dry-run y vuelve a correr con --yes.\n');
      return 1;
    }
    if (!(await confirm(`¿${verb} estos cambios?`))) {
      process.stdout.write('No se cambió nada.\n');
      return 1;
    }
  }

  for (const change of changes) {
    if (change.after === null) {
      fs.rmSync(change.file, { force: true });
      removeEmptyParents(change.file, root);
    } else {
      writeFile(change.file, change.after);
    }
  }
  process.stdout.write(`Listo: ${changes.length} archivo(s).\n`);
  return 0;
};
