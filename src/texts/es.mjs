/**
 * Los textos de la terminal en español. `en.mjs` tiene las mismas claves; un
 * test lo revisa. Lo que se escribe en el repo no pasa por acá.
 */
export const es = {
  help: `claude-repo-guard: barandas de Claude Code instaladas en el repo.

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
  --json      Salida en JSON (siempre en español).

Opciones de todos los comandos:
  --lang es|en   Idioma de la terminal. También CLAUDE_REPO_GUARD_LANG=en.
                 Por defecto, español. LANG no se mira.

En una terminal, los mensajes finales salen junto a Kuro. NO_COLOR quita el color.

La configuración del repo vive en .claude/repo-guard.config.json.
Más: https://github.com/ramon-sg/claude-repo-guard
`,
  unknownCommand: (command) => `No conozco el comando "${command}".`,
  helpNext: 'Para ver los comandos:',
  installRenamed: '"install" ahora se llama "apply". Hace lo mismo: instala, actualiza o aplica cambios.',
  badLang: (source, value) => `${source} acepta es o en, no "${value}".`,

  changes: {
    deleted: 'se borra',
    created: 'nuevo',
    upToDate: 'No hay nada que cambiar: el repo ya está al día.',
    notInstalled: 'No está instalado en este repo: no hay nada que quitar.',
    confirm: { apply: '¿Aplico estos cambios?', uninstall: '¿Quito estos cambios?' },
    confirmHint: '[s/N]',
    dryRun: 'Modo --dry-run: no se escribió nada.',
    dryRunNext: 'Para escribirlos:',
    noTerminal: 'No hay terminal para confirmar.',
    noTerminalNext: 'Revisa los cambios con --dry-run y vuelve a correr con:',
    declined: 'No se cambió nada.',
    done: (count) => `Listo: ${count} ${count === 1 ? 'archivo' : 'archivos'}.`,
    doneLines: ['Revisa el diff y haz commit.'],
  },

  doctor: {
    allOk: (total) => `Todo en orden: ${total} ${total === 1 ? 'revisión' : 'revisiones'}.`,
    failing: (failed, total) => `${failed} de ${total} ${total === 1 ? 'revisión falla' : 'revisiones fallan'}.`,
    names: {
      install: 'Instalación',
      version: 'Versión',
      settings: '.claude/settings.json',
      cloud: 'Sesiones en la nube',
      autoMode: 'Contexto del modo auto',
      scripts: 'Scripts',
      doc: 'Documento',
      sandbox: 'Sandbox',
      linuxSandbox: 'Sandbox en Linux',
    },
    notInstalled: 'no está instalado en este repo: corre `claude-repo-guard apply`',
    versionBehind: (installed, version, cli) => `instalado con v${installed}; esta es v${version}: corre \`${cli}#v${version} apply\``,
    settingsOk: 'sandbox y reglas presentes',
    changed: (what) => `falta o cambió: ${what}`,
    cloudOk: 'nada impide abrir el repo en claude.ai/code',
    cloudBlocked: (keys) => `quita ${keys} de .claude/settings.json: en la nube no hay sandbox y Claude se cierra al arrancar`,
    upToDate: 'al día',
    autoModeChanged: 'no coincide con la configuración: corre apply',
    scriptsOk: 'claude:auto y claude:free',
    docChanged: (docPath) => `${docPath} no coincide con la configuración: corre apply`,
    remoteSandbox: 'sesión en la nube: no hay sandbox de Bash, la máquina ya está aislada',
    linuxOk: 'bubblewrap y socat instalados',
    linuxMissing: (tools) => `falta ${tools.join(' y ')}: los comandos de Claude corren sin sandbox`,
    noSandbox: (platform) => `el sandbox de Claude Code no existe en ${platform}: los comandos corren sin sandbox`,
  },

  errors: {
    notGitRepo: (cwd) => `${cwd} no está dentro de un repo git.`,
    notRelative: (label, value) => `${label} tiene que ser una ruta relativa dentro del repo, no ${value}.`,
    symlink: (label, relative) => `${label} (${relative}) es un enlace simbólico: no lo toco.`,
    invalidJson: (file, detail) => `${file} no es JSON válido: ${detail}`,
    unknownOption: (file, key, keys) => `${file}: no conozco la opción "${key}". Las opciones son: ${keys}.`,
    wrongType: (file, key, kind) => `${file}: "${key}" debe ser ${{ array: 'una lista', string: 'un texto', boolean: 'true o false' }[kind]}.`,
    docPathMd: (file) => `${file}: "docPath" tiene que terminar en .md.`,
    commandParens: (file, key, value) => `${file}: "${key}" lleva comandos como "git reset --hard", sin paréntesis; no sirve ${value}.`,
    manifestBroken: 'El manifiesto está dañado: "files" no es una lista.',
    manifestForeign: (file) => `El manifiesto pide borrar ${file}, que no es un archivo generado por claude-repo-guard.`,
    scriptClash: (name) => `package.json ya tiene un script "${name}" distinto. Renómbralo o bórralo y vuelve a correr apply.`,
    notObject: (key) => `"${key}" ya existe y no es un objeto.`,
    notList: (key) => `"${key}" ya existe y no es una lista.`,
  },
};
