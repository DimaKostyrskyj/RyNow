const MAP_BOUNDS = [[-4000, -5500], [8000, 6000]];
const map = L.map("gtaMap", {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom: 3,
  zoomSnap: .25,
  zoomControl: false,
  attributionControl: false
});

L.control.zoom({ position: "topright" }).addTo(map);
L.imageOverlay("/assets/gtav-roadmap.jpg", MAP_BOUNDS).addTo(map);
map.fitBounds(MAP_BOUNDS);

const layers = new Map();
const markerIndex = [];
let allEnabled = true;

function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function markerIcon(category) {
  return L.divIcon({
    className: "",
    html: `<div class="map-marker" style="--marker:${category.color}">${category.icon}</div>`,
    iconSize: [25,25],
    iconAnchor: [12,12],
    popupAnchor: [0,-12]
  });
}

function popupHtml(item, category) {
  const details = Object.entries(item.details || {})
    .filter(([,value]) => value !== null && value !== "")
    .slice(0,5)
    .map(([key,value]) => `<div><b>${esc(key)}:</b> ${esc(value)}</div>`)
    .join("");

  return `<div class="popup-title"><strong>${esc(item.name)}</strong></div>
    <div class="popup-category" style="color:${category.color}">${esc(category.title)}</div>
    ${details ? `<div class="popup-details">${details}</div>` : ""}`;
}

function renderCategoryList(data) {
  const list = document.getElementById("categoryList");
  list.innerHTML = "";

  data.categories.forEach(category => {
    const row = document.createElement("label");
    row.className = "category-row";
    row.style.setProperty("--cat", category.color);
    row.innerHTML = `
      <span class="category-icon">${category.icon}</span>
      <span class="category-copy">
        <strong>${esc(category.title)}</strong>
        <small>${category.items.length} меток</small>
      </span>
      <span>
        <input type="checkbox" checked data-category="${category.id}">
        <i class="category-switch"></i>
      </span>`;
    list.appendChild(row);

    row.querySelector("input").addEventListener("change", event => {
      const layer = layers.get(category.id);
      if (event.target.checked) map.addLayer(layer);
      else map.removeLayer(layer);
      updateVisibleCount();
    });
  });
}

function addMarkers(data) {
  data.categories.forEach(category => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 42,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true
    });

    category.items.forEach(item => {
      const marker = L.marker([item.y, item.x], { icon: markerIcon(category) })
        .bindPopup(popupHtml(item, category));

      cluster.addLayer(marker);
      markerIndex.push({
        marker,
        layer: cluster,
        category,
        item,
        search: `${item.name} ${category.title} ${Object.values(item.details || {}).join(" ")}`.toLowerCase()
      });
    });

    layers.set(category.id, cluster);
    map.addLayer(cluster);
  });
}

function updateVisibleCount() {
  let count = 0;
  layers.forEach(layer => {
    if (map.hasLayer(layer)) count += layer.getLayers().length;
  });
  document.getElementById("visibleCount").textContent = `${count} меток`;
}

function showSearch(query) {
  const resultsBox = document.getElementById("searchResults");
  const q = query.trim().toLowerCase();

  if (q.length < 2) {
    resultsBox.classList.remove("show");
    resultsBox.innerHTML = "";
    return;
  }

  const matches = markerIndex
    .filter(entry => entry.search.includes(q))
    .slice(0, 30);

  resultsBox.innerHTML = matches.length
    ? matches.map((entry, index) => `
        <button class="search-result" data-result="${index}">
          <strong>${esc(entry.item.name)}</strong>
          <small>${esc(entry.category.title)} · X ${Math.round(entry.item.x)}, Y ${Math.round(entry.item.y)}</small>
        </button>`).join("")
    : `<div class="search-result"><strong>Ничего не найдено</strong></div>`;

  resultsBox.classList.add("show");

  resultsBox.querySelectorAll("[data-result]").forEach(button => {
    button.addEventListener("click", () => {
      const entry = matches[Number(button.dataset.result)];
      if (!map.hasLayer(entry.layer)) map.addLayer(entry.layer);
      map.setView([entry.item.y, entry.item.x], 1.5);
      entry.layer.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
      resultsBox.classList.remove("show");
    });
  });
}

fetch("/map-data.json")
  .then(response => response.json())
  .then(data => {
    renderCategoryList(data);
    addMarkers(data);
    updateVisibleCount();
    document.getElementById("mapLoading").classList.add("hide");
  })
  .catch(error => {
    console.error(error);
    document.querySelector("#mapLoading span").textContent = "Не удалось загрузить данные";
  });

map.on("mousemove", event => {
  document.getElementById("mapCoordinates").textContent =
    `X: ${Math.round(event.latlng.lng)} · Y: ${Math.round(event.latlng.lat)}`;
});

document.getElementById("fitMapBtn").addEventListener("click", () => map.fitBounds(MAP_BOUNDS));
document.getElementById("mapSearch").addEventListener("input", event => showSearch(event.target.value));
document.getElementById("clearSearchBtn").addEventListener("click", () => {
  const input = document.getElementById("mapSearch");
  input.value = "";
  showSearch("");
  input.focus();
});

document.getElementById("toggleAllBtn").addEventListener("click", event => {
  allEnabled = !allEnabled;
  document.querySelectorAll("[data-category]").forEach(input => {
    input.checked = allEnabled;
    const layer = layers.get(input.dataset.category);
    if (allEnabled) map.addLayer(layer);
    else map.removeLayer(layer);
  });
  event.target.textContent = allEnabled ? "Скрыть всё" : "Показать всё";
  updateVisibleCount();
});

document.getElementById("sidebarToggle").addEventListener("click", () => {
  document.getElementById("mapSidebar").classList.toggle("open");
});
