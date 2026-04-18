'use strict';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const OVERSHOOT_M        = 5;
const MAX_WP_PER_KMZ     = 65535;
const MAX_PROJECTS       = 20;
const TURN_TIME_S        = 3;

const FT_PER_M    = 3.28084;
const MPH_PER_MS  = 2.23694;
const ACRES_PER_HA = 2.47105;
const IN_PER_CM   = 0.393701;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let droneProfiles = {};

const state = {
  units:        localStorage.getItem('wp-units') || 'imperial',
  drone:        'dji-mini-4-pro',
  altitudeM:    121.92,   // 400 ft
  speedMs:      8.9408,   // 20 mph
  frontOverlap: 75,
  sideOverlap:  70,
  polygon:      null,
  flightLines:  [],
  waypoints:    [],
};

let projects        = JSON.parse(localStorage.getItem('wp-projects') || '[]');
let currentProjId   = localStorage.getItem('wp-current-project') || null;

// ─────────────────────────────────────────────
// UNIT HELPERS
// ─────────────────────────────────────────────
const isImperial = () => state.units === 'imperial';

function toDispAlt(m)    { return isImperial() ? (m * FT_PER_M).toFixed(0)   : m.toFixed(1); }
function fromDispAlt(v)  { return isImperial() ? v / FT_PER_M                : +v; }
function toDispSpeed(ms) { return isImperial() ? (ms * MPH_PER_MS).toFixed(1): ms.toFixed(1); }
function fromDispSpeed(v){ return isImperial() ? v / MPH_PER_MS              : +v; }
function toDispGSD(cm)   { return isImperial() ? (cm * IN_PER_CM).toFixed(3) : cm.toFixed(2); }
function gsdUnit()       { return isImperial() ? 'in/px' : 'cm/px'; }
function altUnit()       { return isImperial() ? 'ft'    : 'm'; }
function speedUnit()     { return isImperial() ? 'mph'   : 'm/s'; }

function toDispDist(m) {
  return isImperial() ? `${(m * FT_PER_M).toFixed(1)} ft` : `${m.toFixed(1)} m`;
}

function toDispArea(m2) {
  const ha = m2 / 10000;
  if (isImperial()) {
    return `${(ha * ACRES_PER_HA).toFixed(2)} ac`;
  }
  return `${ha.toFixed(3)} ha`;
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ─────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────
let map, drawnItems, satelliteLayer, streetLayer, activeBaseLayer, flightLineLayer;
let isDrawing = false, drawHandler = null, editingLayer = null;

function initMap() {
  map = L.map('map', { center: [39.8283, -98.5795], zoom: 4, zoomControl: true });

  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri &mdash; Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN' }
  );

  streetLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
  );

  satelliteLayer.addTo(map);
  activeBaseLayer = 'satellite';

  drawnItems = new L.FeatureGroup().addTo(map);

  map.on('draw:created', function (e) {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    state.polygon = e.layer.getLatLngs()[0].map(p => [p.lat, p.lng]);
    setDrawing(false);
    showEditBtn(true);
    recompute();
  });

  map.on('draw:drawstop', function () { setDrawing(false); });
}

function setDrawing(active) {
  isDrawing = active;
  const btn = document.getElementById('draw-btn');
  btn.textContent = active ? '✕ Cancel Draw' : '✏ Draw Area';
  btn.classList.toggle('drawing', active);
}

function showEditBtn(visible) {
  document.getElementById('edit-btn').style.display = visible ? '' : 'none';
}

function startDraw() {
  if (isDrawing) {
    if (drawHandler) drawHandler.disable();
    setDrawing(false);
    return;
  }
  if (editingLayer) finishEdit();

  drawHandler = new L.Draw.Polygon(map, {
  shapeOptions: {
    color: '#f97316',
    fillColor: '#f97316',
    fillOpacity: 0.12,
    weight: 2
  },
  allowIntersection: false,
  showArea: true,
  metric: true,
});
  drawHandler.enable();
  setDrawing(true);
}

function startEdit() {
  const layers = drawnItems.getLayers();
  if (!layers.length) return;
  editingLayer = layers[0];
  editingLayer.editing.enable();
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('done-edit-btn').style.display = '';
}

function finishEdit() {
  if (!editingLayer) return;
  editingLayer.editing.disable();
  state.polygon = editingLayer.getLatLngs()[0].map(p => [p.lat, p.lng]);
  editingLayer = null;
  document.getElementById('done-edit-btn').style.display = 'none';
  document.getElementById('edit-btn').style.display = '';
  recompute();
}

function clearAll() {
  if (editingLayer) { editingLayer.editing.disable(); editingLayer = null; }
  if (drawHandler)  { drawHandler.disable(); drawHandler = null; }
  drawnItems.clearLayers();
  clearFlightLines();
  state.polygon   = null;
  state.flightLines = [];
  state.waypoints   = [];
  setDrawing(false);
  showEditBtn(false);
  document.getElementById('done-edit-btn').style.display = 'none';
  updateStatsDisplay(null);
  autoSave();
}

function clearFlightLines() {
  if (flightLineLayer) { map.removeLayer(flightLineLayer); flightLineLayer = null; }
}

function toggleLayer() {
  const btn = document.getElementById('layer-toggle-btn');
  if (activeBaseLayer === 'satellite') {
    map.removeLayer(satelliteLayer);
    streetLayer.addTo(map);
    activeBaseLayer = 'street';
    btn.textContent = '🌍 Satellite';
  } else {
    map.removeLayer(streetLayer);
    satelliteLayer.addTo(map);
    activeBaseLayer = 'satellite';
    btn.textContent = '🗺 Street Map';
  }
}

// ─────────────────────────────────────────────
// GEOCODING  (Nominatim)
// ─────────────────────────────────────────────
async function geocode(query) {
  query = query.trim();
  if (!query) return;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) { showToast('Location not found.', 'warning'); return; }
    const { lat, lon, boundingbox: bb } = data[0];
    if (bb) {
      map.fitBounds([[+bb[0], +bb[2]], [+bb[1], +bb[3]]]);
    } else {
      map.setView([+lat, +lon], 15);
    }
  } catch {
    showToast('Geocoding failed — check your connection.', 'error');
  }
}

// ─────────────────────────────────────────────
// GEOMETRY UTILITIES
// ─────────────────────────────────────────────
function centroid(poly) {
  const n = poly.length;
  let sLat = 0, sLng = 0;
  for (const [lat, lng] of poly) { sLat += lat; sLng += lng; }
  return [sLat / n, sLng / n];
}

function toLocal(lat, lng, cLat, cLng) {
  const cosLat = Math.cos(cLat * Math.PI / 180);
  return [
    (lng - cLng) * cosLat * 111320,
    (lat - cLat) * 110540,
  ];
}

function fromLocal(x, y, cLat, cLng) {
  const cosLat = Math.cos(cLat * Math.PI / 180);
  return [
    y / 110540 + cLat,
    x / (cosLat * 111320) + cLng,
  ];
}

function polyAreaM2(pts) {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(a) / 2;
}

function haversineDist(a, b) {
  const R  = 6371000;
  const φ1 = a[0] * Math.PI / 180, φ2 = b[0] * Math.PI / 180;
  const dφ = (b[0] - a[0]) * Math.PI / 180;
  const dλ = (b[1] - a[1]) * Math.PI / 180;
  const s  = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

// ─────────────────────────────────────────────
// FLIGHT LINE GENERATION
// ─────────────────────────────────────────────
function scanIntersections(localPoly, y) {
  const xs = [];
  const n  = localPoly.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = localPoly[i];
    const [x2, y2] = localPoly[(i+1) % n];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
    }
  }
  return xs.sort((a,b) => a - b);
}

function generateFlightLines(polygon, spacingM, overshootM) {
  if (!polygon || polygon.length < 3) return [];

  const [cLat, cLng] = centroid(polygon);
  const local = polygon.map(([lat,lng]) => toLocal(lat, lng, cLat, cLng));

  const minY = Math.min(...local.map(p=>p[1]));
  const maxY = Math.max(...local.map(p=>p[1]));

  const lines = [];
  let y = minY + spacingM / 2;
  let idx = 0;

  while (y <= maxY + spacingM / 2) {
    const xs = scanIntersections(local, y);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let x1 = xs[i]   - overshootM;
      let x2 = xs[i+1] + overshootM;
      if (idx % 2 === 1) [x1, x2] = [x2, x1];   // bidi alternation
      lines.push([
        fromLocal(x1, y, cLat, cLng),
        fromLocal(x2, y, cLat, cLng),
      ]);
    }
    y += spacingM;
    idx++;
  }

  return lines;
}

function generateWaypoints(lines, intervalM) {
  const wps = [];
  for (const [start, end] of lines) {
    const dist  = haversineDist(start, end);
    const count = Math.max(1, Math.ceil(dist / intervalM));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      wps.push([
        start[0] + t * (end[0] - start[0]),
        start[1] + t * (end[1] - start[1]),
      ]);
    }
  }
  return wps;
}

// ─────────────────────────────────────────────
// COMPUTE  (runs on every change)
// ─────────────────────────────────────────────
function computeGSD(drone, altM) {
  return (drone.sensorWidth * altM * 100) / (drone.focalLength * drone.imageWidth);
}

function recompute() {
  if (!state.polygon || state.polygon.length < 3) {
    clearFlightLines();
    state.flightLines = [];
    state.waypoints   = [];
    updateStatsDisplay(null);
    autoSave();
    return;
  }

  const drone = droneProfiles[state.drone];
  if (!drone) return;

  const gsd      = computeGSD(drone, state.altitudeM);
  const fpW      = gsd * drone.imageWidth  / 100;
  const fpH      = gsd * drone.imageHeight / 100;
  const spacing  = fpW * (1 - state.sideOverlap  / 100);
  const interval = fpH * (1 - state.frontOverlap / 100);

  if (spacing <= 0 || interval <= 0) return;

  const lines    = generateFlightLines(state.polygon, spacing, OVERSHOOT_M);
  const wps      = generateWaypoints(lines, interval);

  state.flightLines = lines;
  state.waypoints   = wps;

  // Area via shoelace in local coords
  const [cLat, cLng] = centroid(state.polygon);
  const local = state.polygon.map(([la,lo]) => toLocal(la, lo, cLat, cLng));
  const areaM2 = polyAreaM2(local);

  const totalLen  = lines.reduce((s, [a,b]) => s + haversineDist(a,b), 0);
  const flightSec = state.speedMs > 0
    ? totalLen / state.speedMs + Math.max(0, lines.length - 1) * TURN_TIME_S
    : 0;

  const shotTimeSec  = state.speedMs > 0 ? interval / state.speedMs : 0;
  const minInterval  = drone.minPhotoIntervalSec || 2.0;
  const maxSpeedMs   = interval / minInterval;

  updateMapDisplay();
  updateStatsDisplay({
    gsd, areaM2, spacing, interval,
    photoCount: wps.length, lineCount: lines.length, flightSec,
    shotTimeSec, minInterval, maxSpeedMs,
  });
  autoSave();
}

// ─────────────────────────────────────────────
// MAP DISPLAY
// ─────────────────────────────────────────────
function updateMapDisplay() {
  clearFlightLines();
  if (!state.flightLines.length) return;

  // Flatten into one continuous path so turns between lines are drawn
  const path = [];
  for (const [start, end] of state.flightLines) {
    path.push(start);
    path.push(end);
  }

  flightLineLayer = L.polyline(path, {
    color: '#00b4d8', weight: 2, opacity: 0.85,
  }).addTo(map);
}

// ─────────────────────────────────────────────
// STATS PANEL
// ─────────────────────────────────────────────
function updateStatsDisplay(s) {
  const panel = document.getElementById('stats-panel');
  if (!s) {
    panel.innerHTML = '<p class="stats-empty">Draw a polygon to see mission stats.</p>';
    return;
  }

  const tooFast = s.shotTimeSec > 0 && s.shotTimeSec < s.minInterval;
  const shotTimeColor = tooFast ? 'var(--danger)' : 'var(--accent)';

  const rows = [
    ['GSD',              `${toDispGSD(s.gsd)} ${gsdUnit()}`],
    ['Area',             toDispArea(s.areaM2)],
    ['Photos',           s.photoCount.toLocaleString()],
    ['Flight Lines',     s.lineCount],
    ['Est. Flight Time', fmtDuration(s.flightSec)],
    ['Line Spacing',     toDispDist(s.spacing)],
    ['Trigger Interval', toDispDist(s.interval)],
    ['Shot Interval',    `${s.shotTimeSec.toFixed(1)}s (min ${s.minInterval}s)`],
    ['Max Safe Speed',   toDispSpeed(s.maxSpeedMs) + ' ' + speedUnit()],
  ];

  panel.innerHTML = rows.map(([label, val], i) => {
    const isShot = label === 'Shot Interval';
    const color  = isShot ? shotTimeColor : 'var(--accent)';
    return `<div class="stat-row">
       <span class="stat-label">${label}</span>
       <span class="stat-value" style="color:${color}">${val}</span>
     </div>`;
  }).join('');

  if (tooFast) {
    panel.innerHTML += `<div class="warning-badge">
      ⚠ Flying too fast! At ${toDispSpeed(state.speedMs)} ${speedUnit()} the drone only has
      ${s.shotTimeSec.toFixed(1)}s between shots but needs ${s.minInterval}s.
      Reduce speed to ${toDispSpeed(s.maxSpeedMs)} ${speedUnit()} or lower.
    </div>`;
  }

  if (s.photoCount > MAX_WP_PER_KMZ) {
    panel.innerHTML += `<div class="warning-badge">
      ⚠ ${s.photoCount.toLocaleString()} waypoints exceed DJI's limit of ${MAX_WP_PER_KMZ.toLocaleString()}.
      Export will split into multiple KMZ files.
    </div>`;
  }
}

// ─────────────────────────────────────────────
// KMZ  /  WPML EXPORT
// ─────────────────────────────────────────────
function buildPlacemark(wp, idx, altM, speedMs) {
  return `    <Placemark>
      <Point><coordinates>${wp[1].toFixed(8)},${wp[0].toFixed(8)},0</coordinates></Point>
      <wpml:index>${idx}</wpml:index>
      <wpml:executeHeight>${altM.toFixed(2)}</wpml:executeHeight>
      <wpml:waypointSpeed>${speedMs.toFixed(2)}</wpml:waypointSpeed>
      <wpml:waypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
      </wpml:waypointHeadingParam>
      <wpml:waypointTurnParam>
        <wpml:waypointTurnMode>coordinateTurn</wpml:waypointTurnMode>
        <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
      </wpml:waypointTurnParam>
      <wpml:useStraightLine>1</wpml:useStraightLine>
      <wpml:actionGroup>
        <wpml:actionGroupId>${idx}</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
        </wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:fileSuffix></wpml:fileSuffix>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>
    </Placemark>`;
}

function buildTemplateKml(wps, altM, speedMs, drone) {
  const ts = Date.now();
  const placemarks = wps.map((wp, i) => buildPlacemark(wp, i, altM, speedMs)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.0">
  <Document>
    <wpml:author>Waypoint Planner</wpml:author>
    <wpml:createTime>${ts}</wpml:createTime>
    <wpml:updateTime>${ts}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speedMs.toFixed(2)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${drone.droneEnumValue || 67}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${drone.droneSubEnumValue || 0}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>relativeToStartPoint</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${speedMs.toFixed(2)}</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>`;
}

function buildWaylinesWpml(wps, altM, speedMs) {
  let dist = 0;
  for (let i = 1; i < wps.length; i++) dist += haversineDist(wps[i-1], wps[i]);
  const dur = speedMs > 0 ? dist / speedMs : 0;
  const placemarks = wps.map((wp, i) => buildPlacemark(wp, i, altM, speedMs)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.0">
  <Document>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${dist.toFixed(2)}</wpml:distance>
      <wpml:duration>${dur.toFixed(2)}</wpml:duration>
      <wpml:autoFlightSpeed>${speedMs.toFixed(2)}</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>`;
}

async function downloadKmz(wps, filename) {
  const drone = droneProfiles[state.drone];
  const zip   = new JSZip();
  const wpmz  = zip.folder('wpmz');
  wpmz.file('template.kml',   buildTemplateKml(wps, state.altitudeM, state.speedMs, drone));
  wpmz.file('waylines.wpml',  buildWaylinesWpml(wps, state.altitudeM, state.speedMs));
  const blob  = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function exportKmz() {
  if (!state.waypoints.length) {
    showToast('Draw a polygon first to generate waypoints.', 'warning');
    return;
  }

  const wps = state.waypoints;

  if (wps.length > MAX_WP_PER_KMZ) {
    const parts = Math.ceil(wps.length / MAX_WP_PER_KMZ);
    const ok = confirm(
      `${wps.length.toLocaleString()} waypoints exceed DJI's limit of ${MAX_WP_PER_KMZ.toLocaleString()}.\n\n` +
      `Split into ${parts} KMZ files?`
    );
    if (!ok) return;
    for (let i = 0; i < parts; i++) {
      const chunk = wps.slice(i * MAX_WP_PER_KMZ, (i+1) * MAX_WP_PER_KMZ);
      await downloadKmz(chunk, `waypoint-planner-mission-part${i+1}.kmz`);
    }
    showToast(`Exported ${parts} KMZ files.`, 'success');
  } else {
    await downloadKmz(wps, 'waypoint-planner-mission.kmz');
    showToast('KMZ exported successfully.', 'success');
  }
}

// ─────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────
function getProjectSnapshot() {
  return {
    drone:        state.drone,
    altitudeM:    state.altitudeM,
    speedMs:      state.speedMs,
    frontOverlap: state.frontOverlap,
    sideOverlap:  state.sideOverlap,
    polygon:      state.polygon,
  };
}

function applySnapshot(snap) {
  state.drone        = snap.drone        || 'dji-mini-4-pro';
  state.altitudeM    = snap.altitudeM    || 121.92;
  state.speedMs      = snap.speedMs      || 8.9408;
  state.frontOverlap = snap.frontOverlap ?? 75;
  state.sideOverlap  = snap.sideOverlap  ?? 70;
  state.polygon      = snap.polygon      || null;
}

function persistProjects() {
  localStorage.setItem('wp-projects', JSON.stringify(projects));
  localStorage.setItem('wp-current-project', currentProjId || '');
}

function autoSave() {
  if (!currentProjId) return;
  const idx = projects.findIndex(p => p.id === currentProjId);
  if (idx < 0) return;
  Object.assign(projects[idx], { updated: Date.now(), ...getProjectSnapshot() });
  persistProjects();
}

function newProject(name) {
  if (projects.length >= MAX_PROJECTS) {
    showToast(`Max ${MAX_PROJECTS} projects reached. Delete one first.`, 'warning');
    return;
  }
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  projects.unshift({ id, name, created: Date.now(), updated: Date.now(), ...getProjectSnapshot() });
  currentProjId = id;
  persistProjects();
  renderProjectList();
  showToast(`Project "${name}" created.`, 'success');
}

function loadProject(id) {
  const proj = projects.find(p => p.id === id);
  if (!proj) return;
  currentProjId = id;
  applySnapshot(proj);
  syncUIToState();

  drawnItems.clearLayers();
  if (state.polygon && state.polygon.length >= 3) {
    const latlngs = state.polygon.map(([la,lo]) => L.latLng(la, lo));
    const poly = L.polygon(latlngs, { color: '#00b4d8', fillColor: '#00b4d8', fillOpacity: 0.15, weight: 2 });
    drawnItems.addLayer(poly);
    map.fitBounds(poly.getBounds(), { padding: [40, 40] });
    showEditBtn(true);
  } else {
    showEditBtn(false);
  }

  recompute();
  persistProjects();
  renderProjectList();
}

function deleteProject(id) {
  const name = (projects.find(p=>p.id===id)||{}).name || 'project';
  projects = projects.filter(p => p.id !== id);
  if (currentProjId === id) {
    currentProjId = projects.length ? projects[0].id : null;
    if (currentProjId) loadProject(currentProjId);
    else { clearAll(); }
  }
  persistProjects();
  renderProjectList();
  showToast(`Deleted "${name}".`, 'info');
}

function duplicateProject(id) {
  if (projects.length >= MAX_PROJECTS) {
    showToast(`Max ${MAX_PROJECTS} projects reached.`, 'warning');
    return;
  }
  const src = projects.find(p => p.id === id);
  if (!src) return;
  const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  projects.unshift({ ...src, id: newId, name: `${src.name} (copy)`, created: Date.now(), updated: Date.now() });
  persistProjects();
  renderProjectList();
  showToast('Project duplicated.', 'info');
}

function renderProjectList() {
  const list = document.getElementById('project-list');
  if (!projects.length) {
    list.innerHTML = '<p class="stats-empty">No saved projects yet.</p>';
    return;
  }
  list.innerHTML = projects.map(p => `
    <div class="project-item ${p.id === currentProjId ? 'active' : ''}">
      <div class="project-name" title="${escHtml(p.name)}">${escHtml(p.name)}</div>
      <div class="project-actions">
        <button class="icon-btn" onclick="loadProject('${p.id}')" title="Load">▶</button>
        <button class="icon-btn" onclick="duplicateProject('${p.id}')" title="Duplicate">⧉</button>
        <button class="icon-btn danger" onclick="deleteProject('${p.id}')" title="Delete">✕</button>
      </div>
    </div>`).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// UI SYNC
// ─────────────────────────────────────────────
function syncUIToState() {
  document.getElementById('drone-select').value    = state.drone;
  document.getElementById('altitude-input').value  = toDispAlt(state.altitudeM);
  document.getElementById('speed-input').value     = toDispSpeed(state.speedMs);
  document.getElementById('front-overlap').value   = state.frontOverlap;
  document.getElementById('side-overlap').value    = state.sideOverlap;
  document.getElementById('units-toggle').checked  = state.units === 'metric';
  updateUnitLabels();
}

function updateUnitLabels() {
  document.getElementById('altitude-label').textContent = `Altitude (${altUnit()})`;
  document.getElementById('speed-label').textContent    = `Speed (${speedUnit()})`;

  const imp = isImperial();
  document.getElementById('label-imperial').style.color = imp ? 'var(--text)'       : 'var(--text-muted)';
  document.getElementById('label-metric').style.color   = imp ? 'var(--text-muted)' : 'var(--text)';
}

// ─────────────────────────────────────────────
// UI INIT
// ─────────────────────────────────────────────
function initUI() {
  // Populate drone select
  const sel = document.getElementById('drone-select');
  sel.innerHTML = Object.entries(droneProfiles)
    .map(([id, d]) => `<option value="${id}">${escHtml(d.name)}</option>`)
    .join('');

  syncUIToState();
  renderProjectList();

  // ── Units toggle ──
  document.getElementById('units-toggle').addEventListener('change', function () {
    state.units = this.checked ? 'metric' : 'imperial';
    localStorage.setItem('wp-units', state.units);
    document.getElementById('altitude-input').value = toDispAlt(state.altitudeM);
    document.getElementById('speed-input').value    = toDispSpeed(state.speedMs);
    updateUnitLabels();
    recompute();
  });

  // ── Drone ──
  document.getElementById('drone-select').addEventListener('change', function () {
    state.drone = this.value;
    recompute();
  });

  // ── Altitude ──
  document.getElementById('altitude-input').addEventListener('input', function () {
    const v = parseFloat(this.value);
    if (!isNaN(v) && v > 0) { state.altitudeM = fromDispAlt(v); recompute(); }
  });

  // ── Speed ──
  document.getElementById('speed-input').addEventListener('input', function () {
    const v = parseFloat(this.value);
    if (!isNaN(v) && v > 0) { state.speedMs = fromDispSpeed(v); recompute(); }
  });

  // ── Overlaps ──
  document.getElementById('front-overlap').addEventListener('input', function () {
    const v = parseFloat(this.value);
    if (!isNaN(v) && v >= 0 && v < 100) { state.frontOverlap = v; recompute(); }
  });
  document.getElementById('side-overlap').addEventListener('input', function () {
    const v = parseFloat(this.value);
    if (!isNaN(v) && v >= 0 && v < 100) { state.sideOverlap = v; recompute(); }
  });

  // ── Map controls ──
  document.getElementById('draw-btn').addEventListener('click', startDraw);
  document.getElementById('edit-btn').addEventListener('click', startEdit);
  document.getElementById('done-edit-btn').addEventListener('click', finishEdit);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('layer-toggle-btn').addEventListener('click', toggleLayer);

  // ── Geocode ──
  const gcInput = document.getElementById('geocode-input');
  document.getElementById('geocode-btn').addEventListener('click', () => geocode(gcInput.value));
  gcInput.addEventListener('keydown', e => { if (e.key === 'Enter') geocode(gcInput.value); });

  // ── Export ──
  document.getElementById('export-btn').addEventListener('click', exportKmz);

  // ── New project ──
  document.getElementById('new-project-btn').addEventListener('click', () => {
    const name = prompt('Project name:', `Mission ${projects.length + 1}`);
    if (name !== null) newProject(name.trim() || `Mission ${projects.length + 1}`);
  });
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  try {
    droneProfiles = await fetch('drone-profiles.json').then(r => r.json());
  } catch (e) {
    console.error(e);
    showToast('Failed to load drone profiles.', 'error');
    return;
  }

  initMap();
  initUI();

  // Restore last active project
  if (currentProjId) {
    const proj = projects.find(p => p.id === currentProjId);
    if (proj) { loadProject(currentProjId); return; }
  }

  // No saved project — set default display values
  document.getElementById('altitude-input').value = toDispAlt(state.altitudeM);
  document.getElementById('speed-input').value    = toDispSpeed(state.speedMs);
}

main();
