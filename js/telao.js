(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const apiBaseUrl = String(window.TELAO_CONFIG?.apiBaseUrl || "/api").replace(/\/+$/, "");
  const slideDurationMs = Math.max(8000, Number(params.get("slide")) * 1000 || 18000);
  const refreshIntervalMs = Math.max(60000, Number(params.get("refresh")) * 1000 || 300000);
  const center = [-15.7942, -47.8822];

  const colors = ["#38bdf8", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#e11d48"];

  const state = {
    publicPoints: [],
    fiscalizacoes: [],
    obras: [],
    acoes: [],
    locais: [],
    rvf: [],
    rvfSummary: {},
    protectedAvailable: false,
    publicAvailable: false,
    lastUpdatedAt: "",
    currentSlide: 0,
    paused: false,
    slideStartedAt: Date.now(),
    map: null,
    cluster: null,
    wakeLock: null
  };

  const slides = Array.from(document.querySelectorAll(".telao-slide"));

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = byId(id);
    if (!element) return;
    element.textContent = String(value);
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
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

  function displayText(value, fallback = "Nao informado") {
    const raw = String(value == null ? "" : value).trim() || fallback;
    return raw
      .replace(/\bFiscalizacoes\b/g, "Fiscalizacoes")
      .replace(/\bFiscalizacao\b/g, "Fiscalizacao")
      .replace(/\bConcluida\b/g, "Concluida")
      .replace(/\bExecucao\b/g, "Execucao")
      .replace(/\bRegiao\b/g, "Regiao")
      .replace(/\bNao\b/g, "Nao");
  }

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return null;
    const normalized = raw
      .replace(/R\$/gi, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function number(value) {
    return (Number(value) || 0).toLocaleString("pt-BR");
  }

  function percent(value) {
    if (!Number.isFinite(value)) return "-";
    return `${Math.round(value)}%`;
  }

  function currency(value) {
    const parsed = Number(value) || 0;
    if (Math.abs(parsed) >= 1000000) {
      return parsed.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1
      });
    }
    return parsed.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0
    });
  }

  function formatDateTime(value) {
    const date = value ? new Date(value) : new Date();
    if (!Number.isFinite(date.getTime())) return "-";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function average(values) {
    const numbers = values.map(toNumber).filter(Number.isFinite);
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }

  function countBy(records, getter, limit = 8) {
    const counts = new Map();
    (records || []).forEach((record) => {
      const label = String(getter(record) || "").trim() || "Nao informado";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, limit);
  }

  function sum(records, getter) {
    return (records || []).reduce((total, record) => total + (toNumber(getter(record)) || 0), 0);
  }

  function includesStatus(value, needle) {
    return normalizeText(value).includes(needle);
  }

  function isConcluded(value) {
    const status = normalizeText(value);
    return status.includes("conclu") && !status.includes("nao");
  }

  function getFiscalStatus(record) {
    return record?.situacao || record?.status || "";
  }

  function getFiscalArea(record) {
    return record?.regiao_administrativa || record?.area || "";
  }

  function getFiscalConformity(record) {
    return toNumber(record?.indice_conformidade ?? record?.conformidade);
  }

  function getObraStatus(record) {
    return record?.situacao_contrato || record?.status || "";
  }

  function getObraArea(record) {
    return record?.local || record?.area || record?.regiao_administrativa || "";
  }

  function getObraProgress(record) {
    return toNumber(
      record?.percentual_executado_obra ??
      record?.execucao_fisica_pct ??
      record?.execucao_financeira_pct ??
      record?.execucao
    );
  }

  function hasCoords(record) {
    const lat = Number(record?.latitude);
    const lng = Number(record?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  }

  function classifyAcaoStatus(record) {
    const status = normalizeText(record?.situacao);
    if (!status) return "Nao informado";
    if (status.includes("nao concluida")) return "Nao concluida";
    if (status.includes("concluida")) return "Concluida";
    if (status.includes("andamento") || status.includes("execucao")) return "Em andamento";
    if (status.includes("pend")) return "Pendente";
    if (status.includes("cancel")) return "Cancelada";
    return String(record?.situacao || "Nao informado").trim();
  }

  function classifyDocumentType(value) {
    const normalized = normalizeText(value);
    if (!normalized) return "Nao informado";
    if (normalized.includes("oficio")) return "Oficio";
    if (normalized.includes("reuniao")) return "Reuniao";
    if (normalized.includes("memorando")) return "Memorando";
    if (normalized.includes("relatorio") && normalized.includes("fiscalizacao")) return "Relatorio de fiscalizacao";
    return String(value || "Outros").trim();
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      if (options.optional) return null;
      throw new Error(`Resposta invalida em ${path}`);
    }

    if (!response.ok) {
      if (options.optional) return null;
      throw new Error(payload?.error || `Falha ao carregar ${path}`);
    }

    return payload;
  }

  function setStatus(kind, message) {
    const pill = byId("telao-data-status");
    if (!pill) return;
    pill.className = `telao-status-pill is-${kind}`;
    pill.innerHTML = `<span class="telao-status-dot"></span><span>${escapeHtml(message)}</span>`;
  }

  function setRefreshStatus(message) {
    setText("telao-refresh-status", message);
  }

  async function loadAllData() {
    setRefreshStatus("Atualizando dados...");
    const now = new Date().toISOString();

    const publicPayload = await fetchJson("/public-points", { optional: true });
    state.publicAvailable = Boolean(publicPayload);
    state.publicPoints = Array.isArray(publicPayload?.points)
      ? publicPayload.points.filter(hasCoords).map((point, index) => ({
        pointId: String(point.pointId || `p-${index + 1}`),
        kind: point.kind === "obra" ? "obra" : "fiscalizacao",
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        area: String(point.area || "").trim(),
        status: String(point.status || "").trim(),
        ano: toNumber(point.ano),
        conformidade: toNumber(point.conformidade),
        execucao: toNumber(point.execucao)
      }))
      : [];

    const [fiscPayload, obrasPayload, acoesPayload, rvfPayload] = await Promise.all([
      fetchJson("/fiscalizacoes", { optional: true }),
      fetchJson("/obras", { optional: true }),
      fetchJson("/acoes-dashboard", { optional: true }),
      fetchJson("/rvf-relatorios", { optional: true })
    ]);

    state.fiscalizacoes = Array.isArray(fiscPayload?.records) ? fiscPayload.records : [];
    state.obras = Array.isArray(obrasPayload?.records) ? obrasPayload.records : [];
    state.acoes = Array.isArray(acoesPayload?.acoes) ? acoesPayload.acoes : [];
    state.locais = Array.isArray(acoesPayload?.locais) ? acoesPayload.locais : [];
    state.rvf = Array.isArray(rvfPayload?.relatorios) ? rvfPayload.relatorios : [];
    state.rvfSummary = rvfPayload?.summary || {};
    state.protectedAvailable = Boolean(fiscPayload || obrasPayload || acoesPayload || rvfPayload);
    state.lastUpdatedAt = publicPayload?.generatedAt || acoesPayload?.updatedAt || state.rvfSummary?.ultimaAtualizacao || now;

    renderAll();
    updateMap();

    setText("telao-updated-at", `Atualizacao: ${formatDateTime(state.lastUpdatedAt)}`);
    setRefreshStatus(`Atualiza a cada ${Math.round(refreshIntervalMs / 60000)} min`);

    if (state.publicAvailable && state.protectedAvailable) {
      setStatus("ok", "Dados completos");
    } else if (state.protectedAvailable) {
      setStatus("ok", "Dados internos");
    } else if (state.publicAvailable) {
      setStatus("warn", "Modo publico");
    } else {
      setStatus("error", "Sem conexao com dados");
    }
  }

  function getFiscalSource() {
    return state.fiscalizacoes.length ? state.fiscalizacoes : state.publicPoints.filter((point) => point.kind === "fiscalizacao");
  }

  function getObraSource() {
    return state.obras.length ? state.obras : state.publicPoints.filter((point) => point.kind === "obra");
  }

  function buildMapPoints() {
    if (state.publicPoints.length) return state.publicPoints;

    const fiscalPoints = state.fiscalizacoes.filter(hasCoords).map((record, index) => ({
      pointId: record.__backendId || `f-${index + 1}`,
      kind: "fiscalizacao",
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      area: getFiscalArea(record),
      status: getFiscalStatus(record),
      ano: toNumber(record.ano),
      conformidade: getFiscalConformity(record)
    }));

    const obraPoints = state.obras.filter(hasCoords).map((record, index) => ({
      pointId: record.__obraId || `o-${index + 1}`,
      kind: "obra",
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      area: getObraArea(record),
      status: getObraStatus(record),
      execucao: getObraProgress(record)
    }));

    return [...fiscalPoints, ...obraPoints];
  }

  function renderAll() {
    renderMapSummary();
    renderFiscalizacoes();
    renderObras();
    renderAcoesRvf();
  }

  function renderMapSummary() {
    const points = buildMapPoints();
    const fisc = points.filter((point) => point.kind === "fiscalizacao");
    const obras = points.filter((point) => point.kind === "obra");

    setText("map-total", number(points.length));
    setText("map-fisc", number(fisc.length));
    setText("map-obras", number(obras.length));
    setText("map-coverage", `${number(points.length)} pontos com coordenadas`);

    renderBars("map-status-bars", [
      ...countBy(fisc, getFiscalStatus, 4).map((item) => ({ ...item, label: `Fisc. ${item.label}` })),
      ...countBy(obras, getObraStatus, 4).map((item) => ({ ...item, label: `Obra ${item.label}` }))
    ].slice(0, 7), "Sem status para exibir.");

    renderBars("map-area-bars", countBy(points, (point) => point.area, 7), "Sem regioes para exibir.");
  }

  function renderFiscalizacoes() {
    const records = getFiscalSource();
    const andamento = records.filter((record) => includesStatus(getFiscalStatus(record), "andamento")).length;
    const concluidas = records.filter((record) => isConcluded(getFiscalStatus(record))).length;
    const pendentes = records.filter((record) => includesStatus(getFiscalStatus(record), "pend")).length;
    const avgConformity = average(records.map(getFiscalConformity));
    const totalAi = sum(records, (record) => record.autos_infracao);
    const totalTn = sum(records, (record) => record.termos_notificacao);
    const riskRecords = records.filter((record) => {
      const status = normalizeText(getFiscalStatus(record));
      const conformity = getFiscalConformity(record);
      const nonConforming = toNumber(record.constatacoes_nao_conformes) || 0;
      return (status.includes("pend") || status.includes("andamento")) &&
        ((Number.isFinite(conformity) && conformity < 60) || nonConforming > 0);
    });

    setText("fisc-total", number(records.length));
    setText("fisc-andamento", number(andamento));
    setText("fisc-concluidas", number(concluidas));
    setText("fisc-pendentes", number(pendentes));
    setText("fisc-conformidade", percent(avgConformity));
    setText("fisc-ai", number(totalAi));
    setText("fisc-tn", number(totalTn));
    setText("fisc-risk", number(riskRecords.length));

    const other = Math.max(records.length - andamento - concluidas - pendentes, 0);
    renderBars("fisc-status-bars", [
      { label: "Em andamento", total: andamento },
      { label: "Concluidas", total: concluidas },
      { label: "Pendentes", total: pendentes },
      { label: "Outras", total: other }
    ], "Nenhuma fiscalizacao cadastrada.");
    renderBars("fisc-region-bars", countBy(records, getFiscalArea, 8), "Sem regiao informada.");
    renderList(
      "fisc-alert-list",
      riskRecords.slice(0, 5).map((record) => ({
        title: record.id || getFiscalArea(record) || "Fiscalizacao",
        meta: `${displayText(getFiscalStatus(record))} | ${displayText(getFiscalArea(record))}`,
        value: percent(getFiscalConformity(record))
      })),
      state.protectedAvailable ? "Nenhuma fiscalizacao critica no momento." : "Entre no sistema para exibir alertas completos."
    );
  }

  function renderObras() {
    const records = getObraSource();
    const execucao = records.filter((record) => includesStatus(getObraStatus(record), "execu")).length;
    const recebimento = records.filter((record) => includesStatus(getObraStatus(record), "receb")).length;
    const avgProgress = average(records.map(getObraProgress));
    const totalValue = sum(records, (record) => record.valor_total_obra);
    const executedValue = sum(records, (record) => record.valor_executado_2025);
    const withCoords = records.filter(hasCoords).length;
    const attentionRecords = records.filter((record) => {
      const progress = getObraProgress(record);
      const status = normalizeText(getObraStatus(record));
      return (Number.isFinite(progress) && progress < 40) || status.includes("paralis") || status.includes("atras");
    });

    setText("obras-total", number(records.length));
    setText("obras-execucao", number(execucao));
    setText("obras-recebimento", number(recebimento));
    setText("obras-media", percent(avgProgress));
    setText("obras-valor-total", currency(totalValue));
    setText("obras-valor-executado", currency(executedValue));
    setText("obras-baixa", number(attentionRecords.length));
    setText("obras-com-coord", number(withCoords));

    const other = Math.max(records.length - execucao - recebimento, 0);
    renderBars("obras-status-bars", [
      { label: "Em execucao", total: execucao },
      { label: "Recebimento", total: recebimento },
      { label: "Outras", total: other }
    ], "Nenhuma obra cadastrada.");
    renderBars("obras-local-bars", countBy(records, getObraArea, 8), "Sem local informado.");
    renderList(
      "obras-alert-list",
      attentionRecords.slice(0, 5).map((record) => ({
        title: record.item || getObraArea(record) || "Obra",
        meta: `${displayText(getObraStatus(record))} | ${displayText(getObraArea(record))}`,
        value: percent(getObraProgress(record))
      })),
      state.protectedAvailable ? "Nenhuma obra em alerta no momento." : "Entre no sistema para exibir alertas completos."
    );
  }

  function renderAcoesRvf() {
    const acoes = state.acoes;
    const locais = state.locais;
    const concluidas = acoes.filter((record) => classifyAcaoStatus(record) === "Concluida").length;
    const andamento = acoes.filter((record) => classifyAcaoStatus(record) === "Em andamento").length;
    const pendentes = acoes.filter((record) => ["Pendente", "Nao concluida"].includes(classifyAcaoStatus(record))).length;
    const autos = sum(acoes, (record) => record.autos_infracao);
    const termos = sum(acoes, (record) => record.termos_notificacao);
    const rvfTotal = Number(state.rvfSummary?.total ?? state.rvf.length) || 0;
    const rvfAtivos = Number(state.rvfSummary?.ativos ?? state.rvf.filter((item) => item.status_link === "ativo").length) || 0;
    const rvfErros = Number(state.rvfSummary?.erros ?? state.rvf.filter((item) => item.status_link === "erro").length) || 0;
    const ultimoAno = state.rvfSummary?.ultimoAno || Math.max(...state.rvf.map((item) => Number(item.ano)).filter(Number.isFinite), 0) || "-";

    setText("acoes-total", number(acoes.length));
    setText("acoes-concluidas", number(concluidas));
    setText("acoes-andamento", number(andamento));
    setText("acoes-pendentes", number(pendentes));
    setText("acoes-ai", number(autos));
    setText("acoes-tn", number(termos));
    setText("acoes-locais", number(locais.length));
    setText("rvf-total", number(rvfTotal));
    setText("rvf-ativos", number(rvfAtivos));
    setText("rvf-erros", number(rvfErros));
    setText("rvf-ano", ultimoAno);
    setText("rvf-total-note", `${number(rvfTotal)} relatorios`);

    const note = byId("telao-protected-note");
    if (note) {
      note.textContent = state.protectedAvailable
        ? "Dados completos carregados pela sessao atual do sistema."
        : "Os dados completos aparecem quando a sessao do sistema estiver ativa.";
    }

    renderBars("acoes-status-bars", countBy(acoes, classifyAcaoStatus, 6), "Sem acoes COFA carregadas.");
    renderBars("acoes-doc-bars", countBy(acoes, (record) => classifyDocumentType(record.tipo_documento), 6), "Sem documentos carregados.");
    renderBars("acoes-regiao-bars", countBy(acoes, (record) => record.regiao_administrativa || record.local_ra, 8), "Sem regioes carregadas.");
    renderBars("rvf-status-bars", [
      { label: "Ativos", total: rvfAtivos },
      { label: "Com erro", total: rvfErros },
      { label: "Pendentes", total: Math.max(rvfTotal - rvfAtivos - rvfErros, 0) }
    ], "Sem relatorios RVF carregados.");
    renderList(
      "rvf-list",
      state.rvf.slice(0, 5).map((item) => ({
        title: item.titulo || "Relatorio RVF",
        meta: `${item.ano || "-"} | ${item.mes || "Mes nao informado"}`,
        value: item.status_link || "-"
      })),
      state.protectedAvailable ? "Nenhum relatorio RVF carregado." : "Entre no sistema para exibir o acervo RVF."
    );
  }

  function renderBars(containerId, items, emptyText) {
    const container = byId(containerId);
    if (!container) return;

    const visibleItems = (items || []).filter((item) => Number(item.total) > 0);
    if (!visibleItems.length) {
      container.innerHTML = `<p class="telao-empty">${escapeHtml(emptyText)}</p>`;
      return;
    }

    const max = Math.max(...visibleItems.map((item) => Number(item.total) || 0), 1);
    container.innerHTML = visibleItems.map((item, index) => {
      const total = Number(item.total) || 0;
      const width = Math.max(5, Math.round((total / max) * 100));
      return `
        <div class="telao-bar-row">
          <span class="telao-bar-label" title="${escapeHtml(item.label)}">${escapeHtml(displayText(item.label))}</span>
          <span class="telao-bar-track">
            <i style="width:${width}%; background:${colors[index % colors.length]}"></i>
          </span>
          <strong>${number(total)}</strong>
        </div>
      `;
    }).join("");
  }

  function renderList(containerId, items, emptyText) {
    const container = byId(containerId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p class="telao-empty">${escapeHtml(emptyText)}</p>`;
      return;
    }

    container.innerHTML = items.map((item) => `
      <article class="telao-list-row">
        <div>
          <strong title="${escapeHtml(item.title)}">${escapeHtml(displayText(item.title, "Registro"))}</strong>
          <span>${escapeHtml(displayText(item.meta || ""))}</span>
        </div>
        <em>${escapeHtml(displayText(item.value || "-"))}</em>
      </article>
    `).join("");
  }

  function markerIcon(kind) {
    const className = kind === "obra" ? "telao-marker-dot is-obra" : "telao-marker-dot is-fisc";
    return L.divIcon({
      className: "telao-marker",
      html: `<span class="${className}"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  function initMap() {
    const mapNode = byId("telao-map");
    if (!mapNode || !window.L) return;

    state.map = L.map(mapNode, {
      center,
      zoom: 11,
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(state.map);

    state.cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 46,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        const size = count >= 100 ? "is-large" : count >= 20 ? "is-medium" : "is-small";
        return L.divIcon({
          html: `<span>${count}</span>`,
          className: `telao-cluster ${size}`,
          iconSize: [46, 46]
        });
      }
    });
    state.map.addLayer(state.cluster);
  }

  function updateMap() {
    if (!state.cluster || !state.map) return;
    const points = buildMapPoints();
    state.cluster.clearLayers();

    points.forEach((point) => {
      const marker = L.marker([Number(point.latitude), Number(point.longitude)], {
        icon: markerIcon(point.kind)
      });
      const label = point.kind === "obra" ? "Obra" : "Fiscalizacao";
      const indicator = point.kind === "obra" ? getObraProgress(point) ?? point.execucao : getFiscalConformity(point) ?? point.conformidade;
      marker.bindPopup(`
        <div class="telao-popup">
          <strong>${label}</strong>
          <span>Status: ${escapeHtml(displayText(point.status))}</span>
          <span>Local: ${escapeHtml(displayText(point.area))}</span>
          <span>Indicador: ${escapeHtml(percent(indicator))}</span>
        </div>
      `);
      state.cluster.addLayer(marker);
    });

    if (points.length) {
      const bounds = L.latLngBounds(points.map((point) => [Number(point.latitude), Number(point.longitude)]));
      state.map.fitBounds(bounds.pad(0.12), { maxZoom: 13, animate: false });
    } else {
      state.map.setView(center, 11);
    }
  }

  function buildDots() {
    const container = byId("telao-dots");
    if (!container) return;
    container.innerHTML = slides.map((slide, index) => `
      <button type="button" aria-label="Abrir ${escapeHtml(slide.dataset.title || `slide ${index + 1}`)}" data-slide-index="${index}"></button>
    `).join("");
    container.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => showSlide(Number(button.dataset.slideIndex)));
    });
  }

  function showSlide(index) {
    if (!slides.length) return;
    state.currentSlide = (index + slides.length) % slides.length;
    state.slideStartedAt = Date.now();
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === state.currentSlide);
    });

    const active = slides[state.currentSlide];
    setText("telao-slide-title", active?.dataset?.title || "");
    setText("telao-slide-counter", `${state.currentSlide + 1}/${slides.length}`);
    document.querySelectorAll("#telao-dots button").forEach((button, dotIndex) => {
      button.classList.toggle("is-active", dotIndex === state.currentSlide);
    });

    if (state.currentSlide === 0 && state.map) {
      setTimeout(() => {
        state.map.invalidateSize();
        updateMap();
      }, 220);
    }
  }

  function nextSlide() {
    showSlide(state.currentSlide + 1);
  }

  function previousSlide() {
    showSlide(state.currentSlide - 1);
  }

  function togglePause() {
    state.paused = !state.paused;
    setText("telao-pause", state.paused ? "Retomar" : "Pausar");
    if (!state.paused) state.slideStartedAt = Date.now();
  }

  function tickCarousel() {
    const progress = byId("telao-progress-bar");
    if (!progress) return;

    if (state.paused || document.hidden) {
      progress.style.width = "0%";
      return;
    }

    const elapsed = Date.now() - state.slideStartedAt;
    const ratio = Math.min(1, elapsed / slideDurationMs);
    progress.style.width = `${Math.round(ratio * 100)}%`;
    if (ratio >= 1) nextSlide();
  }

  function updateClock() {
    const date = new Date();
    setText("telao-clock", date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    }));
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      state.wakeLock = null;
    }
  }

  function wireEvents() {
    byId("telao-prev")?.addEventListener("click", previousSlide);
    byId("telao-next")?.addEventListener("click", nextSlide);
    byId("telao-pause")?.addEventListener("click", togglePause);

    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") nextSlide();
      if (event.key === "ArrowLeft") previousSlide();
      if (event.key === " ") {
        event.preventDefault();
        togglePause();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        state.slideStartedAt = Date.now();
        requestWakeLock();
      }
    });
  }

  async function init() {
    initMap();
    buildDots();
    wireEvents();
    showSlide(0);
    updateClock();
    setInterval(updateClock, 15000);
    setInterval(tickCarousel, 250);
    setInterval(loadAllData, refreshIntervalMs);
    requestWakeLock();

    try {
      await loadAllData();
    } catch (error) {
      console.error(error);
      setStatus("error", "Falha ao carregar");
      setRefreshStatus("Verifique a conexao com a API");
      renderAll();
    }
  }

  init();
})();
