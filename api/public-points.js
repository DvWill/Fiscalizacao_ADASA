const { withDb } = require("./_db");
const { applyCors } = require("./_security");

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

function buildFiscalizacaoPoint(payload, index) {
  const latitude = normalizeCoordinate(payload.latitude, "lat");
  const longitude = normalizeCoordinate(payload.longitude, "lng");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

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
