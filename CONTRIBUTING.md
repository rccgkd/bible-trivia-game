# Contributing

Thank you for helping improve Kingdom Quiz. You do not need any special tools: everything below can be done on the GitHub website.

## Report a problem or suggest an idea

1. Go to the [Issues tab](https://github.com/rccgkd/bible-trivia-game/issues/new/choose).
2. Pick the template that fits and fill it in. Say which device and browser you were using if something did not work.

## Fix or add a question

All questions live in [`js/questions.js`](js/questions.js). Each one looks like this:

```js
{ id: 751, question: "Who built the ark?", options: ["Noah", "Moses", "Abraham", "Elijah"], correctIndex: 0, explanation: "Genesis 6:22 — ..." },
```

- `options` lists four answers and the **correct one always goes first**. The game shuffles them on screen.
- `correctIndex` is always `0`.
- `id` must be a number nobody else uses. Use the next number after the highest one.
- Add `category: "history"` for Church History questions. Leave it out for Bible questions.
- Bible explanations quote the King James Version. Church History explanations are short and factual.

To edit: open the file on GitHub, click the pencil icon, make your change, then choose **Create a new branch for this commit and start a pull request**.

Every pull request is checked automatically. The check validates all questions, so a typo in the format is caught before anything is published.

## Work on the code

Developers who want to run the site on their own machine need Node.js 22 or newer:

```sh
node scripts/lint.mjs       # syntax and JSON checks
node scripts/build.mjs      # validates questions and writes the site to dist/
python3 -m http.server -d dist 8000
```

The project has no dependencies to install. Keep changes small, keep styles in the design tokens (`css/tokens.css`), and avoid inline `style` attributes: the site's Content Security Policy blocks them.
