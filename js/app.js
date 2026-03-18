/* ═══════════════════════════════════════════════════════════════
   UK-Russia Naval Monitor — Main Application
   ═══════════════════════════════════════════════════════════════ */

// ── Categories ───────────────────────────────────────────────────
const CATS = {
  surface:   { label: "Surface warship transit",            color: "#2c5f8a", shape: "circle"   },
  submarine: { label: "Submarine transit",                  color: "#5b3a8c", shape: "diamond"  },
  intel:     { label: "Intelligence / spy vessel",          color: "#c45425", shape: "square"   },
  infra:     { label: "Subsea infrastructure surveillance", color: "#b5232b", shape: "triangle" },
  escort:    { label: "Escort / logistics convoy",          color: "#c49f1a", shape: "circle"   },
  coercive:  { label: "Coercive / escalatory act",          color: "#111",    shape: "star"     },
};

// ── State ────────────────────────────────────────────────────────
let incidents = [];
let newsItems = [];
let activeFilters = new Set(Object.keys(CATS));
let currentView = "map";
let mapMarkers = [];
let feedTimer = null;

// ── Persistence ──────────────────────────────────────────────────
function loadIncidents() {
  const stored = localStorage.getItem("rn_incidents");
  if (stored) { try { return JSON.parse(stored); } catch (e) { /* fall through */ } }
  return null; // null means "use seed data"
}
function saveIncidents() { localStorage.setItem("rn_incidents", JSON.stringify(incidents)); }
function loadNews() {
  const stored = localStorage.getItem("rn_news");
  if (stored) { try { return JSON.parse(stored); } catch (e) { /* fall through */ } }
  return [];
}
function saveNews() { localStorage.setItem("rn_news", JSON.stringify(newsItems)); }

// ── Helpers ──────────────────────────────────────────────────────
function formatDate(d) {
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch (e) { return d; }
}
function formatDateShort(d) {
  try { return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); }
  catch (e) { return d; }
}
function filtered() {
  return incidents.filter(ev => activeFilters.has(ev.cat));
}

// ═══════════════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════════════
let map;

function initMap() {
  map = L.map("map-container", { center: [54.5, -2], zoom: 5, zoomControl: true });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; CARTO &copy; OSM', subdomains: "abcd", maxZoom: 18,
  }).addTo(map);

  // Legend control
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = "<h4>Incident type</h4>" + Object.entries(CATS).map(([k, c]) =>
      `<div class="map-legend-row">${markerSVG(c.shape, c.color, 16)}<span class="ml-label">${c.label}</span></div>`
    ).join("");
    return div;
  };
  legend.addTo(map);
}

function markerSVG(shape, color, size) {
  const s = size || 28;
  const half = s / 2;
  let path;
  // Scale factor relative to default 28
  const f = s / 28;
  switch (shape) {
    case "circle":
      path = `<circle cx="${half}" cy="${half}" r="${8*f}" fill="${color}" stroke="#fff" stroke-width="${2*f}"/>`;
      break;
    case "diamond":
      path = `<polygon points="${half},${4*f} ${24*f},${half} ${half},${24*f} ${4*f},${half}" fill="${color}" stroke="#fff" stroke-width="${2*f}"/>`;
      break;
    case "square":
      path = `<rect x="${5*f}" y="${5*f}" width="${18*f}" height="${18*f}" rx="${2*f}" fill="${color}" stroke="#fff" stroke-width="${2*f}"/>`;
      break;
    case "triangle":
      path = `<polygon points="${half},${3*f} ${26*f},${25*f} ${2*f},${25*f}" fill="${color}" stroke="#fff" stroke-width="${2*f}"/>`;
      break;
    case "star":
      path = `<polygon points="${half},${2*f} ${17.5*f},${10.5*f} ${26*f},${10.5*f} ${19.5*f},${16*f} ${21.5*f},${25*f} ${half},${20*f} ${6.5*f},${25*f} ${8.5*f},${16*f} ${2*f},${10.5*f} ${10.5*f},${10.5*f}" fill="${color}" stroke="#fff" stroke-width="${1.5*f}"/>`;
      break;
    default:
      path = `<circle cx="${half}" cy="${half}" r="${8*f}" fill="${color}" stroke="#fff" stroke-width="${2*f}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${path}</svg>`;
}

function makeIcon(cat) {
  const c = CATS[cat];
  return L.divIcon({
    html: markerSVG(c.shape, c.color),
    className: "", iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
  });
}

function popupHTML(ev) {
  const c = CATS[ev.cat];
  return `<div class="p-id">${ev.id}</div>
    <div class="p-title">${formatDate(ev.date)}</div>
    <div class="p-field"><em>Vessels </em>${ev.assets}</div>
    <div class="p-field"><em>Area </em>${ev.area}</div>
    <div class="p-field"><em>Response </em>${ev.response}</div>
    <div class="p-note">${ev.note}</div>
    <span class="p-tag" style="background:${c.color}">${c.label}</span>`;
}

function renderMapMarkers() {
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  filtered().forEach(ev => {
    const m = L.marker([ev.lat, ev.lng], { icon: makeIcon(ev.cat) }).addTo(map);
    m.bindPopup(popupHTML(ev), { maxWidth: 300 });
    m._evId = ev.id;
    mapMarkers.push(m);
  });
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════════════════════════
function renderTimeline() {
  const el = document.getElementById("timeline-view");
  const data = filtered().sort((a, b) => new Date(a.date) - new Date(b.date));

  const startDate = new Date("2022-12-01"), endDate = new Date("2026-07-01");
  const totalMs = endDate - startDate;
  const W = Math.max(1100, data.length * 75);
  const pad = { left: 50, right: 30 };
  const axisY = 190;

  function dateToX(d) {
    return pad.left + ((new Date(d) - startDate) / totalMs) * (W - pad.left - pad.right);
  }

  let html = `
    <div class="tl-title">Russian Naval Incursions Near UK Waters, 2023\u20132026</div>
    <p class="tl-subtitle">Reported incidents of Russian military and intelligence vessels operating in or near British approaches</p>
    <div class="tl-legend">${Object.entries(CATS).map(([k, c]) =>
      `<div class="tl-legend-item"><span class="tl-legend-dot" style="background:${c.color}"></span>${c.label}</div>`
    ).join("")}</div>
    <div class="tl-canvas" style="min-width:${W}px">
    <div class="tl-axis" style="left:${pad.left}px;right:${pad.right}px;top:${axisY}px"></div>`;

  // Year lines
  [2023, 2024, 2025, 2026].forEach(y => {
    const x = dateToX(y + "-01-01");
    html += `<div class="tl-year-line" style="left:${x}px;top:0;bottom:30px"></div>
      <div class="tl-year-label" style="left:${x}px;bottom:0">${y}</div>`;
  });

  // Events
  data.forEach((ev, i) => {
    const above = i % 2 === 0;
    const x = dateToX(ev.date);
    const c = CATS[ev.cat];
    const stemH = 38 + (i % 3) * 20;
    const top = above ? axisY - stemH - 42 : axisY + 6;
    const cls = above ? "tl-event tl-event-above" : "tl-event";
    const shortLabel = ev.assets.split(";")[0].substring(0, 30);
    const inner = above
      ? `<div class="tl-event-label"><span class="tl-event-date">${formatDateShort(ev.date)}</span><br>${shortLabel}</div>
         <div class="tl-event-stem" style="height:${stemH}px"></div>
         <div class="tl-event-dot" style="background:${c.color}"></div>`
      : `<div class="tl-event-dot" style="background:${c.color}"></div>
         <div class="tl-event-stem" style="height:${stemH}px"></div>
         <div class="tl-event-label"><span class="tl-event-date">${formatDateShort(ev.date)}</span><br>${shortLabel}</div>`;
    html += `<div class="${cls}" style="left:${x - 52}px;top:${top}px" title="${ev.id}: ${ev.note}">${inner}</div>`;
  });

  html += `</div><div class="tl-source">Sources: Royal Navy, UK MoD, Reuters, Irish Times. Generated ${new Date().toLocaleDateString("en-GB")}.</div>`;
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR — FILTERS
// ═══════════════════════════════════════════════════════════════
function renderFilters() {
  const el = document.getElementById("filter-body");
  el.innerHTML = Object.entries(CATS).map(([k, c]) =>
    `<div class="filter-row">
      <input type="checkbox" id="filt-${k}" ${activeFilters.has(k) ? "checked" : ""} onchange="toggleFilter('${k}')">
      <span class="filter-dot" style="background:${c.color}"></span>
      <label for="filt-${k}">${c.label}</label>
    </div>`
  ).join("");
}

function toggleFilter(k) {
  if (activeFilters.has(k)) activeFilters.delete(k); else activeFilters.add(k);
  refresh();
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR — INCIDENT LIST
// ═══════════════════════════════════════════════════════════════
function renderIncidentList() {
  const el = document.getElementById("incident-list");
  const data = filtered().sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById("incident-count").textContent = data.length;
  el.innerHTML = data.map(ev => {
    const c = CATS[ev.cat];
    return `<div class="incident-item" onclick="focusIncident('${ev.id}', this)">
      <div class="incident-id">${ev.id}</div>
      <div class="incident-date">${formatDate(ev.date)}</div>
      <div class="incident-short">${ev.assets.split(";")[0]}</div>
      <span class="incident-cat-tag" style="background:${c.color}">${c.label}</span>
    </div>`;
  }).join("");
}

function focusIncident(id, el) {
  const ev = incidents.find(e => e.id === id);
  if (!ev) return;
  document.querySelectorAll(".incident-item").forEach(e => e.classList.remove("active"));
  if (el) el.classList.add("active");
  if (currentView === "map") {
    map.flyTo([ev.lat, ev.lng], 7, { duration: 0.6 });
    const marker = mapMarkers.find(m => m._evId === id);
    if (marker) setTimeout(() => marker.openPopup(), 650);
  }
}

// ═══════════════════════════════════════════════════════════════
// NEWS FEED
// ═══════════════════════════════════════════════════════════════
const SEARCH_QUERIES = [
  "Russian navy UK waters",
  "Russian warship English Channel",
  "Russian submarine United Kingdom",
  "Yantar spy ship",
  "Russian vessel North Sea cable",
];

function renderNewsList() {
  const el = document.getElementById("news-list");
  if (newsItems.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--fg3);font-size:11px">
      No news items yet.<br>Click <strong>Refresh</strong> to fetch latest headlines,<br>
      or <strong>+ Add Incident</strong> to log manually.</div>`;
    return;
  }
  el.innerHTML = newsItems.slice(0, 50).map((n, i) =>
    `<div class="news-item${n.fresh ? " fresh" : ""}">
      <div class="news-title"><a href="${n.link || "#"}" target="_blank" rel="noopener">${n.title}</a></div>
      <div class="news-meta">${n.source || ""}${n.source && n.pubDate ? " · " : ""}${n.pubDate || ""}</div>
      <div class="news-actions">
        <button onclick="promoteNews(${i})">+ Add as incident</button>
        <button onclick="dismissNews(${i})">Dismiss</button>
      </div>
    </div>`
  ).join("");
}

async function fetchNews() {
  const statusEl = document.getElementById("feed-status");
  statusEl.textContent = "Fetching...";
  const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  try {
    const resp = await fetch(apiUrl);
    const data = await resp.json();
    if (data.status === "ok" && data.items) {
      const existingLinks = new Set(newsItems.map(n => n.link));
      let added = 0;
      data.items.forEach(item => {
        if (!existingLinks.has(item.link)) {
          newsItems.unshift({
            title: item.title, link: item.link,
            source: item.author || "Google News",
            pubDate: item.pubDate ? item.pubDate.substring(0, 10) : "",
            fresh: true,
          });
          added++;
        }
      });
      saveNews();
      renderNewsList();
      const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      statusEl.textContent = added > 0 ? `+${added} new · ${ts}` : `No new · ${ts}`;
      const freshCount = newsItems.filter(n => n.fresh).length;
      document.getElementById("feed-badge").textContent = freshCount || "AUTO";
    } else {
      statusEl.textContent = "Parse error";
    }
  } catch (err) {
    statusEl.textContent = "Fetch failed — check connection";
    console.error("News fetch error:", err);
  }
}

function setFeedInterval(ms) {
  if (feedTimer) clearInterval(feedTimer);
  if (+ms > 0) {
    feedTimer = setInterval(fetchNews, +ms);
    document.getElementById("feed-badge").textContent = "AUTO";
  } else {
    document.getElementById("feed-badge").textContent = "OFF";
  }
}

function promoteNews(i) {
  const n = newsItems[i];
  document.getElementById("f-id").value = "UKRUS-NEW-" + (incidents.length + 1);
  document.getElementById("f-date").value = n.pubDate || "";
  document.getElementById("f-note").value = n.title + (n.link ? "\nSource: " + n.link : "");
  openModal();
}

function dismissNews(i) {
  newsItems.splice(i, 1);
  saveNews();
  renderNewsList();
}

// ═══════════════════════════════════════════════════════════════
// ADD INCIDENT (modal)
// ═══════════════════════════════════════════════════════════════
function openModal() { document.getElementById("modal").classList.add("open"); }
function closeModal() { document.getElementById("modal").classList.remove("open"); }

function addIncident() {
  const ev = {
    id:       document.getElementById("f-id").value || "UKRUS-" + (Date.now() % 100000),
    date:     document.getElementById("f-date").value,
    cat:      document.getElementById("f-cat").value,
    lat:      parseFloat(document.getElementById("f-lat").value) || 51.5,
    lng:      parseFloat(document.getElementById("f-lng").value) || 0,
    assets:   document.getElementById("f-assets").value || "Unknown",
    area:     document.getElementById("f-area").value || "UK waters",
    response: document.getElementById("f-response").value || "Under monitoring",
    note:     document.getElementById("f-note").value || "",
  };
  incidents.push(ev);
  saveIncidents();
  closeModal();
  ["f-id", "f-date", "f-lat", "f-lng", "f-assets", "f-area", "f-response", "f-note"]
    .forEach(id => document.getElementById(id).value = "");
  refresh();
}

// ═══════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.getElementById("map-view").style.display    = view === "map" ? "block" : "none";
  document.getElementById("timeline-view").style.display = view === "timeline" ? "block" : "none";
  if (view === "map") setTimeout(() => map.invalidateSize(), 50);
  if (view === "timeline") renderTimeline();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
  setTimeout(() => map.invalidateSize(), 300);
}

// ═══════════════════════════════════════════════════════════════
// PNG EXPORT
// ═══════════════════════════════════════════════════════════════
async function exportPNG(scale) {
  const overlay = document.getElementById("export-overlay");
  overlay.classList.add("active");
  await new Promise(r => setTimeout(r, 100));

  const target = document.getElementById("main-content");
  try {
    const canvas = await html2canvas(target, {
      scale: scale || 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
    });
    const link = document.createElement("a");
    const viewName = currentView === "map" ? "map" : "timeline";
    link.download = `russia_incursion_${viewName}_${scale}x_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error("Export error:", err);
    alert("Export failed. For the map view, try the timeline view for best results.");
  }
  overlay.classList.remove("active");
}

// ═══════════════════════════════════════════════════════════════
// REFRESH ALL
// ═══════════════════════════════════════════════════════════════
function refresh() {
  renderMapMarkers();
  renderIncidentList();
  if (currentView === "timeline") renderTimeline();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  // Load incidents: localStorage first, then fall back to seed JSON
  const stored = loadIncidents();
  if (stored) {
    incidents = stored;
  } else {
    try {
      const resp = await fetch("data/incidents.json");
      incidents = await resp.json();
      saveIncidents();
    } catch (e) {
      console.error("Failed to load seed data:", e);
      incidents = [];
    }
  }

  newsItems = loadNews();

  initMap();
  renderFilters();
  renderMapMarkers();
  renderIncidentList();
  renderNewsList();
  renderTimeline();

  // Auto-feed: 30 min default
  setFeedInterval(1800000);
  setTimeout(fetchNews, 3000);
}

init();
