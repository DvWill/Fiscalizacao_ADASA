const { withDb } = require("./_db");
const { applyCors } = require("./_security");

const REGION_COORDINATES = {
  "Plano Piloto": [-15.7942, -47.8822],
  Gama: [-16.0192, -48.0617],
  Taguatinga: [-15.8364, -48.0564],
  Brazlandia: [-15.6759, -48.2125],
  Sobradinho: [-15.65, -47.7878],
  Planaltina: [-15.6204, -47.6482],
  Paranoa: [-15.7735, -47.7767],
  "Nucleo Bandeirante": [-15.8714, -47.9675],
  Ceilandia: [-15.8197, -48.1117],
  Guara: [-15.8333, -47.9833],
  Cruzeiro: [-15.7942, -47.9311],
  Samambaia: [-15.8789, -48.0992],
  "Santa Maria": [-16.0197, -48.0028],
  "Sao Sebastiao": [-15.9025, -47.7631],
  "Recanto das Emas": [-15.9167, -48.0667],
  "Lago Sul": [-15.8333, -47.85],
  "Lago Norte": [-15.7333, -47.85],
  "Aguas Claras": [-15.8333, -48.0333],
  "Sobradinho II": [-15.6333, -47.8],
  "Jardim Botanico": [-15.8667, -47.8],
  "Sol Nascente/Por do Sol": [-15.8, -48.1333],
  "Vicente Pires": [-15.8, -48.0333],
  "Valparaiso de Goias": [-16.065, -47.975],
  Luziania: [-16.2525, -47.95],
  "Novo Gama": [-16.059, -48.041]
};

const REGION_ALIASES = [
  ["sol nascente", "Sol Nascente/Por do Sol"],
  ["por do sol", "Sol Nascente/Por do Sol"],
  ["aguas claras", "Aguas Claras"],
  ["sao sebastiao", "Sao Sebastiao"],
  ["ceilandia", "Ceilandia"],
  ["paranoa", "Paranoa"],
  ["jardim botanico", "Jardim Botanico"],
  ["brazlandia", "Brazlandia"],
  ["valparaiso", "Valparaiso de Goias"],
  ["luziania", "Luziania"],
  ["novo gama", "Novo Gama"]
];

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  if (typeof payload !== "string") return {};

  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function toSafeText(value, fallback = "") {
  const text = String(value == null ? "" : value).trim();
  return text || fallback;
}

function toSafeNumber(value) {
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

function normalizePlainText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCoordinate(value, axis) {
  const parsed = toSafeNumber(value);
  if (!Number.isFinite(parsed)) return null;

  let normalized = parsed;
  if (axis === "lng" && normalized > 0 && normalized <= 180) {
    normalized *= -1;
  }

  if (axis === "lat") {
    if (Math.abs(normalized) < 10 || Math.abs(normalized) > 90) return null;
    return normalized;
  }

  if (Math.abs(normalized) < 10 || Math.abs(normalized) > 180) return null;
  return normalized;
}

function inferCoordinatesFromArea(area) {
  const raw = String(area || "").trim();
  const normalized = normalizePlainText(raw);
  if (!normalized || normalized === "distrito federal") {
    return REGION_COORDINATES["Plano Piloto"];
  }

  for (const [region, coordinates] of Object.entries(REGION_COORDINATES)) {
    if (normalized.includes(normalizePlainText(region))) return coordinates;
  }

  for (const [alias, region] of REGION_ALIASES) {
    if (normalized.includes(alias)) return REGION_COORDINATES[region];
  }

  return null;
}

function getStableCoordinateOffset(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }

  return [
    ((Math.abs(hash % 1000) / 1000) - 0.5) * 0.02,
    ((Math.abs(Math.trunc(hash / 1000) % 1000) / 1000) - 0.5) * 0.02
  ];
}

function buildFiscalizacaoPoint(payload, index) {
  let latitude = normalizeCoordinate(payload.latitude, "lat");
  let longitude = normalizeCoordinate(payload.longitude, "lng");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const fallback = inferCoordinatesFromArea(payload.regiao_administrativa);
    if (!fallback) return null;
    const [latOffset, lngOffset] = getStableCoordinateOffset([
      payload.__backendId,
      payload.id,
      payload.processo_sei,
      payload.ano,
      payload.regiao_administrativa
    ].join("|"));
    latitude = fallback[0] + latOffset;
    longitude = fallback[1] + lngOffset;
  }

  const anoParsed = Number(payload.ano);
  const ano = Number.isFinite(anoParsed) && anoParsed > 0 ? Math.trunc(anoParsed) : null;
  const conformidade = toSafeNumber(payload.indice_conformidade);

  return {
    pointId: `f-${index + 1}`,
    kind: "fiscalizacao",
    latitude,
    longitude,
    area: toSafeText(payload.regiao_administrativa, "Nao informada"),
    status: toSafeText(payload.situacao, "Nao informada"),
    ano,
    conformidade: Number.isFinite(conformidade) ? conformidade : null
  };
}

function buildObraPoint(payload, index) {
  const latitude = normalizeCoordinate(payload.latitude, "lat");
  const longitude = normalizeCoordinate(payload.longitude, "lng");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const execucao = toSafeNumber(payload.percentual_executado_obra);

  return {
    pointId: `o-${index + 1}`,
    kind: "obra",
    latitude,
    longitude,
    area: toSafeText(payload.local || payload.regiao_administrativa, "Nao informado"),
    status: toSafeText(payload.situacao_contrato, "Nao informada"),
    execucao: Number.isFinite(execucao) ? execucao : null
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET") {
    res.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  try {
    await withDb(async (db) => {
      const [fiscalizacoesResult, obrasResult] = await Promise.all([
        db.query(
          `
            SELECT payload
            FROM public.fiscalizacoes
            ORDER BY position ASC, created_at ASC
          `
        ),
        db.query(
          `
            SELECT payload
            FROM public.obras
            ORDER BY position ASC, created_at ASC
          `
        )
      ]);

      const fiscalizacoes = fiscalizacoesResult.rows
        .map((row) => parsePayload(row.payload))
        .map((payload, index) => buildFiscalizacaoPoint(payload, index))
        .filter(Boolean);

      const obras = obrasResult.rows
        .map((row) => parsePayload(row.payload))
        .map((payload, index) => buildObraPoint(payload, index))
        .filter(Boolean);

      const points = [...fiscalizacoes, ...obras];
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      res.status(200).json({
        generatedAt: new Date().toISOString(),
        totals: {
          points: points.length,
          fiscalizacoes: fiscalizacoes.length,
          obras: obras.length
        },
        points
      });
    });
  } catch (error) {
    console.error("public points api error", error);
    res.status(500).json({ error: "Erro ao consultar os pontos publicos." });
  }
};
