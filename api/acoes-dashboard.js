const { withDb } = require("./_db");
const { applyCors, requireBearerAuth, requireBulkConfirmation } = require("./_security");
const {
  buildRecordId,
  sanitizeAcaoFiscalizatoriaRecords,
  sanitizeLocalFiscalizacaoRecords
} = require("./_validation");

function readBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function dateToText(value) {
  if (!value) return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeUniqueId(value, seen) {
  const raw = String(value || buildRecordId()).trim() || buildRecordId();
  const base = raw.slice(0, 112);
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

function acaoRowToRecord(row) {
  const payload = parsePayload(row.payload);
  return {
    ...payload,
    __acaoId: row.acao_uid,
    id: row.source_id || "",
    processo_sei: row.processo_sei || "",
    ano: numberOrNull(row.ano),
    objetivo: row.objetivo || "",
    regiao_administrativa: row.regiao_administrativa || "",
    situacao: row.situacao || "",
    tipo_documento: row.tipo_documento || "",
    destinatario: row.destinatario || "",
    direta_indireta: row.direta_indireta || "",
    programada: row.programada || "",
    sei_documento: row.sei_documento || "",
    data: dateToText(row.data_acao),
    constatacoes: numberOrNull(row.constatacoes),
    constatacoes_nao_conformes: numberOrNull(row.constatacoes_nao_conformes),
    recomendacoes_solicitacoes: numberOrNull(row.recomendacoes_solicitacoes),
    termos_notificacao: numberOrNull(row.termos_notificacao),
    autos_infracao: numberOrNull(row.autos_infracao),
    termos_ajustes_conduta: numberOrNull(row.termos_ajustes_conduta),
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    local_ra: row.local_ra || "",
    local_tipo: row.local_tipo || "",
    local_motivo: row.local_motivo || ""
  };
}

function localRowToRecord(row) {
  const payload = parsePayload(row.payload);
  return {
    ...payload,
    __localId: row.local_uid,
    id: row.source_id || "",
    ano: numberOrNull(row.ano),
    ra: row.ra || "",
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    data: dateToText(row.data_fiscalizacao),
    tipo: row.tipo || "",
    motivo: row.motivo || ""
  };
}

function acaoParams(record, position) {
  return [
    record.__acaoId,
    position,
    record.id || record.__acaoId,
    record.processo_sei || null,
    record.ano,
    record.objetivo || null,
    record.regiao_administrativa || null,
    record.situacao || null,
    record.tipo_documento || null,
    record.destinatario || null,
    record.direta_indireta || null,
    record.programada || null,
    record.sei_documento || null,
    record.data || null,
    record.constatacoes,
    record.constatacoes_nao_conformes,
    record.recomendacoes_solicitacoes,
    record.termos_notificacao,
    record.autos_infracao,
    record.termos_ajustes_conduta,
    record.latitude,
    record.longitude,
    record.local_ra || null,
    record.local_tipo || null,
    record.local_motivo || null,
    JSON.stringify(record)
  ];
}

function localParams(record, position) {
  return [
    record.__localId,
    position,
    record.id || record.__localId,
    record.ano,
    record.ra || null,
    record.latitude,
    record.longitude,
    record.data || null,
    record.tipo || null,
    record.motivo || null,
    JSON.stringify(record)
  ];
}

async function listAcoes(db) {
  const result = await db.query(`
    SELECT
      acao_uid,
      source_id,
      processo_sei,
      ano,
      objetivo,
      regiao_administrativa,
      situacao,
      tipo_documento,
      destinatario,
      direta_indireta,
      programada,
      sei_documento,
      data_acao,
      constatacoes,
      constatacoes_nao_conformes,
      recomendacoes_solicitacoes,
      termos_notificacao,
      autos_infracao,
      termos_ajustes_conduta,
      latitude,
      longitude,
      local_ra,
      local_tipo,
      local_motivo,
      payload
    FROM public.acoes_fiscalizatorias
    ORDER BY position ASC, created_at ASC
  `);

  return result.rows.map(acaoRowToRecord);
}

async function listLocais(db) {
  const result = await db.query(`
    SELECT
      local_uid,
      source_id,
      ano,
      ra,
      latitude,
      longitude,
      data_fiscalizacao,
      tipo,
      motivo,
      payload
    FROM public.locais_fiscalizacoes
    ORDER BY position ASC, created_at ASC
  `);

  return result.rows.map(localRowToRecord);
}

async function replaceDashboardData(db, acoes, locais) {
  const seenAcoes = new Set();
  const seenLocais = new Set();
  const normalizedAcoes = acoes.map((record) => ({
    ...record,
    __acaoId: normalizeUniqueId(record.__acaoId, seenAcoes)
  }));
  const normalizedLocais = locais.map((record) => ({
    ...record,
    __localId: normalizeUniqueId(record.__localId, seenLocais)
  }));

  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM public.acoes_fiscalizatorias");
    await db.query("DELETE FROM public.locais_fiscalizacoes");

    for (let index = 0; index < normalizedAcoes.length; index += 1) {
      await db.query(
        `
          INSERT INTO public.acoes_fiscalizatorias (
            acao_uid,
            position,
            source_id,
            processo_sei,
            ano,
            objetivo,
            regiao_administrativa,
            situacao,
            tipo_documento,
            destinatario,
            direta_indireta,
            programada,
            sei_documento,
            data_acao,
            constatacoes,
            constatacoes_nao_conformes,
            recomendacoes_solicitacoes,
            termos_notificacao,
            autos_infracao,
            termos_ajustes_conduta,
            latitude,
            longitude,
            local_ra,
            local_tipo,
            local_motivo,
            payload,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24,
            $25, $26::jsonb, NOW(), NOW()
          )
        `,
        acaoParams(normalizedAcoes[index], index)
      );
    }

    for (let index = 0; index < normalizedLocais.length; index += 1) {
      await db.query(
        `
          INSERT INTO public.locais_fiscalizacoes (
            local_uid,
            position,
            source_id,
            ano,
            ra,
            latitude,
            longitude,
            data_fiscalizacao,
            tipo,
            motivo,
            payload,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
        `,
        localParams(normalizedLocais[index], index)
      );
    }

    await db.query("COMMIT");
    return {
      acoes: await listAcoes(db),
      locais: await listLocais(db)
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

function countBy(records, keyFn) {
  const counts = new Map();
  records.forEach((record) => {
    const value = String(keyFn(record) || "").trim() || "Nao informado";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function buildDashboard(acoes, locais) {
  const total = acoes.length;
  const concluidas = acoes.filter((item) => /conclu/i.test(item.situacao || "") && !/nao|n[aã]o/i.test(item.situacao || "")).length;
  const emAndamento = acoes.filter((item) => /andamento/i.test(item.situacao || "")).length;
  const naoConcluidas = acoes.filter((item) => /nao|n[aã]o/i.test(item.situacao || "")).length;
  const autosInfracao = acoes.reduce((sum, item) => sum + (Number(item.autos_infracao) || 0), 0);
  const termosNotificacao = acoes.reduce((sum, item) => sum + (Number(item.termos_notificacao) || 0), 0);

  return {
    totalAcoes: total,
    totalLocais: locais.length,
    concluidas,
    emAndamento,
    naoConcluidas,
    autosInfracao,
    termosNotificacao,
    porAno: countBy(acoes, (item) => item.ano),
    porSituacao: countBy(acoes, (item) => item.situacao),
    porRegiao: countBy(acoes, (item) => item.regiao_administrativa),
    porTipo: countBy(locais, (item) => item.tipo)
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "PUT", "DELETE", "OPTIONS"])) return;
  if (!requireBearerAuth(req, res)) return;

  const method = String(req.method || "GET").toUpperCase();

  try {
    await withDb(async (db) => {
      if (method === "GET") {
        const acoes = await listAcoes(db);
        const locais = await listLocais(db);
        res.status(200).json({ acoes, locais, dashboard: buildDashboard(acoes, locais) });
        return;
      }

      if (method === "PUT") {
        if (!requireBulkConfirmation(req, res, "replace-all")) return;

        const incoming = readBody(req.body);
        const acoes = sanitizeAcaoFiscalizatoriaRecords(incoming.acoes || []);
        const locais = sanitizeLocalFiscalizacaoRecords(incoming.locais || []);
        const errors = [...acoes.errors, ...locais.errors];
        if (errors.length) {
          res.status(400).json({ error: errors.join(" ") });
          return;
        }

        const result = await replaceDashboardData(db, acoes.records, locais.records);
        res.status(200).json({
          ...result,
          dashboard: buildDashboard(result.acoes, result.locais)
        });
        return;
      }

      if (method === "DELETE") {
        if (!requireBulkConfirmation(req, res, "delete-all")) return;
        await db.query("BEGIN");
        try {
          const acoesDeleted = await db.query("DELETE FROM public.acoes_fiscalizatorias");
          const locaisDeleted = await db.query("DELETE FROM public.locais_fiscalizacoes");
          await db.query("COMMIT");
          res.status(200).json({
            deletedAcoes: acoesDeleted.rowCount || 0,
            deletedLocais: locaisDeleted.rowCount || 0
          });
        } catch (error) {
          await db.query("ROLLBACK");
          throw error;
        }
        return;
      }

      res.status(405).json({ error: "Metodo nao permitido." });
    });
  } catch (error) {
    console.error("acoes dashboard api error", error);
    res.status(500).json({
      error: "Erro ao acessar dados do painel de acoes.",
      code: error?.code || "ACOES_DASHBOARD_DB_ERROR"
    });
  }
};
