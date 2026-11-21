// Junta el CLI y sus dependencias (@ramon-sg/runner) en un solo archivo, para
// publicar sin `dependencies`: lo que corre es exactamente lo que se probó.
import { build } from 'esbuild';

await build({
  entryPoints: ['bin/claude-repo-guard.mjs'],
  outfile: 'dist/claude-repo-guard.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'warning',
});
