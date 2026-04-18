# Waypoint Planner

A lightweight browser-based waypoint planner for drone missions with interactive maps, custom drone profiles, and KMZ export.

---

## Overview

Waypoint Planner is a simple, no-build web app for planning and organizing drone waypoint missions directly in the browser. It allows you to place waypoints, draw routes and areas, measure distances, and export mission data without requiring any backend or installation.

This project is designed to be fast, portable, and easy to run locally.


---

## Quick Start

Because the app loads local JSON files, you must run it from a local web server.

### Option 1: Python (recommended)

python -m http.server 8000

Open in your browser:

http://localhost:8000

---

### Option 2: Node

npx serve .

---

## Usage

1. Open the app in your browser  
2. Navigate the map to your area of interest  
3. Add waypoints, routes, or polygons  
4. Adjust settings or load a drone profile  
5. Save your project locally (browser storage)  
6. Export as KMZ when ready  

---

## Data Storage

- Projects and settings are stored in your browser using localStorage  
- Data is not uploaded anywhere  
- Clearing your browser data will remove saved projects  
- Export important work as KMZ for backup  

---

## External Services

This app relies on third-party services for map tiles and geocoding:

- OpenStreetMap  
- Esri World Imagery  
- Nominatim (search)  

These services require an internet connection and may have rate limits or availability constraints.

---

## File Structure

waypoint-planner/
│
├── index.html  
├── app.js  
├── styles.css  
├── drone-profiles.json  
├── help.html  
├── README.md  
└── docs/  

---

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

---

## Adding Drone Profiles

Drone profiles can be customized in:

drone-profiles.json

You can define parameters such as:
- speed  
- altitude  
- camera characteristics  
- mission-specific settings  

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
---

## Limitations

- Requires internet for map tiles and search  
- Not a flight control system  
- No real-time drone integration  
- Data is stored locally unless exported  
- Browser storage is not permanent  

---

## Roadmap (Optional Ideas)

- GPX/KML import support  
- Elevation data integration  
- Offline tile support  
- Multi-project management UI  
- Cloud sync (optional)  

---

## Contributing

Contributions are welcome.

If you want to improve the project:
- Fork the repo  
- Create a feature branch  
- Submit a pull request  

---

## Security

If you discover a vulnerability or issue, please open an issue or contact privately before public disclosure.

---


## GSD Formula

```
GSD (cm/px) = (sensorWidth_mm × altitude_m × 100) / (focalLength_mm × imageWidth_px)
```

## License

MIT License. See the LICENSE file for details.
