import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges } from './commands/apply-changes.mjs';
import { doctor } from './commands/doctor.mjs';
import { planApply, planUninstall } from './plan.mjs';
import { show } from './banner.mjs';
import { CLI } from './doc.mjs';
import { LangError, resolveLang, takeLang } from './lang.mjs';
import { repoRoot } from './repo.mjs';
import { GuardError, texts } from './texts/index.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string} la versión del paquete. */
export const version = () => JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

/**
 * @param {string[]} argv argumentos sin `node` ni el script.
 * @param {string} [cwd]
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<number>} código de salida.
 */
export const main = async (argv, cwd = process.cwd(), env = process.env) => {
  const { flag, rest } = takeLang(argv);
  let t;
  try {
    t = texts(resolveLang(flag, env));
  } catch (error) {
    if (!(error instanceof LangError)) throw error;
    // Sin idioma válido, el error sale en los dos.
    show({ mood: 'error', title: texts('es').badLang(error.source, error.value), lines: [texts('en').badLang(error.source, error.value)] });
    return 1;
  }

  const [command, ...args] = rest;
  const has = (option) => args.includes(option);
  try {
    switch (command) {
      case 'apply': {
        const root = repoRoot(cwd);
        const { changes } = planApply(root, version());
        return await applyChanges(changes, { root, dryRun: has('--dry-run'), yes: has('--yes'), command, t });
      }
      case 'uninstall': {
        const root = repoRoot(cwd);
        const changes = planUninstall(root);
        if (changes.length === 0) {
          show({ mood: 'ok', title: t.changes.notInstalled });
          return 0;
        }
        return await applyChanges(changes, { root, dryRun: has('--dry-run'), yes: has('--yes'), command, t });
      }
      case 'install':
        show({ mood: 'error', title: t.installRenamed });
        return 1;
      case 'doctor':
        return doctor({ root: repoRoot(cwd), version: version(), json: has('--json'), machine: !has('--repo'), t });
      case '--version':
      case '-v':
        process.stdout.write(`${version()}\n`);
        return 0;
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        process.stdout.write(t.help);
        return 0;
      default:
        show({ mood: 'error', title: t.unknownCommand(command), next: { label: t.helpNext, command: `${CLI} --help` } });
        return 1;
    }
  } catch (error) {
    show({ mood: 'error', title: error instanceof GuardError ? error.in(t) : error.message });
    return 1;
  }
};
