#!/usr/bin/env node
const { spawn } = require('child_process');
const os = require('os');
const net = require('net');

function getLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const iface of addrs) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      let score = 0;
      if (iface.address.startsWith('192.168.')) score += 100;
      if (iface.address.startsWith('10.0.'))    score += 80;
      if (iface.address.startsWith('10.') && !iface.address.startsWith('10.147.')) score += 60;
      const lname = name.toLowerCase();
      if (lname.includes('zerotier'))  score -= 200;
      if (lname.includes('vpn'))       score -= 150;
      if (lname.includes('virtual'))   score -= 150;
      if (lname.includes('vmware'))    score -= 150;
      if (lname.includes('vethernet')) score -= 150;
      if (lname.includes('hyper-v'))   score -= 150;
      if (lname.includes('docker'))    score -= 150;
      if (lname.includes('wsl'))       score -= 150;
      if (lname.includes('wi-fi') || lname.includes('wifi') || lname.includes('wlan')) score += 50;
      if (lname.includes('ethernet') || lname.includes('eth') || lname.includes('lan')) score += 40;
      candidates.push({ address: iface.address, name, score });
    }
  }
  if (candidates.length === 0) return 'localhost';
  candidates.sort((a, b) => b.score - a.score);
  console.log('\n  Network interfaces detected:');
  candidates.forEach(c =>
    console.log(`    [${(c.score >= 0 ? '+' : '') + c.score}]  ${c.name.padEnd(42)} ${c.address}`)
  );
  console.log(`\n  ✅ Selected: ${candidates[0].name} → ${candidates[0].address}`);
  return candidates[0].address;
}

// Wait until a TCP port is open
function waitForPort(port, host, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error',   () => { sock.destroy(); retry(); });
      sock.once('timeout', () => { sock.destroy(); retry(); });
      sock.connect(port, host);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error(`Port ${port} not open after ${timeoutMs}ms`));
      setTimeout(tryConnect, 300);
    };
    tryConnect();
  });
}

async function main() {
  const ip = getLanIp();

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║         🏃  Galah Panjang Dev Server                 ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Desktop :  http://localhost:3000                    ║`);
  console.log(`║  Mobile  :  http://${ip}:3000  ← open on phone  ║`);
  console.log(`║  Server  :  http://${ip}:3001                  ║`);
  console.log('║                                                      ║');
  console.log('║  Make sure phone & laptop are on the same WiFi!     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── 1. Start the game server first ──
  console.log('  [1/2] Starting game server on :3001 ...');
  const server = spawn('node', ['server/server.js'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  // ── 2. Wait until :3001 is actually accepting connections ──
  try {
    await waitForPort(3001, 'localhost', 12000);
    console.log('  [1/2] ✅ Game server ready!\n');
  } catch (e) {
    console.error('  [1/2] ❌ Server did not start in time:', e.message);
    server.kill();
    process.exit(1);
  }

  // ── 3. Start the React client ──
  console.log('  [2/2] Starting React client on :3000 ...');
  const isWin = process.platform === 'win32';
  const clientEnv = { ...process.env, HOST: '0.0.0.0', BROWSER: 'none' };

  let client;
  if (isWin) {
    // Windows: use cross-env to set HOST
    client = spawn('npx', ['cross-env', 'HOST=0.0.0.0', 'BROWSER=none', 'react-scripts', 'start'], {
      stdio: 'inherit',
      shell: true,
      cwd: `${__dirname}/client`,
      env: process.env,
    });
  } else {
    client = spawn('npm', ['start', '--prefix', 'client'], {
      stdio: 'inherit',
      shell: true,
      env: clientEnv,
    });
  }

  process.on('SIGINT', () => {
    console.log('\n  Shutting down...');
    server.kill();
    client.kill();
    process.exit(0);
  });
}

main();
