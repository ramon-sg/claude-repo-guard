import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, readConfig } from './config.mjs';
import { renderDoc } from './doc.mjs';
import { detectPackageManager } from './package-manager.mjs';
import { formatJson, readJson, readText } from './files.mjs';
import { apply, revert } from './merge.mjs';
import { writeScripts } from '@ramon-sg/runner';
import { AUTO_MODE_FILE, OWNED_MARKER, autoModeSettings, scripts, settingsFragment } from './profile.mjs';
import { repoPaths, safeRepoFile } from './repo.mjs';
import { cliText, inTemp, runnerChange, runnerUninstallChange } from './runner-mode.mjs';
import { fail } from './texts/index.mjs';

/**
 * Un cambio a un archivo. `after: null` significa borrarlo.
 *
 * @typedef {{ file: string, before: string, after: string | null }} Change
 *
 * @typedef {{
 *   version: string,
 *   createdSettings: boolean,
 *   createdConfig: boolean,
 *   settingsOperations: import('./merge.mjs').Operation[],
 *   scripts: Record<string, string>,
 *   createdScripts: boolean,
 *   createdRunnerFile?: boolean,
 *   createdPackageJson?: boolean,
 *   files: string[],
 *   originals: { settings: string, packageJson: string },
 * }} Manifest
 */

const CONFIG_FILE = path.join('.claude', 'repo-guard.config.json');

/**
 * Los archivos que el manifiesto puede pedir borrar: solo los que genera la
 * herramienta (el contexto del modo auto y un documento .md), siempre dentro
 * del repo. El manifiesto viaja en el repo, así que no se le cree a ciegas.
 *
 * @param {string} root
 * @param {unknown} files
 * @returns {string[]} rutas absolutas validadas.
 * @throws {Error} si alguna entrada no es un archivo generado por la herramienta.
 */
const generatedFiles = (root, files) => {
  if (!Array.isArray(files)) throw fail('manifestBroken');
  return files.map((file) => {
    if (file !== AUTO_MODE_FILE && !(typeof file === 'string' && file.endsWith('.md'))) {
      throw fail('manifestForeign', JSON.stringify(file));
    }
    return safeRepoFile(root, file, '.claude/repo-guard.manifest.json');
  });
};

/**
 * @param {string} root
 * @returns {Manifest | undefined} lo que dejó la instalación anterior, si la hay.
 */
const readManifest = (root) => {
  const json = readJson(path.join(root, '.claude', 'repo-guard.manifest.json'));
  return json.exists ? /** @type {Manifest} */ (json.data) : undefined;
};

/**
 * Quita del package.json los scripts que agregó la instalación anterior, si
 * siguen siendo los mismos.
 *
 * @param {Record<string, unknown>} data
 * @param {Record<string, string>} recorded
 * @param {boolean} dropEmpty si `scripts` lo creó la instalación y queda vacío, se borra.
 */
const removeScripts = (data, recorded, dropEmpty) => {
  if (data.scripts === null || typeof data.scripts !== 'object') return;
  for (const [name, value] of Object.entries(recorded)) {
    if (data.scripts[name] === value) delete data.scripts[name];
  }
  if (dropEmpty && Object.keys(data.scripts).length === 0) delete data.scripts;
};

/**
 * Al desinstalar, si el contenido volvió a ser el de antes de instalar, se
 * restaura el texto original: así se conserva el formato del repo (arreglos en
 * una línea, orden de claves) y no queda un diff de pura sangría.
 *
 * @param {import('./files.mjs').JsonFile} json
 * @param {string} original
 * @returns {string}
 */
const restoreFormat = (json, original) => {
  try {
    if (original && JSON.stringify(JSON.parse(original)) === JSON.stringify(json.data)) return original;
  } catch {
    // El original no era JSON válido: se queda el formato nuevo.
  }
  return formatJson(json);
};

/**
 * @param {Change[]} changes
 * @returns {Change[]} solo los que de verdad cambian algo.
 */
const effective = (changes) => changes.filter((change) => change.before !== (change.after ?? ''));

/**
 * Calcula lo que haría `apply`, sin escribir nada.
 *
 * Si ya hubo una instalación, primero la deshace en memoria y después aplica la
 * configuración actual: así una opción que se quitó también se quita del repo.
 *
 * @param {string} root
 * @param {string} version
 * @param {import('./runner-mode.mjs').Mode} [mode] sin modo, el viejo.
 * @returns {{ changes: Change[], config: import('./config.mjs').Config }}
 * @throws {Error} si un script del repo choca con uno de la herramienta.
 */
export const planApply = (root, version, mode = { kind: 'legacy' }) => {
  const { config, exists: configExists } = readConfig(path.join(root, CONFIG_FILE));
  const paths = repoPaths(root, config);
  const previous = readManifest(root);

  const settings = readJson(paths.settings);
  const settingsBefore = readText(paths.settings);
  if (previous) revert(settings.data, previous.settingsOperations);
  const createdSettings = previous ? previous.createdSettings : !settings.exists;
  const runner = mode.kind === 'runner' ? mode.runner : undefined;

  /** @type {Change[]} */
  const changes = [];
  /** @type {Record<string, string>} */
  const addedScripts = {};
  let createdScripts = false;
  let createdPackageJson = Boolean(previous?.createdPackageJson);
  let packageManager = detectPackageManager(paths.packageJson);
  if (mode.kind === 'runner') {
    // La biblioteca escribe los atajos (y crea package.json con packageManager
    // si falta) sobre una copia: el repo no se toca hasta confirmar.
    const before = readText(paths.packageJson);
    const owned = previous?.scripts ?? {};
    const pkg = readJson(paths.packageJson);
    const wanted = scripts();
    // Un script con el mismo nombre es del guard solo si lo registró la
    // instalación anterior; cualquier otro distinto es del repo y se respeta,
    // como en el modo viejo.
    const clash = Object.entries(wanted).find(([name, value]) => {
      const current = pkg.data.scripts?.[name];
      return current !== undefined && current !== value && owned[name] !== current;
    });
    if (clash) throw fail('scriptClash', clash[0]);
    // Los que ya no instala y los suyos desactualizados se sacan de la copia;
    // writeScripts agrega los de esta versión.
    const outdated = Object.fromEntries(Object.entries(owned).filter(([name]) => wanted[name] !== owned[name]));
    const touched = Object.keys(outdated).some((name) => pkg.data.scripts?.[name] === outdated[name]);
    const scriptsBefore = { ...pkg.data.scripts };
    removeScripts(pkg.data, outdated, false);
    const after = inTemp(root, ['package.json'], (dir) => {
      if (touched) fs.writeFileSync(path.join(dir, 'package.json'), formatJson(pkg));
      writeScripts(dir, mode.runner, wanted, OWNED_MARKER);
    })['package.json'];
    packageManager = detectPackageManager(paths.packageJson, JSON.parse(after));
    // Una instalación del modo viejo sin package.json no lo registró: si falta ahora, lo crea esta corrida.
    createdPackageJson = Boolean(previous?.createdPackageJson) || !pkg.exists;
    createdScripts = Boolean(previous?.createdScripts) || pkg.data.scripts === undefined;
    for (const [name, value] of Object.entries(wanted)) {
      const current = scriptsBefore[name];
      if (current === undefined || owned[name] === current) addedScripts[name] = value;
    }
    changes.push({ file: paths.packageJson, before, after });
  }
  const settingsOperations = apply(settings.data, settingsFragment(config, packageManager, runner));
  changes.unshift({ file: paths.settings, before: settingsBefore, after: formatJson(settings) });

  const hasPackageJson = mode.kind === 'legacy' && packageManager !== null;
  if (hasPackageJson) {
    const pkg = readJson(paths.packageJson);
    const before = readText(paths.packageJson);
    const wanted = scripts();
    const owned = previous?.scripts ?? {};
    // Los que la herramienta ya no instala se quitan; los suyos se actualizan en su lugar.
    removeScripts(pkg.data, Object.fromEntries(Object.entries(owned).filter(([name]) => !(name in wanted))), false);
    createdScripts = previous ? Boolean(previous.createdScripts) : pkg.data.scripts === undefined;
    pkg.data.scripts ??= {};
    for (const [name, value] of Object.entries(wanted)) {
      const current = pkg.data.scripts[name];
      const ours = owned[name] !== undefined && owned[name] === current;
      if (current !== undefined && current !== value && !ours) {
        throw fail('scriptClash', name);
      }
      if (current === undefined || ours) addedScripts[name] = value;
      pkg.data.scripts[name] = value;
    }
    changes.push({ file: paths.packageJson, before, after: formatJson(pkg) });
  }

  const createdConfig = previous ? previous.createdConfig : !configExists;
  if (!configExists) {
    changes.push({ file: paths.config, before: '', after: `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n` });
  }

  changes.push({ file: paths.autoMode, before: readText(paths.autoMode), after: `${JSON.stringify(autoModeSettings(config), null, 2)}\n` });
  changes.push({ file: paths.doc, before: readText(paths.doc), after: renderDoc(config, { version, packageManager, runner, cli: cliText(mode, version) }) });

  if (mode.kind === 'runner') changes.push(runnerChange(root, mode, version));

  const files = [AUTO_MODE_FILE, config.docPath];
  const current = [paths.autoMode, paths.doc];
  for (const old of previous ? generatedFiles(root, previous.files) : []) {
    if (!current.includes(old)) changes.push({ file: old, before: readText(old), after: null });
  }

  /** @type {Manifest} */
  const manifest = {
    version,
    createdSettings,
    createdConfig,
    settingsOperations,
    scripts: addedScripts,
    createdScripts,
    createdPackageJson,
    createdRunnerFile: previous ? Boolean(previous.createdRunnerFile) : mode.kind === 'runner' && mode.created,
    files,
    originals: previous?.originals ?? { settings: settingsBefore, packageJson: readText(paths.packageJson) },
  };
  changes.push({ file: paths.manifest, before: readText(paths.manifest), after: `${JSON.stringify(manifest, null, 2)}\n` });

  return { changes: effective(changes), config };
};

/**
 * Calcula lo que haría `uninstall`, sin escribir nada.
 *
 * @param {string} root
 * @returns {Change[]} vacío si no hay nada instalado.
 */
export const planUninstall = (root) => {
  const previous = readManifest(root);
  if (!previous) return [];
  const { config } = readConfig(path.join(root, CONFIG_FILE));
  const paths = repoPaths(root, config);

  const settings = readJson(paths.settings);
  const settingsBefore = readText(paths.settings);
  revert(settings.data, previous.settingsOperations);
  const settingsEmpty = Object.keys(settings.data).length === 0;

  /** @type {Change[]} */
  const changes = [
    {
      file: paths.settings,
      before: settingsBefore,
      after: settingsEmpty && previous.createdSettings ? null : restoreFormat(settings, previous.originals?.settings),
    },
  ];

  if (fs.existsSync(paths.packageJson)) {
    const pkg = readJson(paths.packageJson);
    const before = readText(paths.packageJson);
    removeScripts(pkg.data, previous.scripts, Boolean(previous.createdScripts));
    // Un package.json que creó el guard solo para los atajos se va con ellos.
    const onlyOurs = Object.keys(pkg.data).every((key) => key === 'private' || key === 'packageManager');
    const after = previous.createdPackageJson && onlyOurs ? null : restoreFormat(pkg, previous.originals?.packageJson);
    changes.push({ file: paths.packageJson, before, after });
  }

  const runnerFile = runnerUninstallChange(root, Boolean(previous.createdRunnerFile));
  if (runnerFile) changes.push(runnerFile);

  for (const file of generatedFiles(root, previous.files)) changes.push({ file, before: readText(file), after: null });
  if (previous.createdConfig) changes.push({ file: paths.config, before: readText(paths.config), after: null });
  changes.push({ file: paths.manifest, before: readText(paths.manifest), after: null });

  return effective(changes);
};
