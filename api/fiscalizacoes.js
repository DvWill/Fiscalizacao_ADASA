const { withDb } = require("./_db");

function withCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

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

function queryParamToString(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  if (value == null) return "";
  return String(value);
}

async function listRecords(db) {
  const result = await db.query(
    `
      SELECT payload
      FROM public.fiscalizacoes
      ORDER BY position ASC, created_at ASC
    `
  );

  return result.rows.map((row) => parsePayload(row.payload));
}

async function replaceRecords(db, records) {
  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM public.fiscalizacoes");

    for (let index = 0; index < records.length; index += 1) {
      const record = {
        ...(records[index] || {}),
        __backendId: buildId(records[index]?.__backendId)
      };

      await db.query(
        `
          INSERT INTO public.fiscalizacoes (backend_id, position, payload, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        `,
        [record.__backendId, index, JSON.stringify(record)]
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
  if (withCors(req, res)) return;

  const method = String(req.method || "GET").toUpperCase();
  const idParam = queryParamToString(req.query?.id).trim();

  try {
    await withDb(async (db) => {
      if (method === "GET") {
        if (idParam) {
          const found = await db.query(
            "SELECT payload FROM public.fiscalizacoes WHERE backend_id = $1 LIMIT 1",
            [idParam]
          );

          if (found.rows.length === 0) {
            res.status(404).json({ error: "Fiscalizacao nao encontrada." });
            return;
          }

          res.status(200).json({ record: parsePayload(found.rows[0].payload) });
          return;
        }

        const records = await listRecords(db);
        res.status(200).json({ records });
        return;
      }

      if (method === "POST") {
        const incoming = readBody(req.body);
        const record = {
          ...incoming,
          __backendId: buildId(incoming.__backendId)
        };

        const pos = await db.query("SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM public.fiscalizacoes");
        const nextPos = Number(pos.rows[0]?.next_pos ?? 0);

        await db.query(
          `
            INSERT INTO public.fiscalizacoes (backend_id, position, payload, created_at, updated_at)
            VALUES ($1, $2, $3::jsonb, NOW(), NOW())
            ON CONFLICT (backend_id)
            DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
          `,
          [record.__backendId, nextPos, JSON.stringify(record)]
        );

        res.status(201).json({ record });
        return;
      }

      if (method === "PUT") {
        const incoming = readBody(req.body);

        if (!idParam) {
          if (!Array.isArray(incoming.records)) {
            res.status(400).json({ error: "Campo records deve ser uma lista." });
            return;
          }

          const records = await replaceRecords(db, incoming.records);
          res.status(200).json({ records });
          return;
        }

        const found = await db.query(
          "SELECT payload FROM public.fiscalizacoes WHERE backend_id = $1 LIMIT 1",
          [idParam]
        );

        if (found.rows.length === 0) {
          res.status(404).json({ error: "Fiscalizacao nao encontrada." });
          return;
        }

        const currentRecord = parsePayload(found.rows[0].payload);
        const record = {
          ...currentRecord,
          ...incoming,
          __backendId: idParam
        };

        await db.query(
          `
            UPDATE public.fiscalizacoes
            SET payload = $2::jsonb, updated_at = NOW()
            WHERE backend_id = $1
          `,
          [idParam, JSON.stringify(record)]
        );

        res.status(200).json({ record });
        return;
      }

      if (method === "DELETE") {
        if (!idParam) {
          const deletedResult = await db.query("DELETE FROM public.fiscalizacoes");
          res.status(200).json({ deleted: deletedResult.rowCount || 0 });
          return;
        }

        const deleted = await db.query("DELETE FROM public.fiscalizacoes WHERE backend_id = $1", [idParam]);
        if (!deleted.rowCount) {
          res.status(404).json({ error: "Fiscalizacao nao encontrada." });
          return;
        }

        res.status(204).end();
        return;
      }

      res.status(405).json({ error: "Metodo nao permitido." });
    });
  } catch (error) {
    console.error("fiscalizacoes api error", error);
    res.status(500).json({ error: "Erro ao acessar banco de dados." });
  }
};
