let publicMap = null;
let publicCluster = null;
let allPublicPoints = [];
let visiblePublicPoints = [];
let hasInitialFit = false;

function normalizeText(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function getApiBaseUrl() {
  return String(window.PUBLIC_APP_CONFIG?.apiBaseUrl || "/api").trim().replace(/\/+$/, "");
}

function getMarkerClassName(kind) {
  return kind === "obra" ? "dot-obra" : "dot-fisc";
}

function createMarkerIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<span class="public-marker ${getMarkerClassName(kind)}" aria-hidden="true"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function buildPopupContent(point) {
  const title = point.kind === "obra" ? "Obra" : "Fiscalizacao";
  const areaLabel = point.kind === "obra" ? "Local" : "Regiao";

  let extraLine = "";
  if (point.kind === "obra" && Number.isFinite(point.execucao)) {
    extraLine = `<p class="text-xs text-slate-500 mt-1">Execucao: ${escapeHtml(point.execucao)}%</p>`;
  }
  if (point.kind === "fiscalizacao" && Number.isFinite(point.conformidade)) {
    extraLine = `<p class="text-xs text-slate-500 mt-1">Conformidade: ${escapeHtml(point.conformidade)}%</p>`;
  }

  const status = escapeHtml(point.status || "Nao informada");
  const area = escapeHtml(point.area || "Nao informado");
  const year = Number.isFinite(point.ano) ? `<p class="text-xs text-slate-500 mt-1">Ano: ${point.ano}</p>` : "";

  return `
    <div class="p-3 min-w-[190px]">
      <h3 class="text-sm font-semibold text-slate-800">${title}</h3>
      <p class="text-xs text-slate-600 mt-1">Status: ${status}</p>
      <p class="text-xs text-slate-600 mt-1">${areaLabel}: ${area}</p>
      ${year}
      ${extraLine}
    </div>
  `;
}

function updateStats(points) {
  const total = points.length;
  const fiscalizacoes = points.filter((point) => point.kind === "fiscalizacao").length;
  const obras = points.filter((point) => point.kind === "obra").length;

  const totalNode = document.getElementById("stat-total");
  const fiscNode = document.getElementById("stat-fisc");
  const obrasNode = document.getElementById("stat-obras");

  if (totalNode) totalNode.textContent = String(total);
  if (fiscNode) fiscNode.textContent = String(fiscalizacoes);
  if (obrasNode) obrasNode.textContent = String(obras);
}

function renderMarkers(points, fitBounds = false) {
  if (!publicCluster) return;
  publicCluster.clearLayers();

  points.forEach((point) => {
    const marker = L.marker([point.latitude, point.longitude], {
      icon: createMarkerIcon(point.kind),
      title: point.kind === "obra" ? "Obra" : "Fiscalizacao"
    });
    marker.bindPopup(buildPopupContent(point));
    publicCluster.addLayer(marker);
  });

  if (fitBounds && points.length > 0) {
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    publicMap.fitBounds(bounds.pad(0.12));
  }
}

function getCurrentFilterKind() {
  const element = document.getElementById("filter-kind");
  const value = String(element?.value || "all").trim();
  return value === "obra" || value === "fiscalizacao" ? value : "all";
}

function populateStatusOptions() {
  const kind = getCurrentFilterKind();
  const statusSelect = document.getElementById("filter-status");
  if (!statusSelect) return;

  const previous = String(statusSelect.value || "");
  const statuses = [...new Set(
    allPublicPoints
      .filter((point) => kind === "all" || point.kind === kind)
      .map((point) => String(point.status || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));

  statusSelect.innerHTML = `<option value="">Todos os status</option>${statuses.map((status) =>
    `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}`;

  if (statuses.includes(previous)) {
    statusSelect.value = previous;
  }
}

function applyPublicFilters(options = {}) {
  const kind = getCurrentFilterKind();
  const status = String(document.getElementById("filter-status")?.value || "").trim();
  const areaTerm = normalizeText(document.getElementById("filter-area")?.value || "");

  visiblePublicPoints = allPublicPoints.filter((point) => {
    if (kind !== "all" && point.kind !== kind) return false;
    if (status && point.status !== status) return false;
    if (areaTerm && !normalizeText(point.area).includes(areaTerm)) return false;
    return true;
  });

  updateStats(visiblePublicPoints);
  renderMarkers(visiblePublicPoints, Boolean(options.fitBounds));
}

function clearPublicFilters() {
  const kind = document.getElementById("filter-kind");
  const status = document.getElementById("filter-status");
  const area = document.getElementById("filter-area");

  if (kind) kind.value = "all";
  if (status) status.value = "";
  if (area) area.value = "";
  populateStatusOptions();
  applyPublicFilters({ fitBounds: true });
}

function wirePublicEvents() {
  document.getElementById("filter-kind")?.addEventListener("change", () => {
    populateStatusOptions();
    applyPublicFilters();
  });

  document.getElementById("filter-status")?.addEventListener("change", () => {
    applyPublicFilters();
  });

  document.getElementById("filter-area")?.addEventListener("input", () => {
    applyPublicFilters();
  });

  document.getElementById("clear-filters-btn")?.addEventListener("click", () => {
    clearPublicFilters();
  });
}

function initPublicMap() {
  publicMap = L.map("public-map", {
    center: [-15.7942, -47.8822],
    zoom: 11,
    preferCanvas: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(publicMap);

  publicCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 40
  });
  publicMap.addLayer(publicCluster);
}

function setUpdatedAt(timestamp) {
  const node = document.getElementById("public-updated-at");
  if (!node) return;
  node.textContent = `Atualizacao: ${formatDateTime(timestamp)}`;
}

async function loadPublicPoints() {
  const response = await fetch(`${getApiBaseUrl()}/public-points`, {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Falha ao carregar dados publicos.");
  }

  const payload = await response.json();
  const points = Array.isArray(payload?.points) ? payload.points : [];

  allPublicPoints = points.filter((point) => {
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).map((point) => ({
    pointId: String(point.pointId || ""),
    kind: point.kind === "obra" ? "obra" : "fiscalizacao",
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    area: String(point.area || "").trim(),
    status: String(point.status || "").trim(),
    ano: Number.isFinite(Number(point.ano)) ? Number(point.ano) : null,
    conformidade: Number.isFinite(Number(point.conformidade)) ? Number(point.conformidade) : null,
    execucao: Number.isFinite(Number(point.execucao)) ? Number(point.execucao) : null
  }));

  setUpdatedAt(payload?.generatedAt);
}

async function initPublicPage() {
  initPublicMap();
  wirePublicEvents();

  try {
    await loadPublicPoints();
    populateStatusOptions();
    applyPublicFilters({ fitBounds: true });
    hasInitialFit = true;
  } catch (error) {
    console.error(error);
    updateStats([]);
    renderMarkers([], false);
    const node = document.getElementById("public-updated-at");
    if (node) node.textContent = "Nao foi possivel carregar os pontos agora.";
  }

  if (publicMap && hasInitialFit) {
    setTimeout(() => publicMap.invalidateSize(), 100);
  }
}

initPublicPage();
