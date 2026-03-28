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

function buildId(value) {
  const fallback = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const raw = value == null ? "" : String(value);
  return raw.trim() || fallback;
}

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

function normalizeUniqueId(baseValue, seen) {
  const base = buildId(baseValue);
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }

  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  const unique = `${base}-${suffix}`;
  seen.add(unique);
  return unique;
}

function normalizeRecord(record, seen) {
  return {
    ...record,
    __obraId: normalizeUniqueId(record.__obraId || record.item || record.local || record.objeto_contrato, seen)
  };
}

async function listRecords(db) {
  const result = await db.query(
    `
      SELECT payload
      FROM public.obras
      ORDER BY position ASC, created_at ASC
    `
  );

  return result.rows.map((row) => parsePayload(row.payload));
}

async function replaceRecords(db, records) {
  const seenIds = new Set();
  const normalized = records.map((item) => normalizeRecord(item || {}, seenIds));

  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM public.obras");

    for (let index = 0; index < normalized.length; index += 1) {
      const record = normalized[index];
      await db.query(
        `
          INSERT INTO public.obras (obra_id, position, payload, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        `,
        [record.__obraId, index, JSON.stringify(record)]
      );
    }

    await db.query("COMMIT");
    return listRecords(db);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "PUT", "DELETE", "OPTIONS"])) return;
  if (!requireBearerAuth(req, res)) return;

  const method = String(req.method || "GET").toUpperCase();

  try {
    await withDb(async (db) => {
      if (method === "GET") {
        const records = await listRecords(db);
        res.status(200).json({ records });
        return;
      }

      if (method === "PUT") {
        const incoming = readBody(req.body);
        if (!Array.isArray(incoming.records)) {
          res.status(400).json({ error: "Campo records deve ser uma lista." });
          return;
        }

        const records = await replaceRecords(db, incoming.records);
        res.status(200).json({ records });
        return;
      }

      if (method === "DELETE") {
        const deletedResult = await db.query("DELETE FROM public.obras");
        res.status(200).json({ deleted: deletedResult.rowCount || 0 });
        return;
      }

      res.status(405).json({ error: "Metodo nao permitido." });
    });
  } catch (error) {
    console.error("obras api error", error);
    res.status(500).json({ error: "Erro ao acessar banco de dados." });
  }
};
