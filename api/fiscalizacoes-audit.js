const { withDb } = require("./_db");
const { applyCors, requireBearerAuth } = require("./_security");

function readBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function queryParamToString(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  if (value == null) return "";
  return String(value);
}

function buildId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function sanitizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(Math.trunc(parsed), 500);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "OPTIONS"])) return;
  if (!requireBearerAuth(req, res)) return;

  const method = String(req.method || "GET").toUpperCase();

  try {
    await withDb(async (db) => {
      if (method === "GET") {
        const limit = sanitizeLimit(queryParamToString(req.query?.limit));
        const backendId = queryParamToString(req.query?.backendId).trim();

        const params = [];
        const where = [];
        if (backendId) {
          params.push(backendId);
          where.push(`backend_id = $${params.length}`);
        }
        params.push(limit);

        const result = await db.query(
          `
            SELECT
              audit_id,
              backend_id,
              action,
              source,
              payload_before,
              payload_after,
              metadata,
              created_at
            FROM public.fiscalizacoes_audit
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY created_at DESC
            LIMIT $${params.length}
          `,
          params
        );

        res.status(200).json({ entries: result.rows });
        return;
      }

      if (method === "POST") {
        const incoming = readBody(req.body);
        const action = String(incoming.action || "").trim() || "event";
        const backendId = incoming.backendId == null ? null : String(incoming.backendId).trim() || null;
        const source = String(incoming.source || "api").trim() || "api";

        await db.query(
          `
            INSERT INTO public.fiscalizacoes_audit (
              audit_id,
              backend_id,
              action,
              source,
              payload_before,
              payload_after,
              metadata,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, COALESCE($8::timestamptz, NOW()))
          `,
          [
            buildId(),
            backendId,
            action,
            source,
            incoming.before ? JSON.stringify(incoming.before) : null,
            incoming.after ? JSON.stringify(incoming.after) : null,
            incoming.metadata ? JSON.stringify(incoming.metadata) : null,
            incoming.createdAt || null
          ]
        );

        res.status(201).json({ ok: true });
        return;
      }

      res.status(405).json({ error: "Metodo nao permitido." });
    });
  } catch (error) {
    console.error("fiscalizacoes-audit api error", error);
    res.status(500).json({ error: "Erro ao acessar historico de auditoria." });
  }
};
