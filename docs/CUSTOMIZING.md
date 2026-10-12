# Customizing the site

Every change below is made on github.com: open the file, click the pencil icon, edit, then press **Commit changes**. The site updates in about a minute (see [DEPLOYMENT.md](DEPLOYMENT.md)).

| I want to change… | Open this file |
|---|---|
| Colors | `css/tokens.css` |
| Fonts | `css/tokens.css` and `assets/fonts/` |
| Page text (titles, instructions, buttons) | `index.html` |
| The questions | `js/questions.js` |
| The logo and browser icon | `favicon.svg` and `assets/icons/` |
| The preview image shown when the link is shared | `assets/og-image.png` |
| The website address | `site.json` |
| The online room connection | `js/firebase-config.js` |

## Colors

Open `css/tokens.css`. The top section lists the raw palette, and the **Themes** section further down assigns colors to jobs. Change a hex value and every screen follows.

- The four answer colors are `--opt-a` (red), `--opt-b` (blue), `--opt-c` (gold) and `--opt-d` (green).
- `--primary` is the main button color. `--accent` is the gold used for highlights.
- Light theme values are under `:root`; dark theme values are under `:root[data-theme="dark"]`. If you change one theme, check the other.
- Keep text readable: dark text on light colors and white text on dark colors. A free contrast checker such as [webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/) helps. Aim for at least 4.5.

## Text

Open `index.html`. Each screen is a `<section>` with a comment above it, such as `SCREEN: HOST SETUP`. Change the words between the tags and leave the tags and `id="..."` names alone, because the game looks for those names.

## Questions

Open `js/questions.js` and see the format in [CONTRIBUTING.md](CONTRIBUTING.md). The most common mistakes are a missing comma at the end of a line, a missing quote mark, or the correct answer not being listed first. The automatic check names the exact question if something is wrong, so a mistake cannot reach the live site.

## Fonts

The site uses Bricolage Grotesque (headlines) and Instrument Sans (everything else), stored in `assets/fonts/`. To use a different font, upload its `.woff` or `.woff2` files to that folder (Add file > Upload files), then edit the `@font-face` block and `--font-display` or `--font-body` in `css/tokens.css`. Use only fonts whose license allows websites, and keep the license file beside them.

## Images and icons

- Replace `favicon.svg` for the browser tab icon.
- Replace the four PNG files in `assets/icons/` (192 px, 512 px, a 512 px maskable version with extra padding, and a 180 px Apple icon) for home-screen icons.
- Replace `assets/og-image.png` (1200 × 630 px) for the picture shown when someone shares the link.

Keep the same file names so nothing else needs editing.

## Website address

`site.json` holds the one place the address is written. It must start with `https://` and end with a `/`. It is used for search results and link previews. Change it only if you add a custom domain.
