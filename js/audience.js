// ============================================================
// audience.js: the phone view (join a room, follow along, vote)
// ============================================================

import { $, $$, setScale } from './dom.js';
import { SoundFX } from './sounds.js';
import { showScreen, toast, setBusy, keepAwake } from './ui.js';
import { roomExists, watchRoom, castVote, describeError, serverNow } from './room.js';
import { createOptionBar, applyVoteFill, voteCounts } from './game.js';

const VOTE_SECONDS = 20;

const view = {
  roomId: null,
  unwatch: null,
  roundKey: null,        // the voting round (its end time) already drawn on this phone
  hasVoted: false,
  countdown: null,
};

function showJoinError(message) {
  const error = $('#joinError');
  error.textContent = message;
  error.hidden = false;
}

async function joinRoom(event) {
  event.preventDefault();
  const code = $('#roomCodeInput').value.trim().toUpperCase();
  $('#joinError').hidden = true;
  if (code.length !== 4) {
    showJoinError('Room codes have 4 characters. Check the code on the host’s screen.');
    return;
  }

  const button = $('#joinRoomBtn');
  setBusy(button, true);
  try {
    if (!(await roomExists(code))) {
      showJoinError('Room not found. Double-check the code and try again.');
      return;
    }
    view.roomId = code;
    const badge = $('#roomBadge');
    badge.textContent = `Room ${code}`;
    badge.setAttribute('aria-label', `Room code ${code.split('').join(' ')}`);
    badge.hidden = false;
    resetView();
    showScreen('screen-audience-view');
    keepAwake(true);
    view.unwatch = await watchRoom(code, (data) => render(data, code), (error) => {
      console.error('Room connection lost:', error);
      toast('Lost the connection to the room. Check your internet connection.', { tone: 'error' });
    });
  } catch (error) {
    console.error('Join room failed:', error);
    showJoinError(describeError(error));
  } finally {
    setBusy(button, false);
  }
}

function resetView() {
  view.roundKey = null;
  view.hasVoted = false;
  $('#audienceActivePlayer').textContent = 'Waiting for host…';
  $('#audienceQuestionText').textContent = 'The game will begin shortly.';
  $('#audienceWaitingText').textContent = 'Watching the host’s screen…';
  $('#audienceWaiting').hidden = false;
  $('#audienceVotingPanel').hidden = true;
}

function render(data, roomId) {
  if (data.gameState === 'GAMEOVER' || data.gameState === 'ENDED') {
    stopCountdown();
    $('#audienceActivePlayer').textContent = data.gameState === 'GAMEOVER' ? 'Game over' : 'Session ended';
    $('#audienceQuestionText').textContent = data.gameState === 'GAMEOVER'
      ? 'Thanks for playing along!'
      : 'The host has ended this session.';
    $('#audienceWaitingText').textContent = 'You can use the home button to leave.';
    $('#audienceWaiting').hidden = false;
    $('#audienceVotingPanel').hidden = true;
    return;
  }

  const active = data.players && data.players[data.activePlayerIndex];
  $('#audienceActivePlayer').textContent = `${(active && active.name) || 'A player'}’s turn`;
  $('#audienceQuestionText').textContent = data.currentQuestion ? data.currentQuestion.text : 'The game will begin shortly.';
  $('#audienceWaitingText').textContent = 'Watching the host’s screen…';

  const ask = data.lifelines && data.lifelines.askAudience;
  if (ask && ask.status === 'ACTIVE' && data.currentQuestion) {
    $('#audienceWaiting').hidden = true;
    $('#audienceVotingPanel').hidden = false;
    // Every vote re-sends the room. Only rebuild the buttons for a NEW round,
    // so a phone that has already voted keeps showing "vote recorded".
    if (ask.timerEndsAt !== view.roundKey) {
      view.roundKey = ask.timerEndsAt;
      view.hasVoted = false;
      $('#audienceVoteConfirm').hidden = true;
      renderOptions(data.currentQuestion.options, roomId, ask.timerEndsAt);
    }
    applyVoteFill('#audienceOptionsGrid', voteCounts(ask.votes));
  } else {
    stopCountdown();
    $('#audienceVotingPanel').hidden = true;
    $('#audienceWaiting').hidden = false;
    view.roundKey = null;
  }
}

function renderOptions(options, roomId, endsAt) {
  const grid = $('#audienceOptionsGrid');
  grid.replaceChildren();
  options.forEach((text, index) => {
    const button = createOptionBar(index, text);
    button.addEventListener('click', async () => {
      if (view.hasVoted) return;
      view.hasVoted = true;
      SoundFX.click();
      $$('#audienceOptionsGrid .option-btn').forEach((b) => { b.disabled = true; });
      button.classList.add('selected');
      try {
        await castVote(roomId, index);
        $('#audienceVoteConfirm').hidden = false;
        if (navigator.vibrate) navigator.vibrate(30);
      } catch (error) {
        // The vote did not go through: let this person try again
        console.error('Vote failed:', error);
        view.hasVoted = false;
        $$('#audienceOptionsGrid .option-btn').forEach((b) => { b.disabled = false; });
        button.classList.remove('selected');
        toast(`Your vote did not go through. ${describeError(error)}`, { tone: 'error' });
      }
    });
    grid.append(button);
  });

  stopCountdown();
  setScale($('#audienceTimerBar'), 1);
  const paint = () => {
    const left = Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
    $('#audienceTimer').textContent = left > 0 ? `${left}s to vote` : 'Time’s up!';
    setScale($('#audienceTimerBar'), left / VOTE_SECONDS);
    if (left <= 0) stopCountdown();
  };
  paint();
  view.countdown = setInterval(paint, 500);
}

function stopCountdown() {
  if (view.countdown) { clearInterval(view.countdown); view.countdown = null; }
}

/** Leaves the room and clears everything this phone was listening to. */
export function leaveAudience() {
  stopCountdown();
  if (view.unwatch) { view.unwatch(); view.unwatch = null; }
  view.roomId = null;
  keepAwake(false);
  $('#roomBadge').hidden = true;
}

export function initAudience() {
  $('#joinForm').addEventListener('submit', joinRoom);
  $('#roomCodeInput').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    $('#joinError').hidden = true;
  });
}
