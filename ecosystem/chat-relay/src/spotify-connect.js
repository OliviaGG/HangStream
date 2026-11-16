'use strict';

/**
 * Narrow systemd control for render1's headless Spotify Connect receiver.
 *
 * Chat Relay and librespot run on the same host. Commands are fixed here so
 * the owner-only HTTP routes cannot pass arbitrary unit names or shell text to
 * sudo. The deploy user has non-interactive systemctl access on render1.
 */

const { execFile } = require('child_process');

const UNIT = 'spotify-connect.service';
const COMMAND_TIMEOUT_MS = 15000;
const RESTART_SETTLE_MS = 1200;

function execSystemctl(args) {
  return new Promise((resolve, reject) => {
    execFile('sudo', ['-n', 'systemctl', ...args], {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || '').trim() || err.message || 'systemctl failed';
        return reject(new Error(detail.slice(0, 240)));
      }
      resolve(String(stdout || ''));
    });
  });
}

function parseSystemctlShow(raw) {
  const fields = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const split = line.indexOf('=');
    if (split > 0) fields[line.slice(0, split)] = line.slice(split + 1);
  }

  const active = fields.ActiveState || 'unknown';
  const sub = fields.SubState || 'unknown';
  return {
    unit: UNIT,
    active,
    sub,
    running: active === 'active' && sub === 'running',
    pid: Math.max(0, Number(fields.MainPID) || 0),
    restarts: Math.max(0, Number(fields.NRestarts) || 0),
    since: fields.ExecMainStartTimestamp || null,
    result: fields.Result || null,
  };
}

async function status() {
  if (process.platform !== 'linux') {
    return { configured: false, unit: UNIT, running: false, active: 'unsupported', sub: 'unsupported' };
  }
  const raw = await execSystemctl([
    'show', UNIT, '--no-pager',
    '--property=ActiveState',
    '--property=SubState',
    '--property=MainPID',
    '--property=NRestarts',
    '--property=ExecMainStartTimestamp',
    '--property=Result',
  ]);
  return { configured: true, ...parseSystemctlShow(raw) };
}

let restartInFlight = null;

function restart() {
  if (restartInFlight) return restartInFlight;
  restartInFlight = (async () => {
    if (process.platform !== 'linux') throw new Error('Spotify Connect control is only available on render1');
    await execSystemctl(['restart', UNIT]);
    await new Promise(resolve => setTimeout(resolve, RESTART_SETTLE_MS));
    return status();
  })().finally(() => {
    restartInFlight = null;
  });
  return restartInFlight;
}

module.exports = { UNIT, parseSystemctlShow, status, restart };
