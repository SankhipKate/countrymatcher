import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, options = {}) {
  return spawnSync(npmCommand, args, {
    cwd: appDir,
    stdio: options.stdio ?? 'inherit',
    env: process.env,
  });
}

const check = run(['ls', '--depth=0', '--include=dev'], { stdio: 'ignore' });
if (check.error) {
  console.error(`Cannot run npm dependency check: ${check.error.message}`);
  process.exit(1);
}
if (check.status === 0) process.exit(0);

console.log('Node dependencies are missing or out of sync; running npm ci...');
const install = run(['ci']);
if (install.error) {
  console.error(`Cannot run npm ci: ${install.error.message}`);
  process.exit(1);
}
if (install.status !== 0) {
  console.error('npm ci failed; tests were not started.');
  process.exit(install.status ?? 1);
}
