import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Lo que imprime cada ejecutable falso a `--version`. */
export const FAKE_VERSIONS = { bun: '1.4.4', npm: '11.6.0' };

/**
 * Un directorio con `bun`/`bunx` y `npm`/`npx` falsos que solo responden
 * `--version`, para elegir el ejecutor sin red y sin depender de la máquina.
 * Se pone adelante de `/usr/bin:/bin` (git y sh siguen ahí).
 *
 * @param {{ bun?: boolean, npm?: boolean }} which
 * @returns {{ dir: string, path: string }}
 */
export const fakeBin = ({ bun = false, npm = false }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bin-'));
  const write = (name, version) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/bin/sh\necho ${version}\n`);
    fs.chmodSync(file, 0o755);
  };
  if (bun) for (const name of ['bun', 'bunx']) write(name, FAKE_VERSIONS.bun);
  if (npm) for (const name of ['npm', 'npx']) write(name, FAKE_VERSIONS.npm);
  return { dir, path: `${dir}:/usr/bin:/bin` };
};

/**
 * Pone un PATH falso en `process.env` (la biblioteca de runner lo lee de ahí)
 * y devuelve cómo deshacerlo.
 *
 * @param {{ bun?: boolean, npm?: boolean }} which
 * @returns {() => void}
 */
export const usePath = (which) => {
  const original = process.env.PATH;
  const bin = fakeBin(which);
  process.env.PATH = bin.path;
  return () => {
    process.env.PATH = original;
    fs.rmSync(bin.dir, { recursive: true, force: true });
  };
};
