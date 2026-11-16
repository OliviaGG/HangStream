#!/usr/bin/env node

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--ssh-target' && argv[i + 1]) {
      args.sshTarget = argv[++i];
    } else if (arg === '--public-url' && argv[i + 1]) {
      args.publicUrl = argv[++i];
    }
  }
  return args;
}

function buildConfig(argv) {
  const args = parseArgs(argv);
  return {
    json: args.json,
    sshTarget: args.sshTarget || process.env.CHAT_RELAY_SMOKE_SSH_TARGET || '',
    publicUrl: args.publicUrl || process.env.CHAT_RELAY_PUBLIC_HEALTH_URL || 'https://wordtycoon.live/api/health'
  };
}

function okResult(name, details = {}) {
  return { name, ok: true, details };
}

function failResult(name, error, details = {}) {
  return {
    name,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    details
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}${text ? ` :: ${text.slice(0, 200)}` : ''}`);
  }
  if (!json || typeof json !== 'object') {
    throw new Error(`Non-JSON response from ${url}`);
  }
  return json;
}

async function sshJson(target, url) {
  const { stdout } = await execFileAsync('ssh', [target, 'curl', '-sS', url], { maxBuffer: 1024 * 1024 * 10 });
  return JSON.parse(stdout);
}

async function sshPm2(target) {
  const { stdout } = await execFileAsync('ssh', [target, 'pm2', 'jlist'], { maxBuffer: 1024 * 1024 * 20 });
  return JSON.parse(stdout);
}

function assertRelayHealth(payload, source) {
  if (!payload.ok) throw new Error(`${source} returned ok=false`);
  if (!payload.wordTycoonReachable) throw new Error(`${source} cannot reach Word Tycoon`);
  if ((payload.appsRegistered ?? 0) < 1) throw new Error(`${source} reports no registered apps`);
  return {
    source,
    uptimeSec: payload.uptimeSec ?? null,
    appsRegistered: payload.appsRegistered ?? null,
    sessions: payload.sessions?.count ?? null,
    memoryMB: payload.memoryMB || null
  };
}

async function checkPublicHealth(config) {
  const payload = await fetchJson(config.publicUrl);
  return okResult('public-health', assertRelayHealth(payload, config.publicUrl));
}

async function checkInternalHealth(config) {
  if (!config.sshTarget) {
    return okResult('internal-health', { skipped: true, reason: 'no ssh target provided' });
  }
  const source = `${config.sshTarget}:127.0.0.1:3000/api/health`;
  const payload = await sshJson(config.sshTarget, 'http://127.0.0.1:3000/api/health');
  return okResult('internal-health', assertRelayHealth(payload, source));
}

async function checkPm2(config) {
  if (!config.sshTarget) {
    return okResult('pm2-mobile-relay', { skipped: true, reason: 'no ssh target provided' });
  }
  const processes = await sshPm2(config.sshTarget);
  const relay = processes.find((proc) => proc.name === 'mobile-relay');
  if (!relay) throw new Error('mobile-relay is missing from PM2');
  if (relay.pm2_env?.status !== 'online') throw new Error(`mobile-relay status is ${relay.pm2_env?.status || 'unknown'}`);
  return okResult('pm2-mobile-relay', {
    status: relay.pm2_env.status,
    restarts: relay.pm2_env.restart_time ?? null,
    nodeVersion: relay.pm2_env.node_version ?? null,
    memoryMB: relay.monit?.memory ? Math.round(relay.monit.memory / (1024 * 1024)) : null
  });
}

function printHuman(results) {
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.ok ? '' : ` :: ${result.error}`}`);
    for (const [key, value] of Object.entries(result.details || {})) {
      console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
  }
}

async function main() {
  const config = buildConfig(process.argv.slice(2));
  const checks = [
    ['public-health', () => checkPublicHealth(config)],
    ['internal-health', () => checkInternalHealth(config)],
    ['pm2-mobile-relay', () => checkPm2(config)]
  ];
  const results = [];
  for (const [name, check] of checks) {
    try {
      results.push(await check());
    } catch (error) {
      results.push(failResult(name, error));
    }
  }

  const ok = results.every((result) => result.ok);
  if (config.json) {
    console.log(JSON.stringify({ ok, results }, null, 2));
  } else {
    printHuman(results);
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
