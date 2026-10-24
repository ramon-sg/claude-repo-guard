# claude-repo-guard

Barandas para correr Claude Code sin preguntas de permisos, instaladas **en cada repo** y no en la máquina.

## En simple

- El agente trabaja sin preguntar. Lo dudoso no se pregunta: se rechaza y el agente sigue.
- Puede escribir y borrar (`rm` incluido) solo dentro de su worktree y de los temporales. Fuera de eso, el sistema operativo lo impide.
- Todo vive en archivos del repo (`.claude/settings.json`, `package.json`, `docs/`). Claude Code los carga solo, en el checkout principal y en cada worktree. No pide `sudo` ni toca otros repos.
- Cuando quieres correr sin restricciones, hay un alias que las apaga para esa sesión.
- Junto con la instalación se genera un documento que explica qué se instaló, qué protege, qué no y cómo desactivar cada parte.

## Por qué por repo

Instalar las barandas en los managed settings de la máquina obliga a todos los repos por igual, pide permisos de administrador y es difícil de entender y de revertir. Tenerlas en el repo las hace visibles, revisables en un PR y fáciles de quitar.

## Qué instala

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Sandbox | `.claude/settings.json` | Los comandos del agente corren aislados por el sistema operativo: escriben solo en el worktree, los temporales y las cachés necesarias. No arranca si el sandbox no está disponible |
| Hooks de git protegidos | `.claude/settings.json` | El agente no puede escribir en `.husky/**`; `.git/hooks` y `.git/config` ya los protege Claude Code |
| Red | `.claude/settings.json` | Lista corta de dominios permitidos (registros de paquetes, GitHub, localhost) |
| Contexto para el modo `auto` | `.claude/settings.json` | Le dice al clasificador qué es rutina de desarrollo, para que no frene lo normal |
| Alias sin restricciones | `package.json` | `pnpm claude:free`: abre Claude sin sandbox y con `--dangerously-skip-permissions`, con una advertencia |
| Documento | `docs/` | Explica todo lo anterior y cómo desactivarlo o desinstalarlo |

## Cómo se usa

```bash
claude --permission-mode auto                                # trabaja sin preguntar; lo dudoso se rechaza
claude --permission-mode auto --permission-prompts none      # desatendido: nunca pregunta
pnpm claude:free                                             # sin restricciones, solo esta sesión
```

`pnpm claude:free` equivale a:

```bash
claude --settings '{"sandbox":{"enabled":false}}' --dangerously-skip-permissions
```

`--settings` tiene más prioridad que los settings del repo, así que apaga el sandbox solo para esa sesión; `--dangerously-skip-permissions` quita las preguntas. Si el agente lo ejecuta desde una sesión con sandbox, el proceso hijo hereda el sandbox del sistema operativo.

## Qué no cubre

- Credenciales de terceros (secretos, Kubernetes, GitHub, merges a ramas protegidas): se limitan con los permisos de cada aplicación, no con Claude Code.
- Sesiones abiertas con `--dangerously-skip-permissions`: en ese modo la lista de dominios no frena nada.
- Código del agente que se ejecuta fuera del sandbox (CI, scripts que corres tú).

## Estado

En diseño. El spec está en la issue #1.
