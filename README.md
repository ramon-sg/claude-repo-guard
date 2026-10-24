# claude-repo-guard

Barandas para correr Claude Code sin preguntas de permisos, instaladas **en cada repo** y no en la máquina.

## En simple

- El agente trabaja sin preguntar. Lo dudoso no se pregunta: se rechaza y el agente sigue.
- Puede escribir y borrar (`rm` incluido) solo dentro de su worktree y de los temporales. Fuera de eso, el sistema operativo lo impide.
- Todo vive en archivos del repo (`.claude/`, `package.json`, `docs/`). Claude Code los carga solo, en el checkout principal y en cada worktree. No pide `sudo` ni toca otros repos.
- Cuando quieres correr sin restricciones, `pnpm claude:free` las apaga para esa sesión.
- La instalación genera un documento que explica qué se instaló, qué protege, qué no y cómo desactivar cada parte.

## Instalar

Dentro del repo:

```bash
npx github:ramon-sg/claude-repo-guard install --dry-run   # muestra los cambios
npx github:ramon-sg/claude-repo-guard install             # los aplica (pregunta antes)
npx github:ramon-sg/claude-repo-guard doctor              # revisa que todo coincida
npx github:ramon-sg/claude-repo-guard uninstall           # deja el repo como estaba
```

Commitea los archivos que agrega: así cada worktree y cada persona del equipo los trae.

## Cómo se usa

| Para | Comando | Qué hace |
| --- | --- | --- |
| Trabajar sin preguntas | `pnpm claude:auto` | Modo auto: lo dudoso se rechaza y Claude sigue |
| Dejarlo solo | `pnpm run claude:auto --permission-prompts none` | Igual, pero nunca pregunta |
| Correr sin restricciones | `pnpm claude:free` | Sin sandbox y con `--dangerously-skip-permissions`, solo esa sesión |
| Sesión normal | `claude` | Sandbox y reglas activos, con las preguntas de siempre |

Los argumentos extra pasan a Claude: `pnpm run claude:free -p "..."`.

`pnpm claude:free` equivale a:

```bash
claude --settings '{"sandbox":{"enabled":false}}' --dangerously-skip-permissions
```

`--settings` tiene más prioridad que los settings del repo, así que apaga el sandbox solo para esa sesión. Si el agente lo ejecuta desde una sesión con sandbox, el proceso hijo hereda el sandbox del sistema operativo: no sirve para escaparse.

## Qué instala

| Archivo | Qué tiene |
| --- | --- |
| `.claude/settings.json` | Sandbox activo, sin reintentos fuera del sandbox, dominios permitidos y `Edit(/.husky/**)` en `deny`. Se fusiona con lo que el repo ya tenía |
| `.claude/repo-guard.auto-mode.json` | Exige el sandbox (`failIfUnavailable`) y da contexto al clasificador del modo auto. Claude no lee `autoMode` desde los settings del repo, por eso va aparte y lo carga `claude:auto` con `--settings` |
| `package.json` | Los scripts `claude:auto` y `claude:free` |
| `docs/development/claude-repo-guard.md` | El documento generado |
| `.claude/repo-guard.config.json` | Las opciones del repo |
| `.claude/repo-guard.manifest.json` | Lo que agregó la instalación, para deshacerlo exacto |

`uninstall` quita solo lo que agregó `install`: respeta lo que hayas cambiado o agregado después a mano, y si el archivo vuelve a su contenido original, restaura también su formato.

## Opciones

En `.claude/repo-guard.config.json`. Después de editarlo, vuelve a correr `install`.

| Opción | Default | Para qué |
| --- | --- | --- |
| `allowedDomains` | `[]` | Dominios extra, además de npm y GitHub |
| `allowWrite` | `[]` | Rutas extra donde los comandos pueden escribir (`~/` es tu home) |
| `protectedPaths` | `["/.husky/**"]` | Rutas que Claude no puede editar (`/` es la raíz del repo) |
| `environment` | `[]` | Más contexto para el modo auto, en prosa |
| `integrationBranch` | `""` | Rama a la que mergear con merge commit es parte del flujo (por ejemplo `staging`) |
| `localBinding` | `true` | En macOS, levantar servidores y conectarse a localhost |
| `weakerNetworkIsolation` | `false` | En macOS, deja que `gh` y otras herramientas en Go verifiquen TLS dentro del sandbox. Debilita el sandbox |
| `docPath` | `docs/development/claude-repo-guard.md` | Dónde va el documento |

## Qué no cubre

- **Credenciales de terceros** (secretos, Kubernetes, GitHub, merges a ramas protegidas): se limitan con los permisos de cada aplicación, no con Claude Code. El sandbox deja leer tu home.
- **`--dangerously-skip-permissions`:** en ese modo la lista de dominios no frena nada.
- **`pnpm install` dentro del sandbox:** pnpm no puede abrir el lock de su store. Instala dependencias fuera de Claude o desde un hook.
- **localhost en Linux:** cada comando tiene su propio loopback, así que no llega a los servicios del host.
- **El socket de Docker:** si el agente lo usa, un contenedor puede montar lo que Docker comparta y saltarse el sandbox.
- **Código del agente que corre fuera del sandbox** (CI, scripts que corres tú).

## En la nube

El repo funciona igual en una sesión local y en una de claude.ai/code. Probado en la nube:

- **No hay sandbox de Bash:** la máquina no trae `bwrap` ni `socat`. Por eso `sandbox.failIfUnavailable` no va en `.claude/settings.json` (Claude se cerraría al arrancar) sino en `.claude/repo-guard.auto-mode.json`, que solo carga `claude:auto` desde la terminal: el trabajo desatendido en local nunca corre sin sandbox. La máquina ya está aislada y no tiene tus archivos ni tus credenciales.
- **Las reglas de permisos sí se aplican:** `.husky` queda bloqueado desde Bash y desde Edit.
- **La red la filtra el entorno de la nube**, no `network.allowedDomains`.
- **`claude:auto` y `claude:free` son solo para la terminal:** en la nube el modo se elige en el menú.

`doctor` marca un error si `failIfUnavailable` aparece en `.claude/settings.json`.

## Requisitos

- Claude Code con sandbox: macOS, o Linux/WSL2 con `bubblewrap` y `socat`. Sin eso, los comandos corren sin sandbox (`doctor` lo avisa). En la nube no hace falta.
- Node 20 o superior para el instalador.
