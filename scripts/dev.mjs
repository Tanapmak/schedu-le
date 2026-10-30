// Runs the API and the web dev server together. Ctrl+C (or either one exiting)
// stops both, so nothing is left running in the background.
import { spawn } from 'node:child_process';

const run = (workspace) => spawn('npm', ['run', 'dev', '-w', workspace], { stdio: 'inherit' });
const children = [run('api'), run('web')];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
