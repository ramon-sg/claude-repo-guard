import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readConfig } from '../config.mjs';
import { CLI, renderDoc } from '../doc.mjs';
import { readJson, readText } from '../files.mjs';
import { missing } from '../merge.mjs';
import { detectPackageManager } from '../package-manager.mjs';
import { FORBIDDEN_SANDBOX_KEYS, autoModeSettings, scripts, settingsFragment } from '../profile.mjs';
import { repoPaths } from '../repo.mjs';
import { show } from '../banner.mjs';
import { es } from '../texts/es.mjs';

/**
 * @typedef {{ ok: boolean, name: string, detail: string }} Check
 */

/**
 * @param {string} command
 * @returns {boolean} si el comando está en el PATH.
 */
const available = (command) => {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Revisa que lo instalado siga coincidiendo con la configuración del repo.
 *
 * @param {string} root
 * @param {string} version
 * @param {{ machine: boolean, t?: import('../texts/index.mjs').Texts }} options `machine: false` revisa solo el repo.
 * @returns {Check[]}
 */
export const runChecks = (root, version, { machine, t = es }) => {
  const { names, ...say } = t.doctor;
  const { config } = readConfig(path.join(root, '.claude', 'repo-guard.config.json'));
  const paths = repoPaths(root, config);
  /** @type {Check[]} */
  const checks = [];

  const manifest = readJson(paths.manifest);
  if (!manifest.exists) {
    return [{ ok: false, name: names.install, detail: say.notInstalled }];
  }
  checks.push({
    ok: manifest.data.version === version,
    name: names.version,
    detail: manifest.data.version === version ? `v${version}` : say.versionBehind(manifest.data.version, version, CLI),
  });

  const settings = readJson(paths.settings).data;
  const packageManager = detectPackageManager(paths.packageJson);
  const gaps = missing(settings, settingsFragment(config, packageManager));
  checks.push({
    ok: gaps.length === 0,
    name: names.settings,
    detail: gaps.length === 0 ? say.settingsOk : say.changed(gaps.join('; ')),
  });

  const forbidden = FORBIDDEN_SANDBOX_KEYS.filter((key) => settings.sandbox?.[key] !== undefined && settings.sandbox[key] !== false);
  checks.push({
    ok: forbidden.length === 0,
    name: names.cloud,
    detail:
      forbidden.length === 0
        ? say.cloudOk
        : say.cloudBlocked(forbidden.map((key) => `sandbox.${key}`).join(', ')),
  });

  const autoModeOk = readText(paths.autoMode) === `${JSON.stringify(autoModeSettings(config), null, 2)}\n`;
  checks.push({ ok: autoModeOk, name: names.autoMode, detail: autoModeOk ? say.upToDate : say.autoModeChanged });

  const hasPackageJson = packageManager !== null;
  if (hasPackageJson) {
    const current = readJson(paths.packageJson).data.scripts ?? {};
    const wrong = Object.entries(scripts()).filter(([name, value]) => current[name] !== value).map(([name]) => name);
    checks.push({ ok: wrong.length === 0, name: names.scripts, detail: wrong.length === 0 ? say.scriptsOk : say.changed(wrong.join(', ')) });
  }

  const docOk = readText(paths.doc) === renderDoc(config, { version, packageManager });
  checks.push({ ok: docOk, name: names.doc, detail: docOk ? config.docPath : say.docChanged(config.docPath) });

  if (!machine) return checks;
  if (process.env.CLAUDE_CODE_REMOTE === 'true') {
    checks.push({ ok: true, name: names.sandbox, detail: say.remoteSandbox });
  } else if (process.platform === 'linux') {
    const tools = ['bwrap', 'socat'].filter((tool) => !available(tool));
    checks.push({
      ok: tools.length === 0,
      name: names.linuxSandbox,
      detail: tools.length === 0 ? say.linuxOk : say.linuxMissing(tools),
    });
  } else if (process.platform !== 'darwin') {
    checks.push({ ok: false, name: names.sandbox, detail: say.noSandbox(process.platform) });
  }

  return checks;
};

/**
 * La salida `--json` siempre va en español: la lee agent-kitchen.
 *
 * @param {{ root: string, version: string, json: boolean, machine: boolean, t: import('../texts/index.mjs').Texts }} options
 * @returns {number} código de salida: 1 si algo falla.
 */
export const doctor = ({ root, version, json, machine, t }) => {
  if (json) {
    const checks = runChecks(root, version, { machine });
    process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
    return checks.every((check) => check.ok) ? 0 : 1;
  }
  const checks = runChecks(root, version, { machine, t });
  for (const check of checks) process.stdout.write(`${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}\n`);
  const failed = checks.filter((check) => !check.ok).length;
  if (failed === 0) {
    show({ mood: 'ok', title: t.doctor.allOk(checks.length) });
    return 0;
  }
  // Cada línea con ✗ ya dice qué hacer.
  show({ mood: 'error', title: t.doctor.failing(failed, checks.length) }, 'stdout');
  return 1;
};
