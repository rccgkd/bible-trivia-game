// Runs before the page paints, so the right theme is on screen from the very first frame.
// Order of preference: the visitor's saved choice, then the device setting, then light.
(function () {
  try {
    var saved = localStorage.getItem('kq-theme');
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved === 'light' || saved === 'dark' ? saved : dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#060f24' : '#ffffff');
  } catch (e) {
    /* Storage can be blocked (private mode). The CSS falls back to the device setting. */
  }
})();
