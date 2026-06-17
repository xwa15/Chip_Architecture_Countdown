# Chip & Architecture Conference Countdown

A static conference deadline tracker for chip/circuit and computer architecture venues.

## How to run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

## How to add a conference

Edit `data/conferences.json` and append a new object. The page reads all data from JSON, so no HTML changes are needed.

Required fields:

- `id`: stable unique ID, e.g. `dac-2027`
- `name`, `year`, `fullName`
- `area`: e.g. `circuits`, `architecture`, `architecture/systems`
- `location`, `conferenceStart`, `conferenceEnd`, `timezone`
- `deadlines`: list of deadline objects with `type`, `label`, `datetime`, and `displayTime`
- `sources`: official CFP/homepage URLs
- `watch`: keywords used by the GitHub Actions watcher

Use UTC ISO strings for `datetime`. For AoE deadlines, use the next day at `11:59:00Z` for 23:59 AoE.

## Dynamic tracking

The frontend is static and reliable. Dynamic tracking is handled by GitHub Actions:

1. `scripts/check_dates.py` fetches each official source URL.
2. It normalizes the page text and records a fingerprint in `data/snapshots.json`.
3. If a page changes, the workflow opens a GitHub issue asking you to verify the date.
4. After verification, edit `data/conferences.json`.

This avoids silently trusting brittle scraping logic.

GitHub Pages test.
