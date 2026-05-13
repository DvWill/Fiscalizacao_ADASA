const crypto = require("crypto");

const MAX_FISCALIZACOES = 999;
const MAX_OBRAS = 5000;
const MAX_TEXT_LENGTH = 10000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_AUDIT_PAYLOAD_BYTES = 200 * 1024;

const FISCALIZACAO_STRING_FIELDS = new Map([
  ["id", 128],
  ["processo_sei", 128],
  ["objetivo", MAX_TEXT_LENGTH],
  ["regiao_administrativa", 160],
  ["situacao", 80],
  ["tipo_documento", 160],
  ["destinatario", 500],
  ["direta_indireta", 20],
  ["programada", 80],
  ["sei_documento", 128],
  ["data", 32],
  ["constatacoes", MAX_TEXT_LENGTH],
  ["recomendacoes", MAX_TEXT_LENGTH],
  ["determinacoes", MAX_TEXT_LENGTH]
]);

const FISCALIZACAO_NUMBER_FIELDS = {
  ano: { min: 1900, max: 2100, integer: true },
  constatacoes_nao_conformes: { min: 0, max: 100000, integer: true },
  termos_notificacao: { min: 0, max: 100000, integer: true },
  autos_infracao: { min: 0, max: 100000, integer: true },
  termos_ajuste: { min: 0, max: 100000, integer: true },
  indice_conformidade: { min: 0, max: 100 },
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 }
};

const OBRA_STRING_FIELDS = new Map([
  ["item", 500],
  ["sistema", 160],
  ["tipo", 160],
  ["programa", 500],
  ["acao", 500],
  ["local", 500],
  ["numero_contrato", 160],
  ["objeto_contrato", MAX_TEXT_LENGTH],
  ["situacao_contrato", 160],
  ["fornecedor", 500],
  ["numero_processo_sei", 160],
  ["tipo_recurso", 160],
  ["fonte_recurso", 500],
  ["execucao_inicio", 32],
  ["execucao_termino", 32],
  ["observacoes", MAX_TEXT_LENGTH],
  ["sigla_uo", 80],
  ["em_operacao", 80],
  ["item_gplan", 160],
  ["codigo_plano_exploracao", 160]
]);

const OBRA_NUMBER_FIELDS = {
  valor_total_obra: { min: 0, max: 1_000_000_000_000 },
  valor_executado_2025: { min: 0, max: 1_000_000_000_000 },
  valor_executado_jan_jun: { min: 0, max: 1_000_000_000_000 },
  valor_executado_jul_dez: { min: 0, max: 1_000_000_000_000 },
  percentual_executado_obra: { min: 0, max: 100 },
  execucao_financeira_pct: { min: 0, max: 100 },
  execucao_fisica_pct: { min: 0, max: 100 },
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 }
};

function buildRecordId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${crypto.randomBytes(8).toString("hex")}`;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeProvidedId(value) {
  const raw = String(value == null ? "" : value).trim();
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(raw) ? raw : "";
}

function toText(value, maxLength, fieldName, errors) {
  if (value == null) return "";
  const text = String(value).trim();
  if (text.length > maxLength) {
    errors.push(`${fieldName} excede ${maxLength} caracteres.`);
    return text.slice(0, maxLength);
  }
  return text;
}

function toNumber(value, rule, fieldName, errors) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number"
    ? value
    : Number(String(value).replace("%", "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));

  if (!Number.isFinite(parsed)) {
    errors.push(`${fieldName} deve ser numerico.`);
    return null;
  }

  const normalized = rule.integer ? Math.trunc(parsed) : parsed;
  if (normalized < rule.min || normalized > rule.max) {
    errors.push(`${fieldName} esta fora do intervalo permitido.`);
  }
  return normalized;
}

function validateImage(value, errors) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const match = raw.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    errors.push("imagem deve ser um data URL PNG, JPEG ou WebP valido.");
    return null;
  }

  const bytes = Math.floor((match[2].length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    errors.push("imagem excede 2MB.");
    return null;
  }
  return raw;
}

function sanitizeFiscalizacaoRecord(input, options = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { record: null, errors: ["Registro de fiscalizacao deve ser um objeto."] };
  }

  const record = {};
  const providedId = normalizeProvidedId(input.__backendId);
  record.__backendId = options.forcedId || (options.allowId && providedId ? providedId : buildRecordId());

  for (const [field, maxLength] of FISCALIZACAO_STRING_FIELDS.entries()) {
    record[field] = toText(input[field], maxLength, field, errors);
  }

  for (const [field, rule] of Object.entries(FISCALIZACAO_NUMBER_FIELDS)) {
    record[field] = toNumber(input[field], rule, field, errors);
  }

  record.imagem = validateImage(input.imagem, errors);

  const tipo = record.direta_indireta.toLowerCase();
  if (record.direta_indireta && tipo !== "direta" && tipo !== "indireta") {
    errors.push("direta_indireta deve ser Direta ou Indireta.");
  } else if (tipo === "direta") {
    record.direta_indireta = "Direta";
  } else if (tipo === "indireta") {
    record.direta_indireta = "Indireta";
  }

  if (options.requireCore !== false) {
    if (!record.id) errors.push("id e obrigatorio.");
    if (!record.processo_sei) errors.push("processo_sei e obrigatorio.");
  }

  return { record, errors };
}

function sanitizeFiscalizacaoRecords(records, options = {}) {
  if (!Array.isArray(records)) {
    return { records: [], errors: ["Campo records deve ser uma lista."] };
  }
  if (records.length > MAX_FISCALIZACOES) {
    return { records: [], errors: [`Limite de ${MAX_FISCALIZACOES} fiscalizacoes excedido.`] };
  }

  const sanitized = [];
  const errors = [];
  records.forEach((record, index) => {
    const result = sanitizeFiscalizacaoRecord(record, { ...options, allowId: true });
    if (result.errors.length) {
      errors.push(...result.errors.map((error) => `Linha ${index + 1}: ${error}`));
    }
    if (result.record) sanitized.push(result.record);
  });

  return { records: sanitized, errors };
}

function sanitizeObraRecord(input, options = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { record: null, errors: ["Registro de obra deve ser um objeto."] };
  }

  const record = {};
  const providedId = normalizeProvidedId(input.__obraId);
  record.__obraId = options.allowId && providedId ? providedId : buildRecordId();

  for (const [field, maxLength] of OBRA_STRING_FIELDS.entries()) {
    record[field] = toText(input[field], maxLength, field, errors);
  }

  for (const [field, rule] of Object.entries(OBRA_NUMBER_FIELDS)) {
    record[field] = toNumber(input[field], rule, field, errors);
  }

  return { record, errors };
}

function sanitizeObraRecords(records) {
  if (!Array.isArray(records)) {
    return { records: [], errors: ["Campo records deve ser uma lista."] };
  }
  if (records.length > MAX_OBRAS) {
    return { records: [], errors: [`Limite de ${MAX_OBRAS} obras excedido.`] };
  }

  const sanitized = [];
  const errors = [];
  records.forEach((record, index) => {
    const result = sanitizeObraRecord(record, { allowId: true });
    if (result.errors.length) {
      errors.push(...result.errors.map((error) => `Linha ${index + 1}: ${error}`));
    }
    if (result.record) sanitized.push(result.record);
  });

  return { records: sanitized, errors };
}

function sanitizeAuditPayload(value, fieldName, errors) {
  if (value == null) return null;
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_AUDIT_PAYLOAD_BYTES) {
    errors.push(`${fieldName} excede o tamanho permitido.`);
    return null;
  }
  return value;
}

function sanitizeAuditEntry(input) {
  const errors = [];
  const payload = isPlainObject(input) ? input : {};
  return {
    entry: {
      action: toText(payload.action || "event", 64, "action", errors) || "event",
      backendId: toText(payload.backendId, 128, "backendId", errors) || null,
      source: toText(payload.source || "api", 32, "source", errors) || "api",
      before: sanitizeAuditPayload(payload.before, "before", errors),
      after: sanitizeAuditPayload(payload.after, "after", errors),
      metadata: sanitizeAuditPayload(payload.metadata, "metadata", errors),
      createdAt: toText(payload.createdAt, 64, "createdAt", errors) || null
    },
    errors
  };
}

module.exports = {
  buildRecordId,
  sanitizeFiscalizacaoRecord,
  sanitizeFiscalizacaoRecords,
  sanitizeObraRecords,
  sanitizeAuditEntry
};
