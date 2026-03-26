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

function createSeedData() {
  return [
    {
      __backendId: "seed-1",
      id: "FISC-001",
      local: "Lago Paranoa",
      data: "2026-03-09",
      situacao: "Concluida",
      direta_indireta: "Direta"
    },
    {
      __backendId: "seed-2",
      id: "FISC-002",
      local: "ETA Gama",
      data: "2026-03-08",
      situacao: "Em andamento",
      direta_indireta: "Direta"
    }
  ];
}

function getStore() {
  if (!globalThis.__fiscalizacoesStore) {
    globalThis.__fiscalizacoesStore = createSeedData();
  }

  return globalThis.__fiscalizacoesStore;
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

module.exports = function handler(req, res) {
  if (withCors(req, res)) return;

  const records = getStore();
  const method = String(req.method || "GET").toUpperCase();
  const idParam = req.query?.id ? String(req.query.id) : "";

  if (method === "GET") {
    if (idParam) {
      const record = records.find((item) => String(item.__backendId) === idParam);
      if (!record) {
        res.status(404).json({ error: "Fiscalizacao nao encontrada." });
        return;
      }

      res.status(200).json({ record });
      return;
    }

    res.status(200).json({ records });
    return;
  }

  if (method === "POST") {
    const incoming = readBody(req.body);
    const record = {
      ...incoming,
      __backendId: buildId(incoming.__backendId)
    };

    records.push(record);
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

      const nextRecords = incoming.records.map((item) => ({
        ...(item || {}),
        __backendId: buildId(item?.__backendId)
      }));

      globalThis.__fiscalizacoesStore = nextRecords;
      res.status(200).json({ records: nextRecords });
      return;
    }

    const index = records.findIndex((item) => String(item.__backendId) === idParam);
    if (index === -1) {
      res.status(404).json({ error: "Fiscalizacao nao encontrada." });
      return;
    }

    const record = {
      ...records[index],
      ...incoming,
      __backendId: idParam
    };

    records[index] = record;
    res.status(200).json({ record });
    return;
  }

  if (method === "DELETE") {
    if (!idParam) {
      const deleted = records.length;
      globalThis.__fiscalizacoesStore = [];
      res.status(200).json({ deleted });
      return;
    }

    const index = records.findIndex((item) => String(item.__backendId) === idParam);
    if (index === -1) {
      res.status(404).json({ error: "Fiscalizacao nao encontrada." });
      return;
    }

    records.splice(index, 1);
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Metodo nao permitido." });
};
