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
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PASTE_YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

// Initialize Firebase (compat SDK — simplest for beginners, no build tools needed)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
