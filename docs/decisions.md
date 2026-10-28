# Decisiones

Por qué claude-repo-guard hace lo que hace. Una entrada por decisión: qué se decidió, por qué y qué se descartó. La más nueva va primero.

## Los comandos internos de git que arman commits piden confirmación (#18)

**Qué:** en todo repo, `git commit-tree`, `git merge-tree`, `git update-ref`, `git hash-object`, `git read-tree` y `git push --no-verify` piden confirmación. Donde nadie contesta (`claude -p`, `--permission-prompts none`), se rechazan. `git commit`, `git merge` y `git push` normales no preguntan.

**Por qué:** Claude Code no deja que un comando escriba `.claude/`, `.agents/skills/` ni `.mcp.json` dentro del sandbox, para que un agente no reescriba sus propias instrucciones ni sus permisos. Pero esos comandos de git arman un commit escribiendo solo dentro de `.git`, sin tocar los archivos. Un agente podría commitear un cambio a una skill, subirlo y, después de un `git pull`, la próxima sesión cargaría esa skill. Es justo la auto-modificación que la protección quiere evitar.

**Lo que no cubre:** las reglas comparan cómo empieza el comando. Probado con sesiones reales de Claude Code y la regla `Bash(git commit-tree*)`:

| Comando | Resultado |
| --- | --- |
| `git commit-tree …` | Pide confirmación |
| `env git commit-tree …` | Pide confirmación |
| `cd . && git commit-tree …` | Pide confirmación |
| `git -c user.name=a commit-tree …` | Pasa |
| `git -C . commit-tree …` | Pasa |
| `bash -c 'git commit-tree …'` | Pasa |

Atrapan un uso directo, no a quien quiere esquivarlas. La protección de fondo está en GitHub: `CODEOWNERS` con revisión obligatoria para esas rutas, de modo que un cambio a skills o settings no entre a la rama principal sin que alguien lo apruebe.

**Descartado:**
- Bloquear la escritura en `.git/objects` o `.git/refs`: rompería todo commit.
- Bloquear el push de cambios a skills: muchas veces la persona los pidió, y en la nube no hay sandbox.
- Cambios por la API de GitHub: los cubre la revisión del PR.

## git no puede tocar las skills ni los settings dentro del sandbox (#15, #17)

**Qué:** no se abre nada. Un `git merge`, `git pull` o `git switch` que cambia `.agents/skills/`, `.claude/skills` o `.claude/settings.json` falla dentro del sandbox con `Operation not permitted`; esos merges se hacen desde la terminal. El documento generado lo avisa.

**Por qué:** Claude Code bloquea esas rutas a propósito. Abrirlas dejaría que cualquier comando las cambie, no solo git, y desarmaría esa protección. El costo es hacer algunos merges a mano.

**Descartado:** abrir esas rutas en `allowWrite`.

## La caché de npm queda abierta en todo repo (#14)

**Qué:** el sandbox deja escribir `~/.npm/_cacache` (descargas) y `~/.npm/_npx` (donde `npx` instala lo que corre). Se cierra con `"npmCache": false`.

**Por qué:** sin eso, `npx` de un paquete que no está en el repo falla con `EPERM`. Se abre en todo repo porque `npx` se usa aunque el repo use bun o pnpm. Solo `_cacache` no alcanza: `npx` también escribe en `_npx`.

**Riesgo aceptado:** la caché la comparten todos los repos. Un comando de Claude podría alterar un paquete guardado, y otro repo lo correría así fuera del sandbox. Es un riesgo del mismo tipo que el del socket de Docker: protege contra accidentes, no contra un agente manipulado. El documento generado lo avisa.

**Descartado:**
- Cerrada por defecto: cada repo tendría que abrirla, y `npx` fallaría sin explicación hasta entonces.
- Una caché dentro del worktree (`npm_config_cache`): no sale del repo, pero baja todo de nuevo en cada worktree y agrega carpetas y variables que mantener.

## La caché de bun queda abierta en repos con bun (#9)

**Qué:** en repos con bun, el sandbox deja escribir `~/.bun/install/cache`. Se cierra con `"bunCache": false`. En repos sin bun no se abre.

**Por qué:** sin eso, `bun install` falla con `EPERM`. bun crea su carpeta temporal dentro de la caché, así que basta con abrir esa ruta.

**Riesgo aceptado:** el mismo que con npm: la caché la comparten todos los repos con bun.

**Descartado:** una caché dentro del worktree, por lo mismo que con npm.

## `install` pasa a llamarse `apply` (v0.5.0)

**Qué:** un solo comando, `apply`, instala, actualiza y aplica cambios de configuración. `install` falla con un mensaje que lo dice.

**Por qué:** las tres cosas son lo mismo por dentro: dejar el repo como dicen la versión y la configuración. `install` sugería algo de una sola vez.

**Descartado:**
- Comandos separados (`install`, `update`): harían lo mismo, y cada uno fallaría en casos que el otro resuelve.
- Dejar `install` como alias: dos nombres para lo mismo.
