// ============================================================
// dom.js: tiny helpers shared by every module
// ============================================================

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Builds an <svg><use> icon from the sprite in index.html. */
export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/** Creates an element. Text is always inserted as text, never as HTML. */
export function el(tag, { className, text, attrs } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** localStorage that never throws (private mode, blocked storage). */
export const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  },
};

/** Scales an element horizontally or vertically for progress bars (transform only, so it stays smooth). */
export function setScale(node, fraction, axis = 'x') {
  const value = Math.max(0, Math.min(1, fraction));
  node.style.transform = axis === 'y' ? `scaleY(${value})` : `scaleX(${value})`;
}
