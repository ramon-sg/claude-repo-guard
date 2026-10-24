import { AUTO_MODE_FILE, autoModeSettings, scripts, settingsFragment } from './profile.mjs';

/** Cómo se invoca la herramienta sin instalarla. */
const CLI = 'npx github:ramon-sg/claude-repo-guard';

const code = (value) => `\`${value}\``;

const json = (value) => ['```json', JSON.stringify(value, null, 2), '```'].join('\n');

/**
 * Documento que explica qué instaló la herramienta en el repo. Se genera desde
 * el mismo perfil que los settings: si cambian las reglas, cambia el documento.
 *
 * @param {import('./config.mjs').Config} config
 * @param {{ version: string, hasPackageJson: boolean }} context
 * @returns {string} el markdown completo.
 */
export const renderDoc = (config, { version, hasPackageJson }) => {
  const fragment = settingsFragment(config);
  const run = (name) => (hasPackageJson ? `pnpm ${name}` : scripts()[name]);
  const lines = [
    '# Barandas de Claude Code en este repo',
    '',
    `> Generado por [claude-repo-guard](https://github.com/ramon-sg/claude-repo-guard) v${version}. No lo edites a mano: cambia ${code('.claude/repo-guard.config.json')} y vuelve a correr ${code(`${CLI} install`)}.`,
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
    ...(config.weakerNetworkIsolation
      ? [`| ${code('enableWeakerNetworkIsolation')} | Deja que herramientas en Go (${code('gh')}, ${code('gcloud')}) verifiquen TLS dentro del sandbox en macOS | Debilita el sandbox: abre una posible vía de salida a través del servicio de confianza del sistema |`]
      : []),
    ...(config.protectedPaths.length > 0
      ? [`| ${config.protectedPaths.map((path) => code(`Edit(${path})`)).join(', ')} | Claude no edita esos archivos, ni con sus herramientas ni desde Bash | Lo que otro proceso escriba ahí |`]
      : []),
    `| Contexto del modo auto | El clasificador no frena el trabajo rutinario (borrar en el worktree, servicios locales${config.integrationBranch ? `, merge a ${code(config.integrationBranch)}` : ''}) | Solo aplica si Claude se abre con ${code(`--settings ${AUTO_MODE_FILE}`)} |`,
    '',
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
    `- **Una regla puntual:** cambia ${code('.claude/repo-guard.config.json')} y vuelve a correr ${code(`${CLI} install`)}.`,
    `- **Todo:** ${code(`${CLI} uninstall`)} deja el repo como estaba. Respeta lo que hayas agregado después a mano.`,
    '',
    'Las listas `deny` se suman entre niveles de settings: no se pueden quitar desde `--settings` ni desde `settings.local.json`, solo desde la configuración de este repo.',
    '',
    '## Limitaciones conocidas',
    '',
    `- ${code('pnpm install')} no funciona dentro del sandbox: pnpm no puede abrir el lock de su store. Instala dependencias fuera de Claude (o desde un hook, que corre fuera del sandbox).`,
    `- En macOS, ${code('gh')} falla la verificación TLS dentro del sandbox salvo que actives ${code('weakerNetworkIsolation')} en la configuración.`,
    '- El sandbox no cubre las credenciales que se pueden leer en tu home: limítalas con los permisos de cada aplicación.',
    '- No dejes que el agente use el socket de Docker: un contenedor puede montar cualquier carpeta que Docker comparta y saltarse el sandbox.',
    '',
    '## Revisar',
    '',
    `${code(`${CLI} doctor`)} revisa que los settings, los scripts y este documento coincidan con la configuración.`,
    '',
  ];
  return lines.join('\n');
};
