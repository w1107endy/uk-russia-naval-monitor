# Russian Naval Activity Monitor — UK Waters

Interactive monitoring dashboard tracking Russian naval incursions near UK and adjacent waters (2023–present).

## Features

- **Map view** — incidents plotted on an interactive Leaflet map with category-coded markers
- **Timeline view** — horizontal chronological timeline of all incidents
- **Live news feed** — auto-fetches relevant headlines from Google News RSS
- **Incident management** — add new incidents manually or promote from news
- **PNG export** — download high-resolution (2x / 3x) images for policy reports
- **Persistent state** — data saved in localStorage across sessions

## Project structure

```
├── index.html              Main dashboard shell
├── css/style.css           All styles
├── js/app.js               Application logic
├── data/incidents.json     Seed incident data (editable)
└── README.md
```

## How to update data

Edit `data/incidents.json` to add, modify, or remove incidents. Each entry:

```json
{
  "id": "UKRUS-2607",
  "date": "2026-07-01",
  "cat": "surface|submarine|intel|infra|escort|coercive",
  "lat": 51.0,
  "lng": 1.3,
  "assets": "Vessel names",
  "area": "Geographic area",
  "response": "UK/allied response",
  "note": "Analytic note",
  "source": "https://..."
}
```

To reset the dashboard to the seed data, clear localStorage: open browser console → `localStorage.clear()` → reload.

## Deployment

Hosted via GitHub Pages. Push to `main` and it auto-deploys.

## Sources

Royal Navy, UK MoD, Reuters, Irish Times.
