// Node loads backend/.env before this script. Keep model caches across restarts.
const path = require('node:path');
const { spawn } = require('node:child_process');

const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function launch(executable, args) {
  const child = spawn(executable, args, {
    cwd: path.resolve(__dirname, '../backend'), stdio: 'inherit', windowsHide: true,
  });
  children.add(child);
  child.on('error', (error) => { console.error(`Cannot start OCR component: ${error.message}`); stop(1); });
  child.on('exit', (code) => { children.delete(child); if (!stopping) stop(code || 1); });
  return child;
}

async function main() {
  const port = process.env.OCR_PORT || '8000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid OCR_PORT.');
  if (!stopping) launch(process.env.OCR_PYTHON_EXECUTABLE || 'python', [
    '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', port,
  ]);
}
main().catch(error => { console.error(error.message); stop(1); });
