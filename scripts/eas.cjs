const path = require('node:path');
const { spawnSync } = require('node:child_process');
const projectRoot = path.resolve(__dirname, '..');
// The project has its own Git repository. Keep EAS commit checks enabled.
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'eas-cli@23.2.0', ...process.argv.slice(2)], {
  cwd: projectRoot, stdio: 'inherit', env: { ...process.env, EAS_PROJECT_ROOT: projectRoot },
});
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
