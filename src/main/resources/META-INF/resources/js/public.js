let publicMap = null;
let publicCluster = null;
let allPublicPoints = [];
let visiblePublicPoints = [];
let hasInitialFit = false;
let selectedKindFilter = "all";

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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Number(value).toFixed(1).replace(/\.0$/, "")}%`;
}

function getApiBaseUrl() {
  return String(window.PUBLIC_APP_CONFIG?.apiBaseUrl || "/api").trim().replace(/\/+$/, "");
}

function getMarkerClassName(kind) {
  return kind === "obra" ? "dot-obra" : "dot-fisc";
}

function createMarkerIcon(kind) {
  return L.divIcon({
    className: "public-div-icon",
    html: `<div class="public-marker ${getMarkerClassName(kind)}" aria-hidden="true"></div>`,
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

function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = String(value);
}

function updateStats(points) {
  const total = points.length;
  const fiscalizacoes = points.filter((point) => point.kind === "fiscalizacao").length;
  const obras = points.filter((point) => point.kind === "obra").length;

  setText("stat-total", total);
  setText("stat-fisc", fiscalizacoes);
  setText("stat-obras", obras);
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
  return selectedKindFilter;
}

function updateKindFilterButtons() {
  const configs = [
    { id: "view-all-btn", kind: "all" },
    { id: "view-fisc-btn", kind: "fiscalizacao" },
    { id: "view-obras-btn", kind: "obra" }
  ];

  configs.forEach((config) => {
    const button = document.getElementById(config.id);
    if (!button) return;
    button.classList.toggle("active", selectedKindFilter === config.kind);
  });
}

function updateViewLabel() {
  const label = document.getElementById("public-view-label");
  if (!label) return;

  if (selectedKindFilter === "fiscalizacao") {
    label.textContent = "Exibindo apenas Fiscalizacoes no mapa.";
    return;
  }

  if (selectedKindFilter === "obra") {
    label.textContent = "Exibindo apenas Obras no mapa.";
    return;
  }

  label.textContent = "Exibindo todos os pontos no mapa.";
}

function setKindFilter(kind, options = {}) {
  if (!["all", "fiscalizacao", "obra"].includes(kind)) return;
  selectedKindFilter = kind;
  updateKindFilterButtons();
  updateViewLabel();
  populateStatusOptions();
  applyPublicFilters({ fitBounds: Boolean(options.fitBounds) });
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

function isFiscAndamento(status) {
  return normalizeText(status).includes("andamento");
}

function isFiscConcluida(status) {
  return normalizeText(status).includes("conclu");
}

function isFiscPendente(status) {
  return normalizeText(status).includes("pend");
}

function isObraExecucao(status) {
  return normalizeText(status).includes("execu");
}

function isObraRecebimento(status) {
  return normalizeText(status).includes("receb");
}

function averageFrom(points, fieldName) {
  const values = points
    .map((point) => Number(point[fieldName]))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderDistributionBars(containerId, rows, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!rows.length || total === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const max = Math.max(...rows.map((row) => row.count), 1);

  container.innerHTML = rows.map((row) => {
    const width = Math.max(8, Math.round((row.count / max) * 100));
    return `
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-slate-300 w-24 shrink-0">${escapeHtml(row.label)}</span>
        <div class="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div class="h-full rounded-full ${row.barClass}" style="width: ${width}%"></div>
        </div>
        <span class="text-[11px] text-slate-300 w-8 text-right">${row.count}</span>
      </div>
    `;
  }).join("");
}

function renderTopAreas(containerId, points, emptyText, barClass) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!points.length) {
    container.innerHTML = `<p class="text-xs text-slate-500">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const counts = {};
  points.forEach((point) => {
    const area = String(point.area || "Nao informado").trim() || "Nao informado";
    counts[area] = (counts[area] || 0) + 1;
  });

  const ranking = Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4);

  const max = ranking.length ? ranking[0][1] : 1;
  container.innerHTML = ranking.map(([area, count]) => {
    const width = Math.max(8, Math.round((count / max) * 100));
    return `
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-slate-300 w-28 shrink-0 truncate" title="${escapeHtml(area)}">${escapeHtml(area)}</span>
        <div class="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div class="h-full rounded-full ${barClass}" style="width: ${width}%"></div>
        </div>
        <span class="text-[11px] text-slate-300 w-8 text-right">${count}</span>
      </div>
    `;
  }).join("");
}

function updateDetailedDashboard(points) {
  const fiscalizacoes = points.filter((point) => point.kind === "fiscalizacao");
  const obras = points.filter((point) => point.kind === "obra");
  const total = points.length;

  const fisAndamento = fiscalizacoes.filter((point) => isFiscAndamento(point.status)).length;
  const fisConcluidas = fiscalizacoes.filter((point) => isFiscConcluida(point.status)).length;
  const fisPendentes = fiscalizacoes.filter((point) => isFiscPendente(point.status)).length;
  const fisAvg = averageFrom(fiscalizacoes, "conformidade");

  const obrasExecucao = obras.filter((point) => isObraExecucao(point.status)).length;
  const obrasRecebimento = obras.filter((point) => isObraRecebimento(point.status)).length;
  const obrasOutras = Math.max(obras.length - obrasExecucao - obrasRecebimento, 0);
  const obrasAvg = averageFrom(obras, "execucao");

  setText("dash-fisc-total", fiscalizacoes.length);
  setText("dash-fisc-andamento", fisAndamento);
  setText("dash-fisc-concluidas", fisConcluidas);
  setText("dash-fisc-pendentes", fisPendentes);
  setText("dash-fisc-avg", formatPercent(fisAvg));

  setText("dash-obras-total", obras.length);
  setText("dash-obras-execucao", obrasExecucao);
  setText("dash-obras-recebimento", obrasRecebimento);
  setText("dash-obras-outras", obrasOutras);
  setText("dash-obras-avg", formatPercent(obrasAvg));

  const fisShare = total > 0 ? Math.round((fiscalizacoes.length / total) * 100) : 0;
  const obrasShare = total > 0 ? Math.round((obras.length / total) * 100) : 0;
  setText("dash-fisc-share", `${fisShare}% do mapa`);
  setText("dash-obras-share", `${obrasShare}% do mapa`);

  renderDistributionBars(
    "dash-fisc-status-bars",
    [
      { label: "Andamento", count: fisAndamento, barClass: "bg-gradient-to-r from-amber-500 to-yellow-400" },
      { label: "Concluidas", count: fisConcluidas, barClass: "bg-gradient-to-r from-emerald-600 to-emerald-400" },
      { label: "Pendentes", count: fisPendentes, barClass: "bg-gradient-to-r from-rose-600 to-rose-400" }
    ],
    "Nenhuma fiscalizacao encontrada nos filtros."
  );

  renderDistributionBars(
    "dash-obras-status-bars",
    [
      { label: "Em execucao", count: obrasExecucao, barClass: "bg-gradient-to-r from-amber-500 to-yellow-400" },
      { label: "Recebimento", count: obrasRecebimento, barClass: "bg-gradient-to-r from-emerald-600 to-emerald-400" },
      { label: "Outras", count: obrasOutras, barClass: "bg-gradient-to-r from-sky-600 to-sky-400" }
    ],
    "Nenhuma obra encontrada nos filtros."
  );

  renderTopAreas(
    "dash-fisc-areas",
    fiscalizacoes,
    "Sem registros para exibir.",
    "bg-gradient-to-r from-amber-600 to-yellow-400"
  );

  renderTopAreas(
    "dash-obras-areas",
    obras,
    "Sem registros para exibir.",
    "bg-gradient-to-r from-emerald-600 to-emerald-400"
  );
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
  updateDetailedDashboard(visiblePublicPoints);
  renderMarkers(visiblePublicPoints, Boolean(options.fitBounds));
}

function clearPublicFilters() {
  const status = document.getElementById("filter-status");
  const area = document.getElementById("filter-area");

  if (status) status.value = "";
  if (area) area.value = "";

  selectedKindFilter = "all";
  updateKindFilterButtons();
  updateViewLabel();
  populateStatusOptions();
  applyPublicFilters({ fitBounds: true });
}

function wirePublicEvents() {
  document.getElementById("view-all-btn")?.addEventListener("click", () => {
    setKindFilter("all", { fitBounds: true });
  });

  document.getElementById("view-fisc-btn")?.addEventListener("click", () => {
    setKindFilter("fiscalizacao", { fitBounds: true });
  });

  document.getElementById("view-obras-btn")?.addEventListener("click", () => {
    setKindFilter("obra", { fitBounds: true });
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

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap &copy; CARTO"
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
  updateKindFilterButtons();
  updateViewLabel();

  try {
    await loadPublicPoints();
    populateStatusOptions();
    applyPublicFilters({ fitBounds: true });
    hasInitialFit = true;
  } catch (error) {
    console.error(error);
    updateStats([]);
    updateDetailedDashboard([]);
    renderMarkers([], false);
    const node = document.getElementById("public-updated-at");
    if (node) node.textContent = "Nao foi possivel carregar os pontos agora.";
  }

  if (publicMap && hasInitialFit) {
    setTimeout(() => publicMap.invalidateSize(), 100);
  }
}

initPublicPage();
