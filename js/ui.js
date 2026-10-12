// ============================================================
// ui.js: everything the interface does that is not game logic
// screens, announcements, toasts, dialogs, confetti, theme, header
// ============================================================

import { $, $$, el, icon, prefersReducedMotion, storage } from './dom.js';

// ---------- Screens ----------
const GAME_SCREENS = new Set(['screen-host-game', 'screen-audience-view']);

const SCREEN_TITLES = {
  'screen-role': 'Kingdom Quiz — Bible Trivia Night',
  'screen-rules': 'How to play — Kingdom Quiz',
  'screen-audience-tutorial': 'Joining as audience — Kingdom Quiz',
  'screen-host-setup': 'Set up your game — Kingdom Quiz',
  'screen-host-game': 'Game in progress — Kingdom Quiz',
  'screen-audience-join': 'Join a room — Kingdom Quiz',
  'screen-audience-view': 'Following the game — Kingdom Quiz',
  'screen-gameover': 'Game over — Kingdom Quiz',
};

/**
 * Shows one screen and hides the rest. Moves keyboard and screen-reader focus to the
 * new screen's heading, and cross-fades where the browser supports View Transitions.
 */
export function showScreen(id, { focus = true } = {}) {
  const swap = () => {
    const next = document.getElementById(id);
    $$('.screen').forEach((screen) => { screen.hidden = screen !== next; });
    $('#homeBtn').hidden = !GAME_SCREENS.has(id);
    document.title = SCREEN_TITLES[id] || SCREEN_TITLES['screen-role'];
    window.scrollTo(0, 0);
    if (focus) next.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
  };
  if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
    document.startViewTransition(swap);
  } else {
    swap();
    const next = document.getElementById(id);
    next.classList.remove('is-entering');
    void next.offsetWidth; // restart the CSS entrance animation
    next.classList.add('is-entering');
  }
}

// ---------- Screen-reader announcements ----------
export function announce(message) {
  const region = $('#live');
  region.textContent = '';
  // A short delay makes screen readers treat repeated messages as new
  setTimeout(() => { region.textContent = message; }, 40);
}

// ---------- Buttons ----------
/** Shows a spinner inside a button and blocks double clicks. */
export function setBusy(button, busy) {
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  button.disabled = busy;
}

// ---------- Toasts ----------
const TOAST_ICONS = { info: 'info', success: 'check', warning: 'alert', error: 'alert' };

export function toast(message, { tone = 'info', duration = 6000 } = {}) {
  const box = $('#toasts');
  while (box.children.length >= 3) box.firstElementChild.remove();

  const item = el('div', { className: `toast toast-${tone}` }, icon(TOAST_ICONS[tone] || 'info'), el('span', { text: message }));
  if (tone === 'error') item.setAttribute('role', 'alert');
  box.append(item);

  const dismiss = () => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 240);
  };
  item.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
  return dismiss;
}

// ---------- Confirm dialog ----------
/** A styled replacement for window.confirm. Resolves to true or false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const dialog = $('#confirmDialog');
  const ok = $('#confirmOk');
  const cancel = $('#confirmCancel');
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = message;
  ok.textContent = confirmLabel;
  cancel.textContent = cancelLabel;
  ok.classList.toggle('btn-danger', danger);
  ok.classList.toggle('btn-primary', !danger);

  return new Promise((resolve) => {
    const finish = (value) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onEscape);
      dialog.removeEventListener('click', onBackdrop);
      dialog.close();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onEscape = (event) => { event.preventDefault(); finish(false); };
    const onBackdrop = (event) => { if (event.target === dialog) finish(false); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onEscape);
    dialog.addEventListener('click', onBackdrop);
    dialog.showModal();
    cancel.focus(); // the safe choice is focused first
  });
}

export const isDialogOpen = () => Boolean(document.querySelector('dialog[open]'));

// ---------- Confetti and score pop-up ----------
export function spawnConfetti(count = 50) {
  if (prefersReducedMotion()) return;
  const layer = $('#confettiLayer');
  const colors = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)', 'var(--gold-300)'];
  for (let i = 0; i < count; i++) {
    const piece = el('span', { className: 'confetti-piece' });
    const duration = 2.2 + Math.random() * 1.6;
    const delay = Math.random() * 0.5;
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${duration}s`;
    piece.style.animationDelay = `${delay}s`;
    layer.append(piece);
    setTimeout(() => piece.remove(), (duration + delay) * 1000 + 200);
  }
}

/** Big, brief pop-up after each answer: the points won or lost and the running total. */
export function showScorePopup(delta, total, label) {
  const tone = delta > 0 ? 'is-good' : delta < 0 ? 'is-bad' : 'is-neutral';
  const deltaText = delta > 0 ? `+${delta} pts` : delta < 0 ? `−${Math.abs(delta)} pts` : '0 pts';
  const card = el('div', { className: `score-popup-card ${tone}` },
    el('span', { className: 'score-popup-label', text: label }),
    el('span', { className: 'score-popup-delta', text: deltaText }),
    el('span', { className: 'score-popup-total', text: `Total: ${total} pts` }));
  const popup = el('div', { className: 'score-popup', attrs: { 'aria-hidden': 'true' } }, card);
  document.body.append(popup);
  requestAnimationFrame(() => popup.classList.add('show'));
  setTimeout(() => {
    popup.classList.remove('show');
    setTimeout(() => popup.remove(), 400);
  }, 2600);
  announce(`${label} ${deltaText.replace('−', 'minus ')}. Total ${total} points.`);
}

// ---------- Theme ----------
const THEME_COLORS = { light: '#ffffff', dark: '#060f24' };

export function initTheme() {
  const root = document.documentElement;
  const button = $('#themeBtn');

  const apply = (theme, remember) => {
    root.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
    const next = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.title = `Switch to ${next} theme`;
    if (remember) storage.set('kq-theme', theme);
  };

  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
  button.addEventListener('click', () => apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));

  // Follow the device setting until the visitor makes their own choice
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!storage.get('kq-theme')) apply(event.matches ? 'dark' : 'light', false);
  });
}

// ---------- Header: gets compact once you scroll ----------
export function initHeader() {
  const header = $('#siteHeader');
  let queued = false;
  const update = () => {
    queued = false;
    header.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
  };
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

// ---------- Keep the screen awake during a game ----------
let wakeLock = null;
let wakeWanted = false;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed right now (low battery, background tab): ignore */ }
}

export function keepAwake(on) {
  wakeWanted = on;
  if (on) acquireWakeLock();
  else if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeWanted) acquireWakeLock();
});
