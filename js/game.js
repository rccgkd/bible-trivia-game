// ============================================================
// game.js: the host's game engine
// setup, turns, scoring, lifelines, and the end-of-game ranking
// ============================================================

import { $, $$, el, icon, setScale } from './dom.js';
import { SoundFX } from './sounds.js';
import {
  showScreen, toast, announce, setBusy, confirmDialog, isDialogOpen,
  spawnConfetti, showScorePopup, keepAwake,
} from './ui.js';
import {
  ONLINE_ENABLED, createRoom, pushQuestion, pushPlayers, setGameState,
  openVoting, closeVoting, watchVotes, describeError, serverNow,
} from './room.js';

const ASK_AUDIENCE_SECONDS = 20;
const PHONE_FRIEND_SECONDS = 30;
const POINTS_CORRECT = 10;
const POINTS_WRONG = -5;

export const OPTION_META = [
  { label: 'A', cls: 'opt-a' },
  { label: 'B', cls: 'opt-b' },
  { label: 'C', cls: 'opt-c' },
  { label: 'D', cls: 'opt-d' },
];

const CATEGORY_HINTS = {
  bible: 'Names, places, numbers, and events straight from Scripture.',
  history: 'The story of the Christian faith from the Day of Pentecost through the modern era.',
};

const game = {
  players: [],              // [{name, score, correct, wrong, lifelinesUsed}]
  questionsPerPlayer: 10,
  category: 'bible',
  turnOrder: [],            // one player index per turn
  turnIndex: 0,
  usedQuestionIds: new Set(),
  currentQuestion: null,
  selectedOptionIndex: null,
  answered: false,
  roomId: null,
  ask: { active: false, timer: null, unwatch: null },
};

let questionBank = null;

/** The question bank is large, so it is only fetched when a game actually starts. */
async function loadQuestions() {
  if (!questionBank) questionBank = (await import('./questions.js')).BIBLE_QUESTIONS;
  return questionBank;
}

const roomIsLive = () => ONLINE_ENABLED && Boolean(game.roomId);
const currentPlayer = () => game.players[game.turnOrder[game.turnIndex]];

// ============================================================
// Shared option tiles (also used by the audience view)
// ============================================================

/** One answer tile: a lettered diamond plus the answer text. */
export function createOptionBar(index, text) {
  const button = el('button', { className: `option-btn ${OPTION_META[index].cls}`, attrs: { type: 'button', 'data-idx': String(index) } },
    el('span', { className: 'option-badge' }, el('span', { text: OPTION_META[index].label, attrs: { 'aria-hidden': 'true' } })),
    el('span', { className: 'option-label-text', text }));
  button.setAttribute('aria-label', `${OPTION_META[index].label}: ${text}`);
  return button;
}

export function voteCounts(votesObject) {
  const counts = [0, 0, 0, 0];
  Object.values(votesObject || {}).forEach((index) => { if (index >= 0 && index <= 3) counts[index] += 1; });
  return counts;
}

/** Animated share-of-votes fill inside each tile, on the host's and the audience's screens. */
export function applyVoteFill(gridSelector, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  $$(`${gridSelector} .option-btn`).forEach((button) => {
    const index = parseInt(button.dataset.idx, 10);
    if (Number.isNaN(index)) return;
    let fill = button.querySelector('.vote-fill');
    let badge = button.querySelector('.vote-pct-badge');
    if (!fill) {
      fill = el('span', { className: 'vote-fill' });
      button.prepend(fill);
    }
    if (!badge) {
      badge = el('span', { className: 'vote-pct-badge', attrs: { 'aria-hidden': 'true' } });
      badge.hidden = true;
      button.append(badge);
    }
    const share = total > 0 ? counts[index] / total : 0;
    setScale(fill, share);
    fill.classList.toggle('is-leading', total > 0 && max > 0 && counts[index] === max);
    badge.textContent = `${Math.round(share * 100)}%`;
    badge.hidden = total === 0;
  });
}

// ============================================================
// Setup screen
// ============================================================

function renderPlayerNameInputs(count) {
  const wrap = $('#playerNameInputs');
  wrap.replaceChildren();
  for (let i = 0; i < count; i++) {
    const input = el('input', { className: 'input', attrs: {
      type: 'text', id: `playerNameInput${i}`, maxlength: '20', placeholder: `Player ${i + 1} name`,
      'aria-label': `Player ${i + 1} name`, autocomplete: 'off',
    } });
    wrap.append(input);
  }
}

const checkedValue = (name) => $(`input[name="${name}"]:checked`).value;

/** Wires the setup form. Called once at start-up. */
function bindSetup() {
  renderPlayerNameInputs(2);
  $('#playerCountSelect').addEventListener('change', (event) => renderPlayerNameInputs(parseInt(event.target.value, 10)));

  $$('#setupForm .chip input').forEach((input) => input.addEventListener('change', () => {
    SoundFX.click();
    if (input.name === 'category') $('#categoryHint').textContent = CATEGORY_HINTS[input.value] || '';
  }));

  $('#setupForm').addEventListener('submit', (event) => {
    event.preventDefault();
    startGame();
  });
}

/** Resets the setup form to its defaults (used when the host opens it fresh). */
export function resetSetupForm() {
  $('#playerCountSelect').value = '2';
  renderPlayerNameInputs(2);
}

async function startGame() {
  const button = $('#startGameBtn');
  setBusy(button, true);
  try {
    let bank;
    try {
      bank = await loadQuestions();
    } catch {
      toast('The questions could not be loaded. Check your internet connection and try again.', { tone: 'error' });
      return;
    }
    if (!bank.some((q) => (q.category || 'bible') === checkedValue('category'))) {
      toast('There are no questions in that category yet.', { tone: 'error' });
      return;
    }

    const count = parseInt($('#playerCountSelect').value, 10);
    game.players = Array.from({ length: count }, (_, i) => ({
      name: $(`#playerNameInput${i}`).value.trim() || `Player ${i + 1}`,
      score: 0, correct: 0, wrong: 0,
      // Once a lifeline is used it stays used for the rest of the game, for that player only
      lifelinesUsed: { fiftyFifty: false, phoneAFriend: false, askAudience: false },
    }));
    game.questionsPerPlayer = parseInt(checkedValue('perPlayer'), 10);
    game.category = checkedValue('category');
    game.turnOrder = [];
    for (let q = 0; q < game.questionsPerPlayer; q++) {
      for (let p = 0; p < count; p++) game.turnOrder.push(p);
    }
    game.turnIndex = 0;
    game.usedQuestionIds = new Set();
    game.roomId = null;
    $('#roomBadge').hidden = true;

    // Open an online room for audience voting, if Firebase is set up
    if (ONLINE_ENABLED) {
      try {
        game.roomId = await createRoom({
          players: game.players,
          questionsPerPlayer: game.questionsPerPlayer,
          activePlayerIndex: game.turnOrder[0],
        });
        const badge = $('#roomBadge');
        badge.textContent = `Room ${game.roomId}`;
        badge.setAttribute('aria-label', `Room code ${game.roomId.split('').join(' ')}`);
        badge.hidden = false;
      } catch (error) {
        console.error('Room setup failed:', error);
        toast(`Playing without audience voting. ${describeError(error)}`, { tone: 'warning', duration: 9000 });
      }
    }

    showScreen('screen-host-game');
    keepAwake(true);
    loadNextQuestion();
    if (game.roomId) announce(`Game started. Room code ${game.roomId.split('').join(' ')}.`);
  } finally {
    setBusy(button, false);
  }
}

// ============================================================
// Turns and questions
// ============================================================

/** Shuffles a question's options and fixes correctIndex to match (the bank always lists the right answer first). */
function shuffleOptions(question) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...question,
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correctIndex),
  };
}

function loadNextQuestion() {
  endAskAudience(); // never carry a voting round into the next question

  const inCategory = (q) => (q.category || 'bible') === game.category;
  let pool = questionBank.filter((q) => inCategory(q) && !game.usedQuestionIds.has(q.id));
  if (pool.length === 0) {
    game.usedQuestionIds.clear();
    pool = questionBank.filter(inCategory);
  }
  const picked = pool[Math.floor(Math.random() * pool.length)];
  game.usedQuestionIds.add(picked.id);
  game.currentQuestion = shuffleOptions(picked);
  game.selectedOptionIndex = null;
  game.answered = false;

  const stage = $('#quizStage');
  const sweep = $('#stageSweep');
  const reveal = () => {
    renderHostScreen();
    syncRoomQuestion();
    stage.classList.remove('stage-out');
    stage.classList.add('stage-in');
  };
  // A light sweep and a quick dip, so the next question arrives with a beat of drama
  if (game.turnIndex > 0 || stage.classList.contains('stage-in')) {
    stage.classList.remove('stage-in');
    stage.classList.add('stage-out');
    sweep.classList.remove('sweep-active');
    void sweep.offsetWidth;
    sweep.classList.add('sweep-active');
    setTimeout(reveal, 260);
  } else {
    reveal();
  }
}

function renderHostScreen() {
  const player = currentPlayer();
  $('#activePlayerLabel').textContent = `${player.name}’s turn`;
  $('#roundLabel').textContent = `Question ${game.turnIndex + 1} of ${game.turnOrder.length}`;
  $('#questionText').textContent = game.currentQuestion.question;

  const grid = $('#optionsGrid');
  grid.replaceChildren();
  game.currentQuestion.options.forEach((text, index) => {
    const button = createOptionBar(index, text);
    button.addEventListener('click', () => selectOption(index, button));
    grid.append(button);
  });

  $('#submitAnswerBtn').disabled = true;
  $('#submitAnswerBtn').hidden = false;
  $('#passBtn').hidden = false;
  $('#nextTurnBtn').hidden = true;
  $('#explanationText').hidden = true;
  $('#audienceResultsPanel').hidden = true;

  // Lifeline buttons follow the ACTIVE player's own history
  const used = player.lifelinesUsed;
  $('#lifeline5050').disabled = used.fiftyFifty;
  $('#lifelinePhone').disabled = used.phoneAFriend;
  const audienceButton = $('#lifelineAudience');
  audienceButton.disabled = used.askAudience || !roomIsLive();
  audienceButton.title = roomIsLive() ? '' : 'Audience voting needs an online room (not available right now).';
}

function selectOption(index, button) {
  if (game.answered) return;
  $$('#optionsGrid .option-btn').forEach((b) => b.classList.remove('selected'));
  button.classList.add('selected');
  game.selectedOptionIndex = index;
  $('#submitAnswerBtn').disabled = false;
  SoundFX.click();
}

function revealAnswer(chosenIndex) {
  endAskAudience();
  const correct = game.currentQuestion.correctIndex;
  $$('#optionsGrid .option-btn').forEach((button) => {
    button.disabled = true;
    const index = parseInt(button.dataset.idx, 10);
    if (index === correct) {
      button.classList.add('correct-flash');
      button.append(el('span', { className: 'option-result-icon', attrs: { title: 'Correct answer' } }, icon('check')));
    } else if (index === chosenIndex) {
      button.classList.add('wrong-flash');
      button.append(el('span', { className: 'option-result-icon', attrs: { title: 'Your answer' } }, icon('x')));
    }
  });
  const explanation = $('#explanationText');
  explanation.textContent = game.currentQuestion.explanation;
  explanation.hidden = false;
  $('#submitAnswerBtn').hidden = true;
  $('#passBtn').hidden = true;
  const next = $('#nextTurnBtn');
  next.hidden = false;
  next.focus({ preventScroll: true });
  game.answered = true;
}

function submitAnswer() {
  if (game.selectedOptionIndex === null || game.answered) return;
  const player = currentPlayer();
  if (game.selectedOptionIndex === game.currentQuestion.correctIndex) {
    player.score += POINTS_CORRECT;
    player.correct += 1;
    SoundFX.correct();
    spawnConfetti(16);
    showScorePopup(POINTS_CORRECT, player.score, `Correct, ${player.name}!`);
  } else {
    player.score += POINTS_WRONG;
    player.wrong += 1;
    SoundFX.wrong();
    showScorePopup(POINTS_WRONG, player.score, `Not quite, ${player.name}.`);
  }
  revealAnswer(game.selectedOptionIndex);
  syncRoomPlayers();
}

function passTurn() {
  if (game.answered) return;
  SoundFX.click();
  const player = currentPlayer();
  showScorePopup(0, player.score, `${player.name} passed`);
  revealAnswer(-1);
}

function nextTurn() {
  SoundFX.turnChange();
  game.turnIndex += 1;
  if (game.turnIndex >= game.turnOrder.length) endGame();
  else loadNextQuestion();
}

// ============================================================
// Lifelines
// ============================================================

function useFiftyFifty() {
  const player = currentPlayer();
  if (player.lifelinesUsed.fiftyFifty || game.answered) return;
  player.lifelinesUsed.fiftyFifty = true;
  $('#lifeline5050').disabled = true;
  SoundFX.lifeline();

  const wrong = [0, 1, 2, 3].filter((i) => i !== game.currentQuestion.correctIndex);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  const removed = wrong.slice(0, 2);
  $$('#optionsGrid .option-btn').forEach((button) => {
    if (removed.includes(parseInt(button.dataset.idx, 10))) {
      button.classList.add('disabled-5050');
      button.disabled = true;
    }
  });
  if (game.selectedOptionIndex !== null && removed.includes(game.selectedOptionIndex)) {
    game.selectedOptionIndex = null;
    $('#submitAnswerBtn').disabled = true;
  }
  announce('50:50 used. Two wrong answers removed.');
}

function usePhoneAFriend() {
  const player = currentPlayer();
  if (player.lifelinesUsed.phoneAFriend || game.answered) return;
  player.lifelinesUsed.phoneAFriend = true;
  $('#lifelinePhone').disabled = true;
  SoundFX.lifeline();

  const dialog = $('#phoneDialog');
  const count = $('#phoneCountdown');
  const bar = $('#phoneTimerBar');
  const done = $('#phoneDoneBtn');
  let remaining = PHONE_FRIEND_SECONDS;
  count.textContent = String(remaining);
  setScale(bar, 1);

  const finish = () => {
    clearInterval(tick);
    done.removeEventListener('click', onDone);
    dialog.removeEventListener('close', finish);
    if (dialog.open) dialog.close();
  };
  const onDone = () => finish();
  const tick = setInterval(() => {
    remaining -= 1;
    count.textContent = String(Math.max(0, remaining));
    setScale(bar, remaining / PHONE_FRIEND_SECONDS);
    if (remaining <= 5 && remaining > 0) SoundFX.timerUrgent();
    if (remaining <= 0) finish();
  }, 1000);
  done.addEventListener('click', onDone);
  dialog.addEventListener('close', finish);
  dialog.showModal();
  announce(`Phone a Friend. ${PHONE_FRIEND_SECONDS} seconds.`);
}

async function useAskAudience() {
  const player = currentPlayer();
  if (player.lifelinesUsed.askAudience || game.answered || !roomIsLive()) return;
  player.lifelinesUsed.askAudience = true;
  $('#lifelineAudience').disabled = true;
  SoundFX.lifeline();

  const panel = $('#audienceResultsPanel');
  panel.hidden = false;
  $('#audienceBars').replaceChildren(el('p', { className: 'audience-empty', text: 'Votes are coming in from the audience…' }));

  try {
    const endsAt = await openVoting(game.roomId, ASK_AUDIENCE_SECONDS);
    game.ask.active = true;
    game.ask.unwatch = await watchVotes(game.roomId, (votes) => {
      renderAudienceBars(votes);
      applyVoteFill('#optionsGrid', voteCounts(votes));
    });

    const paint = () => {
      const left = Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
      $('#hostAskTimer').textContent = `${left}s`;
      setScale($('#hostAskTimerBar'), left / ASK_AUDIENCE_SECONDS);
      if (left <= 0) endAskAudience({ keepResults: true });
    };
    paint();
    game.ask.timer = setInterval(paint, 500);
    announce('Ask the Audience is open for 20 seconds.');
  } catch (error) {
    console.error('Ask the Audience failed:', error);
    player.lifelinesUsed.askAudience = false; // give it back: it never ran
    $('#lifelineAudience').disabled = false;
    panel.hidden = true;
    toast(describeError(error), { tone: 'error' });
  }
}

/**
 * Closes a voting round, whether the timer ran out or the host moved on first.
 * keepResults leaves the final bars on screen after the timer ends.
 */
function endAskAudience({ keepResults = false } = {}) {
  if (game.ask.timer) { clearInterval(game.ask.timer); game.ask.timer = null; }
  if (game.ask.unwatch) { game.ask.unwatch(); game.ask.unwatch = null; }
  const wasActive = game.ask.active;
  game.ask.active = false;
  if (!keepResults) $('#audienceResultsPanel').hidden = true;
  if (wasActive && roomIsLive()) closeVoting(game.roomId);
}

/** Vertical bar graph: one upright bar per option, growing to its share of the votes. */
function renderAudienceBars(votes) {
  const counts = voteCounts(votes);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const bars = $('#audienceBars');
  bars.className = 'audience-bars audience-bars-vertical';
  bars.replaceChildren();
  OPTION_META.forEach((meta, i) => {
    const share = total ? counts[i] / total : 0;
    const fill = el('span', { className: `audience-vbar-fill${counts[i] === max && counts[i] > 0 ? ' is-leading' : ''}` });
    const column = el('div', { className: `audience-vbar-col ${meta.cls}`, attrs: { role: 'img', 'aria-label': `${meta.label}: ${Math.round(share * 100)} percent` } },
      el('span', { className: 'audience-vbar-pct', text: `${Math.round(share * 100)}%` }),
      el('span', { className: 'audience-vbar-track' }, fill),
      el('span', { className: 'audience-vbar-label', text: meta.label }));
    bars.append(column);
    requestAnimationFrame(() => setScale(fill, share, 'y'));
  });
}

// ============================================================
// Room sync (host to audience)
// ============================================================

function syncRoomQuestion() {
  if (!roomIsLive()) return;
  pushQuestion(game.roomId, {
    activePlayerIndex: game.turnOrder[game.turnIndex],
    playerName: currentPlayer().name,
    question: game.currentQuestion,
    questionNumber: game.turnIndex + 1,
    totalQuestions: game.turnOrder.length,
  });
}

function syncRoomPlayers() {
  if (roomIsLive()) pushPlayers(game.roomId, game.players);
}

// ============================================================
// Game over, rematch, restart
// ============================================================

function endGame() {
  if (roomIsLive()) setGameState(game.roomId, 'GAMEOVER');
  keepAwake(false);
  renderGameOver();
  showScreen('screen-gameover');
  SoundFX.fanfare();
  spawnConfetti(90);
  setTimeout(() => SoundFX.applause(), 700);
  const winner = [...game.players].sort((a, b) => b.score - a.score)[0];
  announce(`Game over. ${winner.name} wins with ${winner.score} points.`);
}

function renderGameOver() {
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const list = $('#leaderboardTable');
  list.replaceChildren();
  ranked.forEach((player, i) => {
    const scoreEl = el('span', { className: 'leaderboard-score', text: '0 pts' });
    const rank = el('span', { className: 'leaderboard-rank' });
    if (i === 0) { rank.append(icon('crown')); rank.setAttribute('aria-label', 'First place'); }
    else rank.textContent = `#${i + 1}`;
    list.append(el('li', { className: `leaderboard-row${i === 0 ? ' is-winner' : ''}` },
      rank, el('span', { className: 'leaderboard-name', text: player.name }), scoreEl));

    // Count up from zero: a small touch that makes the ranking feel alive
    const start = performance.now();
    const target = player.score;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 800);
      scoreEl.textContent = `${Math.round(target * t).toString().replace('-', '−')} pts`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Shared by "Rematch" and "Restart game": same players, scores and lifelines reset. */
function restartGame() {
  endAskAudience();
  game.players.forEach((p) => {
    p.score = 0; p.correct = 0; p.wrong = 0;
    p.lifelinesUsed = { fiftyFifty: false, phoneAFriend: false, askAudience: false };
  });
  game.turnIndex = 0;
  game.usedQuestionIds = new Set();
  if (roomIsLive()) { setGameState(game.roomId, 'PLAYING'); syncRoomPlayers(); }
  showScreen('screen-host-game');
  keepAwake(true);
  loadNextQuestion();
}

/** Tears down the host session (used by the home button and "New game"). */
export function leaveHost() {
  endAskAudience();
  keepAwake(false);
  if (roomIsLive()) setGameState(game.roomId, 'ENDED');
  game.roomId = null;
  $('#roomBadge').hidden = true;
}

// ============================================================
// Keyboard shortcuts for the host (A–D or 1–4 choose, Enter submits, N is next)
// ============================================================

function onKeydown(event) {
  if ($('#screen-host-game').hidden || isDialogOpen()) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  const key = event.key.toLowerCase();
  const letter = 'abcd'.indexOf(key);
  const digit = '1234'.indexOf(key);
  const index = letter >= 0 ? letter : digit;
  if (index >= 0 && !game.answered) {
    const button = $(`#optionsGrid .option-btn[data-idx="${index}"]`);
    if (button && !button.disabled) { event.preventDefault(); selectOption(index, button); }
  } else if (key === 'enter' && event.target === document.body && !game.answered) {
    event.preventDefault();
    submitAnswer();
  } else if (key === 'n' && game.answered) {
    event.preventDefault();
    nextTurn();
  }
}

// ============================================================
// Start-up
// ============================================================

export function initHost() {
  bindSetup();
  $('#submitAnswerBtn').addEventListener('click', submitAnswer);
  $('#passBtn').addEventListener('click', passTurn);
  $('#nextTurnBtn').addEventListener('click', nextTurn);
  $('#lifeline5050').addEventListener('click', useFiftyFifty);
  $('#lifelinePhone').addEventListener('click', usePhoneAFriend);
  $('#lifelineAudience').addEventListener('click', useAskAudience);
  $('#rematchBtn').addEventListener('click', restartGame);
  $('#restartMidGameBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Restart the game?',
      message: 'Everyone’s score and lifelines will reset, and the game starts again from question 1.',
      confirmLabel: 'Restart', danger: true,
    });
    if (!ok) return;
    SoundFX.click();
    restartGame();
  });
  document.addEventListener('keydown', onKeydown);
}

