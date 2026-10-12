# scripts

Checks that run automatically on every pull request and deployment.

- `lint.mjs` checks JavaScript syntax and JSON files.
- `build.mjs` validates the question bank, writes the publishable site to `dist/`, fills in the site address and verifies that every referenced file exists.

Both use only features built into Node.js.
