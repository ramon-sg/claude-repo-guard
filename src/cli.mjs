import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges } from './commands/apply-changes.mjs';
import { doctor } from './commands/doctor.mjs';
import { planApply, planUninstall } from './plan.mjs';
import { repoRoot } from './repo.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string} la versión del paquete. */
export const version = () => JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

const HELP = `claude-repo-guard: barandas de Claude Code instaladas en el repo.

Uso (dentro del repo):
  claude-repo-guard apply       Deja el repo como dicen esta versión y la configuración:
                                instala, actualiza o aplica cambios.
  claude-repo-guard uninstall   Quita lo que agregó apply y deja el repo como estaba.
  claude-repo-guard doctor      Revisa que lo instalado coincida con la configuración.

Opciones de apply y uninstall:
  --dry-run   Muestra los cambios sin escribir nada.
  --yes       No pregunta antes de escribir.

Opciones de doctor:
  --repo      Solo el repo, sin revisar si la máquina tiene sandbox.
  --json      Salida en JSON.

La configuración del repo vive en .claude/repo-guard.config.json.
Más: https://github.com/ramon-sg/claude-repo-guard
`;

/**
 * @param {string[]} argv argumentos sin `node` ni el script.
 * @param {string} [cwd]
 * @returns {Promise<number>} código de salida.
 */
export const main = async (argv, cwd = process.cwd()) => {
  const [command, ...args] = argv;
  const has = (flag) => args.includes(flag);
  try {
    switch (command) {
      case 'apply': {
        const root = repoRoot(cwd);
        const { changes } = planApply(root, version());
        return await applyChanges(changes, { root, dryRun: has('--dry-run'), yes: has('--yes'), verb: 'Aplico' });
      }
      case 'uninstall': {
        const root = repoRoot(cwd);
        const changes = planUninstall(root);
        if (changes.length === 0) {
          process.stdout.write('No está instalado en este repo: no hay nada que quitar.\n');
          return 0;
        }
        return await applyChanges(changes, { root, dryRun: has('--dry-run'), yes: has('--yes'), verb: 'Quito' });
      }
      case 'install':
        process.stderr.write('claude-repo-guard: "install" ahora se llama "apply". Hace lo mismo: instala, actualiza o aplica cambios.\n');
        return 1;
      case 'doctor':
        return doctor({ root: repoRoot(cwd), version: version(), json: has('--json'), machine: !has('--repo') });
      case '--version':
      case '-v':
        process.stdout.write(`${version()}\n`);
        return 0;
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        process.stdout.write(HELP);
        return 0;
      default:
        process.stderr.write(`claude-repo-guard: no conozco el comando "${command}".\n\n${HELP}`);
        return 1;
    }
  } catch (error) {
    process.stderr.write(`claude-repo-guard: ${error.message}\n`);
    return 1;
  }
};
