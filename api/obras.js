function withCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

function getStore() {
  if (!globalThis.__obrasStore) {
    globalThis.__obrasStore = [];
  }
  return globalThis.__obrasStore;
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

function normalizeRecord(record) {
  return {
    ...record,
    __obraId: buildId(record.__obraId || record.item || record.local || record.objeto_contrato)
  };
}

module.exports = function handler(req, res) {
  if (withCors(req, res)) return;

  const records = getStore();
  const method = String(req.method || "GET").toUpperCase();

  if (method === "GET") {
    res.status(200).json({ records });
    return;
  }

  if (method === "PUT") {
    const incoming = readBody(req.body);
    if (!Array.isArray(incoming.records)) {
      res.status(400).json({ error: "Campo records deve ser uma lista." });
      return;
    }

    const nextRecords = incoming.records.map((item) => normalizeRecord(item || {}));
    globalThis.__obrasStore = nextRecords;
    res.status(200).json({ records: nextRecords });
    return;
  }

  if (method === "DELETE") {
    globalThis.__obrasStore = [];
    res.status(200).json({ deleted: records.length });
    return;
  }

  res.status(405).json({ error: "Metodo nao permitido." });
};
