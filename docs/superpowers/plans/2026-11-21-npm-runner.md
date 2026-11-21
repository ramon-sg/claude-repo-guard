# `claude-repo-guard` en npm y con `.agents/runner.json` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar la v0.8.0 en npm como `@ramon-sg/claude-repo-guard`, con `@ramon-sg/runner` adentro, y que en un repo con `.agents/runner.json` escriba su entrada y sus atajos con `writeScripts`, sin cambiar nada en el modo viejo.

**Architecture:** Un módulo nuevo `src/runner-mode.mjs` decide el modo del repo (runner o viejo) y arma, sin escribir, los cambios a `runner.json` y `package.json` usando la biblioteca contra una copia en un directorio temporal: así `--dry-run`, el diff y la confirmación siguen igual. `plan.mjs`, `doc.mjs` y `doctor.mjs` reciben el modo y lo usan para el comando que muestran, la caché de Bun y el gestor de los atajos. Se publica empaquetado con esbuild en `dist/`.

**Tech Stack:** JavaScript ESM (`.mjs`, JSDoc), `node:test`, `@ramon-sg/runner` 1.0.0, esbuild, GitHub Actions con Node y Bun, trusted publishing de npm.

**Spec:** issue #23 y `docs/superpowers/specs/2026-11-20-bunx-runner-design.md` del repo `ramon-sg/agent-kitchen` (secciones "El archivo", "El `package.json` de los atajos", "Herramientas instaladas solas", "Las herramientas se publican con sus dependencias adentro", paso 5 de "Orden entre repos"). API de la biblioteca: README de `ramon-sg/runner` y `src/scripts.ts`, `src/checks.ts` de ese repo.

## Global Constraints

- Paquete: `@ramon-sg/claude-repo-guard`; versión de npm = número del tag: **0.8.0**.
- Archivo: `.agents/runner.json` (`RUNNER_FILE`). Comando: `bun` → `bunx --bun <paquete>@<versión> <args>`; `node` → `npx --yes <paquete>@<versión> <args>`, siempre con `toolCommandText` de la biblioteca.
- **Modo del repo (decisión del usuario):** hay `runner.json` → modo runner. No hay `runner.json` pero sí `.claude/repo-guard.manifest.json` → modo viejo, sin crear `runner.json`. No hay ninguno → instalación nueva: se crea `runner.json` y queda en modo runner.
- Modo viejo: todo exactamente como en v0.7.0 (`npx github:ramon-sg/claude-repo-guard`, scripts solo si hay `package.json`). Ningún test existente cambia de resultado.
- El guard escribe solo su propia entrada en `tools`; nunca toca las demás. Su entrada pasa a la versión que corre (`setTool(..., { allowLower: true })`): `apply` deja el repo como dice la versión que corres.
- `runner` de un archivo nuevo: `chooseRunner`; con terminal y sin `--yes`, pregunta "Bun no está instalado: ¿usar Node o salir para instalar Bun?"; sin terminal o con `--yes`, `node` con `NO_BUN_WARNING`.
- El `package.json` publicado no tiene `dependencies`.
- Tests sin `npx`/`bunx` reales ni red: `bun`/`bunx`/`npx` falsos en un `PATH` de prueba.
- Solo macOS/Linux.
- Textos nuevos en `src/texts/es.mjs` y `src/texts/en.mjs` con las mismas claves (lo revisa `test/lang.test.mjs`).
- Ningún commit, push, PR, tag, release ni publicación sin OK del usuario para esa acción.

## Review Focus

1. Un repo instalado con v0.7.0 (manifiesto, sin `runner.json`) que corre `apply` con 0.8.0: no aparece `runner.json`, el documento sigue diciendo `npx github:…`. → Task 2, test `modo viejo: apply con manifiesto y sin runner.json no crea runner.json`.
2. Repo sin `package.json`, modo runner: `apply` crea `package.json` con `private`, `packageManager` y los dos atajos, y el documento dice `bun run claude:auto` (o `npm run` con Node) en la misma corrida. → Task 3.
3. `runner.json` inválido (JSON roto o versión que no es exacta): `apply` y `doctor` terminan con el bloque de error y la ruta, sin traza. → Task 2.
4. `runner.json` con otras herramientas y claves desconocidas: `apply` y `uninstall` solo tocan la entrada del guard y conservan el resto. → Tasks 2 y 4.
5. `--dry-run` en modo runner no escribe `runner.json` ni `package.json`, y no deja temporales. → Task 3.

---

### Task 1: Publicar empaquetado, con `@ramon-sg/runner` adentro

**Files:**
- Modify: `package.json`, `.gitignore`, `.tool-versions`, `bin/claude-repo-guard.mjs`
- Create: `scripts/bundle.mjs`, `package-lock.json`, `test/pack.test.mjs`

**Interfaces:**
- Produces: `dist/claude-repo-guard.mjs` (shebang `#!/usr/bin/env node`, ejecutable); `npm run build` lo deja. `bin` apunta ahí. `version()` de `src/cli.mjs` sigue leyendo `../package.json` (desde `dist/` también es `..`).

- [ ] **Step 1: Test que falla** en `test/pack.test.mjs`: con `npm pack --dry-run --json`, los archivos incluyen `dist/claude-repo-guard.mjs`, `package.json`, `README.md`, `LICENSE`; no incluyen nada bajo `src/`, `test/` ni `scripts/`; `package.json` no tiene `dependencies` (o vacío); `bin["claude-repo-guard"] === "dist/claude-repo-guard.mjs"`. Segundo test: tras `npm run build`, `node dist/claude-repo-guard.mjs --version` imprime la versión de `package.json`.
- [ ] **Step 2: Correr** `node --test test/pack.test.mjs` → FAIL.
- [ ] **Step 3: Implementar.** `devDependencies`: `@ramon-sg/runner` `1.0.0` y `esbuild` (exacta, última estable). `scripts/bundle.mjs`: esbuild de `bin/claude-repo-guard.mjs` a `dist/claude-repo-guard.mjs`, `bundle: true`, `platform: "node"`, `format: "esm"`, `target: "node20"`; conserva el shebang. Scripts: `build`, `prepare: npm run build` (para que `npx github:…#v0.8.0` siga funcionando: npm corre `prepare` al instalar desde git), `test: npm run build && node --test 'test/*.test.mjs'`. `files`: `dist`, `README.md`, `LICENSE`. `dist/` a `.gitignore`. `.tool-versions`: `bun 1.4.4`. `npm install` para el lockfile.
- [ ] **Step 4: Correr** `npm test` → PASS (todos).
- [ ] **Step 5: Verificar el spec de GitHub** desde una copia local: `npx --yes "git+file://$PWD#HEAD" --version` imprime la versión (el modo viejo de agent-kitchen depende de esto).
- [ ] **Step 6: Commit** (con OK). `build: publicar empaquetado con @ramon-sg/runner adentro`

### Task 2: El modo del repo y la entrada en `runner.json`

**Files:**
- Create: `src/runner-mode.mjs`, `test/runner.test.mjs`, `test/fake-bin.mjs`
- Modify: `src/plan.mjs`, `src/cli.mjs`, `src/texts/es.mjs`, `src/texts/en.mjs`

**Interfaces:**
- Produces en `src/runner-mode.mjs`:
  - `PACKAGE = '@ramon-sg/claude-repo-guard'`.
  - `@typedef {{ kind: 'legacy' } | { kind: 'runner', runner: 'bun' | 'node', created: boolean, warning: string | null }} Mode`.
  - `async resolveMode(root: string, { ask?: () => Promise<'bun'|'node'|null> }): Promise<Mode | null>` — `null` si quien contesta eligió salir. Lanza `GuardError` (`fail('runnerFile', file, detail)`) si `RunnerFileError`.
  - `readMode(root: string): Mode` — sin preguntar, para `doctor` y `uninstall`: sin `runner.json` es `legacy`.
  - `inTemp(root: string, files: string[], run: (dir: string) => void): Record<string, string>` — copia esos archivos relativos (los que existan) a un `mkdtemp`, corre `run(dir)`, devuelve el contenido final de cada uno (`''` si no existe) y borra el temporal siempre (`finally`).
  - `runnerChange(root: string, mode: Mode, version: string): Change` — `runner.json` con `setTool(config ?? vacío, PACKAGE, version, { allowLower: true })` y, si `created`, `runner: mode.runner`; texto vía `inTemp` + `writeRunnerConfig`.
- Produces: el manifiesto suma `createdRunnerFile: boolean` (`mode.created` en la primera instalación; después se conserva el del manifiesto anterior, como `createdSettings`).
- Produces: `planApply(root, version, mode)` y `planUninstall(root, mode)` reciben el modo; `cli.mjs` llama `resolveMode` con un `ask` por readline cuando hay terminal y no hay `--yes`; `null` → banner `t.runnerDeclined`, código 1, sin escribir. `warning` se muestra antes del diff.
- Produces: `test/fake-bin.mjs` — `fakeBin({ bun?: boolean, npm?: boolean }): { dir: string, env: Record<string,string> }`: scripts `bun`/`bunx` y `npm`/`npx` que imprimen `1.4.4` / `11.6.0` a `--version` y salen 0; `withPath(dir, fn)` pone `process.env.PATH = dir` durante `fn` (la biblioteca mira `process.env`).

- [ ] **Step 1: Tests que fallan** en `test/runner.test.mjs` (repo temporal igual que `apply.test.mjs`, con `PATH` falso):
  - `instalación nueva con bun: crea runner.json con runner bun y la entrada 0.8.0` → `json('.agents/runner.json')` es `{ $schema: <de la biblioteca>, runner: 'bun', tools: { '@ramon-sg/claude-repo-guard': version } }`.
  - `instalación nueva sin bun y sin terminal: runner node y el aviso` → `runner === 'node'` y la salida contiene `NO_BUN_WARNING`.
  - `modo viejo: apply con manifiesto y sin runner.json no crea runner.json` → tras escribir un manifiesto de v0.7.0 (correr `apply` y borrar `.agents/`), `apply --yes` no crea `.agents/runner.json` y el documento contiene `npx github:ramon-sg/claude-repo-guard`.
  - `runner.json con otras herramientas y claves extra: solo cambia la entrada del guard` → con `{ runner: 'node', tools: { '@ramon-sg/issue-flow': '0.6.0', '@ramon-sg/claude-repo-guard': '0.7.9' }, foo: 1 }`, queda `issue-flow` igual, `foo: 1`, `runner: 'node'` y el guard en la versión actual.
  - `runner.json con una versión más nueva del guard la baja a la que corre`.
  - `runner.json inválido: apply y doctor fallan con la ruta, sin traza` → código 1, la salida contiene `.agents/runner.json` y no contiene `    at `.
  - `--dry-run en modo runner no escribe runner.json` → no existe tras correr.
- [ ] **Step 2: Correr** `node --test test/runner.test.mjs` → FAIL.
- [ ] **Step 3: Implementar** `src/runner-mode.mjs`, el cambio de `runner.json` en `planApply` (antes del manifiesto), el `ask` y los textos `runnerFile(file, detail)`, `askRunner` (la pregunta del Global Constraints) y `runnerDeclined`.
- [ ] **Step 4: Correr** `npm test` → PASS, incluidos los tests viejos.
- [ ] **Step 5: Commit** (con OK). `feat: entrada propia en .agents/runner.json`

### Task 3: Atajos con `writeScripts` y el gestor de la misma corrida

**Files:**
- Modify: `src/plan.mjs`, `src/profile.mjs`, `src/package-manager.mjs`, `src/doc.mjs`, `test/runner.test.mjs`

**Interfaces:**
- Consumes: `Mode`, `inTemp`, `PACKAGE` (Task 2).
- Produces: `OWNED_MARKER = 'claude --settings'` en `profile.mjs` (lo contienen los dos atajos; es el `owned` de `writeScripts`).
- Produces: `detectPackageManager(packageJson: string, data?: Record<string, unknown>): PackageManager | null` — con `data`, lee `packageManager` de ahí en vez del disco (el `package.json` que la misma corrida va a crear).
- Produces: `settingsFragment(config, packageManager, runner?: 'bun' | 'node')` — abre `BUN_CACHE` también si `runner === 'bun'` y `config.bunCache` (`bunx` guarda ahí lo que baja).
- Produces: el manifiesto suma `createdPackageJson: boolean` (modo runner; `false` en modo viejo).

- [ ] **Step 1: Tests que fallan:**
  - `modo runner sin package.json: lo crea con private, packageManager y los atajos` → `json('package.json')` es `{ private: true, packageManager: 'bun@1.4.4', scripts: { 'claude:auto': …, 'claude:free': … } }` con los valores de `scripts()`.
  - `modo runner sin package.json: el documento dice bun run claude:auto en la misma corrida`; con `runner: 'node'` y `npm` falso → `npm run claude:auto` y `packageManager: 'npm@11.6.0'`.
  - `modo runner con package.json: no toca otros scripts ni dependencias`.
  - `modo runner: un script ajeno con el mismo nombre falla con scriptClash y no escribe nada`.
  - `modo runner con bun abre la caché de bun aunque el repo no tenga bun.lock`; con `node`, no.
  - `--dry-run en modo runner no crea package.json y no deja temporales` → el número de entradas `repo-guard-*` en `os.tmpdir()` no sube.
  - `modo viejo sin package.json sigue sin crearlo`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** En modo runner, `planApply` arma el `package.json` con `inTemp(root, ['package.json'], (dir) => writeScripts(dir, runner, scripts(), OWNED_MARKER))`; `clashes` no vacío → `fail('scriptClash', clashes[0])`. El `packageManager` para settings y documento sale de `detectPackageManager(paths.packageJson, JSON.parse(after))`. El manifiesto sigue registrando `scripts`, `createdScripts` y `originals` como hoy. Modo viejo: el código de hoy, sin cambios.
- [ ] **Step 4: Correr** `npm test` → PASS.
- [ ] **Step 5: Commit** (con OK). `feat: atajos con writeScripts, también si package.json se crea en la corrida`

### Task 4: `uninstall` en modo runner

**Files:**
- Modify: `src/plan.mjs`, `test/runner.test.mjs`

**Interfaces:**
- Consumes: `readMode`, `inTemp`, `PACKAGE`; manifiesto con `createdPackageJson` (Task 3). El manifiesto suma `createdRunnerFile: boolean` (Task 2 lo escribe como `mode.created`).

- [ ] **Step 1: Tests que fallan:**
  - `uninstall en instalación nueva deja el repo como estaba` → solo queda `.git` (borra `runner.json`, `.agents/` vacía y `package.json` creado).
  - `uninstall quita solo la entrada del guard de runner.json` → con otra herramienta y `foo: 1` presentes, quedan; el archivo no se borra.
  - `uninstall no borra un package.json que creó el guard si después se le agregó algo` → con `"dependencies": {"x":"1"}` agregado a mano, queda con eso y sin los atajos.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Quitar `tools[PACKAGE]`; borrar `runner.json` si `createdRunnerFile` y `tools` queda vacío y no hay claves fuera de `$schema` y `runner`. Borrar `package.json` si `createdPackageJson` y, sin los atajos, solo quedan `private` y `packageManager`. `removeEmptyParents` ya borra `.agents/`.
- [ ] **Step 4: Correr** `npm test` → PASS.
- [ ] **Step 5: Commit** (con OK). `feat: uninstall deshace runner.json y el package.json de los atajos`

### Task 5: El comando que se muestra y `doctor` en modo runner

**Files:**
- Modify: `src/doc.mjs`, `src/commands/doctor.mjs`, `src/commands/apply-changes.mjs`, `src/cli.mjs`, `src/texts/es.mjs`, `src/texts/en.mjs`, `test/runner.test.mjs`

**Interfaces:**
- Consumes: `readMode`, `PACKAGE`.
- Produces: `cliText(mode: Mode, version: string): string` en `src/runner-mode.mjs` — modo viejo: `CLI` de hoy; modo runner: `toolCommandText(runner, PACKAGE, version)`. Reemplaza `CLI` en `renderDoc` (`context.cli`), en `applyChanges` (`next`) y en `main` (ayuda tras comando desconocido).
- Produces en `doctor`: en modo runner, la revisión `version` compara `tools[PACKAGE]` de `runner.json` con la que corre (detalle `say.runnerBehind(pinned, version, cli)` con el comando de la versión que corre, sin `#v`); se suman las revisiones de `checkRunner(root)` (`warn` cuenta como `ok`), con nombre `names.runner`. La salida `--json` mantiene `{ ok, name, detail }`.

- [ ] **Step 1: Tests que fallan:**
  - `modo runner con bun: el documento y el --dry-run dicen bunx --bun @ramon-sg/claude-repo-guard@<v>`; con `node`, `npx --yes @ramon-sg/claude-repo-guard@<v>`; ninguno contiene `github:`.
  - `doctor en modo runner da verde tras apply`.
  - `doctor en modo runner marca la entrada de runner.json distinta de la versión que corre` → `ok: false` y el detalle trae el comando con la versión que corre.
  - `doctor en modo runner marca el ejecutor que falta` → `runner: 'bun'` y `PATH` sin `bunx` → una revisión `runner` con `ok: false`.
  - `doctor en modo viejo no cambia` → misma lista de nombres que en v0.7.0.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** `cliText`, el paso de `cli` y las revisiones; textos `runnerBehind` y `names.runner` en los dos idiomas.
- [ ] **Step 4: Correr** `npm test` → PASS.
- [ ] **Step 5: Commit** (con OK). `feat: en modo runner se muestra y se revisa el comando de runner.json`

### Task 6: CI con Node y Bun, publicación y documentación

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`, `docs/decisions.md`, `package.json` (`version: 0.8.0`)
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: CI.** `ci.yml`: `npm ci` antes de `npm test`; el paso "apply y uninstall sobre un repo vacío" corre `dist/claude-repo-guard.mjs` (sin `runner.json` y sin manifiesto: instalación nueva; con `--yes`, `test "$(ls -A "$repo")" = ".git"` al final). Job nuevo `bun` (ubuntu): `setup-node` 24, `oven-sh/setup-bun@v2` con `bun-version-file: .tool-versions`, `npm ci`, `npm run build`, `bun test --timeout 20000 test/`, y `bun dist/claude-repo-guard.mjs --version`.
- [ ] **Step 2: `publish.yml`** igual al de `ramon-sg/runner`: en `release: published`, permisos `id-token: write`, revisa que la tag sea `v` + versión de `package.json`, `npm ci`, `npm test`, `npm publish`.
- [ ] **Step 3: Documentación.** README: uso con `bunx --bun @ramon-sg/claude-repo-guard@0.8.0 apply` y `npx --yes @ramon-sg/claude-repo-guard@0.8.0 apply`; sección `.agents/runner.json` (cuándo lo crea, qué toca, el modo viejo con `npx github:…#vX`); sección "Publicar una versión" como la de `ramon-sg/runner` (primera a mano, trusted publishing después). `docs/decisions.md`: entrada nueva arriba, "#23: npm y `runner.json`", con la regla del modo (decisión del usuario) y lo descartado (crear `runner.json` siempre que falte: deja a medio migrar los repos de agent-kitchen en modo viejo).
- [ ] **Step 4: `version: 0.8.0`**, `npm test` → PASS, push de la rama y CI verde en los dos jobs.
- [ ] **Step 5: Commit y PR** (con OK). `feat: publicar en npm como @ramon-sg/claude-repo-guard con runner.json (v0.8.0)`, `Closes #23`.

### Después del merge (cada paso con OK del usuario)

- [ ] Primera publicación a mano desde `main`: `npm publish --access public --provenance=false`; en npmjs.com, Trusted publishing → `ramon-sg/claude-repo-guard`, `publish.yml`; pushear la tag `v0.8.0` sin crear release.
- [ ] Verificar lo de "Hecho cuando": `bunx --bun @ramon-sg/claude-repo-guard@0.8.0 --version` y `npx --yes @ramon-sg/claude-repo-guard@0.8.0 --version` imprimen `0.8.0`; en un repo temporal, el documento muestra `bun run …` con `runner: bun` y `npm run …` con `runner: node`.
- [ ] Avisar en agent-kitchen (comentario en su issue de la Parte B): el número `0.8.0` para `RUNNER_MINIMUMS`, y que en modo viejo **no debe correr el guard ≥0.8.0 en un repo sin guard instalado**, porque esa es una instalación nueva y crea `runner.json`: o fija el guard en ≤0.7.x en modo viejo, o crea `runner.json` antes.
