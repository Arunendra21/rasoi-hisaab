// One-time seed: creates the 5 login accounts + member docs + default point settings.
// Run locally by the flat owner only:
//   node scripts/seed.mjs                 (uses scripts/serviceAccount.json)
//   node scripts/seed.mjs --reset-pins    (also overwrites existing passwords with pins.json)
// Safe to re-run: existing accounts/docs are kept (profile prefs are never overwritten).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const MEMBERS = [
  { id: 'shiv', name: 'Shiv' },
  { id: 'chavi', name: 'Chavi' },
  { id: 'upasana', name: 'Upasana' },
  { id: 'shristi', name: 'Shristi' },
  { id: 'payal', name: 'Payal' },
];
const DEFAULT_POINTS = { aata: 2, rotiPer5: 1, kaatna: 2, sabji: 3, bartan: 3, weekendBartanMultiplier: 1.5, coverBonus: 1 };
const resetPins = process.argv.includes('--reset-pins');

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const pinsPath = join(here, 'pins.json');
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(here, 'serviceAccount.json');
if (!existsSync(pinsPath)) die('scripts/pins.json nahi mila. Copy scripts/pins.example.json -> scripts/pins.json and fill the PINs.');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!emulator && !existsSync(saPath)) die('scripts/serviceAccount.json nahi mila. Firebase console -> Project settings -> Service accounts -> Generate new private key.');

const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
for (const m of MEMBERS) {
  if (!/^\d{6}$/.test(String(pins[m.id] ?? ''))) die(`pins.json: "${m.id}" ka PIN 6 digit hona chahiye.`);
}

if (emulator) {
  // Local emulator run (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST set): no real project touched.
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-rasoi' });
  console.log('🧪 Emulator mode');
} else {
  initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf8'))) });
}
const auth = getAuth();
const db = getFirestore();

for (const m of MEMBERS) {
  const email = `${m.id}@flat.local`;
  const password = String(pins[m.id]);
  try {
    await auth.getUser(m.id);
    if (resetPins) {
      await auth.updateUser(m.id, { email, password });
      console.log(`🔁 ${m.name}: PIN reset`);
    } else {
      console.log(`✔️  ${m.name}: account pehle se hai (PIN unchanged)`);
    }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid: m.id, email, password, displayName: m.name, emailVerified: true });
    console.log(`✅ ${m.name}: account bana (uid "${m.id}")`);
  }

  const ref = db.doc(`members/${m.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      userId: m.id,
      name: m.name,
      usualRotisWeekday: 6,
      usualRotisWeekend: 3,
      notifications: true,
      lastAuditId: 'seed',
    });
    console.log(`   member doc bana: members/${m.id}`);
  }
}

const settingsRef = db.doc('settings/points');
if (!(await settingsRef.get()).exists) {
  await settingsRef.set({
    values: DEFAULT_POINTS,
    version: 1,
    proposalId: 'seed',
    approvers: [],
    userId: 'seed',
    lastAuditId: 'seed',
  });
  console.log('✅ settings/points bana (default points)');
}

console.log('\n🎉 Seed complete. Ab app kholo aur apne naam + PIN se login karo.\n');
process.exit(0);
