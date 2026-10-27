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
npx github:ramon-sg/claude-repo-guard apply --dry-run     # muestra los cambios
npx github:ramon-sg/claude-repo-guard apply               # los aplica (pregunta antes)
npx github:ramon-sg/claude-repo-guard doctor              # revisa que todo coincida
npx github:ramon-sg/claude-repo-guard uninstall           # deja el repo como estaba
```

`apply` es el único comando para instalar, actualizar y aplicar cambios: deja el repo como dicen la versión que corres y `.claude/repo-guard.config.json`. Correrlo dos veces no cambia nada. Para actualizar, córrelo con la versión nueva (`npx github:ramon-sg/claude-repo-guard#v0.5.0 apply`); no hace falta `uninstall` antes. Hasta la v0.4.1 se llamaba `install`.

Commitea los archivos que agrega: así cada worktree y cada persona del equipo los trae.

Corre `apply` y `uninstall` desde tu terminal, no desde una sesión de Claude: una vez instalado, el sandbox no deja que los comandos de Claude escriban `.claude/settings.json`. Eso también rige para la sesión que estaba abierta mientras instalabas, porque Claude relee los settings en vivo.

## Cómo se usa

| Para | Comando | Qué hace |
| --- | --- | --- |
| Trabajar sin preguntas | `pnpm claude:auto` | Modo auto: lo dudoso se rechaza y Claude sigue |
| Dejarlo solo | `pnpm run claude:auto --permission-prompts none` | Igual, pero nunca pregunta |
| Correr sin restricciones | `pnpm claude:free` | Sin sandbox y con `--dangerously-skip-permissions`, solo esa sesión |
| Sesión normal | `claude` | Sandbox y reglas activos, con las preguntas de siempre |

Los argumentos extra pasan a Claude: `pnpm run claude:free -p "..."`.

Los ejemplos usan pnpm. El documento que genera `apply` usa el gestor del repo: el campo `packageManager` de `package.json`, si no el lockfile (`bun run claude:auto` con `bun.lock`), y si no hay ninguno, `npm run`.

`pnpm claude:free` equivale a:

```bash
claude --settings '{"sandbox":{"enabled":false}}' --dangerously-skip-permissions
```

`--settings` tiene más prioridad que los settings del repo, así que apaga el sandbox solo para esa sesión. Si el agente lo ejecuta desde una sesión con sandbox, el proceso hijo hereda el sandbox del sistema operativo: no sirve para escaparse.

## Qué instala

| Archivo | Qué tiene |
| --- | --- |
| `.claude/settings.json` | Sandbox activo, sin reintentos fuera del sandbox, dominios permitidos y `Edit(/.husky/**)` en `deny`. Se fusiona con lo que el repo ya tenía |
| `.claude/repo-guard.auto-mode.json` | Contexto para el clasificador del modo auto. Claude no lee `autoMode` desde los settings del repo, por eso va aparte y lo carga `claude:auto` con `--settings` |
| `package.json` | Los scripts `claude:auto` y `claude:free` |
| `docs/development/claude-repo-guard.md` | El documento generado |
| `.claude/repo-guard.config.json` | Las opciones del repo |
| `.claude/repo-guard.manifest.json` | Lo que agregó la instalación, para deshacerlo exacto |

`uninstall` quita solo lo que agregó `apply`: respeta lo que hayas cambiado o agregado después a mano, y si el archivo vuelve a su contenido original, restaura también su formato.

## Opciones

En `.claude/repo-guard.config.json`. Después de editarlo, vuelve a correr `apply`.

| Opción | Default | Para qué |
| --- | --- | --- |
| `allowedDomains` | `[]` | Dominios extra, además de npm y GitHub |
| `allowWrite` | `[]` | Rutas extra donde los comandos pueden escribir (`~/` es tu home). Ver [Tests que salen del worktree](#tests-que-salen-del-worktree) |
| `allowUnixSockets` | `[]` | Sockets locales que los comandos pueden usar, como el de Docker. Abre un hueco en el sandbox: ver [Docker](#docker) |
| `protectedPaths` | `["/.husky/**"]` | Rutas que Claude no puede editar (`/` es la raíz del repo) |
| `askCommands` | `[]` | Comandos que piden confirmación, como `git reset --hard`. Ver [Comandos peligrosos](#comandos-peligrosos) |
| `denyCommands` | `[]` | Comandos que se rechazan siempre |
| `environment` | `[]` | Más contexto para el modo auto, en prosa |
| `integrationBranch` | `""` | Rama a la que mergear con merge commit es parte del flujo (por ejemplo `staging`) |
| `localBinding` | `true` | En macOS, levantar servidores y conectarse a localhost |
| `weakerNetworkIsolation` | `false` | En macOS, deja que `gh` y otras herramientas en Go verifiquen TLS dentro del sandbox. Debilita el sandbox |
| `bunCache` | `true` | En repos con bun, abre su caché (`~/.bun/install/cache`) para que `bun install` funcione dentro del sandbox. La caché la comparten todos tus repos |
| `docPath` | `docs/development/claude-repo-guard.md` | Dónde va el documento |

## Comandos peligrosos

Para comandos que a veces hacen falta pero no deberían correr sin que nadie lo sepa, lista el comienzo del comando en `askCommands`; para los que nunca deben correr, en `denyCommands`:

```json
{
  "askCommands": ["git reset --hard", "kubectl delete", "helm uninstall"],
  "denyCommands": ["git push --force"]
}
```

Cada uno se vuelve una regla de permisos de Claude Code (`Bash(git reset --hard*)`). Qué pasa con un comando de `askCommands` (la segunda fila se probó con sesiones reales en los cuatro modos, con y sin sandbox; la primera es lo que dice la documentación de Claude Code):

| Cómo arranca Claude | Qué pasa |
| --- | --- |
| `claude`, `pnpm claude:auto` o `pnpm claude:free` | Te pregunta. El modo auto no lo aprueba solo |
| `--permission-prompts none`, `claude -p` o el modo `dontAsk` | Se rechaza y Claude sigue con otra cosa |

`denyCommands` se rechaza en todos los modos, incluso con `--dangerously-skip-permissions`.

**Por qué reglas de permisos y no un hook propio.** Un hook que busca texto en el comando pregunta también cuando el comando solo *nombra* lo peligroso, por ejemplo un `gh api ... -f body="..."` cuyo texto explica qué hace `git reset --hard`. En una sesión sin nadie al lado, ese falso positivo frena un paso legítimo. Las reglas de Claude Code miran el comando que se ejecuta:

| Comando | Hook que busca texto | Regla `Bash(git reset --hard*)` |
| --- | --- | --- |
| `echo "... git reset --hard"` | Pregunta | Pasa |
| `git reset --hard` | Pregunta | Frena |
| `bash -c "git reset --hard"` | Pregunta | Pasa |

Ninguno de los dos frena a quien quiere esquivarlo: atrapan equivocaciones. Lo que de verdad no debe pasar (producción, secretos, merges a ramas protegidas) se limita con los permisos de cada aplicación.

## Tests que salen del worktree

El sandbox deja escribir solo en el worktree y en los temporales, y no deja abrir sockets locales. Algunos tests necesitan más: un registro compartido entre worktrees, una caché en tu home o Docker. Cuando eso pasa, el comando falla con un error como este:

```
touch: /Users/tu-usuario/.mi-app/registro.json: Operation not permitted
permission denied while trying to connect to the docker API at unix:///.../docker.sock
```

Para habilitarlo:

1. **Encuentra la ruta exacta** en el error. Si no aparece, busca en los scripts del repo qué escriben en `$HOME`:

   ```bash
   grep -rnE '\$\{?HOME\}?|~/|os\.homedir' scripts infra package.json
   ```

2. **Agrégala a `.claude/repo-guard.config.json`.** Usa la carpeta, no el archivo: muchos scripts escriben primero un temporal al lado (`registro.json.tmp`) y luego lo renombran.

   ```json
   { "allowWrite": ["~/.mi-app", "~/.cache/mi-app"] }
   ```

3. **Aplica y revisa:**

   ```bash
   npx github:ramon-sg/claude-repo-guard apply
   npx github:ramon-sg/claude-repo-guard doctor
   ```

4. **Abre una sesión nueva de Claude.** El sandbox se arma al iniciar la sesión, así que una sesión abierta sigue con la configuración vieja.

5. **Commitea** `.claude/settings.json`, la configuración y el documento, para que cada worktree y cada persona lo traigan.

Abre solo lo que los tests usan de verdad. Cada ruta que agregas queda al alcance del agente, también para borrarla.

Dos casos que la herramienta ya resuelve o que no tienen arreglo en la configuración:

- **`mktemp` en macOS:** sin plantilla, ignora `TMPDIR` y crea el temporal en `/private/var/folders/<algo>/T`, que cambia en cada máquina. Por eso `/private/var/folders` va siempre en `allowWrite`; no tienes que agregarlo.
- **`bun install`:** bun escribe en su caché, `~/.bun/install/cache`, y crea ahí su carpeta temporal. En repos con bun esa ruta va sola en `allowWrite`. Si la caché está en otra parte (`BUN_INSTALL_CACHE_DIR`), agrega esa ruta a mano.
- **`ps` y `pgrep` en macOS:** el sandbox no deja listar procesos, y no hay opción que lo habilite. Si un test los usa para encontrar un proceso, haz que ese proceso anote su `$$` o su `$PPID` en un archivo.

### Docker

Para que el agente corra tests que levantan contenedores (`docker compose`, testcontainers), agrega el socket de Docker en `allowUnixSockets`. La ruta depende de cómo tengas Docker instalado; puedes listar varias y sirven en todas las máquinas del equipo:

```json
{
  "allowUnixSockets": [
    "/var/run/docker.sock",
    "~/.orbstack/run/docker.sock",
    "~/.docker/run/docker.sock"
  ]
}
```

| Docker | Socket |
| --- | --- |
| OrbStack | `~/.orbstack/run/docker.sock` |
| Docker Desktop (macOS) | `~/.docker/run/docker.sock` |
| Enlace del sistema | `/var/run/docker.sock` |
| Colima | `~/.colima/default/docker.sock` |

Para ver cuál usas: `docker context ls` (la columna `DOCKER ENDPOINT` de la fila con `*`).

**Lo que cuesta:** con el socket de Docker abierto, el sandbox se puede saltar. Un contenedor puede montar cualquier carpeta que Docker comparta, tu home incluido, y escribir ahí. Las barandas siguen frenando accidentes (un `rm` fuera de lugar, una escritura en tu home desde un comando), pero no a un agente manipulado por un texto malicioso. Si eso te preocupa más que correr los tests sin ti, no abras el socket y corre esos tests con `pnpm claude:free` o fuera de Claude.

### Ejemplo: Cleanqueen

Los tests de integración y el E2E de Cleanqueen usan un registro de puertos compartido entre worktrees, una caché de la base y Docker:

```json
{
  "allowWrite": ["~/.cleanqueen", "~/.cache/cleanqueen"],
  "allowUnixSockets": [
    "/var/run/docker.sock",
    "~/.orbstack/run/docker.sock",
    "~/.docker/run/docker.sock"
  ]
}
```

## Qué no cubre

- **Credenciales de terceros** (secretos, Kubernetes, GitHub, merges a ramas protegidas): se limitan con los permisos de cada aplicación, no con Claude Code. El sandbox deja leer tu home.
- **`--dangerously-skip-permissions`:** en ese modo la lista de dominios no frena nada.
- **`pnpm install` dentro del sandbox:** pnpm no puede abrir el lock de su store. Instala dependencias fuera de Claude o desde un hook.
- **La caché de bun, si está abierta:** la comparten todos tus repos. Un comando de Claude podría alterar un paquete guardado, y otro repo lo instalaría así fuera del sandbox. Se cierra con `"bunCache": false`; entonces `bun install` no funciona dentro del sandbox.
- **`ps` y `pgrep` en macOS:** no corren dentro del sandbox. Ver [Tests que salen del worktree](#tests-que-salen-del-worktree).
- **localhost en Linux:** cada comando tiene su propio loopback, así que no llega a los servicios del host.
- **El socket de Docker, si lo abres:** un contenedor puede montar lo que Docker comparta y saltarse el sandbox. Ver [Docker](#docker).
- **Código del agente que corre fuera del sandbox** (CI, scripts que corres tú).

## En la nube

El repo funciona igual en una sesión local y en una de claude.ai/code. Probado en la nube:

- **No hay sandbox de Bash:** la máquina no trae `bwrap` ni `socat`. Por eso la herramienta no usa `sandbox.failIfUnavailable`: con esa opción Claude se cierra al arrancar. La máquina ya está aislada y no tiene tus archivos ni tus credenciales.
- **Las reglas de permisos sí se aplican:** `.husky` queda bloqueado desde Bash y desde Edit.
- **La red la filtra el entorno de la nube**, no `network.allowedDomains`.
- **`allowWrite` y `allowUnixSockets` no cambian nada:** sin sandbox, todo se puede escribir; y la máquina de la nube no tiene tu Docker.
- **`claude:auto` y `claude:free` son solo para la terminal:** en la nube el modo se elige en el menú.

`doctor` marca un error si `failIfUnavailable` aparece en `.claude/settings.json`.

## Requisitos

- Claude Code con sandbox: macOS, o Linux/WSL2 con `bubblewrap` y `socat`. Sin eso, los comandos corren sin sandbox (`doctor` lo avisa). En la nube no hace falta.
- Node 20 o superior para el instalador.
