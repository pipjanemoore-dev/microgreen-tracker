# Microgreen Tracker

A personal web app for tracking microgreen trays from sowing to harvest. It counts down to each stage, but a tray only moves when you say it's ready.

## Run it

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Run this from the project folder, then open http://localhost:4173.

## Your data

Grows are saved in the browser you use, and only there. A different browser, device or web address starts empty, so use the same address each time. Download a backup from Settings now and then, and use Restore to move your grows elsewhere.

## Tests

```bash
node --test
```

## Files

- `logic.js`: the grow rules, with no browser code
- `app.js`: screens and buttons
- `test/logic.test.js`: tests for the rules

The readiness cues and water amounts are converted to metric from [On The Grow](https://onthegrow.net/)'s guides. Water amounts are starting points you can change in Settings.
