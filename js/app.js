// ======== Fix 100vh no mobile (barra do navegador) ========
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);
setAppHeight();

// ======== Global State ========
let allFiscalizacoes = [];
let filteredFiscalizacoes = [];
let currentFiscalizacao = null;
let map = null;
let markerClusterGroup = null;
let markers = {};
let isSelectingLocation = false;
let tempMarker = null;
let deleteTarget = null;
let allObras = [];
let filteredObras = [];
let currentObra = null;
let currentView = 'fiscalizacoes';
let pendingObrasUpload = [];
let pendingObrasMeta = null;
let pendingFiscalizacoesUpload = [];
let pendingFiscalizacoesMeta = null;
let importSimulation = null;
let listPage = 1;
let listTotalPages = 1;
let isDraftSyncing = false;
let draftSaveTimer = null;
let lastAppliedFilterFingerprint = '';

const LIST_DEFAULT_PAGE_SIZE = 12;
const LIST_STATE_KEY = 'fiscalizacoes_list_state_v1';
const FILTER_STATE_KEY = 'fiscalizacoes_filter_state_v1';
const FILTER_FAVORITES_KEY = 'fiscalizacoes_filter_favorites_v1';
const FILTER_RECENTS_KEY = 'fiscalizacoes_filter_recents_v1';
const FORM_DRAFT_KEY = 'fiscalizacao_form_draft_v1';
const AUDIT_LOCAL_KEY = 'fiscalizacoes_audit_local_v1';
const SESSION_METRICS_KEY = 'fiscalizacoes_session_metrics_v1';
const MAP_LAYER_STATE_KEY = 'fiscalizacoes_map_layers_v1';
const MAP_LEGEND_STATE_KEY = 'fiscalizacoes_map_legend_v1';
const MAX_AUDIT_ENTRIES = 300;

const FISCALIZACAO_FORM_FIELDS = [
  'form-backend-id',
  'form-id',
  'form-processo-sei',
  'form-ano',
  'form-regiao',
  'form-lat',
  'form-lng',
  'form-situacao',
  'form-direta',
  'form-programada',
  'form-conformidade',
  'form-tipo-doc',
  'form-sei-doc',
  'form-data',
  'form-objetivo',
  'form-destinatario',
  'form-constatacoes',
  'form-nao-conformes',
  'form-recomendacoes',
  'form-determinacoes',
  'form-tn',
  'form-ai',
  'form-tac',
  'form-imagem-data'
];

const listSettings = {
  sortField: 'updated_at',
  sortDirection: 'desc',
  pageSize: LIST_DEFAULT_PAGE_SIZE
};

const sessionMetrics = {
  saves: 0,
  imports: 0,
  filtersApplied: 0
};

const fieldLabels = {
  'form-id': 'ID',
  'form-processo-sei': 'Processo SEI',
  'form-ano': 'Ano',
  'form-regiao': 'Região',
  'form-situacao': 'Situação',
  'form-direta': 'Tipo (Direta/Indireta)',
  'form-conformidade': 'Índice de conformidade',
  'form-data': 'Data'
};

let mapLayerVisibility = {
  em_andamento: true,
  concluida: true,
  pendente: true,
  obra_alta: true,
  obra_media: true,
  obra_baixa: true,
  obra_sem_pct: true
};
let isMapLegendCollapsed = false;

const OBRAS_STORAGE_KEY = 'obras_storage_v1';
const VIEW_MODE_KEY = 'fiscalizacoes_data_view';

const defaultConfig = {
  app_title: 'Painel de Fiscalizações',
  subtitle: 'Monitoramento territorial e conformidade em tempo real'
};

const regionCoordinates = {
  'Plano Piloto': [-15.7942, -47.8822],
  'Gama': [-16.0192, -48.0617],
  'Taguatinga': [-15.8364, -48.0564],
  'Brazlandia': [-15.6759, -48.2125],
  'Sobradinho': [-15.6500, -47.7878],
  'Planaltina': [-15.6204, -47.6482],
  'Paranoa': [-15.7735, -47.7767],
  'Nucleo Bandeirante': [-15.8714, -47.9675],
  'Ceilandia': [-15.8197, -48.1117],
  'Guara': [-15.8333, -47.9833],
  'Cruzeiro': [-15.7942, -47.9311],
  'Samambaia': [-15.8789, -48.0992],
  'Santa Maria': [-16.0197, -48.0028],
  'Sao Sebastiao': [-15.9025, -47.7631],
  'Recanto das Emas': [-15.9167, -48.0667],
  'Lago Sul': [-15.8333, -47.8500],
  'Riacho Fundo': [-15.8833, -48.0167],
  'Lago Norte': [-15.7333, -47.8500],
  'Candangolandia': [-15.8500, -47.9500],
  'Aguas Claras': [-15.8333, -48.0333],
  'Riacho Fundo II': [-15.9000, -48.0500],
  'Sudoeste/Octogonal': [-15.8000, -47.9167],
  'Varjao': [-15.7167, -47.8667],
  'Park Way': [-15.9000, -47.9500],
  'SCIA/Estrutural': [-15.7833, -47.9833],
  'Sobradinho II': [-15.6333, -47.8000],
  'Jardim Botanico': [-15.8667, -47.8000],
  'Itapoa': [-15.7500, -47.7667],
  'SIA': [-15.8167, -47.9500],
  'Vicente Pires': [-15.8000, -48.0333],
  'Fercal': [-15.6000, -47.9000],
  'Sol Nascente/Por do Sol': [-15.8000, -48.1333],
  'Arniqueira': [-15.8500, -48.0333]
};

const DISPLAY_TEXT_OVERRIDES = new Map([
  ['Aguas Claras', 'Águas Claras'],
  ['Brazlandia', 'Brazlândia'],
  ['Paranoa', 'Paranoá'],
  ['Nucleo Bandeirante', 'Núcleo Bandeirante'],
  ['Ceilandia', 'Ceilândia'],
  ['Guara', 'Guará'],
  ['Sao Sebastiao', 'São Sebastião'],
  ['Candangolandia', 'Candangolândia'],
  ['Varjao', 'Varjão'],
  ['Jardim Botanico', 'Jardim Botânico'],
  ['Itapoa', 'Itapoã'],
  ['Nao Programada', 'Não Programada'],
  ['Sem regiao', 'Sem região'],
  ['Sem situacao', 'Sem situação'],
  ['Regiao Administrativa', 'Região Administrativa'],
  ['Situacao do Contrato', 'Situação do Contrato'],
  ['No Processo SEI', 'Nº Processo SEI'],
  ['No SEI', 'Nº SEI'],
  ['Destinatario', 'Destinatário'],
  ['Programacao', 'Programação'],
  ['Localizacao', 'Localização'],
  ['Informacoes Basicas', 'Informações Básicas'],
  ['Identificacao', 'Identificação'],
  ['Observacoes', 'Observações'],
  ['Acao', 'Ação'],
  ['Acoes', 'Ações'],
  ['Em operacao', 'Em operação'],
  ['Numero do Contrato', 'Número do Contrato'],
  ['Plano de Exploracao', 'Plano de Exploração'],
  ['Inicio', 'Início'],
  ['Termino', 'Término'],
  ['Concluida', 'Concluída'],
  ['Concluidas', 'Concluídas'],
  ['Situacao', 'Situação'],
  ['Situacoes', 'Situações'],
  ['Regiao', 'Região'],
  ['Regioes', 'Regiões'],
  ['Execucao', 'Execução'],
  ['Conformidade Media', 'Conformidade Média'],
  ['Indice de conformidade', 'Índice de conformidade'],
  ['Total de Fiscalizacoes', 'Total de Fiscalizações'],
  ['Total Autos de Infracao', 'Total de Autos de Infração'],
  ['Total de Termos de Notificacao', 'Total de Termos de Notificação'],
  ['Distribuicao por Situacao', 'Distribuição por Situação'],
  ['Distribuicao por Situacao do Contrato', 'Distribuição por Situação do Contrato'],
  ['Por Regiao Administrativa', 'Por Região Administrativa'],
  ['Dashboard de Metricas', 'Dashboard de Métricas'],
  ['Em Execucao', 'Em Execução'],
  ['Execucao Media', 'Execução Média'],
  ['Pendencias criticas', 'Pendências críticas']
]);

function normalizePlainText(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDisplayText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const exact = DISPLAY_TEXT_OVERRIDES.get(raw);
  if (exact) return exact;

  return raw
    .replace(/\bFiscalizacoes\b/g, 'Fiscalizações')
    .replace(/\bFiscalizacao\b/g, 'Fiscalização')
    .replace(/\bConcluidas\b/g, 'Concluídas')
    .replace(/\bConcluida\b/g, 'Concluída')
    .replace(/\bSituacoes\b/g, 'Situações')
    .replace(/\bSituacao\b/g, 'Situação')
    .replace(/\bRegioes\b/g, 'Regiões')
    .replace(/\bRegiao\b/g, 'Região')
    .replace(/\bExecucao\b/g, 'Execução')
    .replace(/\bLocalizacao\b/g, 'Localização')
    .replace(/\bInformacoes\b/g, 'Informações')
    .replace(/\bIdentificacao\b/g, 'Identificação')
    .replace(/\bNotificacao\b/g, 'Notificação')
    .replace(/\bInfracao\b/g, 'Infração')
    .replace(/\bIndice\b/g, 'Índice')
    .replace(/\bNao\b/g, 'Não')
    .replace(/\bnao\b/g, 'não')
    .replace(/\bMedia\b/g, 'Média');
}

function normalizeHeaderKey(value) {
  return normalizePlainText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hasMeaningfulRecordData(record) {
  return Object.values(record || {}).some((value) => {
    if (value == null) return false;
    return String(value).trim() !== '';
  });
}

function getFirstRecordValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }

  return '';
}

function parseLocalizedNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let text = String(value).trim();
  if (!text || text === '-') return null;

  text = text
    .replace(/R\$/gi, '')
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,.\-]/g, '');

  if (!text) return null;

  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadStoredObras() {
  try {
    const raw = localStorage.getItem(OBRAS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

function saveStoredObras(records) {
  localStorage.setItem(OBRAS_STORAGE_KEY, JSON.stringify({
    updatedAt: new Date().toISOString(),
    records
  }));
}

function clearStoredObras() {
  localStorage.removeItem(OBRAS_STORAGE_KEY);
}

function loadStoredView() {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === 'obras' ? 'obras' : 'fiscalizacoes';
}

function saveStoredView(view) {
  localStorage.setItem(VIEW_MODE_KEY, view === 'obras' ? 'obras' : 'fiscalizacoes');
}

function sanitizeCoordinate(value, axis) {
  const parsed = parseLocalizedNumber(value);
  if (parsed === null) return null;

  if (axis === 'lat') {
    if (Math.abs(parsed) < 10 || Math.abs(parsed) > 90) return null;
    return parsed;
  }

  let longitude = parsed;
  if (longitude > 0 && longitude <= 180) longitude *= -1;
  if (Math.abs(longitude) < 10 || Math.abs(longitude) > 180) return null;
  return longitude;
}

function inferCoordinatesFromLocal(local) {
  const normalizedLocal = normalizePlainText(local);
  if (!normalizedLocal) return null;

  for (const [region, coords] of Object.entries(regionCoordinates)) {
    if (normalizedLocal.includes(normalizePlainText(region))) return coords;
  }

  const aliases = [
    ['sol nascente / por do sol', 'Sol Nascente/Por do Sol'],
    ['sol nascente e por do sol', 'Sol Nascente/Por do Sol'],
    ['aguas claras', 'Aguas Claras'],
    ['nucleo bandeirante', 'Nucleo Bandeirante'],
    ['sao sebastiao', 'Sao Sebastiao'],
    ['ceilandia', 'Ceilandia'],
    ['guara', 'Guara'],
    ['paranoa', 'Paranoa'],
    ['itapoa', 'Itapoa'],
    ['jardim botanico', 'Jardim Botanico'],
    ['varjao', 'Varjao'],
    ['brazlandia', 'Brazlandia'],
    ['candangolandia', 'Candangolandia']
  ];

  for (const [alias, region] of aliases) {
    if (normalizedLocal.includes(alias)) return regionCoordinates[region];
  }

  return null;
}

function buildObraId(seed, index) {
  const base = normalizePlainText(seed || `obra-${index + 1}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `obra-${index + 1}-${base || 'item'}`;
}

function normalizeObraRecord(record, index) {
  return {
    __obraId: record?.__obraId || buildObraId(record?.item || record?.local || record?.objeto_contrato, index),
    ...record
  };
}

function formatCurrency(value) {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Number(value).toFixed(1).replace(/\.0$/, '')}%`;
}

function normalizeDateDisplay(value) {
  const text = (value || '').toString().trim();
  if (!text) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00`).toLocaleDateString('pt-BR');
  }
  return text;
}

function readStoredJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallbackValue : parsed;
  } catch {
    return fallbackValue;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [dayRaw, monthRaw, yearRaw] = text.split('/').map((part) => parseInt(part, 10));
    const day = String(dayRaw).padStart(2, '0');
    const month = String(monthRaw).padStart(2, '0');
    return `${yearRaw}-${month}-${day}`;
  }
  return '';
}

function isModalOpen(id) {
  const node = document.getElementById(id);
  if (!node) return false;
  return !node.classList.contains('hidden');
}

function normalizeIdentityPart(value) {
  return normalizePlainText(String(value || '')).replace(/\s+/g, '');
}

function buildFiscalizacaoIdentity(record) {
  const idPart = normalizeIdentityPart(record?.id);
  const processoPart = normalizeIdentityPart(record?.processo_sei);
  if (!idPart && !processoPart) return '';
  return `${idPart}::${processoPart}`;
}

function bumpSessionMetric(metricName, delta = 1) {
  if (!Object.prototype.hasOwnProperty.call(sessionMetrics, metricName)) return;
  sessionMetrics[metricName] += delta;
  writeStoredJson(SESSION_METRICS_KEY, sessionMetrics);
}

function loadSessionMetrics() {
  const stored = readStoredJson(SESSION_METRICS_KEY, {});
  sessionMetrics.saves = Number(stored.saves || 0);
  sessionMetrics.imports = Number(stored.imports || 0);
  sessionMetrics.filtersApplied = Number(stored.filtersApplied || 0);
}

function setOperationStatus(text, type = 'idle') {
  const badge = document.getElementById('operation-status');
  const dot = document.getElementById('operation-status-dot');
  const label = document.getElementById('operation-status-text');
  if (!badge || !dot || !label) return;

  const dotClass = {
    idle: 'bg-slate-500',
    syncing: 'bg-blue-400',
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    error: 'bg-red-400'
  };

  badge.classList.remove('hidden');
  dot.className = `w-2 h-2 rounded-full ${dotClass[type] || dotClass.idle}`;
  label.textContent = text;
}

function getListSortOptions() {
  if (currentView === 'obras') {
    return [
      { value: 'item', label: 'Item' },
      { value: 'local', label: 'Local' },
      { value: 'situacao', label: 'Situação' },
      { value: 'progress', label: 'Execução' }
    ];
  }

  return [
    { value: 'id', label: 'ID' },
    { value: 'ano', label: 'Ano' },
    { value: 'situacao', label: 'Situação' },
    { value: 'conformidade', label: 'Conformidade' },
    { value: 'regiao', label: 'Região' }
  ];
}

function getComparableValue(record, field) {
  if (currentView === 'obras') {
    switch (field) {
      case 'item':
        return normalizePlainText(record.item);
      case 'local':
        return normalizePlainText(record.local);
      case 'situacao':
        return normalizePlainText(record.situacao_contrato);
      case 'progress':
        return Number.isFinite(getObraProgressValue(record)) ? getObraProgressValue(record) : -1;
      default:
        return normalizePlainText(record.item);
    }
  }

  switch (field) {
    case 'id':
      return normalizePlainText(record.id);
    case 'ano':
      return Number(record.ano || 0);
    case 'situacao':
      return normalizePlainText(record.situacao);
    case 'conformidade':
      return Number.isFinite(Number(record.indice_conformidade)) ? Number(record.indice_conformidade) : -1;
    case 'regiao':
      return normalizePlainText(record.regiao_administrativa);
    default:
      return normalizePlainText(record.id);
  }
}

function sortRecords(records) {
  const sortField = listSettings.sortField;
  const sortDirection = listSettings.sortDirection === 'asc' ? 1 : -1;

  return [...records].sort((a, b) => {
    const left = getComparableValue(a, sortField);
    const right = getComparableValue(b, sortField);

    if (left === right) return 0;
    if (left > right) return sortDirection;
    return -sortDirection;
  });
}

function paginateRecords(records) {
  const pageSize = Number(listSettings.pageSize || LIST_DEFAULT_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  listTotalPages = totalPages;
  if (listPage > totalPages) listPage = totalPages;
  if (listPage < 1) listPage = 1;

  const start = (listPage - 1) * pageSize;
  const end = start + pageSize;
  return records.slice(start, end);
}

function updatePaginationUI(totalItems) {
  const wrapper = document.getElementById('list-pagination');
  const prev = document.getElementById('pagination-prev');
  const next = document.getElementById('pagination-next');
  const info = document.getElementById('pagination-info');
  if (!wrapper || !prev || !next || !info) return;

  const shouldShow = totalItems > Number(listSettings.pageSize || LIST_DEFAULT_PAGE_SIZE);
  wrapper.classList.toggle('hidden', !shouldShow);
  info.textContent = `Pagina ${listPage} de ${listTotalPages}`;
  prev.disabled = listPage <= 1;
  next.disabled = listPage >= listTotalPages;
  prev.classList.toggle('opacity-50', prev.disabled);
  next.classList.toggle('opacity-50', next.disabled);
  prev.classList.toggle('cursor-not-allowed', prev.disabled);
  next.classList.toggle('cursor-not-allowed', next.disabled);
}

function saveListState() {
  writeStoredJson(LIST_STATE_KEY, {
    sortField: listSettings.sortField,
    sortDirection: listSettings.sortDirection,
    pageSize: listSettings.pageSize
  });
}

function loadListState() {
  const stored = readStoredJson(LIST_STATE_KEY, {});
  if (stored.sortField) listSettings.sortField = stored.sortField;
  if (stored.sortDirection === 'asc' || stored.sortDirection === 'desc') {
    listSettings.sortDirection = stored.sortDirection;
  }
  if (Number.isFinite(Number(stored.pageSize)) && Number(stored.pageSize) > 0) {
    listSettings.pageSize = Number(stored.pageSize);
  }
}

function saveFilterState() {
  writeStoredJson(FILTER_STATE_KEY, {
    view: currentView,
    search: document.getElementById('filter-search')?.value || '',
    regiao: document.getElementById('filter-regiao')?.value || '',
    situacao: document.getElementById('filter-situacao')?.value || '',
    ano: document.getElementById('filter-ano')?.value || '',
    conformidade: Number(document.getElementById('filter-conformidade')?.value || 0)
  });
}

function restoreFilterState() {
  const stored = readStoredJson(FILTER_STATE_KEY, null);
  if (!stored) return;

  if (stored.view === 'obras' || stored.view === 'fiscalizacoes') {
    currentView = stored.view;
  }

  const search = document.getElementById('filter-search');
  const regiao = document.getElementById('filter-regiao');
  const situacao = document.getElementById('filter-situacao');
  const ano = document.getElementById('filter-ano');
  const conformidade = document.getElementById('filter-conformidade');

  if (search) search.value = stored.search || '';
  if (regiao) regiao.value = stored.regiao || '';
  if (situacao) situacao.value = stored.situacao || '';
  if (ano) ano.value = stored.ano || '';
  if (conformidade) conformidade.value = String(Number(stored.conformidade || 0));
  updateConformidadeLabel();
}

function getCurrentFilterSnapshot() {
  return {
    view: currentView,
    search: document.getElementById('filter-search')?.value || '',
    regiao: document.getElementById('filter-regiao')?.value || '',
    situacao: document.getElementById('filter-situacao')?.value || '',
    ano: document.getElementById('filter-ano')?.value || '',
    conformidade: Number(document.getElementById('filter-conformidade')?.value || 0)
  };
}

function applyFilterSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.view === 'obras' || snapshot.view === 'fiscalizacoes') {
    if (snapshot.view !== currentView) {
      switchDataView(snapshot.view);
    }
  }

  const search = document.getElementById('filter-search');
  const regiao = document.getElementById('filter-regiao');
  const situacao = document.getElementById('filter-situacao');
  const ano = document.getElementById('filter-ano');
  const conformidade = document.getElementById('filter-conformidade');

  if (search) search.value = snapshot.search || '';
  if (regiao) regiao.value = snapshot.regiao || '';
  if (situacao) situacao.value = snapshot.situacao || '';
  if (ano) ano.value = snapshot.ano || '';
  if (conformidade) conformidade.value = String(Number(snapshot.conformidade || 0));
  updateConformidadeLabel();
  applyFilters();
}

function getFilterFavorites() {
  const favorites = readStoredJson(FILTER_FAVORITES_KEY, []);
  return Array.isArray(favorites) ? favorites : [];
}

function saveFilterFavorites(favorites) {
  writeStoredJson(FILTER_FAVORITES_KEY, favorites.slice(0, 8));
}

function getRecentFilters() {
  const recents = readStoredJson(FILTER_RECENTS_KEY, []);
  return Array.isArray(recents) ? recents : [];
}

function saveRecentFilters(recents) {
  writeStoredJson(FILTER_RECENTS_KEY, recents.slice(0, 5));
}

function buildFilterSummaryText(filter) {
  const parts = [];
  if (filter.regiao) parts.push(filter.regiao);
  if (filter.situacao) parts.push(filter.situacao);
  if (filter.ano) parts.push(filter.ano);
  if (filter.search) parts.push(`"${filter.search}"`);
  if (!parts.length) return 'Sem restricao';
  return parts.slice(0, 2).join(' | ');
}

function addCurrentFilterToRecent() {
  const snapshot = getCurrentFilterSnapshot();
  const fingerprint = JSON.stringify(snapshot);
  const recents = getRecentFilters().filter((item) => item.fingerprint !== fingerprint);

  recents.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    fingerprint,
    label: buildFilterSummaryText(snapshot),
    filter: snapshot,
    at: nowIso()
  });

  saveRecentFilters(recents);
}

function saveCurrentFilterFavorite() {
  const snapshot = getCurrentFilterSnapshot();
  const summary = buildFilterSummaryText(snapshot);
  const name = window.prompt('Nome para este filtro favorito:', summary);
  if (!name || !name.trim()) return;

  const favorites = getFilterFavorites();
  favorites.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: name.trim(),
    filter: snapshot,
    createdAt: nowIso()
  });
  saveFilterFavorites(favorites);
  renderSavedFilterButtons();
  showToast('Filtro favorito salvo.', 'success');
}
window.saveCurrentFilterFavorite = saveCurrentFilterFavorite;

function removeFilterFavorite(favoriteId) {
  const nextFavorites = getFilterFavorites().filter((favorite) => favorite.id !== favoriteId);
  saveFilterFavorites(nextFavorites);
  renderSavedFilterButtons();
}
window.removeFilterFavorite = removeFilterFavorite;

function applyFavoriteFilter(favoriteId) {
  const favorite = getFilterFavorites().find((item) => item.id === favoriteId);
  if (!favorite) return;
  applyFilterSnapshot(favorite.filter);
}
window.applyFavoriteFilter = applyFavoriteFilter;

function applyRecentFilter(index) {
  const item = getRecentFilters()[index];
  if (!item) return;
  applyFilterSnapshot(item.filter);
}
window.applyRecentFilter = applyRecentFilter;

function renderSavedFilterButtons() {
  const favoritesContainer = document.getElementById('favorite-filter-buttons');
  const recentsContainer = document.getElementById('recent-filter-buttons');
  const emptyFavorites = document.getElementById('favorite-filter-empty');
  const emptyRecents = document.getElementById('recent-filter-empty');

  if (!favoritesContainer || !recentsContainer) return;

  const favorites = getFilterFavorites();
  favoritesContainer.innerHTML = favorites.map((favorite) => `
    <div class="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-700/70 px-2 py-1">
      <button type="button"
        onclick="applyFavoriteFilter('${favorite.id}')"
        class="text-xs text-slate-100 hover:text-white max-w-[120px] truncate"
        title="${escapeHtml(favorite.name)}">
        ${escapeHtml(favorite.name)}
      </button>
      <button type="button"
        onclick="removeFilterFavorite('${favorite.id}')"
        class="text-[11px] text-slate-400 hover:text-red-300"
        aria-label="Remover favorito ${escapeHtml(favorite.name)}">
        x
      </button>
    </div>
  `).join('');

  const recents = getRecentFilters();
  recentsContainer.innerHTML = recents.map((item, index) => `
    <button type="button"
      onclick="applyRecentFilter(${index})"
      class="px-2 py-1 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
      title="${escapeHtml(item.label)}">
      ${escapeHtml(item.label)}
    </button>
  `).join('');

  if (emptyFavorites) emptyFavorites.classList.toggle('hidden', favorites.length > 0);
  if (emptyRecents) emptyRecents.classList.toggle('hidden', recents.length > 0);
}

function renderQuickFilterButtons() {
  const container = document.getElementById('quick-filter-buttons');
  if (!container) return;

  const buttons = currentView === 'obras'
    ? [
      { key: 'obras_sem_coord', label: 'Sem coord.' },
      { key: 'obras_execucao_baixa', label: 'Execução < 40%' },
      { key: 'obras_em_execucao', label: 'Em execucao' }
    ]
    : [
      { key: 'fisc_pendente', label: 'Pendentes' },
      { key: 'fisc_concluida', label: 'Concluídas' },
      { key: 'fisc_sem_coord', label: 'Sem coord.' }
    ];

  container.innerHTML = buttons.map((button) => `
    <button type="button"
      onclick="applyQuickFilter('${button.key}')"
      class="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-medium transition-colors">
      ${escapeHtml(button.label)}
    </button>
  `).join('');

  renderSavedFilterButtons();
}
window.applyQuickFilter = applyQuickFilter;

function applyQuickFilter(filterKey) {
  resetFilterInputs();

  if (filterKey === 'fisc_pendente') {
    document.getElementById('filter-situacao').value = 'Pendente';
  } else if (filterKey === 'fisc_concluida') {
    document.getElementById('filter-situacao').value = 'Concluida';
  } else if (filterKey === 'fisc_sem_coord') {
    document.getElementById('filter-search').value = 'sem-coord';
  } else if (filterKey === 'obras_sem_coord') {
    document.getElementById('filter-search').value = 'sem-coord';
  } else if (filterKey === 'obras_execucao_baixa') {
    document.getElementById('filter-search').value = 'execucao-baixa';
  } else if (filterKey === 'obras_em_execucao') {
    document.getElementById('filter-situacao').value = 'Em execucao';
  }

  applyFilters();
}

function applySpecialSearchFilters(record, normalizedSearch) {
  if (!normalizedSearch) return true;
  if (normalizedSearch !== 'sem-coord' && normalizedSearch !== 'execucao-baixa') {
    return true;
  }

  if (currentView === 'obras') {
    if (normalizedSearch === 'sem-coord') {
      return !hasObraCoordinates(record);
    }
    if (normalizedSearch === 'execucao-baixa') {
      const progress = getObraProgressValue(record);
      return Number.isFinite(progress) && progress < 40;
    }
  } else if (normalizedSearch === 'sem-coord') {
    return !(Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude)));
  }

  return false;
}

function getObraProgressValue(obra) {
  if (Number.isFinite(obra.execucao_fisica_pct)) return obra.execucao_fisica_pct;
  if (Number.isFinite(obra.execucao_financeira_pct)) return obra.execucao_financeira_pct;
  return null;
}

function getObraMarkerColor(obra) {
  const progress = getObraProgressValue(obra);
  if (progress != null) {
    if (progress >= 80) return '#10b981';
    if (progress >= 40) return '#f59e0b';
    return '#ef4444';
  }

  const status = normalizePlainText(obra.situacao_contrato);
  if (status.includes('receb') || status.includes('teste') || status.includes('pronta')) return '#10b981';
  if (status.includes('execu')) return '#f59e0b';
  return '#3b82f6';
}

function selectObrasSheetName(sheetNames) {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return null;
  return sheetNames.find((name) => normalizePlainText(name) === 'dados investimentos 2025') ||
    sheetNames.find((name) => normalizePlainText(name).includes('dados investimentos')) ||
    sheetNames.find((name) => normalizePlainText(name).includes('investimentos')) ||
    sheetNames.find((name) => normalizePlainText(name).includes('dados obras')) ||
    sheetNames.find((name) => normalizePlainText(name).includes('obra')) ||
    sheetNames[0];
}

function findObrasHeaderRow(rows) {
  if (!Array.isArray(rows)) return -1;

  for (let index = 0; index < Math.min(rows.length, 50); index++) {
    const headerSet = new Set((rows[index] || []).map(normalizeHeaderKey).filter(Boolean));
    const hasCoreHeaders = headerSet.has('item') && headerSet.has('local');
    const hasLocatorHeaders = headerSet.has('latitude') && headerSet.has('longitude');
    const hasContractHeaders = [
      'situacao_do_contrato',
      'situacao',
      'objeto_do_contrato',
      'objeto_contrato',
      'numero_contrato',
      'n_contrato',
      'processo_sei',
      'n_processo_sei'
    ].some((header) => headerSet.has(header));

    if (hasCoreHeaders && (hasLocatorHeaders || hasContractHeaders)) {
      return index;
    }
  }

  return -1;
}

function mapUploadedObraRecord(rawRecord, index) {
  const record = {};
  Object.entries(rawRecord || {}).forEach(([key, value]) => {
    record[normalizeHeaderKey(key)] = value;
  });

  if (!hasMeaningfulRecordData(record)) return null;

  const local = String(getFirstRecordValue(record, ['local'])).trim();
  const objetoContrato = String(getFirstRecordValue(record, ['objeto_do_contrato', 'objeto_contrato'])).trim();
  const rawItem = String(getFirstRecordValue(record, ['item'])).trim();
  const item = rawItem || String(index + 1);

  const latitude = sanitizeCoordinate(getFirstRecordValue(record, ['latitude']), 'lat');
  const longitude = sanitizeCoordinate(getFirstRecordValue(record, ['longitude']), 'lng');
  const fallbackCoords = latitude == null || longitude == null ? inferCoordinatesFromLocal(local) : null;

  return {
    __obraId: buildObraId(item || local || objetoContrato, index),
    item,
    sistema: String(getFirstRecordValue(record, ['sistema_agua_saa_esgoto_ses', 'sistema'])).trim(),
    tipo: String(getFirstRecordValue(record, ['tipo'])).trim(),
    programa: String(getFirstRecordValue(record, ['programa'])).trim(),
    codigo_plano_exploracao: String(getFirstRecordValue(record, ['codigo_plano_de_exploracao', 'codigo_plano_exploracao'])).trim(),
    acao: String(getFirstRecordValue(record, ['acao'])).trim(),
    local,
    numero_contrato: String(getFirstRecordValue(record, ['n_contrato', 'numero_contrato'])).trim(),
    objeto_contrato: objetoContrato,
    valor_total_obra: parseLocalizedNumber(getFirstRecordValue(record, ['valor_total_da_obra', 'valor_total'])),
    situacao_contrato: String(getFirstRecordValue(record, ['situacao_do_contrato', 'situacao'])).trim(),
    sigla_uo: String(getFirstRecordValue(record, ['sigla_uo'])).trim(),
    fornecedor: String(getFirstRecordValue(record, ['fornecedor'])).trim(),
    em_operacao: String(getFirstRecordValue(record, ['em_operacao'])).trim(),
    item_gplan: String(getFirstRecordValue(record, ['item_gplan'])).trim(),
    numero_processo_sei: String(getFirstRecordValue(record, ['n_processo_sei', 'processo_sei'])).trim(),
    tipo_recurso: String(getFirstRecordValue(record, ['tipo_de_recurso', 'tipo_recurso'])).trim(),
    fonte_recurso: String(getFirstRecordValue(record, ['fonte_do_recurso', 'fonte_recurso'])).trim(),
    execucao_inicio: String(getFirstRecordValue(record, ['execucao_inicio'])).trim(),
    execucao_termino: String(getFirstRecordValue(record, ['execucao_termino'])).trim(),
    valor_executado_jan_jun: parseLocalizedNumber(getFirstRecordValue(record, ['valor_executado_jan_a_jun', 'executado_jan_jun'])),
    valor_executado_jul_dez: parseLocalizedNumber(getFirstRecordValue(record, ['valor_executado_jul_a_dez', 'executado_jul_dez'])),
    valor_executado_2025: parseLocalizedNumber(getFirstRecordValue(record, ['valor_executado_2025', 'executado_2025'])),
    execucao_financeira_pct: parseLocalizedNumber(getFirstRecordValue(record, ['execucao_financeira'])),
    execucao_fisica_pct: parseLocalizedNumber(getFirstRecordValue(record, ['execucao_fisica'])),
    observacoes: String(getFirstRecordValue(record, ['observacoes'])).trim(),
    latitude: latitude != null && longitude != null ? latitude : (fallbackCoords ? fallbackCoords[0] : null),
    longitude: latitude != null && longitude != null ? longitude : (fallbackCoords ? fallbackCoords[1] : null)
  };
}

function hasObraCoordinates(obra) {
  return Number.isFinite(obra?.latitude) && Number.isFinite(obra?.longitude);
}

async function replaceObrasApiRecords(records) {
  const payload = await window.dataSdk._fetchJson(window.dataSdk._buildUrl('/obras'), {
    method: 'PUT',
    body: JSON.stringify({ records })
  });

  if (!payload || !Array.isArray(payload.records)) {
    return null;
  }

  return payload.records.map((record, index) => normalizeObraRecord(record, index));
}

async function loadObrasData() {
  const localRecords = loadStoredObras().map((record, index) => normalizeObraRecord(record, index));
  if (!window.dataSdk?.isApiConfigured?.()) {
    allObras = localRecords;
    return { isOk: true, source: 'local' };
  }

  const payload = await window.dataSdk._fetchJson(window.dataSdk._buildUrl('/obras'), {
    method: 'GET'
  });

  if (!payload || !Array.isArray(payload.records)) {
    allObras = [];
    filteredObras = [];
    return { isOk: false, source: 'api', fallbackReason: 'api_unavailable' };
  }

  allObras = payload.records.map((record, index) => normalizeObraRecord(record, index));
  saveStoredObras(allObras);
  return { isOk: true, source: 'api' };
}

async function persistObrasData(records) {
  const normalizedRecords = (records || []).map((record, index) => normalizeObraRecord(record, index));

  if (!window.dataSdk?.isApiConfigured?.()) {
    allObras = normalizedRecords;
    saveStoredObras(allObras);
    return { isOk: true, source: 'local' };
  }

  const savedRecords = await replaceObrasApiRecords(normalizedRecords);

  if (!savedRecords) {
    return { isOk: false, source: 'api', fallbackReason: 'api_unavailable' };
  }

  allObras = savedRecords;
  saveStoredObras(allObras);
  return { isOk: true, source: 'api' };
}

async function deleteObrasData() {
  if (!window.dataSdk?.isApiConfigured?.()) {
    allObras = [];
    filteredObras = [];
    clearStoredObras();
    return { isOk: true, source: 'local' };
  }

  const savedRecords = await replaceObrasApiRecords([]);
  if (!savedRecords) {
    return { isOk: false, source: 'api', fallbackReason: 'api_unavailable' };
  }

  allObras = [];
  filteredObras = [];
  clearStoredObras();
  return { isOk: true, source: 'api' };
}

allObras = loadStoredObras().map((record, index) => normalizeObraRecord(record, index));
currentView = loadStoredView();

const dataHandler = {
  onDataChanged(data) {
    allFiscalizacoes = data;
    updateFiltersOptions();
    applyFilters();
    updateDashboard();
  }
};

async function initDataSDK() {
  setOperationStatus('Sincronizando dados...', 'syncing');
  const result = await window.dataSdk.init(dataHandler);
  const obrasResult = await loadObrasData();
  if (!result.isOk) showToast('Erro ao inicializar sistema de dados', 'error');
  if (obrasResult.fallbackReason === 'api_unavailable') {
    showToast('API de obras indisponível no momento. Não foi possível ler dados do banco.', 'warning');
  }
  if (result.syncedLocalToApi || obrasResult.syncedLocalToApi) {
    showToast('Dados locais sincronizados com o banco de dados.', 'success');
  }
  updateStorageModeStatus();
  updateFiltersOptions();
  applyFilters();
  updateDashboard();
  if (!result.isOk || !obrasResult.isOk) {
    setOperationStatus('Falha parcial ao carregar dados', 'warning');
  } else {
    setOperationStatus('Sistema pronto', 'success');
  }

  return {
    isOk: result.isOk && obrasResult.isOk,
    source: result.source === 'api' && obrasResult.source === 'api' ? 'api' : 'local'
  };
}

function buildDuplicateReport(records = allFiscalizacoes) {
  const groups = new Map();
  const ordered = [];
  const duplicates = [];

  (records || []).forEach((record) => {
    const identity = buildFiscalizacaoIdentity(record);
    if (!identity) {
      ordered.push(record);
      return;
    }

    if (!groups.has(identity)) {
      groups.set(identity, []);
    }
    groups.get(identity).push(record);
  });

  groups.forEach((group) => {
    if (!group.length) return;
    ordered.push(group[0]);
    if (group.length > 1) {
      duplicates.push({
        identity: buildFiscalizacaoIdentity(group[0]),
        keep: group[0],
        remove: group.slice(1)
      });
    }
  });

  const removedCount = duplicates.reduce((sum, item) => sum + item.remove.length, 0);
  return {
    dedupedRecords: ordered,
    duplicateGroups: duplicates.length,
    duplicateRecords: removedCount,
    details: duplicates
  };
}

async function replaceFiscalizacoesData(records) {
  if (!window.dataSdk?.isApiConfigured?.()) {
    window.dataSdk._data = records.map((record) => ({
      __backendId: record.__backendId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      ...record
    }));
    const ok = window.dataSdk._persist();
    if (!ok) {
      return { isOk: false, error: 'Falha ao salvar no armazenamento local.' };
    }
    window.dataSdk._notify();
    return { isOk: true, source: 'local' };
  }

  const payload = await window.dataSdk._fetchJson(window.dataSdk._buildUrl('/fiscalizacoes'), {
    method: 'PUT',
    body: JSON.stringify({ records })
  });

  if (!payload || !Array.isArray(payload.records)) {
    return { isOk: false, error: 'Falha ao atualizar os registros no banco.' };
  }

  window.dataSdk._data = payload.records;
  window.dataSdk._persist();
  window.dataSdk._notify();
  return { isOk: true, source: 'api' };
}

async function deduplicateFiscalizacoes() {
  const report = buildDuplicateReport(allFiscalizacoes);
  if (report.duplicateRecords === 0) {
    showToast('Não há duplicados para remover.', 'info');
    return;
  }

  const confirmed = window.confirm(
    `Foram encontrados ${report.duplicateRecords} registros duplicados em ${report.duplicateGroups} grupos.\n` +
    'Deseja remover duplicados mantendo apenas a primeira ocorrência de cada ID + Processo SEI?'
  );
  if (!confirmed) return;

  setOperationStatus('Removendo duplicidades...', 'syncing');
  showLoading('Removendo duplicidades...');

  const result = await replaceFiscalizacoesData(report.dedupedRecords);
  hideLoading();

  if (!result.isOk) {
    setOperationStatus('Falha ao deduplicar registros', 'error');
    showToast(result.error || 'Não foi possível remover duplicados.', 'error');
    return;
  }

  await recordAuditEvent('deduplicate', null, null, {
    removed: report.duplicateRecords,
    groups: report.duplicateGroups,
    source: result.source
  });
  setOperationStatus(`Duplicados removidos (${report.duplicateRecords})`, 'success');
  showToast(`${report.duplicateRecords} duplicados removidos com sucesso.`, 'success');
  updateDashboard();
}
window.deduplicateFiscalizacoes = deduplicateFiscalizacoes;

function updateStorageModeStatus() {
  const status = document.getElementById('storage-mode-status');
  const select = document.getElementById('storage-mode-select');
  if (!status || !select || !window.dataSdk) return;

  const selectedMode = window.dataSdk.getActiveMode();
  const apiConfigured = window.dataSdk.isApiConfigured();
  const lastSource = window.dataSdk.getLastSource();

  select.value = selectedMode;

  if (!apiConfigured) {
    status.textContent = 'Salvo no navegador';
    return;
  }

  if (lastSource !== 'api') {
    status.textContent = 'Banco indisponível';
    return;
  }

  status.textContent = 'Banco ativo';
}

async function handleStorageModeChange(event) {
  if (window.dataSdk?.isApiConfigured?.()) {
    window.dataSdk.setStorageMode('api');
    event.target.value = 'api';
    updateStorageModeStatus();
    showToast('Esta instalação salva diretamente no banco de dados.', 'info');
    return;
  }

  const nextMode = event.target.value === 'api' ? 'api' : 'local';

  if (nextMode === 'api' && !window.dataSdk.isApiConfigured()) {
    window.dataSdk.setStorageMode('local');
    updateStorageModeStatus();
    showToast('Configure a URL da API antes de usar esse modo', 'warning');
    return;
  }

  window.dataSdk.setStorageMode(nextMode);
  setOperationStatus(nextMode === 'api' ? 'Conectando ao banco...' : 'Aplicando modo local...', 'syncing');
  showLoading(nextMode === 'api' ? 'Conectando API...' : 'Carregando dados locais...');

  const result = await initDataSDK();

  hideLoading();

  if (!result.isOk) {
    setOperationStatus('Falha ao trocar modo de armazenamento', 'error');
    showToast('Erro ao trocar o modo de salvamento', 'error');
    return;
  }

  if (nextMode === 'api' && result.source !== 'api') {
    setOperationStatus('Banco indisponível, usando dados locais', 'warning');
    showToast('API indisponível. Dados locais carregados.', 'warning');
    return;
  }

  setOperationStatus(result.source === 'api' ? 'Conectado ao banco' : 'Modo local ativo', 'success');
  showToast(
    result.source === 'api' ? 'Modo API externa ativado' : 'Modo local ativado',
    'success'
  );
}

function initStorageModeSelector() {
  const select = document.getElementById('storage-mode-select');
  if (!select) return;

  if (window.dataSdk?.isApiConfigured?.()) {
    window.dataSdk.setStorageMode('api');
    select.value = 'api';
    select.disabled = true;
    select.classList.add('opacity-60', 'cursor-not-allowed');
    const localOption = select.querySelector('option[value="local"]');
    if (localOption) localOption.disabled = true;
    updateStorageModeStatus();
    return;
  }

  if (window.dataSdk?.getStorageMode?.() === 'api') {
    window.dataSdk.setStorageMode('local');
  }

  select.disabled = false;
  select.classList.remove('opacity-60', 'cursor-not-allowed');
  select.value = window.dataSdk?.getStorageMode?.() || 'local';
  select.addEventListener('change', handleStorageModeChange);
  updateStorageModeStatus();
}

function getApiBaseUrl() {
  const raw = String(window.APP_BACKEND_CONFIG?.baseUrl || '/api').trim();
  return raw.replace(/\/+$/, '');
}

async function logoutSession() {
  setOperationStatus('Encerrando sessão...', 'syncing');
  showLoading('Saindo...');

  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch {
    // Mesmo com falha de rede, seguimos para limpar o acesso local.
  } finally {
    hideLoading();
    window.location.replace('/login.html');
  }
}

function initAuthSessionUI() {
  const userLabel = document.getElementById('auth-user-name');
  const logoutBtn = document.getElementById('logout-btn');
  const authBadge = document.getElementById('auth-user-badge');

  const login = String(window.APP_AUTH_USER || '').trim();
  if (userLabel) userLabel.textContent = login || 'Usuário';
  if (authBadge) authBadge.classList.remove('hidden');

  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', logoutSession);
  }
}

function loadMapLegendState() {
  const stored = readStoredJson(MAP_LEGEND_STATE_KEY, null);

  if (typeof stored === 'boolean') {
    isMapLegendCollapsed = stored;
    return;
  }

  if (stored && typeof stored === 'object' && Object.prototype.hasOwnProperty.call(stored, 'collapsed')) {
    isMapLegendCollapsed = Boolean(stored.collapsed);
  }
}

function saveMapLegendState() {
  writeStoredJson(MAP_LEGEND_STATE_KEY, {
    collapsed: isMapLegendCollapsed
  });
}

function updateMapLegendCollapseUI() {
  const legendBody = document.getElementById('map-legend-body');
  const toggleBtn = document.getElementById('map-legend-toggle');
  const toggleText = document.getElementById('map-legend-toggle-text');
  const toggleIcon = document.getElementById('map-legend-toggle-icon');
  if (!legendBody || !toggleBtn) return;

  legendBody.classList.toggle('hidden', isMapLegendCollapsed);
  toggleBtn.setAttribute('aria-expanded', String(!isMapLegendCollapsed));

  if (toggleText) {
    toggleText.textContent = isMapLegendCollapsed ? 'Expandir' : 'Minimizar';
  }
  if (toggleIcon) {
    toggleIcon.textContent = isMapLegendCollapsed ? '+' : '-';
  }
}

function toggleMapLegend(forceCollapsed = null) {
  if (typeof forceCollapsed === 'boolean') {
    isMapLegendCollapsed = forceCollapsed;
  } else {
    isMapLegendCollapsed = !isMapLegendCollapsed;
  }

  saveMapLegendState();
  updateMapLegendCollapseUI();
}
window.toggleMapLegend = toggleMapLegend;

function loadMapLayerState() {
  const stored = readStoredJson(MAP_LAYER_STATE_KEY, null);
  if (!stored || typeof stored !== 'object') return;
  mapLayerVisibility = {
    ...mapLayerVisibility,
    ...stored
  };
}

function saveMapLayerState() {
  writeStoredJson(MAP_LAYER_STATE_KEY, mapLayerVisibility);
}

function getFiscalizacaoLayerKey(situacao) {
  const normalized = normalizePlainText(situacao);
  if (normalized.includes('andamento')) return 'em_andamento';
  if (normalized.includes('concl')) return 'concluida';
  return 'pendente';
}

function getObraLayerKey(obra) {
  const progress = getObraProgressValue(obra);
  if (!Number.isFinite(progress)) return 'obra_sem_pct';
  if (progress >= 80) return 'obra_alta';
  if (progress >= 40) return 'obra_media';
  return 'obra_baixa';
}

function canRenderMarker(record) {
  if (currentView === 'obras') {
    const layerKey = getObraLayerKey(record);
    return Boolean(mapLayerVisibility[layerKey]);
  }

  const layerKey = getFiscalizacaoLayerKey(record.situacao);
  return Boolean(mapLayerVisibility[layerKey]);
}

function renderMapLayerControls() {
  const container = document.getElementById('map-layer-toggles');
  if (!container) return;

  const controls = currentView === 'obras'
    ? [
      { key: 'obra_alta', label: 'Execução >= 80%' },
      { key: 'obra_media', label: 'Execução 40%-79%' },
      { key: 'obra_baixa', label: 'Execução < 40%' },
      { key: 'obra_sem_pct', label: 'Sem percentual' }
    ]
    : [
      { key: 'em_andamento', label: 'Em Andamento' },
      { key: 'concluida', label: 'Concluída' },
      { key: 'pendente', label: 'Pendente' }
    ];

  container.innerHTML = controls.map((control) => `
    <label class="flex items-center justify-between gap-2 text-[11px] text-slate-300">
      <span>${escapeHtml(control.label)}</span>
      <input type="checkbox"
        data-layer-key="${escapeHtml(control.key)}"
        ${mapLayerVisibility[control.key] ? 'checked' : ''}
        class="h-3.5 w-3.5 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500">
    </label>
  `).join('');

  container.querySelectorAll('input[type="checkbox"][data-layer-key]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const key = event.target?.dataset?.layerKey;
      if (!key) return;
      mapLayerVisibility[key] = Boolean(event.target.checked);
      saveMapLayerState();
      updateMapMarkers();
    });
  });
}

function applyMapFocus() {
  const region = document.getElementById('map-focus-region')?.value || '';
  const status = document.getElementById('map-focus-status')?.value || '';
  const hasFilter = Boolean(region || status);

  if (!map) return;

  if (currentView === 'obras') {
    const filtered = filteredObras.filter((obra) => {
      if (!hasObraCoordinates(obra)) return false;
      if (region && obra.local !== region) return false;
      if (status && obra.situacao_contrato !== status) return false;
      return true;
    });

    if (!hasFilter) {
      updateMapMarkers();
      return;
    }

    if (filtered.length === 0) {
      showToast('Nenhum marcador encontrado para este foco.', 'warning');
      return;
    }

    const bounds = L.latLngBounds(filtered.map((obra) => [obra.latitude, obra.longitude]));
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
    return;
  }

  const filtered = filteredFiscalizacoes.filter((fisc) => {
    if (!(Number.isFinite(Number(fisc.latitude)) && Number.isFinite(Number(fisc.longitude)))) return false;
    if (region && fisc.regiao_administrativa !== region) return false;
    if (status && fisc.situacao !== status) return false;
    return true;
  });

  if (!hasFilter) {
    updateMapMarkers();
    return;
  }

  if (filtered.length === 0) {
    showToast('Nenhum marcador encontrado para este foco.', 'warning');
    return;
  }

  const bounds = L.latLngBounds(filtered.map((fisc) => [fisc.latitude, fisc.longitude]));
  map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
}
window.applyMapFocus = applyMapFocus;

function updateMapLegend() {
  const title = document.getElementById('map-legend-title');
  const items = document.getElementById('map-legend-items');
  if (!title || !items) return;

  if (currentView === 'obras') {
    title.textContent = 'Legenda de Obras';
    items.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500"></div>
        <span class="text-xs text-slate-400">Execução >= 80%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500"></div>
        <span class="text-xs text-slate-400">Execução entre 40% e 79%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-red-400 to-rose-500"></div>
        <span class="text-xs text-slate-400">Execução abaixo de 40%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-sky-400 to-blue-500"></div>
        <span class="text-xs text-slate-400">Sem percentual informado</span>
      </div>
    `;
    renderMapLayerControls();
    updateMapLegendCollapseUI();
    return;
  }

  title.textContent = 'Legenda';
  items.innerHTML = `
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500"></div>
      <span class="text-xs text-slate-400">Em Andamento</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500"></div>
      <span class="text-xs text-slate-400">Concluída</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded-full bg-gradient-to-br from-red-400 to-rose-500"></div>
      <span class="text-xs text-slate-400">Pendente</span>
    </div>
  `;
  renderMapLayerControls();
  updateMapLegendCollapseUI();
}

function updateDataViewUI() {
  const isObras = currentView === 'obras';
  const fiscalizacoesBtn = document.getElementById('view-fiscalizacoes-btn');
  const obrasBtn = document.getElementById('view-obras-btn');
  const importBtn = document.getElementById('import-fiscalizacoes-btn');
  const uploadBtn = document.getElementById('upload-obras-btn');
  const addBtn = document.getElementById('add-fiscalizacao-btn');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const filterRegiao = document.getElementById('filter-regiao');
  const filterSituacao = document.getElementById('filter-situacao');
  const filterAno = document.getElementById('filter-ano');
  const filterConformidade = document.getElementById('filter-conformidade');
  const countBadge = document.getElementById('count-badge');
  const searchInput = document.getElementById('filter-search');
  const subtitle = document.getElementById('app-subtitle');

  if (fiscalizacoesBtn && obrasBtn) {
    fiscalizacoesBtn.className = isObras
      ? 'px-3 py-1.5 rounded-md text-slate-300 text-xs sm:text-sm font-medium transition-colors'
      : 'px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs sm:text-sm font-medium transition-colors';
    obrasBtn.className = isObras
      ? 'px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs sm:text-sm font-medium transition-colors'
      : 'px-3 py-1.5 rounded-md text-slate-300 text-xs sm:text-sm font-medium transition-colors';
  }

  importBtn?.classList.toggle('hidden', isObras);
  uploadBtn?.classList.toggle('hidden', !isObras);
  addBtn?.classList.toggle('hidden', isObras);
  if (dashboardBtn) {
    dashboardBtn.classList.remove('hidden');
  }

  if (filterRegiao?.previousElementSibling) {
    filterRegiao.previousElementSibling.textContent = isObras ? 'Local' : 'Região Administrativa';
  }
  if (filterSituacao?.previousElementSibling) {
    filterSituacao.previousElementSibling.textContent = isObras ? 'Situação do Contrato' : 'Situação';
  }
  if (filterAno?.previousElementSibling) {
    filterAno.previousElementSibling.textContent = isObras ? 'Sistema' : 'Ano';
  }

  const conformidadeGroup = filterConformidade?.parentElement?.parentElement;
  if (conformidadeGroup) conformidadeGroup.classList.toggle('hidden', isObras);

  if (countBadge?.parentElement?.firstElementChild) {
    countBadge.parentElement.firstElementChild.textContent = isObras ? 'Obras' : 'Fiscalizações';
  }
  if (searchInput) {
    searchInput.placeholder = isObras
      ? 'Item, local, ação, fornecedor...'
      : 'ID, Processo, Destinatário...';
  }
  if (subtitle) {
    subtitle.textContent = isObras ? 'Mapa de Obras em Andamento' : defaultConfig.subtitle;
  }

  updateMapLegend();
  updateObrasUploadActions();
}

function switchDataView(view) {
  currentView = view === 'obras' ? 'obras' : 'fiscalizacoes';
  saveStoredView(currentView);

  if (currentView === 'obras') {
    if (!document.getElementById('form-modal').classList.contains('hidden')) closeModal();
    if (!document.getElementById('import-modal').classList.contains('hidden')) closeImportModal();
    disableMapSelection();
  } else if (!document.getElementById('obras-upload-modal').classList.contains('hidden')) {
    closeObrasUploadModal();
  }

  document.getElementById('dashboard-panel')?.classList.add('hidden');
  closeDetailPanel();
  clearFilters();
  updateDataViewUI();
  updateFiltersOptions();
  applyFilters();
}
window.switchDataView = switchDataView;

// ======== Map ========
function initMap() {
  map = L.map('map').setView([-15.7942, -47.8822], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  map.addLayer(markerClusterGroup);

  map.on('click', handleMapClick);
}

function toggleFiltersPanel(open) {
  const drawer = document.getElementById('filters-drawer');
  const overlay = document.getElementById('filters-overlay');
  if (!drawer || !overlay) return;

  if (open) {
    overlay.classList.remove('hidden');
    drawer.classList.remove('-translate-x-full');
    document.body.classList.add('overflow-hidden');
  } else {
    overlay.classList.add('hidden');
    drawer.classList.add('-translate-x-full');
    document.body.classList.remove('overflow-hidden');
  }
}
window.toggleFiltersPanel = toggleFiltersPanel;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isModalOpen('form-modal')) {
      closeModal();
      return;
    }
    if (isModalOpen('import-modal')) {
      closeImportModal();
      return;
    }
    if (isModalOpen('dashboard-panel')) {
      toggleDashboard();
      return;
    }
    if (isModalOpen('obras-upload-modal')) {
      closeObrasUploadModal();
      return;
    }
    toggleFiltersPanel(false);
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && isModalOpen('form-modal')) {
    e.preventDefault();
    document.getElementById('fiscalizacao-form')?.requestSubmit();
    return;
  }

  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
      e.preventDefault();
      const search = document.getElementById('filter-search');
      search?.focus();
      search?.select();
    }
    return;
  }

  if (e.altKey && e.key === '1') {
    e.preventDefault();
    switchDataView('fiscalizacoes');
    return;
  }

  if (e.altKey && e.key === '2') {
    e.preventDefault();
    switchDataView('obras');
    return;
  }

  if (e.altKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleFiltersPanel(true);
  }
});

// ======== Markers ========
function createMarkerIcon(situacao) {
  let color;
  switch (situacao) {
    case 'Em Andamento': color = '#f59e0b'; break;
    case 'Concluida': color = '#10b981'; break;
    case 'Pendente': color = '#ef4444'; break;
    default: color = '#3b82f6';
  }

  return L.divIcon({
    className: 'custom-marker fiscalizacao-marker',
    html: `
      <div style="width:30px;height:34px;display:flex;align-items:center;justify-content:center;">
        <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
          <path
            d="M15 1.5C9.75 1.5 5.5 5.75 5.5 11C5.5 17.62 12.31 25.66 14.24 27.77C14.64 28.21 15.36 28.21 15.76 27.77C17.69 25.66 24.5 17.62 24.5 11C24.5 5.75 20.25 1.5 15 1.5Z"
            fill="${color}"
            stroke="white"
            stroke-width="2"
          />
          <rect x="11" y="8.5" width="8" height="9" rx="1.5" fill="white" />
          <path d="M13 11.5H17M13 14.5H17" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
    `,
    iconSize: [30, 34],
    iconAnchor: [15, 34],
    popupAnchor: [0, -30]
  });
}

function createObraMarkerIcon(obra) {
  const color = getObraMarkerColor(obra);

  return L.divIcon({
    className: 'custom-marker obra-marker',
    html: `
      <div style="width:30px;height:34px;display:flex;align-items:center;justify-content:center;">
        <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
          <path
            d="M15 1.5C9.75 1.5 5.5 5.75 5.5 11C5.5 17.62 12.31 25.66 14.24 27.77C14.64 28.21 15.36 28.21 15.76 27.77C17.69 25.66 24.5 17.62 24.5 11C24.5 5.75 20.25 1.5 15 1.5Z"
            fill="${color}"
            stroke="white"
            stroke-width="2"
          />
          <path d="M10.75 10.5H19.25M10.75 13.5H19.25M10.75 16.5H15.25" stroke="white" stroke-width="2" stroke-linecap="round" />
        </svg>
      </div>
    `,
    iconSize: [30, 34],
    iconAnchor: [15, 34],
    popupAnchor: [0, -30]
  });
}

function updateMapMarkers() {
  markerClusterGroup.clearLayers();
  markers = {};

  if (currentView === 'obras') {
    filteredObras.forEach((obra) => {
      if (!hasObraCoordinates(obra)) return;
      if (!canRenderMarker(obra)) return;

      const marker = L.marker([obra.latitude, obra.longitude], {
        icon: createObraMarkerIcon(obra)
      });

      marker.bindPopup(createObraPopupContent(obra), {
        maxWidth: 320,
        className: 'custom-popup'
      });

      marker.on('click', () => showObraDetailPanel(obra));

      markerClusterGroup.addLayer(marker);
      markers[obra.__obraId] = marker;
    });
  } else {
    filteredFiscalizacoes.forEach(fisc => {
      if (fisc.latitude && fisc.longitude) {
        if (!canRenderMarker(fisc)) return;
        const marker = L.marker([fisc.latitude, fisc.longitude], {
          icon: createMarkerIcon(fisc.situacao)
        });

        marker.bindPopup(createPopupContent(fisc), {
          maxWidth: 300,
          className: 'custom-popup'
        });

        marker.on('click', () => showDetailPanel(fisc));

        markerClusterGroup.addLayer(marker);
        markers[fisc.__backendId] = marker;
      }
    });
  }

  if (Object.keys(markers).length > 0) {
    const bounds = markerClusterGroup.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  }
}

function createPopupContent(fisc) {
  const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                      fisc.situacao === 'Concluida' ? 'status-concluida' : 'status-pendente';
  const idLabel = escapeHtml(fisc.id || '-');
  const statusLabel = escapeHtml(formatDisplayText(fisc.situacao || '-'));
  const regiaoLabel = escapeHtml(formatDisplayText(fisc.regiao_administrativa || '-'));
  const processoLabel = escapeHtml(fisc.processo_sei || '-');
  const conformidade = parseLocalizedNumber(fisc.indice_conformidade);
  const hasConformidade = Number.isFinite(conformidade);
  const conformidadePct = hasConformidade ? Math.max(0, Math.min(100, conformidade)) : null;
  const conformidadeDisplay = hasConformidade
    ? `${conformidadePct.toFixed(1).replace(/\.0$/, '')}%`
    : '';

  return `
    <div style="padding: 16px; font-family: 'Manrope', sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-weight:700;font-size:16px;color:#1e293b;">${idLabel}</span>
        <span class="${statusClass}" style="font-size:11px;padding:3px 8px;">${statusLabel}</span>
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Região:</strong> ${regiaoLabel}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Processo:</strong> ${processoLabel}
      </div>
      ${hasConformidade ? `
        <div style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;color:#64748b;">Conformidade</span>
            <span style="font-size:12px;font-weight:600;color:#1e293b;">${conformidadeDisplay}</span>
          </div>
          <div style="background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden;">
            <div style="background:linear-gradient(90deg,#3b82f6,#2563eb);height:100%;width:${conformidadePct}%;"></div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function createObraPopupContent(obra) {
  const color = getObraMarkerColor(obra);
  const progresso = getObraProgressValue(obra);
  const itemLabel = escapeHtml(obra.item || 'Obra');
  const progressLabel = escapeHtml(progresso != null ? formatPercent(progresso) : 'Obra');
  const localLabel = escapeHtml(formatDisplayText(obra.local || '-'));
  const situacaoLabel = escapeHtml(formatDisplayText(obra.situacao_contrato || '-'));
  const acaoLabel = escapeHtml(formatDisplayText(obra.acao || '-'));
  const objetoContratoLabel = escapeHtml(obra.objeto_contrato || '');

  return `
    <div style="padding: 16px; font-family: 'Manrope', sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;">
        <span style="font-weight:700;font-size:15px;color:#1e293b;">${itemLabel}</span>
        <span style="font-size:11px;padding:4px 8px;border-radius:999px;background:${color};color:white;">${progressLabel}</span>
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Local:</strong> ${localLabel}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Situação:</strong> ${situacaoLabel}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Ação:</strong> ${acaoLabel}
      </div>
      ${obra.objeto_contrato ? `
        <div style="margin-top:12px;color:#475569;font-size:12px;line-height:1.4;">
          ${objetoContratoLabel}
        </div>
      ` : ''}
    </div>
  `;
}

// ======== Map click selection ========
function handleMapClick(e) {
  if (!isSelectingLocation) return;

  const { lat, lng } = e.latlng;

  if (tempMarker) map.removeLayer(tempMarker);

  tempMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'temp-marker',
      html: `
        <div style="
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border-radius: 50%;
          border: 4px solid white;
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.5);
          animation: pulse 1.5s infinite;
        "></div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    })
  }).addTo(map);

  document.getElementById('form-lat').value = lat.toFixed(6);
  document.getElementById('form-lng').value = lng.toFixed(6);
  scheduleDraftSave();

  disableMapSelection();
  document.getElementById('form-modal').classList.remove('hidden');
}

function enableMapSelection() {
  isSelectingLocation = true;
  document.getElementById('form-modal').classList.add('hidden');
  document.getElementById('map-hint').classList.remove('hidden');
  map.getContainer().style.cursor = 'crosshair';
}
window.enableMapSelection = enableMapSelection;

function disableMapSelection() {
  isSelectingLocation = false;
  document.getElementById('map-hint').classList.add('hidden');
  map.getContainer().style.cursor = '';
}

// ======== Filters ========
function updateFiltersOptions() {
  if (currentView === 'obras') {
    const locais = [...new Set(allObras.map(o => o.local).filter(Boolean))].sort();
    const situacoes = [...new Set(allObras.map(o => o.situacao_contrato).filter(Boolean))].sort();
    const sistemas = [...new Set(allObras.map(o => o.sistema).filter(Boolean))].sort();

    const regiaoSelect = document.getElementById('filter-regiao');
    const currentLocal = regiaoSelect.value;
    regiaoSelect.innerHTML = '<option value="">Todos os Locais</option>';
    locais.forEach((local) => {
      const option = document.createElement('option');
      option.value = local;
      option.textContent = formatDisplayText(local);
      if (local === currentLocal) option.selected = true;
      regiaoSelect.appendChild(option);
    });

    const situacaoSelect = document.getElementById('filter-situacao');
    const currentSituacao = situacaoSelect.value;
    situacaoSelect.innerHTML = '<option value="">Todas as Situacoes</option>';
    situacoes.forEach((situacao) => {
      const option = document.createElement('option');
      option.value = situacao;
      option.textContent = formatDisplayText(situacao);
      if (situacao === currentSituacao) option.selected = true;
      situacaoSelect.appendChild(option);
    });

    const sistemaSelect = document.getElementById('filter-ano');
    const currentSistema = sistemaSelect.value;
    sistemaSelect.innerHTML = '<option value="">Todos os Sistemas</option>';
    sistemas.forEach((sistema) => {
      const option = document.createElement('option');
      option.value = sistema;
      option.textContent = sistema;
      if (sistema === currentSistema) option.selected = true;
      sistemaSelect.appendChild(option);
    });

    populateMapFocusOptions(locais, situacoes);
  } else {
    const regioes = [...new Set(allFiscalizacoes.map(f => f.regiao_administrativa).filter(Boolean))].sort();
    const anos = [...new Set(allFiscalizacoes.map(f => f.ano).filter(Boolean))].sort((a, b) => b - a);
    const situacoes = [...new Set(allFiscalizacoes.map(f => f.situacao).filter(Boolean))].sort();

    const regiaoSelect = document.getElementById('filter-regiao');
    const currentRegiao = regiaoSelect.value;
    regiaoSelect.innerHTML = '<option value="">Todas as Regioes</option>';
    regioes.forEach((r) => {
      const option = document.createElement('option');
      option.value = r;
      option.textContent = formatDisplayText(r);
      if (r === currentRegiao) option.selected = true;
      regiaoSelect.appendChild(option);
    });

    const anoSelect = document.getElementById('filter-ano');
    const currentAno = anoSelect.value;
    anoSelect.innerHTML = '<option value="">Todos os Anos</option>';
    anos.forEach((a) => {
      const option = document.createElement('option');
      option.value = a;
      option.textContent = a;
      if (String(a) === currentAno) option.selected = true;
      anoSelect.appendChild(option);
    });

    populateMapFocusOptions(regioes, situacoes);
  }

  renderQuickFilterButtons();
  populateSortFieldOptions();
}

function populateSortFieldOptions() {
  const sortSelect = document.getElementById('list-sort-field');
  const directionSelect = document.getElementById('list-sort-direction');
  const pageSizeSelect = document.getElementById('list-page-size');
  if (!sortSelect || !directionSelect || !pageSizeSelect) return;

  const options = getListSortOptions();
  if (!options.some(option => option.value === listSettings.sortField)) {
    listSettings.sortField = options[0]?.value || 'id';
  }

  sortSelect.innerHTML = options.map((option) =>
    `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
  ).join('');
  sortSelect.value = listSettings.sortField;
  directionSelect.value = listSettings.sortDirection;
  pageSizeSelect.value = String(listSettings.pageSize);
}

function populateMapFocusOptions(regioesOuLocais, situacoes) {
  const regionSelect = document.getElementById('map-focus-region');
  const statusSelect = document.getElementById('map-focus-status');
  if (!regionSelect || !statusSelect) return;

  const currentRegion = regionSelect.value;
  const currentStatus = statusSelect.value;

    regionSelect.innerHTML = '<option value="">Todas as regiões/locais</option>';
  regioesOuLocais.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatDisplayText(value);
    if (value === currentRegion) option.selected = true;
    regionSelect.appendChild(option);
  });

  statusSelect.innerHTML = '<option value="">Todos os status</option>';
  situacoes.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatDisplayText(value);
    if (value === currentStatus) option.selected = true;
    statusSelect.appendChild(option);
  });
}
function applyFilters(options = {}) {
  const preservePage = Boolean(options.preservePage);
  const search = document.getElementById('filter-search').value;
  const regiao = document.getElementById('filter-regiao').value;
  const situacao = document.getElementById('filter-situacao').value;
  const ano = document.getElementById('filter-ano').value;
  const conformidade = parseInt(document.getElementById('filter-conformidade').value, 10);
  const normalizedSearch = normalizePlainText(search);

  if (!preservePage) {
    listPage = 1;
  }

  if (currentView === 'obras') {
    filteredObras = allObras.filter((obra) => {
      if (normalizedSearch) {
        const specialFilterPass = applySpecialSearchFilters(obra, normalizedSearch);
        if (!specialFilterPass) {
          const haystack = normalizePlainText([
            obra.item,
            obra.local,
            obra.acao,
            obra.objeto_contrato,
            obra.numero_processo_sei,
            obra.fornecedor
          ].join(' '));
          if (!haystack.includes(normalizedSearch)) return false;
        }
      }

      if (regiao && obra.local !== regiao) return false;
      if (situacao && obra.situacao_contrato !== situacao) return false;
      if (ano && obra.sistema !== ano) return false;
      return true;
    });

    updateMapMarkers();
    renderObrasList();
    document.getElementById('count-badge').textContent = filteredObras.length;
  } else {
    filteredFiscalizacoes = allFiscalizacoes.filter((f) => {
      if (normalizedSearch) {
        const specialFilterPass = applySpecialSearchFilters(f, normalizedSearch);
        if (!specialFilterPass) {
          const haystack = normalizePlainText([
            f.id,
            f.processo_sei,
            f.destinatario,
            f.regiao_administrativa,
            f.objetivo,
            f.situacao
          ].join(' '));
          if (!haystack.includes(normalizedSearch)) return false;
        }
      }

      if (regiao && f.regiao_administrativa !== regiao) return false;
      if (situacao && f.situacao !== situacao) return false;
      if (ano && String(f.ano) !== ano) return false;
      if (conformidade && (!f.indice_conformidade || f.indice_conformidade < conformidade)) return false;
      return true;
    });

    updateMapMarkers();
    renderFiscalizacoesList();
    document.getElementById('count-badge').textContent = filteredFiscalizacoes.length;
  }

  const snapshot = getCurrentFilterSnapshot();
  const fingerprint = JSON.stringify(snapshot);
  if (fingerprint !== lastAppliedFilterFingerprint) {
    addCurrentFilterToRecent();
    lastAppliedFilterFingerprint = fingerprint;
  }

  saveFilterState();
  bumpSessionMetric('filtersApplied');
  updateDashboard();
}
window.applyFilters = applyFilters;

function resetFilterInputs() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-regiao').value = '';
  document.getElementById('filter-situacao').value = '';
  document.getElementById('filter-ano').value = '';
  document.getElementById('filter-conformidade').value = 0;
  document.getElementById('conformidade-label').textContent = '0%+';
}

function clearFilters() {
  resetFilterInputs();
  applyFilters();
}
window.clearFilters = clearFilters;

function onSortOrPageSettingsChanged() {
  const sortField = document.getElementById('list-sort-field')?.value;
  const sortDirection = document.getElementById('list-sort-direction')?.value;
  const pageSize = Number(document.getElementById('list-page-size')?.value || LIST_DEFAULT_PAGE_SIZE);

  if (sortField) listSettings.sortField = sortField;
  if (sortDirection === 'asc' || sortDirection === 'desc') {
    listSettings.sortDirection = sortDirection;
  }
  listSettings.pageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : LIST_DEFAULT_PAGE_SIZE;

  listPage = 1;
  saveListState();
  applyFilters();
}

function goToPage(offset) {
  const target = listPage + offset;
  if (target < 1 || target > listTotalPages) return;
  listPage = target;
  applyFilters({ preservePage: true });
}
window.goToPage = goToPage;

function initEnhancedControls() {
  const sortField = document.getElementById('list-sort-field');
  const sortDirection = document.getElementById('list-sort-direction');
  const pageSize = document.getElementById('list-page-size');
  const prev = document.getElementById('pagination-prev');
  const next = document.getElementById('pagination-next');
  const mapFocusApply = document.getElementById('map-focus-apply');
  const saveFavoriteBtn = document.getElementById('save-filter-favorite-btn');

  sortField?.addEventListener('change', onSortOrPageSettingsChanged);
  sortDirection?.addEventListener('change', onSortOrPageSettingsChanged);
  pageSize?.addEventListener('change', onSortOrPageSettingsChanged);
  prev?.addEventListener('click', () => goToPage(-1));
  next?.addEventListener('click', () => goToPage(1));
  mapFocusApply?.addEventListener('click', applyMapFocus);
  saveFavoriteBtn?.addEventListener('click', saveCurrentFilterFavorite);
}

function updateConformidadeLabel() {
  const value = document.getElementById('filter-conformidade').value;
  document.getElementById('conformidade-label').textContent = `${value}%+`;
}
window.updateConformidadeLabel = updateConformidadeLabel;

function renderFiscalizacoesList() {
  const container = document.getElementById('fiscalizacoes-list');
  const pagination = document.getElementById('list-pagination');

  if (filteredFiscalizacoes.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <p class="text-sm">Nenhuma fiscalização encontrada</p>
        <p class="text-xs mt-1">Ajuste os filtros ou adicione uma nova</p>
      </div>
    `;
    pagination?.classList.add('hidden');
    return;
  }

  const sorted = sortRecords(filteredFiscalizacoes);
  const pageItems = paginateRecords(sorted);

  container.innerHTML = pageItems.map((fisc) => {
    const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                        fisc.situacao === 'Concluida' ? 'status-concluida' : 'status-pendente';
    const idLabel = escapeHtml(fisc.id || '-');
    const statusLabel = escapeHtml(formatDisplayText(fisc.situacao || '-'));
    const regiaoLabel = escapeHtml(formatDisplayText(fisc.regiao_administrativa || 'Sem regiao'));
    const conformidade = Number.isFinite(Number(fisc.indice_conformidade))
      ? Number(fisc.indice_conformidade)
      : null;

    return `
      <div class="list-card p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 cursor-pointer transition-colors border border-slate-700/50 focus-visible:ring-2 focus-visible:ring-blue-500"
           role="button"
           tabindex="0"
           onkeydown="if(event.key==='Enter' || event.key===' '){event.preventDefault(); focusFiscalizacao('${fisc.__backendId}');}"
           onclick="focusFiscalizacao('${fisc.__backendId}')">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-sm">${idLabel}</span>
          <span class="${statusClass}" style="font-size: 10px; padding: 2px 8px;">${statusLabel}</span>
        </div>
        <p class="text-xs text-slate-400 truncate">${regiaoLabel}</p>
        ${conformidade != null ? `
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500 rounded-full" style="width: ${Math.max(0, Math.min(100, conformidade))}%"></div>
            </div>
            <span class="text-xs text-blue-400">${formatPercent(conformidade)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  updatePaginationUI(filteredFiscalizacoes.length);
}

function renderObrasList() {
  const container = document.getElementById('fiscalizacoes-list');
  const pagination = document.getElementById('list-pagination');

  if (filteredObras.length === 0) {
    container.innerHTML = allObras.length === 0 ? `
      <div class="text-center py-8 text-slate-500">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 7h18M3 12h18M3 17h18M8 7v10m8-10v10"/>
        </svg>
        <p class="text-sm">Nenhuma obra carregada</p>
        <p class="text-xs mt-1">Use "Upload Obras" para carregar a planilha</p>
      </div>
    ` : `
      <div class="text-center py-8 text-slate-500">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        </svg>
        <p class="text-sm">Nenhuma obra encontrada</p>
        <p class="text-xs mt-1">Ajuste os filtros ou carregue outra planilha</p>
      </div>
    `;
    pagination?.classList.add('hidden');
    return;
  }

  const sorted = sortRecords(filteredObras);
  const pageItems = paginateRecords(sorted);

  container.innerHTML = pageItems.map((obra) => {
    const color = getObraMarkerColor(obra);
    const progress = getObraProgressValue(obra);
    const itemLabel = escapeHtml(obra.item || 'Obra');
    const localLabel = escapeHtml(obra.local || 'Sem local informado');
    const situacaoLabel = escapeHtml(obra.situacao_contrato || 'Sem situacao');
    const chipLabel = progress != null ? formatPercent(progress) : (hasObraCoordinates(obra) ? 'Sem %' : 'Sem coord.');

    return `
      <div class="list-card p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 cursor-pointer transition-colors border border-slate-700/50 focus-visible:ring-2 focus-visible:ring-emerald-500"
           role="button"
           tabindex="0"
           onkeydown="if(event.key==='Enter' || event.key===' '){event.preventDefault(); focusObra('${obra.__obraId}');}"
           onclick="focusObra('${obra.__obraId}')">
        <div class="flex items-start justify-between gap-3 mb-2">
          <span class="font-semibold text-sm leading-tight">${itemLabel}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${color};color:white;white-space:nowrap;">
            ${escapeHtml(chipLabel)}
          </span>
        </div>
        <p class="text-xs text-slate-300 truncate">${localLabel}</p>
        <p class="text-xs text-slate-500 mt-1 truncate">${situacaoLabel}</p>
      </div>
    `;
  }).join('');

  updatePaginationUI(filteredObras.length);
}

function focusFiscalizacao(backendId) {
  const fisc = allFiscalizacoes.find(f => f.__backendId === backendId);
  if (!fisc) return;

  if (fisc.latitude && fisc.longitude && markers[backendId]) {
    map.setView([fisc.latitude, fisc.longitude], 15);
    markers[backendId].openPopup();
  }
  showDetailPanel(fisc);

  // no mobile, fecha drawer pra liberar mapa/painel
  toggleFiltersPanel(false);
}
window.focusFiscalizacao = focusFiscalizacao;

function focusObra(obraId) {
  const obra = allObras.find((item) => item.__obraId === obraId);
  if (!obra) return;

  if (hasObraCoordinates(obra) && markers[obraId]) {
    map.setView([obra.latitude, obra.longitude], 14);
    markers[obraId].openPopup();
  }

  showObraDetailPanel(obra);
  toggleFiltersPanel(false);
}
window.focusObra = focusObra;

// ======== Detail Panel ========
function createDetailField(label, value) {
  return `
    <div class="detail-field">
      <p class="detail-field-label">${label}</p>
      <p class="detail-field-value">${value || '-'}</p>
    </div>
  `;
}

function setDetailPanelActionsVisible(visible) {
  document.getElementById('edit-detail-btn')?.classList.toggle('hidden', !visible);
  document.getElementById('delete-detail-btn')?.classList.toggle('hidden', !visible);
}

function showDetailPanel(fisc) {
  currentFiscalizacao = fisc;
  currentObra = null;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');

  const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                      fisc.situacao === 'Concluida' ? 'status-concluida' : 'status-pendente';

  setDetailPanelActionsVisible(true);
  document.getElementById('detail-title').textContent = fisc.id || 'Detalhes da Fiscalização';
  document.getElementById('delete-detail-btn').onclick = () => confirmDelete(fisc);

  content.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-center">
        <span class="${statusClass} text-base">${formatDisplayText(fisc.situacao)}</span>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Informações Básicas</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Nº Processo SEI', fisc.processo_sei)}
          ${createDetailField('Ano', fisc.ano)}
          ${createDetailField('Região', formatDisplayText(fisc.regiao_administrativa))}
          ${createDetailField('Destinatário', fisc.destinatario)}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Classificacao</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo', fisc.direta_indireta)}
          ${createDetailField('Programação', formatDisplayText(fisc.programada))}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Documento</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo', fisc.tipo_documento)}
          ${createDetailField('Nº SEI', fisc.sei_documento)}
          ${createDetailField('Data', fisc.data ? new Date(fisc.data).toLocaleDateString('pt-BR') : null)}
        </div>

        ${fisc.objetivo ? `
          <div class="mt-3">
            <p class="text-xs text-slate-500 mb-1">Objetivo</p>
            <p class="detail-rich-text">${fisc.objetivo}</p>
          </div>
        ` : ''}
      </div>

      ${(fisc.latitude && fisc.longitude) ? `
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Localização</h3>
          <div class="bg-slate-800/50 rounded-lg p-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p class="text-xs text-slate-500">Latitude</p>
                <p class="text-sm font-mono text-slate-300">${fisc.latitude}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500">Longitude</p>
                <p class="text-sm font-mono text-slate-300">${fisc.longitude}</p>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${fisc.imagem ? `
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Imagem</h3>
          <div class="rounded-xl overflow-hidden border border-slate-700 bg-slate-900/80">
            <img src="${fisc.imagem}" alt="Imagem da fiscalização" class="w-full object-cover max-h-96">
          </div>
        </div>
      ` : ''}
    </div>
  `;

  panel.classList.remove('hidden');
}
window.showDetailPanel = showDetailPanel;

function showObraDetailPanel(obra) {
  currentObra = obra;
  currentFiscalizacao = null;

  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  const progress = getObraProgressValue(obra);
  const color = getObraMarkerColor(obra);

  setDetailPanelActionsVisible(false);
  document.getElementById('detail-title').textContent = obra.item || 'Detalhes da Obra';

  content.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-center">
        <span style="padding:6px 14px;border-radius:999px;background:${color};color:white;font-size:14px;font-weight:600;">
          ${progress != null ? `Execução ${formatPercent(progress)}` : formatDisplayText(obra.situacao_contrato || 'Obra no mapa')}
        </span>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Identificação</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Item', obra.item)}
          ${createDetailField('Local', formatDisplayText(obra.local))}
          ${createDetailField('Sistema', obra.sistema)}
          ${createDetailField('Tipo', obra.tipo)}
          ${createDetailField('Programa', obra.programa)}
          ${createDetailField('Ação', formatDisplayText(obra.acao))}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Contrato</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Número do Contrato', obra.numero_contrato)}
          ${createDetailField('Situação', formatDisplayText(obra.situacao_contrato))}
          ${createDetailField('Fornecedor', obra.fornecedor)}
          ${createDetailField('Sigla UO', obra.sigla_uo)}
          ${createDetailField('Processo SEI', obra.numero_processo_sei)}
          ${createDetailField('Em operação', formatDisplayText(obra.em_operacao))}
        </div>
        ${obra.objeto_contrato ? `
          <div class="mt-3">
            <p class="text-xs text-slate-500 mb-1">Objeto do Contrato</p>
            <p class="detail-rich-text">${obra.objeto_contrato}</p>
          </div>
        ` : ''}
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Execução</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Valor Total da Obra', formatCurrency(obra.valor_total_obra))}
          ${createDetailField('Valor Executado 2025', formatCurrency(obra.valor_executado_2025))}
          ${createDetailField('Executado Jan-Jun', formatCurrency(obra.valor_executado_jan_jun))}
          ${createDetailField('Executado Jul-Dez', formatCurrency(obra.valor_executado_jul_dez))}
          ${createDetailField('Execução Financeira', formatPercent(obra.execucao_financeira_pct))}
          ${createDetailField('Execução Física', formatPercent(obra.execucao_fisica_pct))}
          ${createDetailField('Início', normalizeDateDisplay(obra.execucao_inicio))}
          ${createDetailField('Término', normalizeDateDisplay(obra.execucao_termino))}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Recursos</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo de Recurso', obra.tipo_recurso)}
          ${createDetailField('Fonte do Recurso', obra.fonte_recurso)}
          ${createDetailField('Item GPLAN', obra.item_gplan)}
          ${createDetailField('Plano de Exploração', obra.codigo_plano_exploracao)}
        </div>
      </div>

      ${(hasObraCoordinates(obra)) ? `
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Localização</h3>
          <div class="bg-slate-800/50 rounded-lg p-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p class="text-xs text-slate-500">Latitude</p>
                <p class="text-sm font-mono text-slate-300">${obra.latitude}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500">Longitude</p>
                <p class="text-sm font-mono text-slate-300">${obra.longitude}</p>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${obra.observacoes ? `
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Observações</h3>
          <p class="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3">${obra.observacoes}</p>
        </div>
      ` : ''}
    </div>
  `;

  panel.classList.remove('hidden');
}
window.showObraDetailPanel = showObraDetailPanel;

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.add('hidden');
  currentFiscalizacao = null;
  currentObra = null;
  setDetailPanelActionsVisible(true);
}
window.closeDetailPanel = closeDetailPanel;

function setDraftStatus(text, tone = 'idle') {
  const status = document.getElementById('form-draft-status');
  if (!status) return;

  status.textContent = text;
  status.classList.remove('text-slate-300', 'text-amber-300', 'text-emerald-300', 'text-red-300');

  const toneClass = {
    idle: 'text-slate-300',
    pending: 'text-amber-300',
    saved: 'text-emerald-300',
    error: 'text-red-300'
  };

  status.classList.add(toneClass[tone] || toneClass.idle);
}

function collectFormDraft() {
  const draft = {};
  FISCALIZACAO_FORM_FIELDS.forEach((fieldId) => {
    const node = document.getElementById(fieldId);
    if (!node) return;
    draft[fieldId] = node.value ?? '';
  });
  draft.__savedAt = nowIso();
  draft.__editingId = document.getElementById('form-backend-id')?.value || '';
  return draft;
}

function applyFormDraft(draft) {
  if (!draft || typeof draft !== 'object') return;
  isDraftSyncing = true;
  FISCALIZACAO_FORM_FIELDS.forEach((fieldId) => {
    if (!Object.prototype.hasOwnProperty.call(draft, fieldId)) return;
    const node = document.getElementById(fieldId);
    if (!node) return;
    node.value = draft[fieldId] ?? '';
  });
  isDraftSyncing = false;
  updateImagemPreview({
    data: draft['form-imagem-data'] || '',
    name: draft['form-imagem-data'] ? 'Imagem em rascunho' : ''
  });
}

function clearFormDraft() {
  localStorage.removeItem(FORM_DRAFT_KEY);
  setDraftStatus('Sem alterações pendentes', 'idle');
}

function saveFormDraftNow() {
  if (isDraftSyncing) return;
  if (!isModalOpen('form-modal')) return;

  const draft = collectFormDraft();
  if (!writeStoredJson(FORM_DRAFT_KEY, draft)) {
    setDraftStatus('Falha ao salvar rascunho local', 'error');
    return;
  }
  setDraftStatus(`Rascunho salvo ${new Date(draft.__savedAt).toLocaleTimeString('pt-BR')}`, 'saved');
}

function scheduleDraftSave() {
  if (isDraftSyncing) return;
  setDraftStatus('Salvando rascunho...', 'pending');
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveFormDraftNow, 450);
}

function maybeRestoreDraftOnCreate() {
  const draft = readStoredJson(FORM_DRAFT_KEY, null);
  if (!draft) {
    setDraftStatus('Sem alterações pendentes', 'idle');
    return;
  }

  if (String(draft.__editingId || '').trim()) {
    setDraftStatus('Sem alterações pendentes', 'idle');
    return;
  }

  const hasData = FISCALIZACAO_FORM_FIELDS.some((fieldId) => String(draft[fieldId] || '').trim() !== '');
  if (!hasData) {
    setDraftStatus('Sem alterações pendentes', 'idle');
    return;
  }

  applyFormDraft(draft);
  const savedAt = draft.__savedAt ? new Date(draft.__savedAt).toLocaleString('pt-BR') : 'recentemente';
  setDraftStatus(`Rascunho restaurado (${savedAt})`, 'saved');
  showToast('Rascunho local restaurado no formulario.', 'info');
}

function maybeRestoreDraftOnEdit(backendId) {
  const draft = readStoredJson(FORM_DRAFT_KEY, null);
  if (!draft) return;
  if (String(draft.__editingId || '').trim() !== String(backendId || '').trim()) return;

  applyFormDraft(draft);
  const savedAt = draft.__savedAt ? new Date(draft.__savedAt).toLocaleString('pt-BR') : 'recentemente';
  setDraftStatus(`Rascunho de edicao restaurado (${savedAt})`, 'saved');
  showToast('Rascunho da edicao restaurado.', 'info');
}

function clearFormFieldErrors() {
  const summary = document.getElementById('form-error-summary');
  const list = document.getElementById('form-error-list');
  if (summary) summary.classList.add('hidden');
  if (list) list.innerHTML = '';

  FISCALIZACAO_FORM_FIELDS.forEach((fieldId) => {
    const node = document.getElementById(fieldId);
    if (!node) return;
    node.classList.remove('field-error');
    node.removeAttribute('aria-invalid');
  });
}

function buildFormValidationErrors() {
  const errors = [];
  const id = String(document.getElementById('form-id')?.value || '').trim();
  const processo = String(document.getElementById('form-processo-sei')?.value || '').trim();
  const ano = toSafeNumber(document.getElementById('form-ano')?.value);
  const regiao = String(document.getElementById('form-regiao')?.value || '').trim();
  const situacao = String(document.getElementById('form-situacao')?.value || '').trim();
  const direta = String(document.getElementById('form-direta')?.value || '').trim();
  const conformidadeRaw = String(document.getElementById('form-conformidade')?.value || '').trim();
  const conformidade = conformidadeRaw === '' ? null : toSafeNumber(conformidadeRaw.replace(',', '.'));
  const latRaw = String(document.getElementById('form-lat')?.value || '').trim();
  const lngRaw = String(document.getElementById('form-lng')?.value || '').trim();
  const data = String(document.getElementById('form-data')?.value || '').trim();

  if (!id) errors.push({ field: 'form-id', message: 'Informe o ID da fiscalização.' });
  if (!processo) errors.push({ field: 'form-processo-sei', message: 'Informe o número do processo SEI.' });
  if (!Number.isFinite(ano)) {
    errors.push({ field: 'form-ano', message: 'Ano inválido.' });
  } else if (ano < 2000 || ano > 2100) {
    errors.push({ field: 'form-ano', message: 'Ano deve estar entre 2000 e 2100.' });
  }
  if (!regiao) errors.push({ field: 'form-regiao', message: 'Selecione uma região administrativa.' });
  if (!situacao) errors.push({ field: 'form-situacao', message: 'Selecione a situação.' });
  if (!direta) errors.push({ field: 'form-direta', message: 'Selecione se é Direta ou Indireta.' });

  if (conformidade != null) {
    if (!Number.isFinite(conformidade)) {
      errors.push({ field: 'form-conformidade', message: 'Índice de conformidade inválido.' });
    } else if (conformidade < 0 || conformidade > 100) {
      errors.push({ field: 'form-conformidade', message: 'Índice de conformidade deve ficar entre 0 e 100.' });
    }
  }

  if ((latRaw && !lngRaw) || (!latRaw && lngRaw)) {
    errors.push({
      field: latRaw ? 'form-lng' : 'form-lat',
      message: 'Preencha latitude e longitude juntas, ou deixe as duas vazias.'
    });
  }

  if (latRaw) {
    const lat = toSafeNumber(latRaw.replace(',', '.'));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push({ field: 'form-lat', message: 'Latitude inválida (use valor entre -90 e 90).' });
    }
  }

  if (lngRaw) {
    const lng = toSafeNumber(lngRaw.replace(',', '.'));
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push({ field: 'form-lng', message: 'Longitude inválida (use valor entre -180 e 180).' });
    }
  }

  if (data && !toIsoDate(data)) {
    errors.push({ field: 'form-data', message: 'Data inválida. Use AAAA-MM-DD ou DD/MM/AAAA.' });
  }

  return errors;
}

function showFormValidationErrors(errors) {
  clearFormFieldErrors();
  if (!errors.length) return true;

  const summary = document.getElementById('form-error-summary');
  const list = document.getElementById('form-error-list');
  if (summary && list) {
    list.innerHTML = errors.map((error) => {
      const label = fieldLabels[error.field] || error.field;
      return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(error.message)}</li>`;
    }).join('');
    summary.classList.remove('hidden');
  }

  errors.forEach((error) => {
    const node = document.getElementById(error.field);
    if (!node) return;
    node.classList.add('field-error');
    node.setAttribute('aria-invalid', 'true');
  });

  const first = document.getElementById(errors[0].field);
  first?.focus();
  return false;
}

function initFormRealtimeValidation() {
  const form = document.getElementById('fiscalizacao-form');
  if (!form) return;

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.id;
    if (!id) return;
    if (FISCALIZACAO_FORM_FIELDS.includes(id)) {
      scheduleDraftSave();
      target.classList.remove('field-error');
      target.removeAttribute('aria-invalid');
    }
  });
}

async function recordAuditEvent(action, beforeRecord, afterRecord, metadata = {}) {
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    action,
    backendId: afterRecord?.__backendId || beforeRecord?.__backendId || metadata.backendId || null,
    source: window.dataSdk?.getActiveMode?.() || 'local',
    before: beforeRecord || null,
    after: afterRecord || null,
    metadata,
    createdAt: nowIso()
  };

  const localAudit = readStoredJson(AUDIT_LOCAL_KEY, []);
  if (Array.isArray(localAudit)) {
    localAudit.unshift(entry);
    writeStoredJson(AUDIT_LOCAL_KEY, localAudit.slice(0, MAX_AUDIT_ENTRIES));
  }

  if (!window.dataSdk?.isApiConfigured?.()) return;
  try {
    await window.dataSdk._fetchJson(window.dataSdk._buildUrl('/fiscalizacoes-audit'), {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  } catch {
    // Keep local fallback silently.
  }
}

// ======== Add/Edit Modal ========
function openAddModal() {
  document.getElementById('modal-title').innerHTML = `
    <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
    Nova Fiscalização
  `;
  document.getElementById('submit-text').textContent = 'Salvar Fiscalização';
  document.getElementById('fiscalizacao-form').reset();
  document.getElementById('form-backend-id').value = '';
  document.getElementById('form-ano').value = new Date().getFullYear();
  document.getElementById('form-direta').value = 'Direta';
  clearFormFieldErrors();
  document.getElementById('form-modal').classList.remove('hidden');
  updateImagemPreview();
  maybeRestoreDraftOnCreate();
}
window.openAddModal = openAddModal;

function editCurrentFiscalizacao() {
  if (!currentFiscalizacao) return;

  document.getElementById('modal-title').innerHTML = `
    <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>
    Editar Fiscalização
  `;
  document.getElementById('submit-text').textContent = 'Atualizar Fiscalização';

  document.getElementById('form-backend-id').value = currentFiscalizacao.__backendId;
  document.getElementById('form-id').value = currentFiscalizacao.id || '';
  document.getElementById('form-processo-sei').value = currentFiscalizacao.processo_sei || '';
  document.getElementById('form-ano').value = currentFiscalizacao.ano || '';
  document.getElementById('form-regiao').value = currentFiscalizacao.regiao_administrativa || '';
  document.getElementById('form-lat').value = currentFiscalizacao.latitude || '';
  document.getElementById('form-lng').value = currentFiscalizacao.longitude || '';
  document.getElementById('form-situacao').value = currentFiscalizacao.situacao || '';
  document.getElementById('form-direta').value = currentFiscalizacao.direta_indireta || '';
  document.getElementById('form-programada').value = currentFiscalizacao.programada || '';
  document.getElementById('form-conformidade').value = currentFiscalizacao.indice_conformidade || '';
  document.getElementById('form-tipo-doc').value = currentFiscalizacao.tipo_documento || '';
  document.getElementById('form-sei-doc').value = currentFiscalizacao.sei_documento || '';
  document.getElementById('form-data').value = currentFiscalizacao.data || '';
  document.getElementById('form-objetivo').value = currentFiscalizacao.objetivo || '';
  document.getElementById('form-destinatario').value = currentFiscalizacao.destinatario || '';
  document.getElementById('form-constatacoes').value = currentFiscalizacao.constatacoes || '';
  document.getElementById('form-nao-conformes').value = currentFiscalizacao.constatacoes_nao_conformes || '';
  document.getElementById('form-recomendacoes').value = currentFiscalizacao.recomendacoes || '';
  document.getElementById('form-determinacoes').value = currentFiscalizacao.determinacoes || '';
  document.getElementById('form-tn').value = currentFiscalizacao.termos_notificacao || '';
  document.getElementById('form-ai').value = currentFiscalizacao.autos_infracao || '';
  document.getElementById('form-tac').value = currentFiscalizacao.termos_ajuste || '';
  updateImagemPreview({
    data: currentFiscalizacao.imagem || '',
    name: currentFiscalizacao.imagem ? 'Imagem anexada' : ''
  });
  clearFormFieldErrors();
  setDraftStatus('Edicao em andamento (rascunho local ativo)', 'pending');
  maybeRestoreDraftOnEdit(currentFiscalizacao.__backendId);

  closeDetailPanel();
  document.getElementById('form-modal').classList.remove('hidden');
}
window.editCurrentFiscalizacao = editCurrentFiscalizacao;

function closeModal() {
  document.getElementById('form-modal').classList.add('hidden');
  clearTimeout(draftSaveTimer);
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
  disableMapSelection();
}
window.closeModal = closeModal;

function updateImagemPreview({ data = '', name = '' } = {}) {
  const hidden = document.getElementById('form-imagem-data');
  const preview = document.getElementById('form-imagem-preview');
  const img = document.getElementById('form-imagem-preview-img');
  const label = document.getElementById('form-imagem-name');
  const fileInput = document.getElementById('form-imagem-file');

  if (!hidden || !preview || !img || !label) return;

  if (data) {
    hidden.value = data;
    img.src = data;
    label.textContent = name || 'Imagem selecionada';
    preview.classList.remove('hidden');
  } else {
    hidden.value = '';
    img.removeAttribute('src');
    label.textContent = '';
    preview.classList.add('hidden');
    if (fileInput) fileInput.value = '';
  }
}

function handleImagemSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    updateImagemPreview();
    return;
  }

  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    showToast('Imagem deve ter no máximo 2MB.', 'warning');
    event.target.value = '';
    updateImagemPreview();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => updateImagemPreview({ data: reader.result, name: file.name });
  reader.onerror = () => {
    showToast('Não foi possível ler a imagem.', 'error');
    updateImagemPreview();
  };
  reader.readAsDataURL(file);
}
window.handleImagemSelected = handleImagemSelected;

function clearImagemField() {
  updateImagemPreview();
}
window.clearImagemField = clearImagemField;

// ======== Submit (create/update) ========
async function handleSubmit(event) {
  event.preventDefault();

  const validationErrors = buildFormValidationErrors();
  if (!showFormValidationErrors(validationErrors)) {
    showToast('Corrija os campos destacados para continuar.', 'warning');
    return;
  }

  const backendId = document.getElementById('form-backend-id').value;
  const isEditing = !!backendId;

  if (!isEditing && allFiscalizacoes.length >= 999) {
    showToast('Limite de 999 fiscalizações atingido. Exclua algumas para continuar.', 'error');
    return;
  }

  let lat = parseFloat(document.getElementById('form-lat').value);
  let lng = parseFloat(document.getElementById('form-lng').value);
  const regiao = document.getElementById('form-regiao').value;

  if ((!lat || !lng) && regiao && regionCoordinates[regiao]) {
    const [baseLat, baseLng] = regionCoordinates[regiao];
    lat = baseLat + (Math.random() - 0.5) * 0.02;
    lng = baseLng + (Math.random() - 0.5) * 0.02;
  }

  const fiscData = {
    id: document.getElementById('form-id').value,
    processo_sei: document.getElementById('form-processo-sei').value,
    ano: parseInt(document.getElementById('form-ano').value, 10) || null,
    objetivo: document.getElementById('form-objetivo').value,
    regiao_administrativa: regiao,
    situacao: document.getElementById('form-situacao').value,
    tipo_documento: document.getElementById('form-tipo-doc').value,
    destinatario: document.getElementById('form-destinatario').value,
    direta_indireta: document.getElementById('form-direta').value,
    programada: document.getElementById('form-programada').value,
    sei_documento: document.getElementById('form-sei-doc').value,
    data: document.getElementById('form-data').value,
    constatacoes: document.getElementById('form-constatacoes').value,
    constatacoes_nao_conformes: parseInt(document.getElementById('form-nao-conformes').value, 10) || null,
    recomendacoes: document.getElementById('form-recomendacoes').value,
    determinacoes: document.getElementById('form-determinacoes').value,
    termos_notificacao: parseInt(document.getElementById('form-tn').value, 10) || null,
    autos_infracao: parseInt(document.getElementById('form-ai').value, 10) || null,
    termos_ajuste: parseInt(document.getElementById('form-tac').value, 10) || null,
    indice_conformidade: parseFloat(document.getElementById('form-conformidade').value) || null,
    imagem: document.getElementById('form-imagem-data').value || null,
    latitude: lat || null,
    longitude: lng || null
  };

  if (!isEditing) {
    const newIdentity = buildFiscalizacaoIdentity(fiscData);
    const duplicate = allFiscalizacoes.find((record) => {
      if (!record) return false;
      return buildFiscalizacaoIdentity(record) === newIdentity;
    });
    if (newIdentity && duplicate) {
      const duplicateId = duplicate.id || '(sem ID)';
      showToast(`Já existe fiscalização com mesmo ID/Processo (${duplicateId}).`, 'warning');
      setOperationStatus('Duplicidade detectada no cadastro', 'warning');
      return;
    }
  }

  setOperationStatus(isEditing ? 'Atualizando registro...' : 'Salvando registro...', 'syncing');
  showLoading(isEditing ? 'Atualizando...' : 'Salvando...');

  let result;
  let beforeRecord = null;
  if (isEditing) {
    const existingRecord = allFiscalizacoes.find(f => f.__backendId === backendId);
    if (existingRecord) {
      beforeRecord = { ...existingRecord };
      result = await window.dataSdk.update({ ...existingRecord, ...fiscData, __backendId: backendId });
    } else {
      result = { isOk: false };
    }
  } else {
    result = await window.dataSdk.create(fiscData);
  }

  hideLoading();

  if (result && result.isOk) {
    const savedRecord = isEditing
      ? allFiscalizacoes.find((item) => item.__backendId === backendId) || { ...beforeRecord, ...fiscData, __backendId: backendId }
      : allFiscalizacoes[allFiscalizacoes.length - 1] || fiscData;
    await recordAuditEvent(isEditing ? 'update' : 'create', beforeRecord, savedRecord, {
      view: currentView
    });
    bumpSessionMetric('saves');
    clearFormDraft();
    setOperationStatus('Última operação concluída', 'success');
    showToast(isEditing ? 'Fiscalização atualizada!' : 'Fiscalização criada!', 'success');
    closeModal();
    updateDashboard();
  } else {
    setOperationStatus('Falha de conexão ou permissão ao salvar', 'error');
    showToast('Erro ao salvar fiscalização', 'error');
  }
}
window.handleSubmit = handleSubmit;

// ======== Delete ========
function confirmDelete(fisc) {
  deleteTarget = fisc;
  document.getElementById('delete-confirm').classList.remove('hidden');
  document.getElementById('confirm-delete-btn').onclick = executeDelete;
}
window.confirmDelete = confirmDelete;

function cancelDelete() {
  deleteTarget = null;
  document.getElementById('delete-confirm').classList.add('hidden');
}
window.cancelDelete = cancelDelete;

async function executeDelete() {
  if (!deleteTarget) return;

  document.getElementById('delete-confirm').classList.add('hidden');
  setOperationStatus('Removendo registro...', 'syncing');
  showLoading('Excluindo...');

  const beforeRecord = { ...deleteTarget };
  const result = await window.dataSdk.delete(deleteTarget);

  hideLoading();

  if (result.isOk) {
    await recordAuditEvent('delete', beforeRecord, null, { view: currentView });
    setOperationStatus('Registro removido com sucesso', 'success');
    showToast('Fiscalização excluída!', 'success');
    closeDetailPanel();
    updateDashboard();
  } else {
    setOperationStatus('Falha ao remover registro', 'error');
    showToast('Erro ao excluir fiscalização', 'error');
  }

  deleteTarget = null;
}

// ======== Dashboard ========
function toggleDashboard() {
  const panel = document.getElementById('dashboard-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) updateDashboard();
}
window.toggleDashboard = toggleDashboard;

function setDashboardMeta(config) {
  const panel = document.getElementById('dashboard-panel');
  if (!panel) return;

  const titleHeading = panel.querySelector('h2');
  if (titleHeading) {
    const titleSpan = titleHeading.querySelector('#dashboard-title-text');
    if (titleSpan) {
      titleSpan.textContent = config.title;
    } else {
      const textNode = [...titleHeading.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNode) textNode.textContent = ` ${config.title}`;
    }
  }

  const metricLabels = panel.querySelectorAll('.metric-card .text-slate-400.text-sm');
  const labels = [
    config.totalLabel,
    config.secondaryLabel,
    config.tertiaryLabel,
    config.quaternaryLabel,
    config.quinaryLabel,
    config.senaryLabel,
    config.septenaryLabel
  ];

  metricLabels.forEach((element, index) => {
    if (labels[index]) element.textContent = labels[index];
  });

  const chartTitles = panel.querySelectorAll('.metric-card h3');
  if (chartTitles[0]) chartTitles[0].textContent = config.statusChartTitle;
  if (chartTitles[1]) chartTitles[1].textContent = config.regionChartTitle;
}

function buildDashboardBar(value, maxValue, colorClass, valueClass, label) {
  const safeMax = Math.max(maxValue, 1);
  const height = Math.max((value / safeMax) * 150, 20);

  return `
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${height}px; min-height: 20px;">
        <div class="absolute inset-0 ${colorClass} rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 ${valueClass}">${value}</p>
      <p class="text-xs text-slate-400 text-center">${label}</p>
    </div>
  `;
}

function updateDashboard() {
  if (currentView === 'obras') {
    const total = allObras.length;
    const comCoordenadas = allObras.filter((obra) => hasObraCoordinates(obra)).length;
    const semCoordenadas = total - comCoordenadas;
    const emExecucao = allObras.filter((obra) => normalizePlainText(obra.situacao_contrato).includes('execu')).length;
    const emRecebimento = allObras.filter((obra) => normalizePlainText(obra.situacao_contrato).includes('receb')).length;
    const outrasSituacoes = total - emExecucao - emRecebimento;

    const progressos = allObras
      .map((obra) => getObraProgressValue(obra))
      .filter((value) => Number.isFinite(value));
    const avgExecucao = progressos.length > 0
      ? Math.round(progressos.reduce((sum, value) => sum + value, 0) / progressos.length)
      : 0;

    const valorTotal = allObras.reduce((sum, obra) => sum + (Number.isFinite(obra.valor_total_obra) ? obra.valor_total_obra : 0), 0);
    const valorExecutado = allObras.reduce((sum, obra) => sum + (Number.isFinite(obra.valor_executado_2025) ? obra.valor_executado_2025 : 0), 0);

    setDashboardMeta({
      title: 'Dashboard de Obras',
      totalLabel: 'Total de Obras',
      secondaryLabel: 'Em Execução',
      tertiaryLabel: 'Em Recebimento',
      quaternaryLabel: 'Execução Média',
      quinaryLabel: 'Sem Coordenadas',
      senaryLabel: 'Valor Total',
      septenaryLabel: 'Executado 2025',
      statusChartTitle: 'Distribuição por Situação do Contrato',
      regionChartTitle: 'Por Local'
    });

    document.getElementById('metric-total').textContent = total;
    document.getElementById('metric-andamento').textContent = emExecucao;
    document.getElementById('metric-concluida').textContent = emRecebimento;
    document.getElementById('metric-pendente').textContent = semCoordenadas;
    document.getElementById('metric-conformidade').textContent = `${avgExecucao}%`;
    document.getElementById('metric-ai').textContent = formatCurrency(valorTotal);
    document.getElementById('metric-tn').textContent = formatCurrency(valorExecutado);
    document.getElementById('metric-critical-pending').textContent = allObras.filter((obra) => {
      const progress = getObraProgressValue(obra);
      const status = normalizePlainText(obra.situacao_contrato);
      return (Number.isFinite(progress) && progress < 40) || status.includes('paralis') || status.includes('atras');
    }).length;
    document.getElementById('metric-no-coords').textContent = semCoordenadas;
    document.getElementById('metric-session-saves').textContent = sessionMetrics.saves;
    document.getElementById('metric-session-imports').textContent = sessionMetrics.imports;
    const duplicateSummary = document.getElementById('duplicate-summary-text');
    if (duplicateSummary) {
      duplicateSummary.textContent = 'Duplicidade (ID + Processo SEI): aplicável apenas a fiscalizações';
    }
    const dedupeButton = document.getElementById('dedupe-fiscalizacoes-btn');
    if (dedupeButton) dedupeButton.disabled = true;

    const maxStatus = Math.max(emExecucao, emRecebimento, outrasSituacoes, 1);
    document.getElementById('chart-situacao').innerHTML = [
      buildDashboardBar(emExecucao, maxStatus, 'bg-gradient-to-t from-amber-500 to-yellow-400', 'text-amber-400', 'Em Execução'),
      buildDashboardBar(emRecebimento, maxStatus, 'bg-gradient-to-t from-emerald-500 to-green-400', 'text-emerald-400', 'Em Recebimento'),
      buildDashboardBar(outrasSituacoes, maxStatus, 'bg-gradient-to-t from-sky-500 to-blue-400', 'text-sky-400', 'Outras')
    ].join('');

    const localCounts = {};
    allObras.forEach((obra) => {
      const local = String(obra.local || '').trim() || 'Sem local informado';
      localCounts[local] = (localCounts[local] || 0) + 1;
    });

    const sortedLocais = Object.entries(localCounts).sort((a, b) => b[1] - a[1]);
    const maxLocal = sortedLocais.length > 0 ? sortedLocais[0][1] : 1;

    document.getElementById('chart-regiao').innerHTML = sortedLocais.length > 0
      ? sortedLocais.map(([local, count]) => `
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-400 w-32 truncate">${local}</span>
          <div class="flex-1 h-5 bg-slate-700 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
                 style="width: ${(count / maxLocal) * 100}%"></div>
          </div>
          <span class="text-sm font-semibold text-emerald-400 min-w-[30px] text-right">${count}</span>
        </div>
      `).join('')
      : '<p class="text-center text-slate-500 py-8">Nenhuma obra cadastrada</p>';
    return;
  }

  setDashboardMeta({
    title: 'Dashboard de Métricas',
    totalLabel: 'Total de Fiscalizações',
    secondaryLabel: 'Em Andamento',
    tertiaryLabel: 'Concluídas',
    quaternaryLabel: 'Conformidade Média',
    quinaryLabel: 'Pendentes',
    senaryLabel: 'Total de Autos de Infração',
    septenaryLabel: 'Total de Termos de Notificação',
    statusChartTitle: 'Distribuição por Situação',
    regionChartTitle: 'Por Região Administrativa'
  });

  const total = allFiscalizacoes.length;
  const andamento = allFiscalizacoes.filter(f => f.situacao === 'Em Andamento').length;
  const concluida = allFiscalizacoes.filter(f => f.situacao === 'Concluida').length;
  const pendente = allFiscalizacoes.filter(f => f.situacao === 'Pendente').length;

  const conformidades = allFiscalizacoes.filter(f => f.indice_conformidade).map(f => f.indice_conformidade);
  const avgConformidade = conformidades.length > 0
    ? Math.round(conformidades.reduce((a, b) => a + b, 0) / conformidades.length)
    : 0;

  const totalAI = allFiscalizacoes.reduce((sum, f) => sum + (f.autos_infracao || 0), 0);
  const totalTN = allFiscalizacoes.reduce((sum, f) => sum + (f.termos_notificacao || 0), 0);

  document.getElementById('metric-total').textContent = total;
  document.getElementById('metric-andamento').textContent = andamento;
  document.getElementById('metric-concluida').textContent = concluida;
  document.getElementById('metric-pendente').textContent = pendente;
  document.getElementById('metric-conformidade').textContent = `${avgConformidade}%`;
  document.getElementById('metric-ai').textContent = totalAI;
  document.getElementById('metric-tn').textContent = totalTN;
  document.getElementById('metric-critical-pending').textContent = allFiscalizacoes.filter((f) => {
    const pendenteOuAndamento = normalizePlainText(f.situacao).includes('pend') || normalizePlainText(f.situacao).includes('andamento');
    const conformidade = toSafeNumber(f.indice_conformidade);
    const naoConformes = toSafeNumber(f.constatacoes_nao_conformes) || 0;
    return pendenteOuAndamento && ((Number.isFinite(conformidade) && conformidade < 60) || naoConformes > 0);
  }).length;
  document.getElementById('metric-no-coords').textContent = allFiscalizacoes.filter((f) => {
    return !(Number.isFinite(Number(f.latitude)) && Number.isFinite(Number(f.longitude)));
  }).length;
  document.getElementById('metric-session-saves').textContent = sessionMetrics.saves;
  document.getElementById('metric-session-imports').textContent = sessionMetrics.imports;
  const dedupeButton = document.getElementById('dedupe-fiscalizacoes-btn');
  if (dedupeButton) dedupeButton.disabled = false;
  const duplicateSummary = document.getElementById('duplicate-summary-text');
  if (duplicateSummary) {
    const duplicateReport = buildDuplicateReport(allFiscalizacoes);
    duplicateSummary.textContent = `Duplicidades por ID + Processo SEI: ${duplicateReport.duplicateRecords}`;
  }

  const maxStatus = Math.max(andamento, concluida, pendente, 1);
  document.getElementById('chart-situacao').innerHTML = [
    buildDashboardBar(andamento, maxStatus, 'bg-gradient-to-t from-amber-500 to-yellow-400', 'text-amber-400', 'Andamento'),
    buildDashboardBar(concluida, maxStatus, 'bg-gradient-to-t from-emerald-500 to-green-400', 'text-emerald-400', 'Concluída'),
    buildDashboardBar(pendente, maxStatus, 'bg-gradient-to-t from-red-500 to-rose-400', 'text-red-400', 'Pendente')
  ].join('');

  const regionCounts = {};
  allFiscalizacoes.forEach(f => {
    if (f.regiao_administrativa) regionCounts[f.regiao_administrativa] = (regionCounts[f.regiao_administrativa] || 0) + 1;
  });

  const sortedRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  const maxRegion = sortedRegions.length > 0 ? sortedRegions[0][1] : 1;

  document.getElementById('chart-regiao').innerHTML = sortedRegions.length > 0
    ? sortedRegions.map(([region, count]) => `
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-32 truncate">${region}</span>
        <div class="flex-1 h-5 bg-slate-700 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
               style="width: ${(count / maxRegion) * 100}%"></div>
        </div>
        <span class="text-sm font-semibold text-blue-400 min-w-[30px] text-right">${count}</span>
      </div>
    `).join('')
    : '<p class="text-center text-slate-500 py-8">Nenhuma região cadastrada</p>';
}

// ======== Obras Upload ========
function updateObrasUploadActions() {
  const uploadBtn = document.getElementById('obras-upload-btn');
  const clearBtn = document.getElementById('clear-obras-btn');

  if (uploadBtn) uploadBtn.disabled = pendingObrasUpload.length === 0;
  if (clearBtn) clearBtn.classList.toggle('hidden', !(pendingObrasMeta || allObras.length > 0));
}

function renderObrasUploadPreview(records = [], meta = null) {
  const summary = document.getElementById('obras-upload-summary');
  const fileLabel = document.getElementById('obras-summary-file');
  const sheetLabel = document.getElementById('obras-summary-sheet');
  const countLabel = document.getElementById('obras-summary-count');
  const previewBody = document.getElementById('obras-preview-body');

  if (!summary || !fileLabel || !sheetLabel || !countLabel || !previewBody) return;

  if (!meta) {
    summary.classList.add('hidden');
    fileLabel.textContent = '-';
    sheetLabel.textContent = '-';
    countLabel.textContent = '0';
    previewBody.innerHTML = '';
    return;
  }

  fileLabel.textContent = meta.fileName || '-';
  sheetLabel.textContent = meta.sheetName || '-';
  countLabel.textContent = String(records.length);
  previewBody.innerHTML = records.length > 0
    ? records.slice(0, 5).map((obra) => `
      <tr class="border-t border-slate-600">
        <td class="px-2 py-2 text-slate-300">${escapeHtml(obra.item || '-')}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(obra.local || '-')}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(obra.situacao_contrato || '-')}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(formatPercent(getObraProgressValue(obra)))}</td>
      </tr>
    `).join('')
    : `
      <tr class="border-t border-slate-600">
        <td colspan="4" class="px-2 py-4 text-center text-slate-500">
          Nenhuma obra valida encontrada na aba selecionada.
        </td>
      </tr>
    `;

  summary.classList.remove('hidden');
}

function openObrasUploadModal() {
  document.getElementById('obras-upload-modal').classList.remove('hidden');
  renderObrasUploadPreview(pendingObrasUpload, pendingObrasMeta);
  updateObrasUploadActions();
}
window.openObrasUploadModal = openObrasUploadModal;

function closeObrasUploadModal() {
  document.getElementById('obras-upload-modal').classList.add('hidden');
  updateObrasUploadActions();
}
window.closeObrasUploadModal = closeObrasUploadModal;

async function handleObrasFileSelected(event) {
  const input = event?.target;
  const file = input?.files?.[0];

  if (!file) {
    pendingObrasUpload = [];
    pendingObrasMeta = null;
    renderObrasUploadPreview();
    updateObrasUploadActions();
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Leitor de planilha indisponível no navegador.', 'error');
    input.value = '';
    return;
  }

  showLoading('Lendo planilha de obras...');

  try {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false
    });
    const sheetName = selectObrasSheetName(workbook.SheetNames);
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;

    if (!sheetName || !sheet) {
      throw new Error('Não foi possível localizar a aba de obras na planilha.');
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: ''
    });
    const headerRowIndex = findObrasHeaderRow(rawRows);

    if (headerRowIndex < 0) {
      throw new Error('Não encontrei o cabeçalho da tabela de obras nesta planilha.');
    }

    const rawRecords = XLSX.utils.sheet_to_json(sheet, {
      range: headerRowIndex,
      raw: false,
      defval: ''
    });

    const records = rawRecords
      .map((record, index) => mapUploadedObraRecord(record, index))
      .filter(Boolean);

    pendingObrasUpload = records;
    pendingObrasMeta = {
      fileName: file.name,
      sheetName,
      headerRowIndex
    };

    renderObrasUploadPreview(records, pendingObrasMeta);
    updateObrasUploadActions();

    if (records.length === 0) {
      showToast('Planilha lida, mas nenhuma obra válida foi encontrada.', 'warning');
    } else {
      const mappedWithCoordinates = records.filter((obra) => hasObraCoordinates(obra)).length;
      showToast(`${records.length} obras preparadas (${mappedWithCoordinates} com coordenadas).`, 'success');
    }
  } catch (error) {
    pendingObrasUpload = [];
    pendingObrasMeta = null;
    renderObrasUploadPreview();
    updateObrasUploadActions();
    showToast(error?.message || 'Erro ao processar a planilha de obras.', 'error');
  } finally {
    hideLoading();
    if (input) input.value = '';
  }
}
window.handleObrasFileSelected = handleObrasFileSelected;

async function executeObrasUpload() {
  if (pendingObrasUpload.length === 0) {
    showToast('Selecione uma planilha válida antes de carregar as obras.', 'warning');
    return;
  }

  setOperationStatus('Salvando obras...', 'syncing');
  showLoading('Salvando obras...');

  const result = await persistObrasData(pendingObrasUpload.map((obra) => ({ ...obra })));

  hideLoading();

  if (!result.isOk) {
    setOperationStatus('Falha de conexão ao salvar obras', 'error');
    showToast('Erro ao salvar obras.', 'error');
    return;
  }

  pendingObrasUpload = [];
  pendingObrasMeta = null;
  renderObrasUploadPreview();
  updateObrasUploadActions();
  closeObrasUploadModal();

  if (currentView !== 'obras') {
    switchDataView('obras');
  } else {
    closeDetailPanel();
    updateFiltersOptions();
    clearFilters();
  }

  updateDashboard();
  bumpSessionMetric('imports');
  setOperationStatus('Obras atualizadas com sucesso', 'success');

  const mappedWithCoordinates = allObras.filter((obra) => hasObraCoordinates(obra)).length;
  if (result.fallbackReason === 'api_unavailable') {
    showToast(`${allObras.length} obras carregadas localmente (${mappedWithCoordinates} com coordenadas).`, 'warning');
    return;
  }
  showToast(`${allObras.length} obras carregadas (${mappedWithCoordinates} com coordenadas).`, 'success');
}
window.executeObrasUpload = executeObrasUpload;

async function clearObrasData() {
  if (!pendingObrasMeta && allObras.length === 0) {
    showToast('Não há obras carregadas para limpar.', 'info');
    return;
  }

  if (!window.confirm('Remover todas as obras carregadas do mapa?')) {
    return;
  }

  setOperationStatus('Removendo obras...', 'syncing');
  showLoading('Removendo obras...');

  const result = await deleteObrasData();

  hideLoading();

  if (!result.isOk) {
    setOperationStatus('Falha ao remover obras', 'error');
    showToast('Erro ao remover obras.', 'error');
    return;
  }

  pendingObrasUpload = [];
  pendingObrasMeta = null;
  renderObrasUploadPreview();
  updateObrasUploadActions();

  const fileInput = document.getElementById('obras-file-input');
  if (fileInput) fileInput.value = '';

  if (currentView === 'obras') {
    closeDetailPanel();
    updateFiltersOptions();
    applyFilters();
  }

  updateDashboard();
  setOperationStatus('Obras removidas', 'success');

  if (result.fallbackReason === 'api_unavailable') {
    showToast('Obras removidas localmente (API indisponível).', 'warning');
    return;
  }
  showToast('Dados de obras removidos.', 'success');
}
window.clearObrasData = clearObrasData;

// ======== Export ========
function exportToCSV() {
  let headers = [];
  let rows = [];
  let filename = '';

  if (currentView === 'obras') {
    if (allObras.length === 0) {
      showToast('Nenhuma obra para exportar', 'warning');
      return;
    }

    headers = [
      'Item', 'Sistema', 'Tipo', 'Programa', 'Ação', 'Local',
      'Número Contrato', 'Objeto Contrato', 'Valor Total', 'Situação',
      'Fornecedor', 'Processo SEI', 'Tipo Recurso', 'Fonte Recurso',
      'Execução Início', 'Execução Término', 'Executado 2025',
      'Execução Financeira', 'Execução Física', 'Latitude', 'Longitude'
    ];

    rows = allObras.map((obra) => [
      obra.item, obra.sistema, obra.tipo, obra.programa, obra.acao, obra.local,
      obra.numero_contrato, obra.objeto_contrato, obra.valor_total_obra,
      obra.situacao_contrato, obra.fornecedor, obra.numero_processo_sei,
      obra.tipo_recurso, obra.fonte_recurso, obra.execucao_inicio,
      obra.execucao_termino, obra.valor_executado_2025,
      obra.execucao_financeira_pct, obra.execucao_fisica_pct,
      obra.latitude, obra.longitude
    ]);

    filename = `obras_${new Date().toISOString().split('T')[0]}.csv`;
  } else {
    if (allFiscalizacoes.length === 0) {
      showToast('Nenhuma fiscalização para exportar', 'warning');
      return;
    }

    headers = [
      'ID', 'Processo SEI', 'Ano', 'Objetivo', 'Região', 'Situação',
      'Tipo Documento', 'Destinatário', 'Direta/Indireta', 'Programada',
      'SEI Documento', 'Data', 'Constatações', 'Não Conformes',
      'Recomendações', 'Determinações', 'TN', 'AI', 'TAC',
      'Conformidade', 'Latitude', 'Longitude'
    ];

    rows = allFiscalizacoes.map(f => [
      f.id, f.processo_sei, f.ano, f.objetivo, f.regiao_administrativa,
      f.situacao, f.tipo_documento, f.destinatario, f.direta_indireta,
      f.programada, f.sei_documento, f.data, f.constatacoes,
      f.constatacoes_nao_conformes, f.recomendacoes, f.determinacoes,
      f.termos_notificacao, f.autos_infracao, f.termos_ajuste,
      f.indice_conformidade, f.latitude, f.longitude
    ]);

    filename = `fiscalizacoes_${new Date().toISOString().split('T')[0]}.csv`;
  }

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();

  showToast('Arquivo exportado!', 'success');
}
window.exportToCSV = exportToCSV;

// ======== Toast / Loading ========
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');

  const icons = {
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
  };

  toast.className = `app-toast app-toast--${type} fade-in`;
  toast.innerHTML = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[type]}</svg>
    <span class="text-sm font-medium text-slate-900">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
window.showToast = showToast;

function showLoading(text = 'Carregando...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ======== Import ========
function openImportModal() {
  document.getElementById('import-modal').classList.remove('hidden');
  resetFiscalizacoesImportState();
}
window.openImportModal = openImportModal;

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
  resetFiscalizacoesImportState();
}
window.closeImportModal = closeImportModal;

function resetFiscalizacoesImportState() {
  pendingFiscalizacoesUpload = [];
  pendingFiscalizacoesMeta = null;
  importSimulation = null;

  const input = document.getElementById('fiscalizacoes-file-input');
  if (input) input.value = '';

  const preview = document.getElementById('import-preview');
  const summary = document.getElementById('import-simulation-summary');
  const uploadSummary = document.getElementById('fiscalizacoes-upload-summary');
  const previewBody = document.getElementById('preview-body');
  const importBtn = document.getElementById('import-btn');
  if (preview) preview.classList.add('hidden');
  if (summary) summary.classList.add('hidden');
  if (uploadSummary) uploadSummary.classList.add('hidden');
  if (previewBody) previewBody.innerHTML = '';
  if (importBtn) importBtn.disabled = true;
}

function selectFiscalizacoesSheetName(sheetNames) {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return null;
  return sheetNames.find((name) => normalizePlainText(name).includes('fiscaliza')) ||
    sheetNames.find((name) => normalizePlainText(name).includes('direta')) ||
    sheetNames.find((name) => normalizePlainText(name).includes('dados')) ||
    sheetNames[0];
}

function findFiscalizacoesHeaderRow(rows) {
  if (!Array.isArray(rows)) return -1;
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    const cells = row.map(normalizeHeaderText);
    const hasId = cells.includes('id');
    const hasProcessoSei = cells.some((cell) => cell.includes('processo sei'));
    const hasDiretaIndireta = cells.some((cell) => cell.includes('direta ou indireta'));
    if (hasId && hasProcessoSei && hasDiretaIndireta) {
      return index;
    }
  }
  return -1;
}

function renderFiscalizacoesUploadSummary(rows = [], meta = null) {
  const summary = document.getElementById('fiscalizacoes-upload-summary');
  const fileLabel = document.getElementById('fiscalizacoes-summary-file');
  const sheetLabel = document.getElementById('fiscalizacoes-summary-sheet');
  const countLabel = document.getElementById('fiscalizacoes-summary-count');
  if (!summary || !fileLabel || !sheetLabel || !countLabel) return;

  if (!meta) {
    summary.classList.add('hidden');
    fileLabel.textContent = '-';
    sheetLabel.textContent = '-';
    countLabel.textContent = '0';
    return;
  }

  fileLabel.textContent = meta.fileName || '-';
  sheetLabel.textContent = meta.sheetName || '-';
  countLabel.textContent = String(rows.length);
  summary.classList.remove('hidden');
}

async function handleFiscalizacoesFileSelected(event) {
  const input = event?.target;
  const file = input?.files?.[0];

  if (!file) {
    resetFiscalizacoesImportState();
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Leitor de planilha indisponível no navegador.', 'error');
    return;
  }

  showLoading('Lendo arquivo de fiscalizações...');
  setOperationStatus('Lendo arquivo para importação...', 'syncing');

  try {
    let dataRows = [];
    let sheetName = 'CSV';
    let headerRowIndex = -1;

    const isCsv = /\.csv$/i.test(file.name || '') || String(file.type || '').toLowerCase().includes('csv');
    if (isCsv) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const delimiter = detectImportDelimiter(lines);
      headerRowIndex = findImportHeaderIndex(lines, delimiter);
      if (headerRowIndex < 0) {
        throw new Error('Não foi possível localizar o cabeçalho no CSV de fiscalizações.');
      }
      dataRows = lines
        .slice(headerRowIndex + 1)
        .map((line) => line.split(delimiter).map((cell) => String(cell || '').trim()))
        .filter((cells) => cells.some((cell) => cell !== ''));
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      sheetName = selectFiscalizacoesSheetName(workbook.SheetNames);
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      if (!sheetName || !sheet) {
        throw new Error('Não foi possível localizar uma aba válida de fiscalizações.');
      }
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      headerRowIndex = findFiscalizacoesHeaderRow(rawRows);
      if (headerRowIndex < 0) {
        throw new Error('Não foi possível localizar o cabeçalho de fiscalizações na planilha.');
      }
      dataRows = rawRows
        .slice(headerRowIndex + 1)
        .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell || '').trim()) : []))
        .filter((cells) => cells.some((cell) => cell !== ''));
    }

    pendingFiscalizacoesUpload = dataRows;
    pendingFiscalizacoesMeta = {
      fileName: file.name,
      sheetName,
      headerRowIndex,
      fileKey: `${file.name}-${file.size}-${file.lastModified}`
    };
    renderFiscalizacoesUploadSummary(dataRows, pendingFiscalizacoesMeta);
    setOperationStatus('Arquivo carregado. Execute a simulação.', 'success');

    if (dataRows.length === 0) {
      showToast('Arquivo lido, mas nenhuma linha de fiscalização foi encontrada.', 'warning');
      return;
    }

    showToast(`Arquivo carregado com ${dataRows.length} linhas para simulação.`, 'success');
    previewImport();
  } catch (error) {
    pendingFiscalizacoesUpload = [];
    pendingFiscalizacoesMeta = null;
    renderFiscalizacoesUploadSummary();
    setOperationStatus('Falha ao ler arquivo de importação', 'error');
    showToast(error?.message || 'Erro ao ler arquivo de fiscalizações.', 'error');
  } finally {
    hideLoading();
    if (input) input.value = '';
  }
}
window.handleFiscalizacoesFileSelected = handleFiscalizacoesFileSelected;

function detectImportDelimiter(lines) {
  const sample = lines.slice(0, 5).join('\n');
  const delimiters = [';', '\t', ','];

  let bestDelimiter = ';';
  let bestCount = -1;

  for (const delimiter of delimiters) {
    const escaped = delimiter === '\t' ? '\\t' : `\\${delimiter}`;
    const count = (sample.match(new RegExp(escaped, 'g')) || []).length;

    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function normalizeHeaderText(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findImportHeaderIndex(lines, delimiter) {
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map(normalizeHeaderText);
    const hasId = cells.includes('id');
    const hasProcessoSei = cells.some(cell => cell.includes('processo sei'));
    const hasDiretaIndireta = cells.some(cell => cell.includes('direta ou indireta'));

    if (hasId && hasProcessoSei && hasDiretaIndireta) {
      return i;
    }
  }

  return -1;
}

function parseImportRecordFromCells(cells) {
  const rowResult = {
    status: 'ok',
    notes: [],
    record: null,
    id: '',
    regiao: '',
    situacao: '',
    conformidade: ''
  };

  if (!Array.isArray(cells) || cells.length < 19) {
    rowResult.status = 'error';
    rowResult.notes.push('Linha incompleta: esperado mínimo de 19 colunas.');
    return rowResult;
  }

  const norm = (value) => String(value ?? '').trim();
  const normalizeType = (value) => normalizePlainText(norm(value));
  const parseNumber = (value) => {
    const cleaned = norm(value).replace('%', '');
    const parsed = parseLocalizedNumber(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const parseIntSafe = (value) => {
    const parsed = parseNumber(value);
    return parsed == null ? null : Math.trunc(parsed);
  };

  let regiaoRaw = norm(cells[4]);
  let regiao = regiaoRaw;
  if (/^distrito\s*federal$/i.test(regiaoRaw)) {
    regiao = 'Plano Piloto';
  }

  const tipoFiscalizacao = norm(cells[7]);
  if (normalizeType(tipoFiscalizacao) !== 'direta') {
    rowResult.status = 'warning';
    rowResult.notes.push('Ignorada: somente fiscalizações Direta são importadas.');
    rowResult.id = norm(cells[0]);
    rowResult.regiao = regiao;
    rowResult.situacao = norm(cells[5]);
    rowResult.conformidade = norm(cells[18]);
    return rowResult;
  }

  const id = norm(cells[0]);
  if (!id) {
    rowResult.status = 'error';
    rowResult.notes.push('ID vazio.');
  }

  const processo = norm(cells[1]);
  if (!processo) {
    rowResult.status = 'error';
    rowResult.notes.push('Processo SEI vazio.');
  }

  let ano = parseIntSafe(cells[2]);
  if (!Number.isFinite(ano)) {
    rowResult.status = 'warning';
    rowResult.notes.push('Ano ausente ou inválido; será mantido vazio.');
    ano = null;
  }

  const conformidade = parseNumber(cells[18]);
  if (norm(cells[18]) && conformidade == null) {
    rowResult.status = rowResult.status === 'error' ? 'error' : 'warning';
    rowResult.notes.push('Conformidade inválida; valor ignorado.');
  }

  let lat = null;
  let lng = null;
  if (regiao && regionCoordinates[regiao]) {
    const [baseLat, baseLng] = regionCoordinates[regiao];
    lat = baseLat + (Math.random() - 0.5) * 0.02;
    lng = baseLng + (Math.random() - 0.5) * 0.02;
  } else {
    rowResult.status = rowResult.status === 'error' ? 'error' : 'warning';
    rowResult.notes.push('Região sem coordenada base; o mapa pode ficar sem foco local.');
  }

  rowResult.id = id;
  rowResult.regiao = regiao;
  rowResult.situacao = norm(cells[5]);
  rowResult.conformidade = norm(cells[18]);
  rowResult.record = {
    id,
    processo_sei: processo,
    ano,
    objetivo: norm(cells[3]),
    regiao_administrativa: regiao || null,
    situacao: norm(cells[5]),
    tipo_documento: norm(cells[6]),
    destinatario: '',
    direta_indireta: 'Direta',
    programada: norm(cells[8]),
    sei_documento: norm(cells[9]),
    data: toIsoDate(norm(cells[10])),
    constatacoes: norm(cells[11]),
    constatacoes_nao_conformes: parseIntSafe(cells[12]),
    recomendacoes: norm(cells[13]),
    determinacoes: norm(cells[14]),
    termos_notificacao: parseIntSafe(cells[15]),
    autos_infracao: parseIntSafe(cells[16]),
    termos_ajuste: parseIntSafe(cells[17]),
    indice_conformidade: conformidade,
    latitude: lat,
    longitude: lng
  };

  return rowResult;
}

function renderImportSimulation(simulation) {
  const preview = document.getElementById('import-preview');
  const previewBody = document.getElementById('preview-body');
  const summary = document.getElementById('import-simulation-summary');
  const totalLabel = document.getElementById('sim-total-lines');
  const validLabel = document.getElementById('sim-valid-lines');
  const warningLabel = document.getElementById('sim-warning-lines');
  const errorLabel = document.getElementById('sim-error-lines');
  const note = document.getElementById('sim-summary-note');
  const importBtn = document.getElementById('import-btn');
  if (!preview || !previewBody || !summary || !totalLabel || !validLabel || !warningLabel || !errorLabel || !note || !importBtn) return;

  previewBody.innerHTML = simulation.rows.slice(0, 80).map((row) => {
    const toneClass = row.status === 'error'
      ? 'text-red-300'
      : row.status === 'warning'
        ? 'text-amber-300'
        : 'text-emerald-300';
    const statusText = row.status === 'error' ? 'Erro' : (row.status === 'warning' ? 'Aviso' : 'OK');
    return `
      <tr class="border-t border-slate-600">
        <td class="px-2 py-2 ${toneClass}">${statusText}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(row.id || '-')}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(formatDisplayText(row.regiao || '-'))}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(formatDisplayText(row.situacao || '-'))}</td>
        <td class="px-2 py-2 text-slate-300">${escapeHtml(row.conformidade || '-')}</td>
        <td class="px-2 py-2 text-slate-400">${escapeHtml((row.notes || []).join(' | ') || '-')}</td>
      </tr>
    `;
  }).join('');

  totalLabel.textContent = simulation.total;
  validLabel.textContent = simulation.validCount;
  warningLabel.textContent = simulation.warningCount;
  errorLabel.textContent = simulation.errorCount;
  note.textContent = simulation.errorCount > 0
    ? 'Corrija as linhas com erro para habilitar a importação.'
    : 'Simulação pronta. Linhas com aviso serão importadas, mas revise os alertas.';

  preview.classList.remove('hidden');
  summary.classList.remove('hidden');
  importBtn.disabled = simulation.errorCount > 0 || simulation.importableRecords.length === 0;
}

function buildImportSimulationFromRows(dataRows) {
  const rows = (dataRows || []).map((cells, index) => {
    const parsed = parseImportRecordFromCells(cells);
    parsed.lineNumber = index + 1;
    return parsed;
  });

  const existingIdentityMap = new Map();
  allFiscalizacoes.forEach((record) => {
    const identity = buildFiscalizacaoIdentity(record);
    if (!identity) return;
    if (!existingIdentityMap.has(identity)) {
      existingIdentityMap.set(identity, record);
    }
  });

  const seenImportIdentity = new Set();
  rows.forEach((row) => {
    if (!row.record) return;
    const identity = buildFiscalizacaoIdentity(row.record);
    if (!identity) return;

    if (existingIdentityMap.has(identity)) {
      row.status = row.status === 'error' ? 'error' : 'warning';
      row.skipImport = true;
      row.notes.push('Registro já existe no sistema e será ignorado para evitar duplicidade.');
      return;
    }

    if (seenImportIdentity.has(identity)) {
      row.status = row.status === 'error' ? 'error' : 'warning';
      row.skipImport = true;
      row.notes.push('Registro repetido no próprio arquivo; apenas a primeira ocorrência será considerada.');
      return;
    }

    seenImportIdentity.add(identity);
  });

  const importableRecords = rows
    .filter((row) => row.record && row.status !== 'error' && !row.skipImport)
    .map((row) => row.record);

  const errorCount = rows.filter((row) => row.status === 'error').length;
  const warningCount = rows.filter((row) => row.status === 'warning').length;
  const validCount = rows.filter((row) => row.status === 'ok').length;

  return {
    sourceKey: pendingFiscalizacoesMeta?.fileKey || '',
    total: rows.length,
    rows,
    importableRecords,
    errorCount,
    warningCount,
    validCount
  };
}

function buildImportSimulation() {
  if (!pendingFiscalizacoesUpload.length) return null;
  return buildImportSimulationFromRows(pendingFiscalizacoesUpload);
}

function previewImport() {
  const simulation = buildImportSimulation();
  if (!simulation) {
    showToast('Selecione um arquivo de fiscalizações antes de simular.', 'warning');
    return;
  }

  if (simulation.total === 0) {
    showToast('Não foram encontradas linhas para importar.', 'warning');
    return;
  }

  importSimulation = simulation;
  renderImportSimulation(simulation);
  setOperationStatus('Simulação de importação concluída', simulation.errorCount > 0 ? 'warning' : 'success');

  if (simulation.importableRecords.length === 0) {
    showToast('Nenhuma linha válida para importação.', 'warning');
    return;
  }

  if (simulation.errorCount > 0) {
    showToast('Simulação concluída com erros. Revise as linhas destacadas.', 'warning');
    return;
  }

  if (simulation.warningCount > 0) {
    showToast('Simulação concluída com avisos.', 'info');
    return;
  }

  showToast('Simulação concluída sem erros.', 'success');
}
window.previewImport = previewImport;

async function executeImport() {
  if (!pendingFiscalizacoesUpload.length) {
    showToast('Selecione um arquivo de fiscalizações primeiro.', 'warning');
    return;
  }

  if (!importSimulation || importSimulation.sourceKey !== (pendingFiscalizacoesMeta?.fileKey || '')) {
    previewImport();
  }

  if (!importSimulation) return;
  if (importSimulation.errorCount > 0) {
    showToast('Não é possível importar com erros na simulação.', 'error');
    return;
  }

  const recordsToImport = importSimulation.importableRecords;
  if (recordsToImport.length === 0) {
    showToast('Não há registros importáveis.', 'warning');
    return;
  }

  if (allFiscalizacoes.length + recordsToImport.length > 999) {
    showToast(`Você tem ${allFiscalizacoes.length} registros. Máximo permitido é 999.`, 'error');
    return;
  }

  setOperationStatus(`Importando ${recordsToImport.length} registros...`, 'syncing');
  showLoading(`Importando ${recordsToImport.length} fiscalizações...`);
  const btn = document.getElementById('import-btn');
  if (btn) btn.disabled = true;

  let imported = 0;
  let failed = 0;

  for (let index = 0; index < recordsToImport.length; index += 1) {
    const payload = recordsToImport[index];
    const result = await window.dataSdk.create(payload);
    if (result?.isOk) {
      imported += 1;
    } else {
      failed += 1;
    }

    const progress = Math.round(((index + 1) / recordsToImport.length) * 100);
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
      loadingText.textContent = `Importando... ${progress}% (${imported}/${recordsToImport.length})`;
    }
  }

  hideLoading();
  if (btn) btn.disabled = false;

  if (imported > 0) {
    await recordAuditEvent('import_batch', null, null, {
      imported,
      warnings: importSimulation.warningCount
    });
    bumpSessionMetric('imports');
    setOperationStatus(`${imported} registros importados com sucesso`, 'success');
    showToast(`${imported} fiscalizações importadas!`, 'success');
    closeImportModal();
    updateDashboard();
  }

  if (failed > 0) {
    setOperationStatus(`Importação com falhas (${failed})`, 'warning');
    showToast(`${failed} registros falharam na importação.`, 'warning');
  }
}
window.executeImport = executeImport;

// ======== Init ========
async function init() {
  // titulos
  const t = document.getElementById('app-title');
  const s = document.getElementById('app-subtitle');
  if (t) t.textContent = defaultConfig.app_title;
  if (s) s.textContent = defaultConfig.subtitle;

  initAuthSessionUI();
  loadSessionMetrics();
  loadListState();
  loadMapLayerState();
  loadMapLegendState();
  updateMapLegendCollapseUI();
  initStorageModeSelector();
  initEnhancedControls();
  initFormRealtimeValidation();
  updateDataViewUI();
  initMap();
  await initDataSDK();
  updateFiltersOptions();
  restoreFilterState();
  applyFilters();
  renderSavedFilterButtons();
  updateObrasUploadActions();
  setDraftStatus('Sem alterações pendentes', 'idle');
  setOperationStatus('Sistema pronto', 'success');
}
init();


