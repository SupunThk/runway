import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '--watch', 'apps/api/src/server.ts'],
    { cwd: root, stdio: 'inherit' },
  ),
  spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/vite/bin/vite.js', import.meta.url),
      ),
      '--host',
      '127.0.0.1',
    ],
    {
      cwd: fileURLToPath(new URL('../apps/web/', import.meta.url)),
      stdio: 'inherit',
    },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
