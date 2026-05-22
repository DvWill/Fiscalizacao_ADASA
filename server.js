const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "fiscalizacoes.json");

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use((req, res, next) => {
  const blocked = /^\/(?:\.env|data\/|api\/|src\/|target\/|node_modules\/|.*\.log$)/i.test(req.path);
  if (blocked) {
    res.status(404).end();
    return;
  }
  next();
});
app.use(express.static(__dirname, { dotfiles: "deny" }));

function safeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireApiAuth(req, res, next) {
  const expectedToken = String(process.env.API_TOKEN || process.env.APP_API_TOKEN || "").trim();
  if (!expectedToken && String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
    next();
    return;
  }
  if (!expectedToken) {
    res.status(503).json({ error: "Autenticacao obrigatoria nao configurada no servidor." });
    return;
  }

  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match || !safeEquals(match[1].trim(), expectedToken)) {
    res.status(401).json({ error: "Nao autorizado." });
    return;
  }

  next();
}

app.use("/api", requireApiAuth);

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialPayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: []
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialPayload, null, 2), "utf8");
  }
}

async function readRecords() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw || "{}");

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.records)) return parsed.records;
  return [];
}

async function writeRecords(records) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeRecord(record) {
  return {
    ...record,
    __backendId: record.__backendId || crypto.randomUUID()
  };
}

app.get("/api/fiscalizacoes", async (req, res) => {
  try {
    const records = await readRecords();
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: "Falha ao carregar fiscalizacoes." });
  }
});

app.post("/api/fiscalizacoes", async (req, res) => {
  try {
    const records = await readRecords();
    const record = normalizeRecord(req.body || {});

    records.push(record);
    await writeRecords(records);

    res.status(201).json({ record });
  } catch (error) {
    res.status(500).json({ error: "Falha ao salvar fiscalizacao." });
  }
});

app.put("/api/fiscalizacoes/:id", async (req, res) => {
  try {
    const records = await readRecords();
    const id = req.params.id;
    const index = records.findIndex((item) => item.__backendId === id);

    if (index === -1) {
      res.status(404).json({ error: "Fiscalizacao nao encontrada." });
      return;
    }

    const updatedRecord = normalizeRecord({
      ...records[index],
      ...req.body,
      __backendId: id
    });

    records[index] = updatedRecord;
    await writeRecords(records);

    res.json({ record: updatedRecord });
  } catch (error) {
    res.status(500).json({ error: "Falha ao atualizar fiscalizacao." });
  }
});

app.delete("/api/fiscalizacoes/:id", async (req, res) => {
  try {
    const records = await readRecords();
    const id = req.params.id;
    const nextRecords = records.filter((item) => item.__backendId !== id);

    if (nextRecords.length === records.length) {
      res.status(404).json({ error: "Fiscalizacao nao encontrada." });
      return;
    }

    await writeRecords(nextRecords);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Falha ao excluir fiscalizacao." });
  }
});

app.get("/telao", (req, res) => {
  res.sendFile(path.join(__dirname, "telao.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

ensureDataFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar servidor:", error);
    process.exit(1);
  });
