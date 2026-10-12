# js

The game, written as ES modules with no build step.

- `app.js` starts the app and connects the screens.
- `game.js` is the host's engine: setup, turns, scoring and lifelines.
- `audience.js` is the phone view for joining a room and voting.
- `room.js` talks to the Firebase Realtime Database, loading Firebase only when a room is needed.
- `ui.js` and `dom.js` hold shared interface helpers: screens, toasts, dialogs, theme and confetti.
- `sounds.js` generates sound effects in the browser.
- `questions.js` is the question bank (750 questions).
- `firebase-config.js` holds the connection details for the Firebase project.
- `theme-init.js` runs before the page paints so the right theme appears immediately.
