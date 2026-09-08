const path = require('node:path');
const { spawnSync } = require('node:child_process');
const projectRoot = path.resolve(__dirname, '..');
// This workspace currently lives beneath a home-directory Git repository.
// Both variables are required: NO_VCS alone can still discover the parent Git root.
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'eas-cli@23.2.0', ...process.argv.slice(2)], {
  cwd: projectRoot, stdio: 'inherit', env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: projectRoot },
});
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
