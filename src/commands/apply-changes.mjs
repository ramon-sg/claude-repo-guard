import fs from 'node:fs';
import path from 'node:path';
import { show } from '../banner.mjs';
import { CLI } from '../doc.mjs';
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
 * @param {{ root: string, dryRun: boolean, yes: boolean, command: 'apply' | 'uninstall', t: import('../texts/index.mjs').Texts }} options
 * @returns {Promise<number>} código de salida.
 */
export const applyChanges = async (changes, { root, dryRun, yes, command, t }) => {
  if (changes.length === 0) {
    show({ mood: 'ok', title: t.changes.upToDate });
    return 0;
  }

  for (const change of changes) {
    const name = path.relative(root, change.file);
    if (change.after === null) {
      process.stdout.write(`\n— ${name} (${t.changes.deleted})\n`);
      continue;
    }
    process.stdout.write(`\n${change.before === '' ? '+' : '~'} ${name}${change.before === '' ? ` (${t.changes.created})` : ''}\n`);
    for (const line of lineDiff(change.before, change.after)) process.stdout.write(`  ${line}\n`);
  }

  const withYes = { label: t.changes.dryRunNext, command: `${CLI} ${command} --yes` };
  if (dryRun) {
    show({ mood: 'ok', title: t.changes.dryRun, next: withYes });
    return 0;
  }
  if (!yes) {
    if (!process.stdin.isTTY) {
      show({ mood: 'error', title: t.changes.noTerminal, next: { ...withYes, label: t.changes.noTerminalNext } });
      return 1;
    }
    process.stdout.write('\n');
    if (!(await confirm(t.changes.confirm[command], t.changes.confirmHint))) {
      show({ mood: 'ok', title: t.changes.declined });
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
  show({ mood: 'ok', title: t.changes.done(changes.length), lines: t.changes.doneLines });
  return 0;
};
