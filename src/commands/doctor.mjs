import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readConfig } from '../config.mjs';
import { renderDoc } from '../doc.mjs';
import { readJson, readText } from '../files.mjs';
import { missing } from '../merge.mjs';
import { detectPackageManager } from '../package-manager.mjs';
import { FORBIDDEN_SANDBOX_KEYS, autoModeSettings, scripts, settingsFragment } from '../profile.mjs';
import { repoPaths } from '../repo.mjs';

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
 * @param {{ machine: boolean }} options `machine: false` revisa solo el repo.
 * @returns {Check[]}
 */
export const runChecks = (root, version, { machine }) => {
  const { config } = readConfig(path.join(root, '.claude', 'repo-guard.config.json'));
  const paths = repoPaths(root, config);
  /** @type {Check[]} */
  const checks = [];

  const manifest = readJson(paths.manifest);
  if (!manifest.exists) {
    return [{ ok: false, name: 'Instalación', detail: 'no está instalado en este repo: corre `claude-repo-guard install`' }];
  }
  checks.push({
    ok: manifest.data.version === version,
    name: 'Versión',
    detail: manifest.data.version === version ? `v${version}` : `instalado con v${manifest.data.version}; esta es v${version}: corre install`,
  });

  const settings = readJson(paths.settings).data;
  const packageManager = detectPackageManager(paths.packageJson);
  const gaps = missing(settings, settingsFragment(config, packageManager));
  checks.push({
    ok: gaps.length === 0,
    name: '.claude/settings.json',
    detail: gaps.length === 0 ? 'sandbox y reglas presentes' : `falta o cambió: ${gaps.join('; ')}`,
  });

  const forbidden = FORBIDDEN_SANDBOX_KEYS.filter((key) => settings.sandbox?.[key] !== undefined && settings.sandbox[key] !== false);
  checks.push({
    ok: forbidden.length === 0,
    name: 'Sesiones en la nube',
    detail:
      forbidden.length === 0
        ? 'nada impide abrir el repo en claude.ai/code'
        : `quita ${forbidden.map((key) => `sandbox.${key}`).join(', ')} de .claude/settings.json: en la nube no hay sandbox y Claude se cierra al arrancar`,
  });

  const autoModeOk = readText(paths.autoMode) === `${JSON.stringify(autoModeSettings(config), null, 2)}\n`;
  checks.push({ ok: autoModeOk, name: 'Contexto del modo auto', detail: autoModeOk ? 'al día' : 'no coincide con la configuración: corre install' });

  const hasPackageJson = packageManager !== null;
  if (hasPackageJson) {
    const current = readJson(paths.packageJson).data.scripts ?? {};
    const wrong = Object.entries(scripts()).filter(([name, value]) => current[name] !== value).map(([name]) => name);
    checks.push({ ok: wrong.length === 0, name: 'Scripts', detail: wrong.length === 0 ? 'claude:auto y claude:free' : `falta o cambió: ${wrong.join(', ')}` });
  }

  const docOk = readText(paths.doc) === renderDoc(config, { version, packageManager });
  checks.push({ ok: docOk, name: 'Documento', detail: docOk ? config.docPath : `${config.docPath} no coincide con la configuración: corre install` });

  if (!machine) return checks;
  if (process.env.CLAUDE_CODE_REMOTE === 'true') {
    checks.push({ ok: true, name: 'Sandbox', detail: 'sesión en la nube: no hay sandbox de Bash, la máquina ya está aislada' });
  } else if (process.platform === 'linux') {
    const tools = ['bwrap', 'socat'].filter((tool) => !available(tool));
    checks.push({
      ok: tools.length === 0,
      name: 'Sandbox en Linux',
      detail: tools.length === 0 ? 'bubblewrap y socat instalados' : `falta ${tools.join(' y ')}: los comandos de Claude corren sin sandbox`,
    });
  } else if (process.platform !== 'darwin') {
    checks.push({ ok: false, name: 'Sandbox', detail: `el sandbox de Claude Code no existe en ${process.platform}: los comandos corren sin sandbox` });
  }

  return checks;
};

/**
 * @param {{ root: string, version: string, json: boolean, machine: boolean }} options
 * @returns {number} código de salida: 1 si algo falla.
 */
export const doctor = ({ root, version, json, machine }) => {
  const checks = runChecks(root, version, { machine });
  if (json) {
    process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
  } else {
    for (const check of checks) process.stdout.write(`${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}\n`);
  }
  return checks.every((check) => check.ok) ? 0 : 1;
};
