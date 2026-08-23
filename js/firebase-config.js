// ============================================================
// firebase-config.js
//
// PASTE YOUR OWN FIREBASE CONFIG BELOW.
// You get this object from: Firebase Console → Project Settings
// → General tab → "Your apps" → the </> (Web app) icon.
// Follow the step-by-step guide you were given for exactly where
// to find this. Do NOT worry about this being "public" — a
// Firebase web config is meant to be visible in client code; your
// actual security comes from the Database Rules you set in the
// Firebase console, not from hiding this file.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDVK3E7Sc7LGAFfyF_U9qaH4rIT2PU3BZM",
  authDomain: "kingdom-quiz-feeb8.firebaseapp.com",
  projectId: "kingdom-quiz-feeb8",
  storageBucket: "kingdom-quiz-feeb8.firebasestorage.app",
  messagingSenderId: "226438871312",
  appId: "1:226438871312:web:c5bf956ad036d43d310d95"
};

// Initialize Firebase (compat SDK — simplest for beginners, no build tools needed)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
