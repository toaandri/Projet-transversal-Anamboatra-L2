#!/usr/bin/env node
const os = require('os');
const { spawn } = require('child_process');

const FORBIDDEN_NAME = /(virtualbox|vethernet|vmware|hyper-v|loopback|docker|wsl)/i;

function listLanCandidates() {
  const ifaces = os.networkInterfaces();
    const out = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const isVirtual = FORBIDDEN_NAME.test(name);
      let score = 0;
      if (a.address.startsWith('192.168.')) score += 30;
      else if (a.address.startsWith('10.')) score += 20;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 15;
      if (/wi-?fi|wlan|wireless/i.test(name)) score += 25;
      if (/ethernet|en|eth/i.test(name)) score += 10;
      if (isVirtual) score -= 50;

      if (a.address.startsWith('192.168.56.')) score -= 60;
      if (a.address.startsWith('192.168.99.')) score -= 60;
      if (a.address.startsWith('169.254.')) score -= 80;
      out.push({ name, address: a.address, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function pickLanIp(forced) {
  if (forced) return forced;
  const candidates = listLanCandidates();
  if (candidates.length === 0) return null;
  return candidates[0].address;
}

function main() {
  const userArgs = process.argv.slice(2);
  let forced = null;
  const passthrough = [];
  for (const a of userArgs) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) forced = a;
    else passthrough.push(a);
  }

  const ip = pickLanIp(forced);
  const candidates = listLanCandidates();
  console.log('[anamboatra] Interfaces LAN détectées :');
  for (const c of candidates) {
    console.log(`  - ${c.name.padEnd(28)} ${c.address}  (score ${c.score})`);
  }

  if (!ip) {
    console.warn('[anamboatra] Aucune IP LAN trouvée. Expo va démarrer sur localhost.');
    console.warn('             → utilise plutôt `npm run start:tunnel`.');
  } else {
    console.log(`[anamboatra] IP LAN choisie pour Metro : ${ip}`);
    console.log(`[anamboatra] (le téléphone et le PC doivent être sur le même Wi-Fi)`);
  }

  const env = { ...process.env };
  if (ip) env.REACT_NATIVE_PACKAGER_HOSTNAME = ip;

  const args = ['expo', 'start', '--lan', '--clear', ...passthrough];
  const child = spawn('npx', args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main();
