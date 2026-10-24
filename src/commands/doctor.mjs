import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readConfig } from '../config.mjs';
import { renderDoc } from '../doc.mjs';
import { readJson, readText } from '../files.mjs';
import { missing } from '../merge.mjs';
import { autoModeSettings, scripts, settingsFragment } from '../profile.mjs';
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

  const gaps = missing(readJson(paths.settings).data, settingsFragment(config));
  checks.push({
    ok: gaps.length === 0,
    name: '.claude/settings.json',
    detail: gaps.length === 0 ? 'sandbox y reglas presentes' : `falta o cambió: ${gaps.join('; ')}`,
  });

  const autoModeOk = readText(paths.autoMode) === `${JSON.stringify(autoModeSettings(config), null, 2)}\n`;
  checks.push({ ok: autoModeOk, name: 'Contexto del modo auto', detail: autoModeOk ? 'al día' : 'no coincide con la configuración: corre install' });

  const hasPackageJson = fs.existsSync(paths.packageJson);
  if (hasPackageJson) {
    const current = readJson(paths.packageJson).data.scripts ?? {};
    const wrong = Object.entries(scripts()).filter(([name, value]) => current[name] !== value).map(([name]) => name);
    checks.push({ ok: wrong.length === 0, name: 'Scripts', detail: wrong.length === 0 ? 'claude:auto y claude:free' : `falta o cambió: ${wrong.join(', ')}` });
  }

  const docOk = readText(paths.doc) === renderDoc(config, { version, hasPackageJson });
  checks.push({ ok: docOk, name: 'Documento', detail: docOk ? config.docPath : `${config.docPath} no coincide con la configuración: corre install` });

  if (!machine) return checks;
  if (process.platform === 'linux') {
    const tools = ['bwrap', 'socat'].filter((tool) => !available(tool));
    checks.push({
      ok: tools.length === 0,
      name: 'Sandbox en Linux',
      detail: tools.length === 0 ? 'bubblewrap y socat instalados' : `falta ${tools.join(' y ')}: sin eso la sesión no arranca`,
    });
  } else if (process.platform !== 'darwin') {
    checks.push({ ok: false, name: 'Sandbox', detail: `el sandbox de Claude Code no existe en ${process.platform}: la sesión no arranca` });
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
