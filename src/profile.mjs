/**
 * Las reglas que instala la herramienta, armadas desde la configuración del
 * repo. Es la única fuente: los settings, los scripts y el documento salen de
 * acá, así que no pueden contradecirse.
 */

/** Dominios que todo repo con Node y GitHub necesita para trabajar. */
export const BASE_DOMAINS = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'github.com',
  'api.github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
];

/**
 * Rutas donde todo repo necesita escribir. En macOS `mktemp` ignora `TMPDIR`
 * cuando no recibe una plantilla y crea el temporal en la carpeta del usuario
 * bajo `/private/var/folders`, que cambia de nombre en cada máquina. El sandbox
 * no acepta comodines, así que se abre la carpeta completa; las de otros
 * usuarios siguen protegidas por sus permisos. En Linux la ruta no existe.
 */
export const BASE_ALLOW_WRITE = ['/private/var/folders'];

/** Contexto que se le da al clasificador del modo auto (en inglés: es texto para el modelo). */
export const BASE_ENVIRONMENT = [
  'Deleting files inside the current working directory (the git worktree of this session) or the system temp directory is routine cleanup.',
  'Services on localhost (databases, dev servers, Docker stacks started for this worktree) are development resources, not production.',
];

/** Archivo con la configuración del modo auto, que solo se lee vía `--settings`. */
export const AUTO_MODE_FILE = '.claude/repo-guard.auto-mode.json';

/**
 * Claves que el repo no debe tener en `.claude/settings.json`. Las sesiones en
 * la nube de Claude Code no tienen sandbox de Bash: con `failIfUnavailable`,
 * Claude se cierra al arrancar ahí. El mismo repo tiene que abrir en local y en
 * la nube.
 */
export const FORBIDDEN_SANDBOX_KEYS = ['failIfUnavailable'];

/**
 * @param {import('./config.mjs').Config} config
 * @returns {Record<string, unknown>} lo que se fusiona en `.claude/settings.json`.
 */
export const settingsFragment = (config) => {
  const sandbox = {
    enabled: true,
    allowUnsandboxedCommands: false,
    ...(config.weakerNetworkIsolation ? { enableWeakerNetworkIsolation: true } : {}),
    filesystem: { allowWrite: [...BASE_ALLOW_WRITE, ...config.allowWrite.filter((path) => !BASE_ALLOW_WRITE.includes(path))] },
    network: {
      allowedDomains: [...BASE_DOMAINS, ...config.allowedDomains.filter((domain) => !BASE_DOMAINS.includes(domain))],
      ...(config.localBinding ? { allowLocalBinding: true } : {}),
      ...(config.allowUnixSockets.length > 0 ? { allowUnixSockets: config.allowUnixSockets } : {}),
    },
  };
  const deny = [...config.protectedPaths.map((path) => `Edit(${path})`), ...config.denyCommands.map(commandRule)];
  const ask = config.askCommands.map(commandRule);
  const permissions = {
    ...(ask.length > 0 ? { ask } : {}),
    ...(deny.length > 0 ? { deny } : {}),
  };
  return {
    sandbox,
    ...(Object.keys(permissions).length > 0 ? { permissions } : {}),
  };
};

/**
 * Regla de permisos de Claude Code para un comando y todo lo que le sigue:
 * `git reset --hard` → `Bash(git reset --hard*)`. Mira el comando que se
 * ejecuta, no el texto suelto: un mensaje que solo lo nombra pasa.
 *
 * @param {string} command
 * @returns {string}
 */
export const commandRule = (command) => `Bash(${command.trim()}*)`;

/**
 * @param {import('./config.mjs').Config} config
 * @returns {Record<string, unknown>} el contenido de `.claude/repo-guard.auto-mode.json`.
 */
export const autoModeSettings = (config) => {
  const allow = config.integrationBranch
    ? [`Merging pull requests into the ${config.integrationBranch} branch with a merge commit is part of the normal workflow.`]
    : [];
  return {
    autoMode: {
      environment: ['$defaults', ...BASE_ENVIRONMENT, ...config.environment],
      ...(allow.length > 0 ? { allow: ['$defaults', ...allow] } : {}),
    },
  };
};

/**
 * Scripts que se agregan al `package.json` del repo.
 *
 * @returns {Record<string, string>}
 */
export const scripts = () => ({
  'claude:auto': `claude --settings ${AUTO_MODE_FILE} --permission-mode auto`,
  'claude:free':
    "echo 'claude:free: sin sandbox y sin preguntas de permisos, solo en esta sesión.' >&2 && claude --settings '{\"sandbox\":{\"enabled\":false}}' --dangerously-skip-permissions",
});
