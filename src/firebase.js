import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Local testing only: `VITE_USE_EMULATOR=1 npm run dev` talks to the Firebase emulators.
const useEmulator = import.meta.env.VITE_USE_EMULATOR === '1';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (useEmulator) {
  config.apiKey ||= 'demo-key';
  config.projectId = 'demo-rasoi';
  config.appId ||= 'demo-app';
}

export const configMissing = !config.apiKey || !config.projectId;

export const app = initializeApp(configMissing ? { apiKey: 'missing', projectId: 'missing', appId: 'missing' } : config);
export const auth = getAuth(app);
// Stay logged in on this phone until "Logout".
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Local cache = fast re-open and fewer billed reads on the free plan.
export const db = initializeFirestore(app, {
  localCache: useEmulator ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
}
