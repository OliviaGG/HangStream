'use strict';

/**
 * Power control for the headless OBS renderer process on render1.
 *
 * This is deliberately separate from src/obs-remote.js. That module speaks
 * obs-websocket and controls the BROADCAST — StartStream/StopStream toggle the
 * RTMP output while OBS itself keeps running and keeps compositing. render1 has
 * no GPU, so a running-but-not-streaming OBS still burns roughly the whole
 * 12-thread box: on 2026-07-22 it sat in a failed reconnect loop for ~37 hours
 * (4,479 attempts) at ~950% CPU while sending 8 kbps. Stopping the stream would
 * not have freed any of that. Only stopping the systemd unit does.
 *
 * So: obs-remote = "end the broadcast", obs-power = "free the machine".
 *
 * Transport is ssh to a forced-command key. render1's authorized_keys pins this
 * key with command="/usr/local/bin/obs-ctl",restrict, so the relay can only ever
 * invoke status|start|stop|restart — never a shell. Verified: passing
 * "status; cat /etc/shadow" is rejected by the dispatcher's exact-match case.
 *
 * Config: OBS_CTL_KEY (path to the private key) + OBS_CTL_TARGET (user@host).
 */

const { execFile } = require('child_process');

const OBS_CTL_KEY = process.env.OBS_CTL_KEY || '';
const OBS_CTL_TARGET = process.env.OBS_CTL_TARGET || '';
const ACTION_TIMEOUT_MS = 45000;

const ACTIONS = ['status', 'start', 'stop', 'restart'];

function isConfigured() {
  return !!(OBS_CTL_KEY && OBS_CTL_TARGET);
}

/**
 * Run one allowlisted verb on render1 and parse the dispatcher's JSON reply.
 * @param {'status'|'start'|'stop'|'restart'} action
 */
function run(action) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) return reject(new Error('obs-power not configured'));
    // Belt and braces: the remote forced command allowlists these too, but do
    // not let an unexpected value reach ssh in the first place.
    if (!ACTIONS.includes(action)) return reject(new Error(`invalid action: ${action}`));

    const args = [
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=10',
      '-i', OBS_CTL_KEY,
      OBS_CTL_TARGET,
      action
    ];

    execFile('ssh', args, { timeout: ACTION_TIMEOUT_MS }, (err, stdout, stderr) => {
      const raw = String(stdout || '').trim() || String(stderr || '').trim();
      let payload = null;
      try { payload = JSON.parse(raw.split('\n').pop()); } catch (_) { /* non-JSON */ }

      if (payload && payload.error) return reject(new Error(payload.error));
      if (err && !payload) return reject(new Error(err.message || 'obs-power ssh failed'));
      if (!payload) return reject(new Error(`unparseable reply: ${raw.slice(0, 120)}`));

      resolve({
        unit: payload.unit,
        // active/inactive/failed/activating — systemd's own vocabulary
        active: payload.active,
        running: payload.active === 'active',
        // whether the unit starts on boot; currently "disabled" by design, so
        // the renderer never comes back on its own after a reboot
        enabled: payload.enabled,
        since: payload.since || null,
        obsProcesses: Number(payload.obsProcesses || 0),
        load1: Number(payload.load1 || 0)
      });
    });
  });
}

const status = () => run('status');
const start = () => run('start');
const stop = () => run('stop');
const restart = () => run('restart');

module.exports = { isConfigured, status, start, stop, restart, run, ACTIONS };
