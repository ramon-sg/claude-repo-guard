import { AUTO_MODE_FILE, BUN_CACHE, NPM_CACHE, autoModeSettings, commandRule, scripts, settingsFragment } from './profile.mjs';
import { runScript } from './package-manager.mjs';

/** Cómo se invoca la herramienta sin instalarla. */
export const CLI = 'npx github:ramon-sg/claude-repo-guard';

const code = (value) => `\`${value}\``;

const json = (value) => ['```json', JSON.stringify(value, null, 2), '```'].join('\n');

/**
 * Documento que explica qué instaló la herramienta en el repo. Se genera desde
 * el mismo perfil que los settings: si cambian las reglas, cambia el documento.
 *
 * @param {import('./config.mjs').Config} config
 * @param {{ version: string, packageManager: import('./package-manager.mjs').PackageManager | null }} context
 * @returns {string} el markdown completo.
 */
export const renderDoc = (config, { version, packageManager }) => {
  const fragment = settingsFragment(config, packageManager);
  const hasPackageJson = packageManager !== null;
  const run = (name) => (packageManager ? runScript(packageManager, name) : scripts()[name]);
  const lines = [
    '# Barandas de Claude Code en este repo',
    '',
    `> Generado por [claude-repo-guard](https://github.com/ramon-sg/claude-repo-guard) v${version}. No lo edites a mano: cambia ${code('.claude/repo-guard.config.json')} y vuelve a correr ${code(`${CLI} apply`)}.`,
    '',
    '## En simple',
    '',
    '- Los comandos que corre Claude quedan aislados por el sistema operativo: escriben y borran solo dentro del directorio de la sesión (el worktree), los temporales y las rutas que se agreguen a propósito.',
    '- La red queda limitada a una lista de dominios.',
    '- Funciona en sesiones locales y en la nube (claude.ai/code). En la nube no hay sandbox de Bash, pero la máquina ya está aislada: ver "En la nube".',
    `- ${config.protectedPaths.length > 0 ? `Claude no puede editar ${config.protectedPaths.map(code).join(', ')}: son scripts que se ejecutan fuera de su control (por ejemplo, hooks de git).` : 'No hay rutas protegidas extra.'}`,
    '- Todo vive en archivos de este repo. Nada se instala en la máquina ni afecta a otros repos.',
    '',
    '## Cómo se usa',
    '',
    '| Para | Comando | Qué hace |',
    '| --- | --- | --- |',
    `| Trabajar sin preguntas | ${code(run('claude:auto'))} | Modo auto: lo dudoso se rechaza y Claude sigue. Carga el contexto del clasificador |`,
    `| Dejarlo solo | ${code(`${scripts()['claude:auto']} --permission-prompts none`)} | Igual, pero nunca pregunta: lo que pediría confirmación se rechaza |`,
    `| Correr sin restricciones | ${code(run('claude:free'))} | Sin sandbox y con ${code('--dangerously-skip-permissions')}, solo esa sesión |`,
    `| Sesión normal | ${code('claude')} | Sandbox y reglas activos, con las preguntas de permisos de siempre |`,
    '',
    `${code('claude:free')} equivale a ${code(`claude --settings '{"sandbox":{"enabled":false}}' --dangerously-skip-permissions`)}. ${code('--settings')} tiene más prioridad que los settings del repo, así que apaga el sandbox solo para esa sesión. Si Claude lo ejecuta desde una sesión con sandbox, el proceso hijo hereda el sandbox del sistema operativo: no sirve para escaparse.`,
    '',
    '## Qué se instaló',
    '',
    '| Archivo | Qué tiene |',
    '| --- | --- |',
    `| ${code('.claude/settings.json')} | Sandbox, dominios permitidos y reglas ${code('deny')}, fusionados con lo que el repo ya tenía |`,
    `| ${code(AUTO_MODE_FILE)} | Contexto para el clasificador del modo auto. Claude no lee ${code('autoMode')} desde los settings del repo, por eso va aparte y se carga con ${code('--settings')} |`,
    ...(hasPackageJson ? [`| ${code('package.json')} | Los scripts ${code('claude:auto')} y ${code('claude:free')} |`] : []),
    `| ${code('.claude/repo-guard.config.json')} | Las opciones de este repo |`,
    `| ${code('.claude/repo-guard.manifest.json')} | Lo que agregó la instalación, para poder deshacerlo exacto |`,
    `| ${code(config.docPath)} | Este documento |`,
    '',
    'Lo que se fusionó en `.claude/settings.json`:',
    '',
    json(fragment),
    '',
    `Lo que tiene ${code(AUTO_MODE_FILE)}:`,
    '',
    json(autoModeSettings(config)),
    '',
    '## Qué protege cada regla',
    '',
    '| Regla | Protege | No protege |',
    '| --- | --- | --- |',
    `| ${code('sandbox.enabled')} | Los comandos de Bash no escriben ni borran fuera del worktree, los temporales y ${code('allowWrite')} | Las herramientas de archivos de Claude (Read, Edit, Write) corren fuera del sandbox: las rigen las reglas de permisos y el modo. Si el sandbox no está disponible (la nube, o Linux sin ${code('bwrap')}), los comandos corren sin él |`,
    `| ${code('allowUnsandboxedCommands: false')} | Claude no puede reintentar un comando fuera del sandbox | Los comandos que el repo excluya a propósito (${code('excludedCommands')}) |`,
    `| ${code('network.allowedDomains')} | En los modos auto y dontAsk, los comandos solo salen a esos dominios | Con ${code('--dangerously-skip-permissions')} los demás dominios pasan sin preguntar. Un dominio permitido (como GitHub) sigue siendo un canal de salida |`,
    ...(config.localBinding
      ? [`| ${code('network.allowLocalBinding')} | En macOS deja levantar servidores y conectarse a localhost (bases de dev, servidores de tests) | Expone todos los servicios de localhost, no solo los del repo. En Linux no tiene efecto: cada comando tiene su propio loopback |`]
      : []),
    `| ${code('filesystem.allowWrite')}: ${code('/private/var/folders')} | En macOS, ${code('mktemp')} sin plantilla crea ahí sus temporales (ignora ${code('TMPDIR')}). Sin esto fallan los tests en shell que usan ${code('mktemp -d')} | Abre también la caché del usuario en esa carpeta. Las carpetas de otros usuarios siguen protegidas por sus permisos |`,
    ...(config.allowWrite.length > 0
      ? [`| ${code('filesystem.allowWrite')}: ${config.allowWrite.map(code).join(', ')} | Los comandos pueden escribir ahí además del worktree (registros o cachés compartidos entre worktrees) | Lo que haya en esas rutas queda a su alcance, también para borrarlo |`]
      : []),
    ...(config.allowUnixSockets.length > 0
      ? [`| ${code('network.allowUnixSockets')}: ${config.allowUnixSockets.map(code).join(', ')} | Deja usar esos sockets locales; con el de Docker, los tests pueden levantar sus contenedores | Con el socket de Docker el sandbox se puede saltar: un contenedor puede montar cualquier carpeta que Docker comparta (tu home incluido) y escribir ahí. Protege contra accidentes, no contra un agente manipulado |`]
      : []),
    ...(config.weakerNetworkIsolation
      ? [`| ${code('enableWeakerNetworkIsolation')} | Deja que herramientas en Go (${code('gh')}, ${code('gcloud')}) verifiquen TLS dentro del sandbox en macOS | Debilita el sandbox: abre una posible vía de salida a través del servicio de confianza del sistema |`]
      : []),
    ...(config.protectedPaths.length > 0
      ? [`| ${config.protectedPaths.map((path) => code(`Edit(${path})`)).join(', ')} | Claude no edita esos archivos, ni con sus herramientas ni desde Bash | Lo que otro proceso escriba ahí |`]
      : []),
    ...(config.askCommands.length > 0
      ? [`| ${code('permissions.ask')}: ${config.askCommands.map((command) => code(commandRule(command))).join(', ')} | Esos comandos piden confirmación; donde nadie contesta, se rechazan (ver abajo). Un texto que solo los nombra (un mensaje, un comentario) pasa | Un comando escondido dentro de ${code('bash -c "..."')} o de un script: atrapa equivocaciones, no a quien quiere esquivarla |`]
      : []),
    ...(config.denyCommands.length > 0
      ? [`| ${code('permissions.deny')}: ${config.denyCommands.map((command) => code(commandRule(command))).join(', ')} | Esos comandos se rechazan siempre, en todos los modos | Lo mismo: un comando escondido dentro de ${code('bash -c "..."')} o de un script |`]
      : []),
    `| Contexto del modo auto | El clasificador no frena el trabajo rutinario (borrar en el worktree, servicios locales${config.integrationBranch ? `, merge a ${code(config.integrationBranch)}` : ''}) | Solo aplica si Claude se abre con ${code(`--settings ${AUTO_MODE_FILE}`)} |`,
    '',
    ...(config.askCommands.length > 0
      ? [
          '### Qué pasa con los comandos que piden confirmación',
          '',
          '| Cómo arranca Claude | Qué pasa |',
          '| --- | --- |',
          `| ${code('claude')}, ${code(run('claude:auto'))} o ${code(run('claude:free'))} | Te pregunta. El modo auto no lo aprueba solo |`,
          `| ${code('--permission-prompts none')}, ${code('claude -p')} o el modo ${code('dontAsk')} | Se rechaza y Claude sigue con otra cosa |`,
          '',
        ]
      : []),
    '## En la nube',
    '',
    'El repo funciona igual en una sesión local y en una de claude.ai/code. Lo que cambia en la nube:',
    '',
    `- **No hay sandbox de Bash:** la máquina no trae ${code('bwrap')} ni ${code('socat')}, y los comandos corren como root sin aislamiento. Por eso no se usa ${code('sandbox.failIfUnavailable')}: con esa opción Claude se cierra al arrancar en la nube. La máquina es desechable y no tiene tus archivos ni tus credenciales.`,
    `- **Las reglas de permisos sí se aplican:** ${config.protectedPaths.length > 0 ? `${config.protectedPaths.map(code).join(', ')} sigue bloqueado, desde Bash y desde Edit.` : 'las reglas `deny` del repo siguen activas.'}`,
    `- **La red la filtra el entorno de la nube**, no ${code('network.allowedDomains')}. Los dominios se configuran en el entorno, en claude.ai/code.`,
    `- **Los scripts ${code('claude:auto')} y ${code('claude:free')} son solo para la terminal:** en la nube el modo se elige en el menú de la sesión.`,
    `- **GitHub pasa por un proxy** que no deja borrar ramas, pero sí empujar a cualquiera: protege las ramas importantes con reglas en GitHub. ${code('gh pr')} y ${code('gh issue')} no funcionan ahí; usa ${code('gh api')}.`,
    '',
    '## Cómo desactivarlo',
    '',
    `- **Una sesión:** ${code(run('claude:free'))}.`,
    `- **Siempre, solo en tu máquina:** pon ${code('{"sandbox": {"enabled": false}}')} en ${code('.claude/settings.local.json')}, que tiene más prioridad que el del repo. Agrégalo a ${code('.gitignore')} si no está.`,
    `- **Una regla puntual:** cambia ${code('.claude/repo-guard.config.json')} y vuelve a correr ${code(`${CLI} apply`)}.`,
    `- **Todo:** ${code(`${CLI} uninstall`)} deja el repo como estaba. Respeta lo que hayas agregado después a mano.`,
    '',
    'Las listas `deny` se suman entre niveles de settings: no se pueden quitar desde `--settings` ni desde `settings.local.json`, solo desde la configuración de este repo.',
    '',
    '## Limitaciones conocidas',
    '',
    ...(packageManager === 'pnpm'
      ? [`- ${code('pnpm install')} no funciona dentro del sandbox: pnpm no puede abrir el lock de su store. Instala dependencias fuera de Claude (o desde un hook, que corre fuera del sandbox).`]
      : []),
    config.npmCache
      ? `- La caché de npm (${NPM_CACHE.map(code).join(' y ')}) está abierta para que ${code('npx')} corra paquetes que no están en el repo. La comparten todos tus repos: un comando de Claude podría alterar un paquete guardado, y otro repo lo correría así fuera del sandbox. Para cerrarla, pon ${code('"npmCache": false')} en ${code('.claude/repo-guard.config.json')}.`
      : `- ${code('npx')} de un paquete que no está en el repo no funciona dentro del sandbox: la caché de npm está cerrada (${code('"npmCache": false')}). Córrelo fuera de Claude o agrega el paquete al repo.`,
    ...(packageManager === 'bun'
      ? [
          config.bunCache
            ? `- La caché de bun (${code(BUN_CACHE)}) está abierta para que ${code('bun install')} funcione dentro del sandbox. La comparten todos tus repos: un comando de Claude podría alterar un paquete guardado, y otro repo lo instalaría así fuera del sandbox. Para cerrarla, pon ${code('"bunCache": false')} en ${code('.claude/repo-guard.config.json')}.`
            : `- ${code('bun install')} no funciona dentro del sandbox: la caché de bun está cerrada (${code('"bunCache": false')}). Instala dependencias fuera de Claude (o desde un hook, que corre fuera del sandbox).`,
        ]
      : []),
    `- En macOS, ${code('ps')} y ${code('pgrep')} no corren dentro del sandbox: no deja listar procesos. Un test que los use falla; que el proceso anote su ${code('$PPID')} o su ${code('$$')} en un archivo da el mismo dato.`,
    `- Dentro del sandbox, Claude no puede escribir ${code('.claude/settings.json')}: ${code(`${CLI} apply`)} se corre desde tu terminal, no desde una sesión de Claude.`,
    `- En macOS, ${code('gh')} falla la verificación TLS dentro del sandbox salvo que actives ${code('weakerNetworkIsolation')} en la configuración.`,
    '- El sandbox no cubre las credenciales que se pueden leer en tu home: limítalas con los permisos de cada aplicación.',
    config.allowUnixSockets.length > 0
      ? `- El socket de Docker está abierto (${code('allowUnixSockets')}): un contenedor puede montar cualquier carpeta que Docker comparta y saltarse el sandbox. Es el precio de que el agente corra tests con Docker.`
      : `- Docker queda bloqueado: el sandbox no deja abrir sus sockets. Si los tests lo necesitan, agrega el socket en ${code('allowUnixSockets')}, sabiendo que un contenedor puede saltarse el sandbox.`,
    '',
    '## Revisar',
    '',
    `${code(`${CLI} doctor`)} revisa que los settings, los scripts y este documento coincidan con la configuración.`,
    '',
  ];
  return lines.join('\n');
};
