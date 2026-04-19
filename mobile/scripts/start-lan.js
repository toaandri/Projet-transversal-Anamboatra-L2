#!/usr/bin/env node
/**
 * Anamboatra mobile — démarre Expo en LAN en forçant la bonne IP.
 *
 * Sur Windows, `expo start --lan` échoue souvent car Node liste plusieurs
 * interfaces virtuelles (VirtualBox, vEthernet WSL, Hyper-V, Docker…) et choisit
 * la mauvaise. Résultat : le QR code pointe sur 127.0.0.1 ou sur une IP que le
 * téléphone ne peut pas joindre, et Expo Go reste bloqué sur "loading" ou
 * affiche "Something went wrong".
 *
 * Ce script :
 *  1. Liste toutes les IPv4 non-internes,
 *  2. Filtre les interfaces virtuelles connues (vEthernet, VirtualBox…),
 *  3. Préfère les plages Wi-Fi/box ADSL classiques (192.168.x, 10.x, 172.16-31.x),
 *  4. Exporte `REACT_NATIVE_PACKAGER_HOSTNAME=<IP>` pour Metro,
 *  5. Lance `npx expo start --lan --clear` avec les autres args éventuels.
 *
 * Usage :
 *   node scripts/start-lan.js              → auto-détection
 *   node scripts/start-lan.js 192.168.1.42 → IP forcée
 */
const os = require('os');
const { spawn } = require('child_process');

const FORBIDDEN_NAME = /(virtualbox|vethernet|vmware|hyper-v|loopback|docker|wsl)/i;

function listLanCandidates() {
  const ifaces = os.networkInterfaces();
  /** @type {Array<{ name: string, address: string, score: number }>} */
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
      // Plages d'IP typiquement utilisées par les adaptateurs virtuels.
      // Le téléphone ne les atteint jamais, on les pénalise fortement.
      if (a.address.startsWith('192.168.56.')) score -= 60; // VirtualBox host-only
      if (a.address.startsWith('192.168.99.')) score -= 60; // docker-machine
      if (a.address.startsWith('169.254.')) score -= 80;     // APIPA / link-local
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
