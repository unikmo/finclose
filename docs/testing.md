# Running the tests

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | 116 unit, property and fuzz tests (about 4 seconds) | Node only |
| `FUZZ_ITERATIONS=30000 npm test` | the same, with the fuzz tests 20 times deeper (about 30 seconds more) | Node only |
| `npm run test:emulator` | 26 tests against the Firestore, Realtime Database, Auth and Storage emulators | Java 21 on the path; no real Firebase project is touched |
| `npm run test:browser` | 9 end-to-end tests of `/packs` in a real Chrome or Edge, against a local copy of the app in LAB mode (takes about a minute: it starts the app) | Google Chrome or Microsoft Edge installed; `playwright-core` (dev dependency) |

## What the fuzz tests do
Seeded random inputs, so a failure prints its seed and iteration and can be repeated. They check that amounts and dates round-trip in every format they generate, that no input makes the statement parser crash or produce an invalid transaction, that a pack's hash is stable and changes when the data does, that the proposed journal always adds up, and that text from a bank can never start a spreadsheet formula in the exported files. I checked they can fail: breaking the trailing-minus rule and breaking the formula guard each made them fail.

## What the browser test does
It creates a pack from a statement, checks the issues list and questions, saves an owner's answer, corrects a category and reloads to see it came back from storage, downloads the journal, edits account numbers (a clashing number is refused), checks every control has a name, checks there is no sideways scrolling at phone width, and erases the company's data (typing the ID is required). It also fails on any script or console error.

## What none of this covers
Real bank files, real Firebase (sign-in, rules, TTL, indexes), receipt uploads in the browser, a screen reader, a real phone, real-data mode.
