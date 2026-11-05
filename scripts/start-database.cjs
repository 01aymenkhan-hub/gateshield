// Starts the existing local cluster; never initializes, resets or deletes data.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function main() {
  const bin = process.env.POSTGRES_BIN_PATH;
  const data = process.env.POSTGRES_DATA_PATH;
  const port = process.env.POSTGRES_PORT || '55432';
  if (!bin || !data || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Configure POSTGRES_BIN_PATH, POSTGRES_DATA_PATH and POSTGRES_PORT in .env.');
  }
  if (!fs.existsSync(path.join(data, 'PG_VERSION'))) {
    throw new Error('Configured PostgreSQL cluster does not exist; refusing to initialize it automatically.');
  }
  const ctl = path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  const run = (args) => {
    const result = spawnSync(ctl, args, { encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    return result;
  };
  const status = run(['status', '-D', data]);
  if (status.status === 0) {
    console.log('Local PostgreSQL is already running.');
    return;
  }
  if (status.status !== 3) throw new Error(status.stderr || status.stdout || 'Cannot inspect PostgreSQL status.');
  const result = run(['start', '-D', data, '-l', process.env.POSTGRES_LOG_PATH || path.join(data, 'server.log'),
    '-o', `-h 127.0.0.1 -p ${port}`, '-w']);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'PostgreSQL startup failed.');
  console.log(`Local PostgreSQL is running on 127.0.0.1:${port}.`);
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
