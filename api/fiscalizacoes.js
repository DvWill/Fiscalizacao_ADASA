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

function normalizeIdentityPart(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

function buildIdentity(record) {
  const idPart = normalizeIdentityPart(record?.id);
  const processoPart = normalizeIdentityPart(record?.processo_sei);
  if (!idPart && !processoPart) return "";
  return `${idPart}::${processoPart}`;
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

function buildAuditId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function writeAudit(db, { action, backendId = null, source = "api", before = null, after = null, metadata = null }) {
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
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
    `,
    [
      buildAuditId(),
      backendId,
      action,
      source,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

async function findDuplicateByIdentity(db, record, excludingBackendId = "") {
  const identity = buildIdentity(record);
  if (!identity) return null;

  const [idPart, processoPart] = identity.split("::");
  const params = [idPart, processoPart];
  let query = `
    SELECT backend_id, payload
    FROM public.fiscalizacoes
    WHERE LOWER(REGEXP_REPLACE(COALESCE(payload->>'id', ''), '\\s+', '', 'g')) = $1
      AND LOWER(REGEXP_REPLACE(COALESCE(payload->>'processo_sei', ''), '\\s+', '', 'g')) = $2
  `;

  if (excludingBackendId) {
    params.push(excludingBackendId);
    query += ` AND backend_id <> $${params.length} `;
  }

  query += " LIMIT 1";
  const found = await db.query(query, params);
  if (!found.rows.length) return null;

  return {
    backendId: found.rows[0].backend_id,
    record: parsePayload(found.rows[0].payload)
  };
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
  const seenIdentities = new Set();
  for (const record of records) {
    const identity = buildIdentity(record);
    if (!identity) continue;
    if (seenIdentities.has(identity)) {
      const error = new Error("DUPLICATE_IDENTITY_IN_BATCH");
      error.code = "DUPLICATE_IDENTITY_IN_BATCH";
      throw error;
    }
    seenIdentities.add(identity);
  }

  const previousRecords = await listRecords(db);
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
    const nextRecords = await listRecords(db);
    await writeAudit(db, {
      action: "replace_all",
      source: "api",
      metadata: {
        previousCount: previousRecords.length,
        nextCount: nextRecords.length
      }
    });
    return nextRecords;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "PUT", "DELETE", "OPTIONS"])) return;
  if (!requireBearerAuth(req, res)) return;

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

        const duplicate = await findDuplicateByIdentity(db, record);
        if (duplicate) {
          res.status(409).json({ error: "Ja existe fiscalizacao com mesmo ID e Processo SEI." });
          return;
        }

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
        await writeAudit(db, {
          action: "create",
          backendId: record.__backendId,
          source: "api",
          after: record
        });

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

          try {
            const records = await replaceRecords(db, incoming.records);
            res.status(200).json({ records });
            return;
          } catch (error) {
            if (error?.code === "DUPLICATE_IDENTITY_IN_BATCH" || error?.message === "DUPLICATE_IDENTITY_IN_BATCH") {
              res.status(400).json({ error: "A lista enviada contem duplicidade de ID + Processo SEI." });
              return;
            }
            throw error;
          }
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

        const duplicate = await findDuplicateByIdentity(db, record, idParam);
        if (duplicate) {
          res.status(409).json({ error: "Ja existe fiscalizacao com mesmo ID e Processo SEI." });
          return;
        }

        await db.query(
          `
            UPDATE public.fiscalizacoes
            SET payload = $2::jsonb, updated_at = NOW()
            WHERE backend_id = $1
          `,
          [idParam, JSON.stringify(record)]
        );
        await writeAudit(db, {
          action: "update",
          backendId: idParam,
          source: "api",
          before: currentRecord,
          after: record
        });

        res.status(200).json({ record });
        return;
      }

      if (method === "DELETE") {
        if (!idParam) {
          const previousCountResult = await db.query("SELECT COUNT(1) AS total FROM public.fiscalizacoes");
          const previousCount = Number(previousCountResult.rows[0]?.total || 0);
          const deletedResult = await db.query("DELETE FROM public.fiscalizacoes");
          await writeAudit(db, {
            action: "delete_all",
            source: "api",
            metadata: {
              deleted: deletedResult.rowCount || 0,
              previousCount
            }
          });
          res.status(200).json({ deleted: deletedResult.rowCount || 0 });
          return;
        }

        const current = await db.query("SELECT payload FROM public.fiscalizacoes WHERE backend_id = $1 LIMIT 1", [idParam]);
        const beforeRecord = current.rows.length > 0 ? parsePayload(current.rows[0].payload) : null;
        const deleted = await db.query("DELETE FROM public.fiscalizacoes WHERE backend_id = $1", [idParam]);
        if (!deleted.rowCount) {
          res.status(404).json({ error: "Fiscalizacao nao encontrada." });
          return;
        }
        await writeAudit(db, {
          action: "delete",
          backendId: idParam,
          source: "api",
          before: beforeRecord
        });

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
