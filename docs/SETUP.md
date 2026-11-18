# Setup & deploy (beginner, free Spark plan)

You do this once, on your laptop. At the end you get a link like `https://rasoi-hisaab-xyz.web.app` to share in the flat WhatsApp group.

## 0. Install
- Node.js 20 or newer: https://nodejs.org
- In this folder: `npm install`

## 1. Create the Firebase project (5 min, in the browser)
1. https://console.firebase.google.com → **Add project** → any name (e.g. `rasoi-hisaab`) → Google Analytics off → Create. Stay on the free **Spark** plan.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.** (Leave "Email link" off.)
3. **Build → Firestore Database → Create database →** location `asia-south1 (Mumbai)` → **Production mode** → Create.
4. **Project settings (⚙️) → General → Your apps → Web (`</>`)** → nickname `rasoi` → Register (no Hosting checkbox needed). Copy the `firebaseConfig` values.
5. **Project settings → Service accounts → Generate new private key** → save the file as `scripts/serviceAccount.json`.
   ⚠️ This file is an admin key. It is in `.gitignore`. Never send it to anyone.

## 2. Local config
```bash
cp .env.example .env
```
Fill `.env` with the values from step 1.4 (apiKey → `VITE_FIREBASE_API_KEY`, etc.).

```bash
cp scripts/pins.example.json scripts/pins.json
```
Put the 5 PINs in `scripts/pins.json` (6 digits each). It is in `.gitignore`.

## 3. Create the 5 logins (seed)
```bash
npm run seed
```
Creates Auth users `shiv@flat.local` … with password = PIN and fixed uids, the 5 `members` docs and `settings/points`. Safe to run again.

Reset a PIN later: change it in `scripts/pins.json`, then
```bash
node scripts/seed.mjs --reset-pins
```
(or Firebase console → Authentication → user → Reset password).

## 4. Deploy rules + website
```bash
npx firebase login
```
```bash
npx firebase use --add
```
(pick your project, alias `default`)
```bash
npm run deploy
```
This builds the site and deploys Hosting + Firestore rules. The terminal prints **Hosting URL: https://<project>.web.app** — share that link.

Every time you change code: `npm run deploy` again.

## 5. Tests
Planner logic (no setup needed):
```bash
npm test
```
Security rules on the Firestore emulator (needs Java 11+ installed, e.g. `sudo apt install openjdk-21-jre-headless`):
```bash
npm run test:rules
```
No Java? Run the emulator in Docker instead:
```bash
npx firebase setup:emulators:firestore
```
```bash
docker run -d --rm --name rasoi-emu -p 127.0.0.1:8181:8181 -v ~/.cache/firebase/emulators:/e:ro eclipse-temurin:21-jre sh -c 'java -jar /e/cloud-firestore-emulator-*.jar --host 0.0.0.0 --port 8181'
```
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 npx vitest run tests/rules.test.js
```

## 6. Try it locally without touching your real project (optional)
Start the emulators (Firestore needs Java or the Docker command above, Auth runs in Node):
```bash
npx firebase emulators:start --only auth,firestore --project demo-rasoi
```
In a second terminal, seed the emulator and start the site:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-rasoi node scripts/seed.mjs
```
```bash
VITE_USE_EMULATOR=1 npm run dev
```

## Free-plan limits (you won't hit them)
Spark: 50,000 reads / 20,000 writes per day. Each phone loads ~2 months of entries (≈ 500 docs) when opened and then only receives changes. 5 people opening it ~10 times a day ≈ 25k reads at worst.
