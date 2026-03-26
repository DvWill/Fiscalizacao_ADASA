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

const OBRAS_STORAGE_KEY = 'obras_storage_v1';
const VIEW_MODE_KEY = 'fiscalizacoes_data_view';

const defaultConfig = {
  app_title: 'Sistema de Fiscalizações',
  subtitle: 'Monitoramento em Tempo Real'
};

const regionCoordinates = {
  'Plano Piloto': [-15.7942, -47.8822],
  'Gama': [-16.0192, -48.0617],
  'Taguatinga': [-15.8364, -48.0564],
  'Brazlândia': [-15.6759, -48.2125],
  'Sobradinho': [-15.6500, -47.7878],
  'Planaltina': [-15.6204, -47.6482],
  'Paranoá': [-15.7735, -47.7767],
  'Núcleo Bandeirante': [-15.8714, -47.9675],
  'Ceilândia': [-15.8197, -48.1117],
  'Guará': [-15.8333, -47.9833],
  'Cruzeiro': [-15.7942, -47.9311],
  'Samambaia': [-15.8789, -48.0992],
  'Santa Maria': [-16.0197, -48.0028],
  'São Sebastião': [-15.9025, -47.7631],
  'Recanto das Emas': [-15.9167, -48.0667],
  'Lago Sul': [-15.8333, -47.8500],
  'Riacho Fundo': [-15.8833, -48.0167],
  'Lago Norte': [-15.7333, -47.8500],
  'Candangolândia': [-15.8500, -47.9500],
  'Águas Claras': [-15.8333, -48.0333],
  'Riacho Fundo II': [-15.9000, -48.0500],
  'Sudoeste/Octogonal': [-15.8000, -47.9167],
  'Varjão': [-15.7167, -47.8667],
  'Park Way': [-15.9000, -47.9500],
  'SCIA/Estrutural': [-15.7833, -47.9833],
  'Sobradinho II': [-15.6333, -47.8000],
  'Jardim Botânico': [-15.8667, -47.8000],
  'Itapoã': [-15.7500, -47.7667],
  'SIA': [-15.8167, -47.9500],
  'Vicente Pires': [-15.8000, -48.0333],
  'Fercal': [-15.6000, -47.9000],
  'Sol Nascente/Pôr do Sol': [-15.8000, -48.1333],
  'Arniqueira': [-15.8500, -48.0333]
};

function normalizePlainText(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeHeaderKey(value) {
  return normalizePlainText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
    ['sol nascente / por do sol', 'Sol Nascente/PÃ´r do Sol'],
    ['sol nascente e por do sol', 'Sol Nascente/PÃ´r do Sol'],
    ['aguas claras', 'Ãguas Claras'],
    ['nucleo bandeirante', 'NÃºcleo Bandeirante'],
    ['sao sebastiao', 'SÃ£o SebastiÃ£o'],
    ['ceilandia', 'CeilÃ¢ndia'],
    ['guara', 'GuarÃ¡'],
    ['paranoa', 'ParanoÃ¡'],
    ['itapoa', 'ItapoÃ£'],
    ['jardim botanico', 'Jardim BotÃ¢nico'],
    ['varjao', 'VarjÃ£o'],
    ['brazlandia', 'BrazlÃ¢ndia'],
    ['candangolandia', 'CandangolÃ¢ndia']
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
  if (!window.dataSdk?.isApiConfigured?.()) {
    showToast('Configure a API para carregar as obras do banco.', 'warning');
    allObras = loadStoredObras().map((record, index) => normalizeObraRecord(record, index));
    return { isOk: false, source: 'local' };
  }

  const payload = await window.dataSdk._fetchJson(window.dataSdk._buildUrl('/obras'), {
    method: 'GET'
  });

  if (!payload || !Array.isArray(payload.records)) {
    return { isOk: false, source: 'api' };
  }

  allObras = payload.records.map((record, index) => normalizeObraRecord(record, index));
  saveStoredObras(allObras);
  return { isOk: true, source: 'api' };
}

async function persistObrasData(records) {
  const normalizedRecords = (records || []).map((record, index) => normalizeObraRecord(record, index));

  if (!window.dataSdk?.isApiConfigured?.()) {
    showToast('API não configurada: não foi possível salvar obras no banco.', 'error');
    return { isOk: false, source: 'local' };
  }

  const savedRecords = await replaceObrasApiRecords(normalizedRecords);

  if (!savedRecords) {
    return { isOk: false, source: 'api' };
  }

  allObras = savedRecords;
  saveStoredObras(allObras);
  return { isOk: true, source: 'api' };
}

async function deleteObrasData() {
  if (!window.dataSdk?.isApiConfigured?.()) {
    showToast('API não configurada: não foi possível excluir obras no banco.', 'error');
    return { isOk: false, source: 'local' };
  }

  const savedRecords = await replaceObrasApiRecords([]);
  if (!savedRecords) {
    return { isOk: false, source: 'api' };
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
  const result = await window.dataSdk.init(dataHandler);
  const obrasResult = await loadObrasData();
  if (!result.isOk) showToast('Erro ao inicializar sistema de dados', 'error');
  if (!obrasResult.isOk) showToast('Erro ao inicializar obras', 'error');
  if (result.syncedLocalToApi || obrasResult.syncedLocalToApi) {
    showToast('Dados locais sincronizados com o banco de dados.', 'success');
  }
  updateStorageModeStatus();
  updateFiltersOptions();
  applyFilters();
  updateDashboard();

  return {
    isOk: result.isOk && obrasResult.isOk,
    source: result.source === 'api' && obrasResult.source === 'api' ? 'api' : 'local'
  };
}

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
    status.textContent = 'Banco indisponivel';
    return;
  }

  status.textContent = 'Banco ativo';
}

async function handleStorageModeChange(event) {
  if (window.dataSdk?.isApiConfigured?.()) {
    window.dataSdk.setStorageMode('api');
    event.target.value = 'api';
    updateStorageModeStatus();
    showToast('Esta instalacao salva diretamente no banco de dados.', 'info');
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
  showLoading(nextMode === 'api' ? 'Conectando API...' : 'Carregando dados locais...');

  const result = await initDataSDK();

  hideLoading();

  if (!result.isOk) {
    showToast('Erro ao trocar o modo de salvamento', 'error');
    return;
  }

  if (nextMode === 'api' && result.source !== 'api') {
    showToast('API indisponivel. Dados locais carregados.', 'warning');
    return;
  }

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

function updateMapLegend() {
  const title = document.getElementById('map-legend-title');
  const items = document.getElementById('map-legend-items');
  if (!title || !items) return;

  if (currentView === 'obras') {
    title.textContent = 'Legenda de Obras';
    items.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500"></div>
        <span class="text-xs text-slate-400">Execucao >= 80%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500"></div>
        <span class="text-xs text-slate-400">Execucao entre 40% e 79%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-red-400 to-rose-500"></div>
        <span class="text-xs text-slate-400">Execucao abaixo de 40%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-gradient-to-br from-sky-400 to-blue-500"></div>
        <span class="text-xs text-slate-400">Sem percentual informado</span>
      </div>
    `;
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
      <span class="text-xs text-slate-400">Concluida</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded-full bg-gradient-to-br from-red-400 to-rose-500"></div>
      <span class="text-xs text-slate-400">Pendente</span>
    </div>
  `;
}

function updateDataViewUI() {
  const isObras = currentView === 'obras';
  const fiscalizacoesBtn = document.getElementById('view-fiscalizacoes-btn');
  const obrasBtn = document.getElementById('view-obras-btn');
  const importBtn = document.getElementById('import-fiscalizacoes-btn');
  const uploadBtn = document.getElementById('upload-obras-btn');
  const addBtn = document.getElementById('add-fiscalizacao-btn');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const storageMode = document.getElementById('storage-mode-wrapper');
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
  storageMode?.classList.toggle('hidden', isObras);

  if (dashboardBtn) {
    dashboardBtn.classList.remove('hidden');
  }

  if (filterRegiao?.previousElementSibling) {
    filterRegiao.previousElementSibling.textContent = isObras ? 'Local' : 'Regiao Administrativa';
  }
  if (filterSituacao?.previousElementSibling) {
    filterSituacao.previousElementSibling.textContent = isObras ? 'Situacao do Contrato' : 'Situacao';
  }
  if (filterAno?.previousElementSibling) {
    filterAno.previousElementSibling.textContent = isObras ? 'Sistema' : 'Ano';
  }

  const conformidadeGroup = filterConformidade?.parentElement?.parentElement;
  if (conformidadeGroup) conformidadeGroup.classList.toggle('hidden', isObras);

  if (countBadge?.parentElement?.firstElementChild) {
    countBadge.parentElement.firstElementChild.textContent = isObras ? 'Obras' : 'Fiscalizacoes';
  }
  if (searchInput) {
    searchInput.placeholder = isObras
      ? 'Item, local, acao, fornecedor...'
      : 'ID, Processo, Destinatario...';
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
  if (e.key === 'Escape') toggleFiltersPanel(false);
});

// ======== Markers ========
function createMarkerIcon(situacao) {
  let color;
  switch (situacao) {
    case 'Em Andamento': color = '#f59e0b'; break;
    case 'Concluída': color = '#10b981'; break;
    case 'Pendente': color = '#ef4444'; break;
    default: color = '#3b82f6';
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, ${color}dd, ${color});
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="transform: rotate(45deg); font-size: 14px;">📋</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

function createObraMarkerIcon(obra) {
  const color = getObraMarkerColor(obra);

  return L.divIcon({
    className: 'custom-marker obra-marker',
    html: `
      <div style="
        width: 34px;
        height: 34px;
        background: linear-gradient(135deg, ${color}dd, ${color});
        border-radius: 12px 12px 12px 2px;
        transform: rotate(45deg);
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          transform: rotate(-45deg);
          width: 12px;
          height: 12px;
          border: 2px solid white;
          border-radius: 999px;
          border-right-color: transparent;
          border-top-color: transparent;
        "></div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30]
  });
}

function updateMapMarkers() {
  markerClusterGroup.clearLayers();
  markers = {};

  if (currentView === 'obras') {
    filteredObras.forEach((obra) => {
      if (!hasObraCoordinates(obra)) return;

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
                      fisc.situacao === 'Concluída' ? 'status-concluida' : 'status-pendente';

  return `
    <div style="padding: 16px; font-family: 'Plus Jakarta Sans', sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-weight:700;font-size:16px;color:#1e293b;">${fisc.id}</span>
        <span class="${statusClass}" style="font-size:11px;padding:3px 8px;">${fisc.situacao}</span>
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Região:</strong> ${fisc.regiao_administrativa || '-'}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Processo:</strong> ${fisc.processo_sei || '-'}
      </div>
      ${fisc.indice_conformidade ? `
        <div style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;color:#64748b;">Conformidade</span>
            <span style="font-size:12px;font-weight:600;color:#1e293b;">${fisc.indice_conformidade}%</span>
          </div>
          <div style="background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden;">
            <div style="background:linear-gradient(90deg,#3b82f6,#2563eb);height:100%;width:${fisc.indice_conformidade}%;"></div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function createObraPopupContent(obra) {
  const color = getObraMarkerColor(obra);
  const progresso = getObraProgressValue(obra);

  return `
    <div style="padding: 16px; font-family: 'Plus Jakarta Sans', sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;">
        <span style="font-weight:700;font-size:15px;color:#1e293b;">${obra.item || 'Obra'}</span>
        <span style="font-size:11px;padding:4px 8px;border-radius:999px;background:${color};color:white;">${progresso != null ? formatPercent(progresso) : 'Obra'}</span>
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Local:</strong> ${obra.local || '-'}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Situacao:</strong> ${obra.situacao_contrato || '-'}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Acao:</strong> ${obra.acao || '-'}
      </div>
      ${obra.objeto_contrato ? `
        <div style="margin-top:12px;color:#475569;font-size:12px;line-height:1.4;">
          ${obra.objeto_contrato}
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
      option.textContent = local;
      if (local === currentLocal) option.selected = true;
      regiaoSelect.appendChild(option);
    });

    const situacaoSelect = document.getElementById('filter-situacao');
    const currentSituacao = situacaoSelect.value;
    situacaoSelect.innerHTML = '<option value="">Todas as Situacoes</option>';
    situacoes.forEach((situacao) => {
      const option = document.createElement('option');
      option.value = situacao;
      option.textContent = situacao;
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
    return;
  }

  const regioes = [...new Set(allFiscalizacoes.map(f => f.regiao_administrativa).filter(Boolean))].sort();
  const anos = [...new Set(allFiscalizacoes.map(f => f.ano).filter(Boolean))].sort((a, b) => b - a);

  const regiaoSelect = document.getElementById('filter-regiao');
  const currentRegiao = regiaoSelect.value;
  regiaoSelect.innerHTML = '<option value="">Todas as Regiões</option>';
  regioes.forEach(r => {
    const option = document.createElement('option');
    option.value = r;
    option.textContent = r;
    if (r === currentRegiao) option.selected = true;
    regiaoSelect.appendChild(option);
  });

  const anoSelect = document.getElementById('filter-ano');
  const currentAno = anoSelect.value;
  anoSelect.innerHTML = '<option value="">Todos os Anos</option>';
  anos.forEach(a => {
    const option = document.createElement('option');
    option.value = a;
    option.textContent = a;
    if (String(a) === currentAno) option.selected = true;
    anoSelect.appendChild(option);
  });
}

function applyFilters() {
  const search = document.getElementById('filter-search').value;
  const regiao = document.getElementById('filter-regiao').value;
  const situacao = document.getElementById('filter-situacao').value;
  const ano = document.getElementById('filter-ano').value;
  const conformidade = parseInt(document.getElementById('filter-conformidade').value, 10);

  if (currentView === 'obras') {
    const normalizedSearch = normalizePlainText(search);

    filteredObras = allObras.filter((obra) => {
      if (normalizedSearch) {
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

      if (regiao && obra.local !== regiao) return false;
      if (situacao && obra.situacao_contrato !== situacao) return false;
      if (ano && obra.sistema !== ano) return false;
      return true;
    });

    updateMapMarkers();
    renderObrasList();
    document.getElementById('count-badge').textContent = filteredObras.length;
    return;
  }

  filteredFiscalizacoes = allFiscalizacoes.filter(f => {
    const normalizedSearch = search.toLowerCase();

    if (normalizedSearch && !f.id?.toLowerCase().includes(normalizedSearch) &&
        !f.processo_sei?.toLowerCase().includes(normalizedSearch) &&
        !f.destinatario?.toLowerCase().includes(normalizedSearch)) return false;

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
window.applyFilters = applyFilters;

function clearFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-regiao').value = '';
  document.getElementById('filter-situacao').value = '';
  document.getElementById('filter-ano').value = '';
  document.getElementById('filter-conformidade').value = 0;
  document.getElementById('conformidade-label').textContent = '0%+';
  applyFilters();
}
window.clearFilters = clearFilters;

function updateConformidadeLabel() {
  const value = document.getElementById('filter-conformidade').value;
  document.getElementById('conformidade-label').textContent = `${value}%+`;
}
window.updateConformidadeLabel = updateConformidadeLabel;

function renderFiscalizacoesList() {
  const container = document.getElementById('fiscalizacoes-list');

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
    return;
  }

  container.innerHTML = filteredFiscalizacoes.map(fisc => {
    const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                        fisc.situacao === 'Concluída' ? 'status-concluida' : 'status-pendente';

    return `
      <div class="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 cursor-pointer transition-colors border border-slate-700/50"
           onclick="focusFiscalizacao('${fisc.__backendId}')">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-sm">${fisc.id}</span>
          <span class="${statusClass}" style="font-size: 10px; padding: 2px 8px;">${fisc.situacao}</span>
        </div>
        <p class="text-xs text-slate-400 truncate">${fisc.regiao_administrativa || 'Sem região'}</p>
        ${fisc.indice_conformidade ? `
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500 rounded-full" style="width: ${fisc.indice_conformidade}%"></div>
            </div>
            <span class="text-xs text-blue-400">${fisc.indice_conformidade}%</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderObrasList() {
  const container = document.getElementById('fiscalizacoes-list');

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
    return;
  }

  container.innerHTML = filteredObras.map((obra) => {
    const color = getObraMarkerColor(obra);
    const progress = getObraProgressValue(obra);

    return `
      <div class="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 cursor-pointer transition-colors border border-slate-700/50"
           onclick="focusObra('${obra.__obraId}')">
        <div class="flex items-start justify-between gap-3 mb-2">
          <span class="font-semibold text-sm leading-tight">${obra.item || 'Obra'}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${color};color:white;white-space:nowrap;">
            ${progress != null ? formatPercent(progress) : (hasObraCoordinates(obra) ? 'Sem %' : 'Sem coord.')}
          </span>
        </div>
        <p class="text-xs text-slate-300 truncate">${obra.local || 'Sem local informado'}</p>
        <p class="text-xs text-slate-500 mt-1 truncate">${obra.situacao_contrato || 'Sem situacao'}</p>
      </div>
    `;
  }).join('');
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
    <div class="bg-slate-800/50 rounded-lg p-3">
      <p class="text-xs text-slate-500 mb-1">${label}</p>
      <p class="text-sm font-medium text-slate-200">${value || '-'}</p>
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
                      fisc.situacao === 'Concluída' ? 'status-concluida' : 'status-pendente';

  setDetailPanelActionsVisible(true);
  document.getElementById('detail-title').textContent = fisc.id || 'Detalhes da Fiscalizacao';
  document.getElementById('delete-detail-btn').onclick = () => confirmDelete(fisc);

  content.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-center">
        <span class="${statusClass} text-base">${fisc.situacao}</span>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Informações Básicas</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Nº Processo SEI', fisc.processo_sei)}
          ${createDetailField('Ano', fisc.ano)}
          ${createDetailField('Região', fisc.regiao_administrativa)}
          ${createDetailField('Destinatário', fisc.destinatario)}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Classificação</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo', fisc.direta_indireta)}
          ${createDetailField('Programação', fisc.programada)}
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
            <p class="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3">${fisc.objetivo}</p>
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
          ${progress != null ? `Execucao ${formatPercent(progress)}` : (obra.situacao_contrato || 'Obra em mapa')}
        </span>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Identificacao</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Item', obra.item)}
          ${createDetailField('Local', obra.local)}
          ${createDetailField('Sistema', obra.sistema)}
          ${createDetailField('Tipo', obra.tipo)}
          ${createDetailField('Programa', obra.programa)}
          ${createDetailField('Acao', obra.acao)}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Contrato</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Numero do Contrato', obra.numero_contrato)}
          ${createDetailField('Situacao', obra.situacao_contrato)}
          ${createDetailField('Fornecedor', obra.fornecedor)}
          ${createDetailField('Sigla UO', obra.sigla_uo)}
          ${createDetailField('Processo SEI', obra.numero_processo_sei)}
          ${createDetailField('Em operacao', obra.em_operacao)}
        </div>
        ${obra.objeto_contrato ? `
          <div class="mt-3">
            <p class="text-xs text-slate-500 mb-1">Objeto do Contrato</p>
            <p class="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3">${obra.objeto_contrato}</p>
          </div>
        ` : ''}
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Execucao</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Valor Total da Obra', formatCurrency(obra.valor_total_obra))}
          ${createDetailField('Valor Executado 2025', formatCurrency(obra.valor_executado_2025))}
          ${createDetailField('Executado Jan-Jun', formatCurrency(obra.valor_executado_jan_jun))}
          ${createDetailField('Executado Jul-Dez', formatCurrency(obra.valor_executado_jul_dez))}
          ${createDetailField('Execucao Financeira', formatPercent(obra.execucao_financeira_pct))}
          ${createDetailField('Execucao Fisica', formatPercent(obra.execucao_fisica_pct))}
          ${createDetailField('Inicio', normalizeDateDisplay(obra.execucao_inicio))}
          ${createDetailField('Termino', normalizeDateDisplay(obra.execucao_termino))}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Recursos</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo de Recurso', obra.tipo_recurso)}
          ${createDetailField('Fonte do Recurso', obra.fonte_recurso)}
          ${createDetailField('Item GPLAN', obra.item_gplan)}
          ${createDetailField('Plano de Exploracao', obra.codigo_plano_exploracao)}
        </div>
      </div>

      ${(hasObraCoordinates(obra)) ? `
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Localizacao</h3>
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
          <h3 class="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Observacoes</h3>
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
  document.getElementById('form-modal').classList.remove('hidden');
  updateImagemPreview();
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

  closeDetailPanel();
  document.getElementById('form-modal').classList.remove('hidden');
}
window.editCurrentFiscalizacao = editCurrentFiscalizacao;

function closeModal() {
  document.getElementById('form-modal').classList.add('hidden');
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

  showLoading(isEditing ? 'Atualizando...' : 'Salvando...');

  let result;
  if (isEditing) {
    const existingRecord = allFiscalizacoes.find(f => f.__backendId === backendId);
    if (existingRecord) {
      result = await window.dataSdk.update({ ...existingRecord, ...fiscData, __backendId: backendId });
    } else {
      result = { isOk: false };
    }
  } else {
    result = await window.dataSdk.create(fiscData);
  }

  hideLoading();

  if (result && result.isOk) {
    showToast(isEditing ? 'Fiscalização atualizada!' : 'Fiscalização criada!', 'success');
    closeModal();
  } else {
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
  showLoading('Excluindo...');

  const result = await window.dataSdk.delete(deleteTarget);

  hideLoading();

  if (result.isOk) {
    showToast('Fiscalização excluída!', 'success');
    closeDetailPanel();
  } else {
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

function updateDashboard() {
  const total = allFiscalizacoes.length;
  const andamento = allFiscalizacoes.filter(f => f.situacao === 'Em Andamento').length;
  const concluida = allFiscalizacoes.filter(f => f.situacao === 'Concluída').length;
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

  const maxStatus = Math.max(andamento, concluida, pendente, 1);
  document.getElementById('chart-situacao').innerHTML = `
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${(andamento / maxStatus) * 150}px; min-height: 20px;">
        <div class="absolute inset-0 bg-gradient-to-t from-amber-500 to-yellow-400 rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 text-amber-400">${andamento}</p>
      <p class="text-xs text-slate-400">Andamento</p>
    </div>
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${(concluida / maxStatus) * 150}px; min-height: 20px;">
        <div class="absolute inset-0 bg-gradient-to-t from-emerald-500 to-green-400 rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 text-emerald-400">${concluida}</p>
      <p class="text-xs text-slate-400">Concluída</p>
    </div>
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${(pendente / maxStatus) * 150}px; min-height: 20px;">
        <div class="absolute inset-0 bg-gradient-to-t from-red-500 to-rose-400 rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 text-red-400">${pendente}</p>
      <p class="text-xs text-slate-400">Pendente</p>
    </div>
  `;

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
      secondaryLabel: 'Em Execucao',
      tertiaryLabel: 'Em Recebimento',
      quaternaryLabel: 'Execucao Media',
      quinaryLabel: 'Sem Coordenadas',
      senaryLabel: 'Valor Total',
      septenaryLabel: 'Executado 2025',
      statusChartTitle: 'Distribuicao por Situacao do Contrato',
      regionChartTitle: 'Por Local'
    });

    document.getElementById('metric-total').textContent = total;
    document.getElementById('metric-andamento').textContent = emExecucao;
    document.getElementById('metric-concluida').textContent = emRecebimento;
    document.getElementById('metric-pendente').textContent = semCoordenadas;
    document.getElementById('metric-conformidade').textContent = `${avgExecucao}%`;
    document.getElementById('metric-ai').textContent = formatCurrency(valorTotal);
    document.getElementById('metric-tn').textContent = formatCurrency(valorExecutado);

    const maxStatus = Math.max(emExecucao, emRecebimento, outrasSituacoes, 1);
    document.getElementById('chart-situacao').innerHTML = [
      buildDashboardBar(emExecucao, maxStatus, 'bg-gradient-to-t from-amber-500 to-yellow-400', 'text-amber-400', 'Em Execucao'),
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
    title: 'Dashboard de Metricas',
    totalLabel: 'Total de Fiscalizacoes',
    secondaryLabel: 'Em Andamento',
    tertiaryLabel: 'Concluidas',
    quaternaryLabel: 'Conformidade Media',
    quinaryLabel: 'Pendentes',
    senaryLabel: 'Total Autos de Infracao',
    septenaryLabel: 'Total Termos de Notificacao',
    statusChartTitle: 'Distribuicao por Situacao',
    regionChartTitle: 'Por Regiao Administrativa'
  });

  const total = allFiscalizacoes.length;
  const andamento = allFiscalizacoes.filter(f => f.situacao === 'Em Andamento').length;
  const concluida = allFiscalizacoes.filter(f => f.situacao === 'ConcluÃ­da').length;
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

  const maxStatus = Math.max(andamento, concluida, pendente, 1);
  document.getElementById('chart-situacao').innerHTML = [
    buildDashboardBar(andamento, maxStatus, 'bg-gradient-to-t from-amber-500 to-yellow-400', 'text-amber-400', 'Andamento'),
    buildDashboardBar(concluida, maxStatus, 'bg-gradient-to-t from-emerald-500 to-green-400', 'text-emerald-400', 'Concluida'),
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
    : '<p class="text-center text-slate-500 py-8">Nenhuma regiÃ£o cadastrada</p>';
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
        <td class="px-2 py-2 text-slate-300">${obra.item || '-'}</td>
        <td class="px-2 py-2 text-slate-300">${obra.local || '-'}</td>
        <td class="px-2 py-2 text-slate-300">${obra.situacao_contrato || '-'}</td>
        <td class="px-2 py-2 text-slate-300">${formatPercent(getObraProgressValue(obra))}</td>
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
    showToast('Leitor de planilha indisponivel no navegador.', 'error');
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
      throw new Error('Nao foi possivel localizar a aba de obras na planilha.');
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: ''
    });
    const headerRowIndex = findObrasHeaderRow(rawRows);

    if (headerRowIndex < 0) {
      throw new Error('Nao encontrei o cabecalho da tabela de obras nessa planilha.');
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
      showToast('Planilha lida, mas nenhuma obra valida foi encontrada.', 'warning');
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
    showToast('Selecione uma planilha valida antes de carregar as obras.', 'warning');
    return;
  }

  showLoading('Salvando obras...');

  const result = await persistObrasData(pendingObrasUpload.map((obra) => ({ ...obra })));

  hideLoading();

  if (!result.isOk) {
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

  const mappedWithCoordinates = allObras.filter((obra) => hasObraCoordinates(obra)).length;
  showToast(`${allObras.length} obras carregadas (${mappedWithCoordinates} com coordenadas).`, 'success');
}
window.executeObrasUpload = executeObrasUpload;

async function clearObrasData() {
  if (!pendingObrasMeta && allObras.length === 0) {
    showToast('Nao ha obras carregadas para limpar.', 'info');
    return;
  }

  if (!window.confirm('Remover todas as obras carregadas do mapa?')) {
    return;
  }

  showLoading('Removendo obras...');

  const result = await deleteObrasData();

  hideLoading();

  if (!result.isOk) {
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
      'Item', 'Sistema', 'Tipo', 'Programa', 'Acao', 'Local',
      'Numero Contrato', 'Objeto Contrato', 'Valor Total', 'Situacao',
      'Fornecedor', 'Processo SEI', 'Tipo Recurso', 'Fonte Recurso',
      'Execucao Inicio', 'Execucao Termino', 'Executado 2025',
      'Execucao Financeira', 'Execucao Fisica', 'Latitude', 'Longitude'
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
      showToast('Nenhuma fiscalizacao para exportar', 'warning');
      return;
    }

    headers = [
      'ID', 'Processo SEI', 'Ano', 'Objetivo', 'Regiao', 'Situacao',
      'Tipo Documento', 'Destinatario', 'Direta/Indireta', 'Programada',
      'SEI Documento', 'Data', 'Constatacoes', 'Nao Conformes',
      'Recomendacoes', 'Determinacoes', 'TN', 'AI', 'TAC',
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

  const colors = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
    info: 'bg-blue-600'
  };

  const icons = {
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
  };

  toast.className = `${colors[type]} px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 fade-in`;
  toast.innerHTML = `
    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[type]}</svg>
    <span class="text-sm font-medium text-white">${message}</span>
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
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-preview').classList.add('hidden');
}
window.openImportModal = openImportModal;

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-preview').classList.add('hidden');
}
window.closeImportModal = closeImportModal;

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

function previewImport() {
  const text = document.getElementById('import-textarea').value.trim();
  if (!text) {
    showToast('Cole os dados primeiro', 'warning');
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const delim = detectImportDelimiter(lines);

  const previewBody = document.getElementById('preview-body');
  previewBody.innerHTML = '';

  const headerIndex = findImportHeaderIndex(lines, delim);
  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;

  for (let i = startIndex; i < Math.min(startIndex + 5, lines.length); i++) {
    const cells = lines[i].split(delim);
    const row = document.createElement('tr');
    row.className = 'border-t border-slate-600';
    row.innerHTML = `
      <td class="px-2 py-2 text-slate-300">${cells[0] || '-'}</td>
      <td class="px-2 py-2 text-slate-300">${cells[4] || '-'}</td>
      <td class="px-2 py-2 text-slate-300">${cells[5] || '-'}</td>
      <td class="px-2 py-2 text-slate-300">${cells[7] || '-'}</td>
    `;
    previewBody.appendChild(row);
  }

  document.getElementById('import-preview').classList.remove('hidden');
}
window.previewImport = previewImport;

async function executeImport() {
  const text = document.getElementById('import-textarea').value.trim();
  if (!text) {
    showToast('Cole os dados primeiro', 'warning');
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) {
    showToast('Dados inválidos', 'error');
    return;
  }

  const delim = detectImportDelimiter(lines);

  const norm = (v) => (v ?? '').toString().trim();
  const normalizeTipoFiscalizacao = (v) => norm(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const parseNumber = (v) => {
    const s = norm(v);
    if (!s || s === '#ERROR!') return null;
    const cleaned = s.replace('%', '').replace(/\./g, '').replace(',', '.').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const parseIntSafe = (v) => {
    const n = parseNumber(v);
    return n === null ? null : Math.trunc(n);
  };

  const parseDateToISO = (v) => {
    const s = norm(v);
    if (!s || s === '#ERROR!') return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [a, b, c] = s.split('/').map(x => parseInt(x, 10));
      let day, month;
      if (a > 12) { day = a; month = b; } else { month = a; day = b; }
      const yyyy = c;
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  };

  const headerIndex = findImportHeaderIndex(lines, delim);
  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const dataLines = lines.slice(startIndex);

  if (dataLines.length < 1) {
    showToast('Dados inválidos', 'error');
    return;
  }

  const diretaCandidates = dataLines.reduce((count, line) => {
    const cells = line.split(delim);
    if (cells.length < 19) return count;
    return normalizeTipoFiscalizacao(cells[7]) === 'direta' ? count + 1 : count;
  }, 0);

  if (diretaCandidates === 0) {
    showToast('Nenhuma fiscalizacao "Direta" encontrada para importar.', 'warning');
    return;
  }

  if (allFiscalizacoes.length + diretaCandidates > 999) {
    showToast(`Você tem ${allFiscalizacoes.length} registros. Máximo é 999.`, 'error');
    return;
  }

  showLoading(`Importando ${diretaCandidates} fiscalizacoes Direta...`);
  const btn = document.getElementById('import-btn');
  btn.disabled = true;

  let imported = 0;
  let failed = 0;
  let skippedNonDireta = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cells = line.split(delim);

    if (cells.length < 19) { failed++; continue; }

    let regiaoRaw = norm(cells[4]);
    let regiao = regiaoRaw;

    const brasiliaCenter = { lat: -15.7942, lng: -47.8822 };

    if (/^distrito\s*federal$/i.test(regiaoRaw)) {
      regiao = 'Plano Piloto';
    }

    const tipoFiscalizacao = norm(cells[7]);
    if (normalizeTipoFiscalizacao(tipoFiscalizacao) !== 'direta') {
      skippedNonDireta++;
      continue;
    }

    let lat = null;
    let lng = null;

    if ((!lat || !lng)) {
      if (regiao && regionCoordinates[regiao]) {
        const [baseLat, baseLng] = regionCoordinates[regiao];
        lat = baseLat + (Math.random() - 0.5) * 0.02;
        lng = baseLng + (Math.random() - 0.5) * 0.02;
      } else if (/^distrito\s*federal$/i.test(regiaoRaw)) {
        lat = brasiliaCenter.lat + (Math.random() - 0.5) * 0.02;
        lng = brasiliaCenter.lng + (Math.random() - 0.5) * 0.02;
      }
    }

    const fiscData = {
      id: norm(cells[0]),
      processo_sei: norm(cells[1]),
      ano: parseIntSafe(cells[2]),
      objetivo: norm(cells[3]),
      regiao_administrativa: regiao || null,
      situacao: norm(cells[5]),
      tipo_documento: norm(cells[6]),
      destinatario: '',
      direta_indireta: 'Direta',
      programada: norm(cells[8]),
      sei_documento: norm(cells[9]),
      data: parseDateToISO(cells[10]),
      constatacoes: norm(cells[11]),
      constatacoes_nao_conformes: parseIntSafe(cells[12]),
      recomendacoes: norm(cells[13]),
      determinacoes: norm(cells[14]),
      termos_notificacao: parseIntSafe(cells[15]),
      autos_infracao: parseIntSafe(cells[16]),
      termos_ajuste: parseIntSafe(cells[17]),
      indice_conformidade: parseNumber(cells[18]),
      latitude: lat || null,
      longitude: lng || null
    };

    const result = await window.dataSdk.create(fiscData);
    if (result && result.isOk) imported++;
    else failed++;

    const progress = Math.round(((i + 1) / dataLines.length) * 100);
    document.getElementById('loading-text').textContent =
      `Importando... ${progress}% (${imported}/${diretaCandidates})`;
  }

  hideLoading();
  btn.disabled = false;

  if (imported > 0) {
    showToast(`✅ ${imported} fiscalizacoes Direta importadas!`, 'success');
    closeImportModal();
  }
  if (skippedNonDireta > 0) {
    showToast(`⚠️ ${skippedNonDireta} registros ignorados (nao sao Direta)`, 'warning');
  }
  if (failed > 0) {
    showToast(`⚠️ ${failed} registros falharam`, 'warning');
  }
}
window.executeImport = executeImport;

// ======== Init ========
async function init() {
  // títulos
  const t = document.getElementById('app-title');
  const s = document.getElementById('app-subtitle');
  if (t) t.textContent = defaultConfig.app_title;
  if (s) s.textContent = defaultConfig.subtitle;

  initStorageModeSelector();
  updateDataViewUI();
  initMap();
  await initDataSDK();
  updateFiltersOptions();
  applyFilters();
  updateObrasUploadActions();
}
init();
