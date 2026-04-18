# Waypoint Planner

A browser-based drone mapping mission planner. No backend, no build step — just open `index.html`.

## Quick Start

```
# Option 1 — open directly (most browsers block fetch() on file:// for JSON)
# Use a local server instead:

npx serve .
# or
python -m http.server 8080
# then open http://localhost:8080
```

> **Note:** Chrome/Edge block `fetch()` on `file://` URLs due to CORS policy. Firefox may work
> directly but a local server is recommended for reliability.

## Features

- **Satellite & street map** with location search (Nominatim / OpenStreetMap)
- **Draw a polygon** boundary, edit vertices, or clear and redraw
- **Lawnmower (bidi) flight line generation** clipped to polygon with 5 m overshoot
- **Drone profiles** — DJI Mini 4 Pro & DJI Air 3S (sensor specs stored in `drone-profiles.json`)
- **Imperial / Metric toggle** — all inputs and stats update instantly; preference saved to localStorage
- **Live stats** — GSD, area, photo count, flight lines, estimated flight time, spacing, trigger interval
- **DJI WPML KMZ export** — produces a `wpmz/template.kml` + `wpmz/waylines.wpml` zip that DJI Fly
  accepts; auto-splits into multiple files if waypoints exceed the 65 535 DJI limit
- **Project manager** — up to 20 named projects saved to localStorage with load / duplicate / delete

## File Structure

```
waypoint-planner/
  index.html          Main app shell
  style.css           Dark-theme CSS
  app.js              All application logic (vanilla JS)
  drone-profiles.json Drone sensor specs
  README.md           This file
```

## Adding Drone Profiles

Edit `drone-profiles.json` and add an entry following this schema:

```json
"my-drone-id": {
  "name": "My Drone",
  "focalLength": 24,        // mm (35mm equiv)
  "sensorWidth": 9.6,       // mm
  "sensorHeight": 7.2,      // mm
  "imageWidth": 8064,       // px
  "imageHeight": 6048,      // px
  "droneEnumValue": 67,     // DJI WPML enum
  "droneSubEnumValue": 0
}
```

## Pushing to GitHub

```bash
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/waypoint-planner.git
git branch -M main
git push -u origin main
```

## GSD Formula

```
GSD (cm/px) = (sensorWidth_mm × altitude_m × 100) / (focalLength_mm × imageWidth_px)
```
