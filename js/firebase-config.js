// ============================================================
// firebase-config.js
//
// Connection details for the Firebase project that powers live
// audience voting. These values are IDENTIFIERS, not passwords:
// every Firebase web app ships them to the browser by design.
// What protects the data is the set of Realtime Database rules
// in database.rules.json (see docs/FIREBASE_SETUP.md), together
// with the optional hardening steps described there.
//
// Never put a service-account key or any "private key" in this
// repository. The web config below is the only thing needed.
// ============================================================

export const FIREBASE_SDK_VERSION = '10.13.0';

export const firebaseConfig = {
  apiKey: "AIzaSyDVK3E7Sc7LGAFfyF_U9qaH4rIT2PU3BZM",
  authDomain: "kingdom-quiz-feeb8.firebaseapp.com",
  databaseURL: "https://kingdom-quiz-feeb8-default-rtdb.firebaseio.com",
  projectId: "kingdom-quiz-feeb8",
  storageBucket: "kingdom-quiz-feeb8.firebasestorage.app",
  messagingSenderId: "226438871312",
  appId: "1:226438871312:web:c5bf956ad036d43d310d95"
};

/** False while the placeholder values are still in place: the game then runs host-only. */
export function isFirebaseConfigured() {
  return typeof firebaseConfig.apiKey === 'string' && !firebaseConfig.apiKey.startsWith('PASTE_');
}
