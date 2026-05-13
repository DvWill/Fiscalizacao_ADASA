const { Pool } = require("pg");

function buildConnectionString() {
  const source = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
  const raw = String(source).trim().replace(/^"(.*)"$/, "$1");
  if (!raw) {
    throw new Error("Missing NEON_DATABASE_URL (or DATABASE_URL).");
  }

  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete("channel_binding");
    return parsed.toString();
  } catch {
    return raw;
  }
}

let pool;
let initPromise;

function shouldRejectUnauthorized() {
  const value = process.env.PG_SSL_REJECT_UNAUTHORIZED;
  if (value == null || String(value).trim() === "") {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: buildConnectionString(),
      ssl: { rejectUnauthorized: shouldRejectUnauthorized() }
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!initPromise) {
    initPromise = (async () => {
      const db = getPool();
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.fiscalizacoes (
          backend_id VARCHAR(128) PRIMARY KEY,
          position INTEGER NOT NULL DEFAULT 0,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes
        ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.obras (
          obra_id VARCHAR(128) PRIMARY KEY,
          position INTEGER NOT NULL DEFAULT 0,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        ALTER TABLE public.obras
        ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0
      `);
      await db.query(`
        ALTER TABLE public.obras
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `);
      await db.query(`
        ALTER TABLE public.obras
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.fiscalizacoes_audit (
          audit_id VARCHAR(128) PRIMARY KEY,
          backend_id VARCHAR(128),
          action VARCHAR(64) NOT NULL,
          source VARCHAR(32),
          payload_before JSONB,
          payload_after JSONB,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS audit_id VARCHAR(128)
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS backend_id VARCHAR(128)
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS action VARCHAR(64) NOT NULL DEFAULT 'event'
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS source VARCHAR(32)
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS payload_before JSONB
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS payload_after JSONB
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS metadata JSONB
      `);
      await db.query(`
        ALTER TABLE public.fiscalizacoes_audit
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS fiscalizacoes_audit_created_at_idx
        ON public.fiscalizacoes_audit (created_at DESC)
      `);
    })();
  }

  await initPromise;
}

async function withDb(handler) {
  await ensureSchema();
  return handler(getPool());
}

module.exports = { withDb };
