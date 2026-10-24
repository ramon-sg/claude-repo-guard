import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, readConfig } from './config.mjs';
import { renderDoc } from './doc.mjs';
import { formatJson, readJson, readText } from './files.mjs';
import { apply, revert } from './merge.mjs';
import { autoModeSettings, scripts, settingsFragment } from './profile.mjs';
import { repoPaths } from './repo.mjs';

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
 *   files: string[],
 *   originals: { settings: string, packageJson: string },
 * }} Manifest
 */

const CONFIG_FILE = path.join('.claude', 'repo-guard.config.json');

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
 * Calcula lo que haría `install`, sin escribir nada.
 *
 * Si ya hubo una instalación, primero la deshace en memoria y después aplica la
 * configuración actual: así una opción que se quitó también se quita del repo.
 *
 * @param {string} root
 * @param {string} version
 * @returns {{ changes: Change[], config: import('./config.mjs').Config }}
 * @throws {Error} si un script del repo choca con uno de la herramienta.
 */
export const planInstall = (root, version) => {
  const { config, exists: configExists } = readConfig(path.join(root, CONFIG_FILE));
  const paths = repoPaths(root, config);
  const previous = readManifest(root);

  const settings = readJson(paths.settings);
  const settingsBefore = readText(paths.settings);
  if (previous) revert(settings.data, previous.settingsOperations);
  const createdSettings = previous ? previous.createdSettings : !settings.exists;
  const settingsOperations = apply(settings.data, settingsFragment(config));

  /** @type {Change[]} */
  const changes = [{ file: paths.settings, before: settingsBefore, after: formatJson(settings) }];

  const hasPackageJson = fs.existsSync(paths.packageJson);
  /** @type {Record<string, string>} */
  const addedScripts = {};
  let createdScripts = false;
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
        throw new Error(`package.json ya tiene un script "${name}" distinto. Renómbralo o bórralo y vuelve a correr install.`);
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
  changes.push({ file: paths.doc, before: readText(paths.doc), after: renderDoc(config, { version, hasPackageJson }) });

  const files = [path.relative(root, paths.autoMode), config.docPath];
  for (const old of previous?.files ?? []) {
    if (!files.includes(old)) changes.push({ file: path.join(root, old), before: readText(path.join(root, old)), after: null });
  }

  /** @type {Manifest} */
  const manifest = {
    version,
    createdSettings,
    createdConfig,
    settingsOperations,
    scripts: addedScripts,
    createdScripts,
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
    changes.push({ file: paths.packageJson, before, after: restoreFormat(pkg, previous.originals?.packageJson) });
  }

  for (const file of previous.files) changes.push({ file: path.join(root, file), before: readText(path.join(root, file)), after: null });
  if (previous.createdConfig) changes.push({ file: paths.config, before: readText(paths.config), after: null });
  changes.push({ file: paths.manifest, before: readText(paths.manifest), after: null });

  return effective(changes);
};
