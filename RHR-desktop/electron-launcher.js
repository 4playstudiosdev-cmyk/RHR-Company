// Some environments (VS Code's integrated terminal / extension host in
// particular) leak ELECTRON_RUN_AS_NODE into child shells. Electron checks
// only whether that key EXISTS in its environment — even set to an empty
// string it still boots as a plain Node process instead of launching the
// app, so `require('electron')` never returns the real API and `app` in
// electron.js is undefined. The key has to be deleted, not just emptied,
// before the Electron binary itself starts.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => process.exit(code ?? 0));
