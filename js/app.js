// ============================================================
// app.js — Kingdom Quiz game engine
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- Firebase readiness check ----------
// If firebase-config.js still has the placeholder keys, we run the
// game in "local only" mode: the host screen works fully, but the
// audience-voting features are disabled with a friendly note,
// instead of throwing errors. This lets a beginner try the game
// immediately, before setting up a Firebase project.
function isFirebaseConfigured() {
  try {
    return !firebaseConfig.apiKey.startsWith('PASTE_');
  } catch (e) {
    return false;
  }
}
const FIREBASE_READY = isFirebaseConfigured();

// ---------- Screen navigation ----------
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
  // The home button only makes sense while a game/session is actually
  // in progress — hide it on setup/menu/results screens.
  const showHome = id === 'screen-host-game' || id === 'screen-audience-view';
  $('#homeBtn').classList.toggle('hidden', !showHome);
}

// ---------- Kahoot-style answer tile colors + shapes ----------
const OPTION_META = [
  { label: 'A', cls: 'opt-a' },
  { label: 'B', cls: 'opt-b' },
  { label: 'C', cls: 'opt-c' },
  { label: 'D', cls: 'opt-d' },
];

// Shared by the host's question tiles and every audience member's
// voting tiles, so both stay visually and structurally identical.
function createOptionBar(idx, text) {
  const btn = document.createElement('button');
  btn.className = `option-btn ${OPTION_META[idx].cls}`;
  btn.dataset.idx = idx;
  btn.innerHTML = `<span class="option-badge"><span>${OPTION_META[idx].label}</span></span><span class="option-label-text">${text}</span>`;
  return btn;
}

function voteCountsFromObj(votesObj) {
  const counts = [0, 0, 0, 0];
  Object.values(votesObj || {}).forEach((idx) => { if (idx >= 0 && idx <= 3) counts[idx] += 1; });
  return counts;
}

// Live, animated color-fill showing each option's current share of
// the votes — used on both the host's question tiles and every
// audience member's own voting tiles, updating in real time as votes
// come in (this is what makes the "ratio" visibly animate).
function applyVoteFillToGrid(gridSelector, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  $$(`${gridSelector} .option-btn`).forEach((btn) => {
    const idx = parseInt(btn.dataset.idx, 10);
    if (Number.isNaN(idx)) return;
    let fill = btn.querySelector('.vote-fill');
    let badge = btn.querySelector('.vote-pct-badge');
    if (!fill) {
      fill = document.createElement('span');
      fill.className = 'vote-fill';
      btn.insertBefore(fill, btn.firstChild);
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'vote-pct-badge hidden';
      btn.appendChild(badge);
    }
    const pct = total > 0 ? Math.round((counts[idx] / total) * 100) : 0;
    fill.style.width = pct + '%';
    fill.classList.toggle('is-leading', total > 0 && max > 0 && counts[idx] === max);
    badge.textContent = `${pct}%`;
    badge.classList.toggle('hidden', total === 0);
  });
}

// ---------- Confetti ----------
function spawnConfetti(count = 50) {
  const layer = $('#confettiLayer');
  if (!layer) return;
  const colors = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)', 'var(--gold)'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    const duration = 2.2 + Math.random() * 1.6;
    const delay = Math.random() * 0.5;
    piece.style.animationDuration = duration + 's';
    piece.style.animationDelay = delay + 's';
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), (duration + delay) * 1000 + 200);
  }
}

// ---------- Global game state ----------
const game = {
  players: [],              // [{name, score, correct, wrong}]
  questionsPerPlayer: 10,
  turnOrder: [],             // array of player indices, one entry per turn
  turnIndex: 0,
  usedQuestionIds: new Set(),
  currentQuestion: null,
  selectedOptionIndex: null,
  answered: false,
  roomId: null,
  audienceVotesUnsub: null,
  askAudienceTimer: null,
  askAudienceActive: false,
  askAudienceVotesRef: null,
  askAudienceVotesHandler: null,
  difficulty: 'all',
  audienceRoomRef: null,
  audienceRoomHandler: null,
};

// Tracks which voting round (by its timerEndsAt timestamp) the audience
// device has already rendered/voted in, so a vote-count update doesn't
// wipe out the "you voted" state or redraw fresh buttons mid-round.
let audienceRenderedRoundKey = null;

// ============================================================
// MUTE BUTTON
// ============================================================
$('#muteBtn').addEventListener('click', () => {
  const nowMuted = !SoundFX.isMuted();
  SoundFX.setMuted(nowMuted);
  $('#muteBtn').textContent = nowMuted ? '🔇' : '🔊';
});

// ============================================================
// SCREEN: ROLE SELECT
// ============================================================
$$('.role-card').forEach((card) => {
  card.addEventListener('click', () => {
    SoundFX.click();
    const role = card.dataset.role;
    if (role === 'host') {
      showScreen('screen-rules');
    } else {
      if (!FIREBASE_READY) {
        alert("The host hasn't finished setting up the online room yet (Firebase isn't configured). Ask them to complete the setup guide, then try again.");
        return;
      }
      showScreen('screen-audience-join');
    }
  });
});

// ============================================================
// SCREEN: RULES
// ============================================================
$('#rulesContinueBtn').addEventListener('click', () => {
  SoundFX.click();
  renderPlayerNameInputs(2);
  showScreen('screen-host-setup');
});

// ============================================================
// SCREEN: HOST SETUP
// ============================================================
function renderPlayerNameInputs(count) {
  const wrap = $('#playerNameInputs');
  wrap.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Player ${i + 1} name`;
    input.id = `playerNameInput${i}`;
    input.maxLength = 20;
    wrap.appendChild(input);
  }
}

$('#playerCountSelect').addEventListener('change', (e) => {
  renderPlayerNameInputs(parseInt(e.target.value, 10));
});

let selectedQuestionsPerPlayer = 10;
$$('#questionsPerPlayerRow .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('#questionsPerPlayerRow .chip').forEach((c) => c.classList.remove('chip-selected'));
    chip.classList.add('chip-selected');
    selectedQuestionsPerPlayer = parseInt(chip.dataset.val, 10);
    SoundFX.click();
  });
});

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

$('#startGameBtn').addEventListener('click', async () => {
  const count = parseInt($('#playerCountSelect').value, 10);
  const players = [];
  for (let i = 0; i < count; i++) {
    const val = $(`#playerNameInput${i}`).value.trim();
    players.push({
      name: val || `Player ${i + 1}`,
      score: 0,
      correct: 0,
      wrong: 0,
      // Once a lifeline is used by this player, it stays used for the
      // rest of the game — it does NOT reset on their next turn.
      lifelinesUsed: { fiftyFifty: false, phoneAFriend: false, askAudience: false },
    });
  }

  game.players = players;
  game.questionsPerPlayer = selectedQuestionsPerPlayer;
  game.turnOrder = [];
  for (let q = 0; q < game.questionsPerPlayer; q++) {
    for (let p = 0; p < players.length; p++) game.turnOrder.push(p);
  }
  game.turnIndex = 0;
  game.usedQuestionIds = new Set();

  // Set up the online room (for audience voting) if Firebase is configured.
  if (FIREBASE_READY) {
    try {
      await auth.signInAnonymously();
      game.roomId = generateRoomId();
      await db.ref(`rooms/${game.roomId}`).set({
        gameState: 'PLAYING',
        activePlayerIndex: game.turnOrder[0],
        totalQuestionsPerPlayer: game.questionsPerPlayer,
        players: players.map((p) => ({ name: p.name, score: p.score })),
        currentQuestion: null,
        lifelines: {
          fiftyFifty: false,
          phoneAFriend: false,
          askAudience: { status: 'INACTIVE', timeRemaining: 0, votes: {} },
        },
      });
      $('#roomBadge').textContent = `Room ${game.roomId}`;
      $('#roomBadge').classList.remove('hidden');
      $('#lifelineAudience').disabled = false;
    } catch (err) {
      console.error('Firebase room setup failed:', err);
      game.roomId = null;
      $('#lifelineAudience').disabled = true;
      $('#lifelineAudience').title = 'Online room unavailable — check your Firebase setup.';
    }
  } else {
    $('#lifelineAudience').disabled = true;
    $('#lifelineAudience').title = 'Set up Firebase to enable audience voting (see the launch guide).';
  }

  showScreen('screen-host-game');
  loadNextQuestion();
});

// ============================================================
// HOST GAME VIEW
// ============================================================
function currentPlayer() {
  return game.players[game.turnOrder[game.turnIndex]];
}

// Shuffles a question's 4 options into a random order and returns a
// fresh copy with correctIndex updated to match — without touching the
// original entry in BIBLE_QUESTIONS. Every question in the bank has its
// correct answer stored in slot 0, so without this step the correct
// answer would always land in the same position on screen.
function shuffleOptionsForQuestion(q) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

function loadNextQuestion() {
  // Safety net: guarantee no leftover "Ask the Audience" round carries
  // into the new question, however the previous turn ended.
  endAskAudience();

  // pick a random unused question
  let pool = BIBLE_QUESTIONS.filter((q) => !game.usedQuestionIds.has(q.id));
  if (pool.length === 0) {
    game.usedQuestionIds.clear();
    pool = BIBLE_QUESTIONS;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  game.usedQuestionIds.add(q.id);
  game.currentQuestion = shuffleOptionsForQuestion(q);
  game.selectedOptionIndex = null;
  game.answered = false;

  // Dramatic "moving on" transition: the stage briefly dips out with a
  // light sweep, then the new question fades back in, instead of the
  // content just snapping to the next question instantly.
  const stage = $('#quizStage');
  const sweep = $('#stageSweep');
  if (stage && sweep) {
    stage.classList.remove('stage-in');
    stage.classList.add('stage-out');
    sweep.classList.remove('sweep-active');
    void sweep.offsetWidth; // force reflow so the animation can replay
    sweep.classList.add('sweep-active');
    setTimeout(() => {
      renderHostGameScreen();
      syncRoomQuestion();
      stage.classList.remove('stage-out');
      stage.classList.add('stage-in');
    }, 260);
  } else {
    renderHostGameScreen();
    syncRoomQuestion();
  }
}

function renderHostGameScreen() {
  const player = currentPlayer();
  $('#activePlayerLabel').textContent = `${player.name}'s turn`;
  $('#scoreboardActive').textContent = `${player.score} pts`;
  $('#roundLabel').textContent = `Question ${game.turnIndex + 1} of ${game.turnOrder.length}`;

  // scoreboard strip
  const strip = $('#scoreboardStrip');
  strip.innerHTML = '';
  game.players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'scoreboard-chip' + (i === game.turnOrder[game.turnIndex] ? ' is-active' : '');
    chip.textContent = `${p.name}: ${p.score}`;
    strip.appendChild(chip);
  });

  // question + options
  $('#questionText').textContent = game.currentQuestion.question;
  const grid = $('#optionsGrid');
  grid.innerHTML = '';
  game.currentQuestion.options.forEach((opt, idx) => {
    const btn = createOptionBar(idx, opt);
    btn.addEventListener('click', () => handleOptionClick(idx, btn));
    grid.appendChild(btn);
  });

  // reset UI state
  $('#submitAnswerBtn').disabled = true;
  $('#submitAnswerBtn').classList.remove('hidden');
  $('#passBtn').classList.remove('hidden');
  $('#nextTurnBtn').classList.add('hidden');
  $('#explanationText').classList.add('hidden');
  $('#audienceResultsPanel').classList.add('hidden');

  // lifeline buttons — disabled state follows the ACTIVE PLAYER's own
  // history (once they use a lifeline, it stays disabled on every future
  // turn of theirs), not a per-turn reset.
  const usedByPlayer = player.lifelinesUsed;
  $('#lifeline5050').disabled = usedByPlayer.fiftyFifty;
  $('#lifelinePhone').disabled = usedByPlayer.phoneAFriend;
  $('#lifelineAudience').disabled = usedByPlayer.askAudience || !(FIREBASE_READY && game.roomId);
}

function handleOptionClick(idx, btn) {
  if (game.answered) return;
  $$('#optionsGrid .option-btn').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
  game.selectedOptionIndex = idx;
  $('#submitAnswerBtn').disabled = false;
  SoundFX.click();
}

function lockOptionsAndReveal(chosenIndex) {
  // The turn is resolving now — if "Ask the Audience" was running,
  // close it out immediately so the audience screen clears in step
  // with the host, instead of waiting out its own 30s timer.
  endAskAudience();

  const correctIdx = game.currentQuestion.correctIndex;
  $$('#optionsGrid .option-btn').forEach((b) => {
    b.disabled = true;
    const idx = parseInt(b.dataset.idx, 10);
    if (idx === correctIdx) {
      b.classList.add('correct-flash');
      b.insertAdjacentHTML('beforeend', '<span class="option-result-icon">✓</span>');
    } else if (idx === chosenIndex) {
      b.classList.add('wrong-flash');
      b.insertAdjacentHTML('beforeend', '<span class="option-result-icon">✕</span>');
    }
  });
  $('#explanationText').textContent = `📖 ${game.currentQuestion.explanation}`;
  $('#explanationText').classList.remove('hidden');
  $('#submitAnswerBtn').classList.add('hidden');
  $('#passBtn').classList.add('hidden');
  $('#nextTurnBtn').classList.remove('hidden');
  game.answered = true;
}

$('#submitAnswerBtn').addEventListener('click', () => {
  if (game.selectedOptionIndex === null || game.answered) return;
  const player = currentPlayer();
  const isCorrect = game.selectedOptionIndex === game.currentQuestion.correctIndex;
  if (isCorrect) {
    player.score += 10;
    player.correct += 1;
    SoundFX.correct();
    spawnConfetti(16);
  } else {
    player.score -= 5;
    player.wrong += 1;
    SoundFX.wrong();
  }
  $('#scoreboardActive').textContent = `${player.score} pts`;
  lockOptionsAndReveal(game.selectedOptionIndex);
  syncRoomPlayers();
});

$('#passBtn').addEventListener('click', () => {
  if (game.answered) return;
  SoundFX.click();
  lockOptionsAndReveal(-1);
});

$('#nextTurnBtn').addEventListener('click', () => {
  SoundFX.turnChange();
  game.turnIndex += 1;
  if (game.turnIndex >= game.turnOrder.length) {
    endGame();
  } else {
    loadNextQuestion();
  }
});

// ============================================================
// LIFELINES
// ============================================================
$('#lifeline5050').addEventListener('click', () => {
  const player = currentPlayer();
  if (player.lifelinesUsed.fiftyFifty || game.answered) return;
  player.lifelinesUsed.fiftyFifty = true;
  $('#lifeline5050').disabled = true;
  SoundFX.lifeline();

  const correctIdx = game.currentQuestion.correctIndex;
  const wrongIndices = [0, 1, 2, 3].filter((i) => i !== correctIdx);
  // shuffle and take 2 to disable
  for (let i = wrongIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
  }
  const toDisable = wrongIndices.slice(0, 2);
  $$('#optionsGrid .option-btn').forEach((b) => {
    const idx = parseInt(b.dataset.idx, 10);
    if (toDisable.includes(idx)) {
      b.classList.add('disabled-5050');
      b.disabled = true;
    }
  });
});

$('#lifelinePhone').addEventListener('click', () => {
  const player = currentPlayer();
  if (player.lifelinesUsed.phoneAFriend || game.answered) return;
  player.lifelinesUsed.phoneAFriend = true;
  $('#lifelinePhone').disabled = true;
  SoundFX.lifeline();
  showPhoneAFriendModal();
});

function showPhoneAFriendModal() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(31,42,68,0.75);display:flex;align-items:center;justify-content:center;z-index:50;';
  overlay.innerHTML = `
    <div style="background:var(--parchment);border-radius:18px;padding:28px 26px;max-width:320px;text-align:center;box-shadow:var(--shadow);">
      <p style="font-family:'JetBrains Mono',monospace;color:var(--teal);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:.75rem;margin:0 0 8px;">Phone a Friend</p>
      <p style="margin:0 0 18px;color:var(--indigo-2);">Step away and consult someone off-screen. You have:</p>
      <p id="phoneCountdown" style="font-family:'JetBrains Mono',monospace;font-size:2.4rem;font-weight:700;color:var(--indigo);margin:0 0 18px;">30</p>
      <button id="phoneDoneBtn" class="btn btn-primary btn-block" style="margin-top:0;">Done</button>
    </div>`;
  document.body.appendChild(overlay);

  let remaining = 30;
  const tick = setInterval(() => {
    remaining -= 1;
    overlay.querySelector('#phoneCountdown').textContent = remaining;
    if (remaining <= 5 && remaining > 0) SoundFX.timerUrgent();
    if (remaining <= 0) {
      clearInterval(tick);
      overlay.remove();
    }
  }, 1000);

  overlay.querySelector('#phoneDoneBtn').addEventListener('click', () => {
    clearInterval(tick);
    overlay.remove();
  });
}

$('#lifelineAudience').addEventListener('click', () => {
  const player = currentPlayer();
  if (player.lifelinesUsed.askAudience || game.answered) return;
  if (!(FIREBASE_READY && game.roomId)) return;
  player.lifelinesUsed.askAudience = true;
  $('#lifelineAudience').disabled = true;
  SoundFX.lifeline();
  startAskAudience();
});

// How long the audience gets to vote during "Ask the Audience".
const ASK_AUDIENCE_SECONDS = 20;

function startAskAudience() {
  const timerEndsAt = Date.now() + ASK_AUDIENCE_SECONDS * 1000;
  const roomRef = db.ref(`rooms/${game.roomId}`);
  roomRef.child('lifelines/askAudience').set({ status: 'ACTIVE', timeRemaining: ASK_AUDIENCE_SECONDS, timerEndsAt, votes: {} });

  $('#audienceResultsPanel').classList.remove('hidden');
  $('#audienceBars').innerHTML = '<p style="color:var(--indigo-2);font-size:0.85rem;">Votes are coming in from the audience…</p>';

  game.askAudienceVotesRef = roomRef.child('lifelines/askAudience/votes');
  game.askAudienceVotesHandler = (snapshot) => {
    const votes = snapshot.val() || {};
    renderAudienceBars(votes);
    applyVoteFillToGrid('#optionsGrid', voteCountsFromObj(votes));
  };
  game.askAudienceVotesRef.on('value', game.askAudienceVotesHandler);
  game.askAudienceActive = true;

  game.askAudienceTimer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    if (remaining <= 0) endAskAudience();
  }, 500);
}

// Fully closes out an "Ask the Audience" round — whether it's ending
// because the timer ran out, or because the host revealed the answer
// / moved to the next turn before the timer finished. Without this, a
// leftover setInterval and Firebase listener from an earlier round
// keep running and only turn the audience's voting screen off
// whenever THEIR original countdown happens to elapse — which could
// be turns later. Calling this immediately on every turn transition
// guarantees the audience screen clears in step with the host.
function endAskAudience() {
  if (game.askAudienceTimer) {
    clearInterval(game.askAudienceTimer);
    game.askAudienceTimer = null;
  }
  if (game.askAudienceVotesRef && game.askAudienceVotesHandler) {
    game.askAudienceVotesRef.off('value', game.askAudienceVotesHandler);
    game.askAudienceVotesRef = null;
    game.askAudienceVotesHandler = null;
  }
  const wasActive = game.askAudienceActive;
  game.askAudienceActive = false;
  $('#audienceResultsPanel').classList.add('hidden');
  if (wasActive && FIREBASE_READY && game.roomId) {
    db.ref(`rooms/${game.roomId}/lifelines/askAudience`).set({ status: 'INACTIVE', timeRemaining: 0, votes: {} });
  }
}

// Renders the host's live results as a VERTICAL bar graph — one
// upright bar per option (A-D), each growing to its percentage share
// of votes cast so far, with the percentage labelled above each bar.
function renderAudienceBars(votes) {
  const counts = [0, 0, 0, 0];
  Object.values(votes).forEach((idx) => { if (idx >= 0 && idx <= 3) counts[idx] += 1; });
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...counts);
  const bars = $('#audienceBars');
  bars.innerHTML = '';
  bars.className = 'audience-bars audience-bars-vertical';
  ['A', 'B', 'C', 'D'].forEach((label, i) => {
    const pct = Math.round((counts[i] / total) * 100);
    const col = document.createElement('div');
    col.className = `audience-vbar-col ${OPTION_META[i].cls}`;
    col.innerHTML = `
      <span class="audience-vbar-pct">${pct}%</span>
      <span class="audience-vbar-track"><span class="audience-vbar-fill${counts[i] === max && counts[i] > 0 ? ' is-leading' : ''}" style="height:0%"></span></span>
      <span class="audience-vbar-label">${label}</span>`;
    bars.appendChild(col);
    const fillEl = col.querySelector('.audience-vbar-fill');
    void fillEl.offsetWidth;
    requestAnimationFrame(() => { fillEl.style.height = pct + '%'; });
  });
}

// ============================================================
// FIREBASE SYNC (host → room, for the audience view)
// ============================================================
function syncRoomQuestion() {
  if (!(FIREBASE_READY && game.roomId)) return;
  const player = currentPlayer();
  db.ref(`rooms/${game.roomId}`).update({
    activePlayerIndex: game.turnOrder[game.turnIndex],
    currentQuestion: {
      text: game.currentQuestion.question,
      options: game.currentQuestion.options,
      questionNumber: game.turnIndex + 1,
      totalQuestionsInSession: game.turnOrder.length,
    },
  });
  db.ref(`rooms/${game.roomId}/players/${game.turnOrder[game.turnIndex]}/name`).set(player.name);
}

function syncRoomPlayers() {
  if (!(FIREBASE_READY && game.roomId)) return;
  db.ref(`rooms/${game.roomId}/players`).set(game.players.map((p) => ({ name: p.name, score: p.score })));
}

// ============================================================
// GAME OVER
// ============================================================
function endGame() {
  if (FIREBASE_READY && game.roomId) {
    db.ref(`rooms/${game.roomId}/gameState`).set('GAMEOVER');
  }
  renderGameOver();
  showScreen('screen-gameover');
  SoundFX.fanfare();
  spawnConfetti(90);
  setTimeout(() => SoundFX.applause(), 700);
}

function renderGameOver() {
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const table = $('#leaderboardTable');
  table.innerHTML = '';
  ranked.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row' + (i === 0 ? ' is-winner' : '');
    row.innerHTML = `
      <span class="leaderboard-rank">${i === 0 ? '👑' : `#${i + 1}`}</span>
      <span class="leaderboard-name">${p.name}</span>
      <span class="leaderboard-score" data-target="${p.score}">0 pts</span>`;
    table.appendChild(row);

    // Count each score up from 0 rather than dropping the final number
    // in place — small touch, makes the ranking feel alive.
    const scoreEl = row.querySelector('.leaderboard-score');
    const target = p.score;
    const duration = 800;
    const startTime = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      scoreEl.textContent = `${Math.round(target * t)} pts`;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

$('#rematchBtn').addEventListener('click', () => {
  resetAndRestartGame();
});

// Shared by "Rematch" (from the game-over screen) and "Restart Game"
// (mid-game, from the host sidebar) — resets scores, lifelines, and
// turn order, then jumps straight back into question 1.
function resetAndRestartGame() {
  endAskAudience();
  game.players.forEach((p) => {
    p.score = 0; p.correct = 0; p.wrong = 0;
    p.lifelinesUsed = { fiftyFifty: false, phoneAFriend: false, askAudience: false };
  });
  game.turnIndex = 0;
  game.usedQuestionIds = new Set();
  if (FIREBASE_READY && game.roomId) {
    db.ref(`rooms/${game.roomId}/gameState`).set('PLAYING');
    syncRoomPlayers();
  }
  showScreen('screen-host-game');
  loadNextQuestion();
}

$('#restartMidGameBtn').addEventListener('click', () => {
  const confirmed = confirm('Restart the game? Everyone\'s score will reset to 0.');
  if (!confirmed) return;
  SoundFX.click();
  resetAndRestartGame();
});

$('#newGameBtn').addEventListener('click', () => {
  showScreen('screen-role');
});

// ============================================================
// HOME BUTTON — leave the current game/session from anywhere
// ============================================================
$('#homeBtn').addEventListener('click', () => {
  const confirmed = confirm('Leave and go back to the home screen? This ends your current session.');
  if (!confirmed) return;
  goHome();
});

function goHome() {
  // Stop any host-side "Ask the Audience" machinery still running.
  endAskAudience();
  // Stop any audience-side room subscription / countdown still running.
  if (game.audienceRoomRef && game.audienceRoomHandler) {
    game.audienceRoomRef.off('value', game.audienceRoomHandler);
    game.audienceRoomRef = null;
    game.audienceRoomHandler = null;
  }
  if (audienceCountdownInterval) {
    clearInterval(audienceCountdownInterval);
    audienceCountdownInterval = null;
  }
  if (FIREBASE_READY && game.roomId) {
    db.ref(`rooms/${game.roomId}/gameState`).set('ENDED').catch(() => {});
  }
  game.roomId = null;
  $('#roomBadge').classList.add('hidden');
  showScreen('screen-role');
}

// ============================================================
// AUDIENCE JOIN + VIEW
// ============================================================
$('#roomCodeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

$('#joinRoomBtn').addEventListener('click', async () => {
  const code = $('#roomCodeInput').value.trim().toUpperCase();
  $('#joinError').classList.add('hidden');
  if (code.length !== 4) return;

  try {
    await auth.signInAnonymously();
    const snap = await db.ref(`rooms/${code}`).once('value');
    if (!snap.exists()) {
      $('#joinError').classList.remove('hidden');
      return;
    }
    game.roomId = code;
    $('#roomBadge').textContent = `Room ${code}`;
    $('#roomBadge').classList.remove('hidden');
    showScreen('screen-audience-view');
    subscribeAudienceRoom(code);
  } catch (err) {
    console.error('Join room failed:', err);
    $('#joinError').textContent = 'Could not connect. Check your internet connection and try again.';
    $('#joinError').classList.remove('hidden');
  }
});

let audienceHasVotedThisRound = false;

function subscribeAudienceRoom(roomId) {
  const roomRef = db.ref(`rooms/${roomId}`);
  const handler = (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    renderAudienceView(data, roomId);
  };
  roomRef.on('value', handler);
  game.audienceRoomRef = roomRef;
  game.audienceRoomHandler = handler;
}

function renderAudienceView(data, roomId) {
  if (data.gameState === 'GAMEOVER') {
    $('#audienceActivePlayer').textContent = 'Game Over';
    $('#audienceQuestionText').textContent = 'Thanks for playing along! 🎉';
    $('#audienceWaiting').classList.add('hidden');
    $('#audienceVotingPanel').classList.add('hidden');
    return;
  }

  const activeName = (data.players && data.players[data.activePlayerIndex] && data.players[data.activePlayerIndex].name) || 'a player';
  $('#audienceActivePlayer').textContent = `${activeName}'s turn`;
  $('#audienceQuestionText').textContent = data.currentQuestion ? data.currentQuestion.text : 'The game will begin shortly.';

  const ask = data.lifelines && data.lifelines.askAudience;
  if (ask && ask.status === 'ACTIVE') {
    $('#audienceWaiting').classList.add('hidden');
    $('#audienceVotingPanel').classList.remove('hidden');

    // The room object updates on EVERY vote (since votes live under the
    // same room), which re-fires this whole function. Only rebuild the
    // voting buttons when it's actually a NEW round (a new timerEndsAt).
    // Otherwise leave the grid alone so a device that already voted
    // keeps showing "vote recorded" instead of a fresh, clickable grid.
    if (ask.timerEndsAt !== audienceRenderedRoundKey) {
      audienceRenderedRoundKey = ask.timerEndsAt;
      audienceHasVotedThisRound = false;
      $('#audienceVoteConfirm').classList.add('hidden');
      renderAudienceOptions(data.currentQuestion.options, roomId, ask.timerEndsAt);
    }
    // Always refresh the live color-fill on the tiles — every device's
    // vote updates this for everyone watching, in real time, whether
    // or not this device has voted itself.
    applyVoteFillToGrid('#audienceOptionsGrid', voteCountsFromObj(ask.votes));
  } else {
    $('#audienceVotingPanel').classList.add('hidden');
    $('#audienceWaiting').classList.remove('hidden');
    audienceRenderedRoundKey = null;
  }
}

let audienceCountdownInterval = null;

function renderAudienceOptions(options, roomId, timerEndsAt) {
  const grid = $('#audienceOptionsGrid');
  grid.innerHTML = '';
  options.forEach((opt, idx) => {
    const btn = createOptionBar(idx, opt);
    btn.addEventListener('click', () => {
      if (audienceHasVotedThisRound) return;
      audienceHasVotedThisRound = true;
      SoundFX.click();
      db.ref(`rooms/${roomId}/lifelines/askAudience/votes/${auth.currentUser.uid}`).set(idx);
      $$('#audienceOptionsGrid .option-btn').forEach((b) => (b.disabled = true));
      btn.classList.add('selected');
      $('#audienceVoteConfirm').classList.remove('hidden');
    });
    grid.appendChild(btn);
  });

  $('#audienceTimerBar').style.width = '100%';
  if (audienceCountdownInterval) clearInterval(audienceCountdownInterval);
  audienceCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    $('#audienceTimer').textContent = remaining > 0 ? `${remaining}s to vote` : "Time's up!";
    $('#audienceTimerBar').style.width = Math.max(0, (remaining / ASK_AUDIENCE_SECONDS) * 100) + '%';
    if (remaining <= 0) clearInterval(audienceCountdownInterval);
  }, 500);
}

// ============================================================
// INITIAL STATE
// ============================================================
renderPlayerNameInputs(2);
showScreen('screen-role');
if (!FIREBASE_READY) {
  console.warn('Kingdom Quiz is running in local-only mode. Set up Firebase (see the launch guide) to enable audience voting.');
}
