// ============================================================
// room.js: live rooms for audience voting (Firebase Realtime Database)
//
// The Firebase SDK is loaded on demand, straight from Google's CDN,
// only when a host starts a game or an audience member joins one.
// Visitors who never use rooms never download it.
//
// Data layout (see database.rules.json for who may write what):
//   rooms/<CODE>/
//     hostUid, createdAt, gameState (PLAYING | GAMEOVER | ENDED)
//     activePlayerIndex, totalQuestionsPerPlayer
//     players/<n>/{name, score}
//     currentQuestion/{text, options[4], questionNumber, totalQuestionsInSession}
//     lifelines/askAudience/{status, timeRemaining, timerEndsAt, votes/<uid>: 0-3}
// ============================================================

import { firebaseConfig, FIREBASE_SDK_VERSION, isFirebaseConfigured } from './firebase-config.js';

export const ONLINE_ENABLED = isFirebaseConfigured();

let sdkPromise = null;
let serverOffset = 0;
let writeErrorHandler = () => {};

/** The page registers one function that shows a friendly message when a background write fails. */
export function onWriteError(handler) { writeErrorHandler = handler; }

/** Loads Firebase once. Anonymous sign-in only, so no pop-ups or extra frames are needed. */
function loadSdk() {
  sdkPromise ??= (async () => {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
    const [appMod, authMod, dbMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-database.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence, authMod.inMemoryPersistence],
    });
    const db = dbMod.getDatabase(app);
    // Keeps the host's and every phone's countdown in step even if a device clock is wrong.
    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), (snap) => { serverOffset = snap.val() || 0; });
    return { auth, db, authMod, dbMod };
  })().catch((error) => {
    sdkPromise = null; // allow a retry after a network failure
    throw error;
  });
  return sdkPromise;
}

async function connect() {
  if (!ONLINE_ENABLED) throw new Error('online-disabled');
  const sdk = await loadSdk();
  if (typeof sdk.auth.authStateReady === 'function') await sdk.auth.authStateReady();
  if (!sdk.auth.currentUser) await sdk.authMod.signInAnonymously(sdk.auth);
  return sdk;
}

/** Current time on the database's clock, in milliseconds. */
export const serverNow = () => Date.now() + serverOffset;

/** A short message a person can act on, for any error thrown above. */
export function describeError(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if (text.includes('permission')) return 'The room refused the update. The database rules may need to be published (see docs/FIREBASE_SETUP.md).';
  if (text.includes('network') || text.includes('offline') || text.includes('unavailable') || text.includes('failed to fetch') || text.includes('importing')) {
    return 'Could not reach the room. Check your internet connection and try again.';
  }
  if (text.includes('admin-restricted') || text.includes('operation-not-allowed')) return 'Anonymous sign-in is switched off in Firebase (see docs/FIREBASE_SETUP.md, step 3).';
  if (text.includes('no-free-room-code')) return 'Could not find a free room code. Please try again.';
  return 'Something went wrong with the online room. Please try again.';
}

/** Background writes must never crash the game: report once and carry on. */
const background = (promise) => promise.catch((error) => { writeErrorHandler(error); });

const roomPath = (id, ...rest) => ['rooms', id, ...rest].join('/');

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ---------- Host ----------

/** Creates a room with a code nobody else is using. Resolves to the 4-character code. */
export async function createRoom({ players, questionsPerPlayer, activePlayerIndex }) {
  const { auth, db, dbMod } = await connect();
  const { ref, get, set, serverTimestamp } = dbMod;
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateRoomId();
    const roomRef = ref(db, roomPath(id));
    if ((await get(roomRef)).exists()) continue;
    await set(roomRef, {
      hostUid: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      gameState: 'PLAYING',
      activePlayerIndex,
      totalQuestionsPerPlayer: questionsPerPlayer,
      players: players.map((p) => ({ name: p.name, score: p.score })),
      lifelines: {
        fiftyFifty: false,
        phoneAFriend: false,
        askAudience: { status: 'INACTIVE', timeRemaining: 0 },
      },
    });
    return id;
  }
  throw new Error('no-free-room-code');
}

export async function pushQuestion(roomId, { activePlayerIndex, playerName, question, questionNumber, totalQuestions }) {
  const { db, dbMod } = await connect();
  return background(dbMod.update(dbMod.ref(db, roomPath(roomId)), {
    activePlayerIndex,
    currentQuestion: {
      text: question.question,
      options: question.options,
      questionNumber,
      totalQuestionsInSession: totalQuestions,
    },
    [`players/${activePlayerIndex}/name`]: playerName,
  }));
}

export async function pushPlayers(roomId, players) {
  const { db, dbMod } = await connect();
  return background(dbMod.set(dbMod.ref(db, roomPath(roomId, 'players')), players.map((p) => ({ name: p.name, score: p.score }))));
}

export async function setGameState(roomId, state) {
  const { db, dbMod } = await connect();
  return background(dbMod.set(dbMod.ref(db, roomPath(roomId, 'gameState')), state));
}

/** Opens a voting round. Resolves to the moment (server time) the round ends. */
export async function openVoting(roomId, seconds) {
  const { db, dbMod } = await connect();
  const timerEndsAt = serverNow() + seconds * 1000;
  await dbMod.set(dbMod.ref(db, roomPath(roomId, 'lifelines/askAudience')), {
    status: 'ACTIVE', timeRemaining: seconds, timerEndsAt,
  });
  return timerEndsAt;
}

export async function closeVoting(roomId) {
  const { db, dbMod } = await connect();
  return background(dbMod.set(dbMod.ref(db, roomPath(roomId, 'lifelines/askAudience')), { status: 'INACTIVE', timeRemaining: 0 }));
}

/** Calls back with the votes object ({uid: 0-3}) whenever it changes. Resolves to an unsubscribe function. */
export async function watchVotes(roomId, callback) {
  const { db, dbMod } = await connect();
  return dbMod.onValue(dbMod.ref(db, roomPath(roomId, 'lifelines/askAudience/votes')), (snap) => callback(snap.val() || {}));
}

// ---------- Audience ----------

/** Resolves to true if a room with this code exists. */
export async function roomExists(code) {
  const { db, dbMod } = await connect();
  return (await dbMod.get(dbMod.ref(db, roomPath(code)))).exists();
}

/** Calls back with the whole room whenever it changes. Resolves to an unsubscribe function. */
export async function watchRoom(code, callback, onError) {
  const { db, dbMod } = await connect();
  return dbMod.onValue(dbMod.ref(db, roomPath(code)), (snap) => {
    if (snap.exists()) callback(snap.val());
  }, onError);
}

export async function castVote(roomId, optionIndex) {
  const { auth, db, dbMod } = await connect();
  await dbMod.set(dbMod.ref(db, roomPath(roomId, `lifelines/askAudience/votes/${auth.currentUser.uid}`)), optionIndex);
}
