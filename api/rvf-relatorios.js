const { withDb } = require("./_db");
const { applyCors, requireBearerAuth, checkRateLimit, getClientIp } = require("./_security");

const SOURCE_URL = "https://www.adasa.df.gov.br/fiscalizacao-sae1/fiscalizacao-direta/relatorios-de-vistoria-e-fiscalizacao-rvf?show_menu=1&menu_name=saneamento-basico";
const SOURCE_ORIGIN = "https://www.adasa.df.gov.br";
const MAX_REPORTS_PER_SYNC = 500;
const PAGE_TIMEOUT_MS = 15_000;
const LINK_TIMEOUT_MS = 4_500;
const LINK_CHECK_CONCURRENCY = 8;

const MONTHS = [
  ["janeiro", "Janeiro"],
  ["fevereiro", "Fevereiro"],
  ["marco", "Marco"],
  ["março", "Marco"],
  ["abril", "Abril"],
  ["maio", "Maio"],
  ["junho", "Junho"],
  ["julho", "Julho"],
  ["agosto", "Agosto"],
  ["setembro", "Setembro"],
  ["outubro", "Outubro"],
  ["novembro", "Novembro"],
  ["dezembro", "Dezembro"]
];

function readBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function sanitizeTitle(value) {
  return decodeHtmlEntities(stripTags(value))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—•]+/, "")
    .trim()
    .slice(0, 1000);
}

function inferMonthFromTitle(title) {
  const normalized = normalizeText(title);
  if (!normalized) return null;

  for (const [needle, label] of MONTHS) {
    if (normalized.includes(normalizeText(needle))) return label;
  }

  return null;
}

function normalizeHref(href) {
  const decoded = decodeHtmlEntities(String(href || "").trim());
  if (!decoded || decoded.startsWith("#") || /^javascript:/i.test(decoded) || /^mailto:/i.test(decoded)) {
    return null;
  }

  try {
    return new URL(decoded, SOURCE_URL);
  } catch {
    return null;
  }
}

function isAllowedReportUrl(url) {
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return false;

  const host = url.hostname.toLowerCase();
  const pathname = decodeURIComponent(url.pathname || "").toLowerCase();

  return host === "www.adasa.df.gov.br" ||
    host.endsWith(".adasa.df.gov.br") ||
    host === "samediasites.blob.core.windows.net" ||
    host === "drive.google.com" ||
    host === "docs.google.com" ||
    host.includes("sharepoint.com") ||
    pathname.endsWith(".pdf");
}

function looksLikeReportTitle(title) {
  const normalized = normalizeText(title);
  if (!normalized || normalized.length < 8) return false;

  return [
    "relatorio",
    "fiscalizacao",
    "vistoria",
    "rvf",
    "rvt",
    "informacao tecnica",
    "informacoes",
    "anexo"
  ].some((term) => normalized.includes(term));
}

function extractContentHtml(html) {
  const startMatch = html.match(/Relat[oó]rios\s+de\s+Vistoria\s+e\s+Fiscaliza[cç][aã]o\s*-\s*2025/i);
  const start = startMatch ? startMatch.index : Math.max(0, html.indexOf("Clique nos links abaixo"));
  const tail = html.slice(start);
  const endCandidates = [
    tail.search(/<footer\b/i),
    tail.search(/id=["']gray-footer["']/i),
    tail.search(/<h[1-6][^>]*>\s*Institucional\s*<\/h[1-6]>/i),
    tail.search(/Fragmento do painel em azulejos/i)
  ].filter((index) => index > 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : tail.length;
  return tail.slice(0, end);
}

function parseReportsFromHtml(html) {
  const content = extractContentHtml(html);
  const tokens = /Relat[oó]rios\s+de\s+Vistoria\s+e\s+Fiscaliza[cç][aã]o\s*-\s*(20\d{2})|<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const reports = [];
  const seen = new Set();
  const seenUrlsByYear = new Set();
  let currentYear = null;
  let match;

  while ((match = tokens.exec(content)) && reports.length < MAX_REPORTS_PER_SYNC) {
    if (match[1]) {
      const year = Number(match[1]);
      currentYear = year >= 2015 && year <= 2035 ? year : null;
      continue;
    }

    if (!currentYear) continue;

    const url = normalizeHref(match[2]);
    const title = sanitizeTitle(match[3]);
    if (!url || !title || !isAllowedReportUrl(url) || !looksLikeReportTitle(title)) continue;

    const urlOriginal = url.toString();
    const dedupeKey = `${currentYear}::${normalizeText(title)}::${urlOriginal}`;
    const urlYearKey = `${currentYear}::${urlOriginal}`;
    if (seen.has(dedupeKey) || seenUrlsByYear.has(urlYearKey)) continue;
    seen.add(dedupeKey);
    seenUrlsByYear.add(urlYearKey);

    reports.push({
      titulo: title,
      ano: currentYear,
      mes: inferMonthFromTitle(title),
      url_original: urlOriginal,
      dominio_origem: url.hostname.toLowerCase()
    });
  }

  return reports;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = LINK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSourcePage() {
  const response = await fetchWithTimeout(SOURCE_URL, {
    method: "GET",
    headers: {
      "User-Agent": "fiscalizacoes-rvf-sync/1.0",
      "Accept": "text/html,application/xhtml+xml"
    }
  }, PAGE_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Pagina da ADASA retornou HTTP ${response.status}.`);
  }

  return response.text();
}

async function checkReportLink(report) {
  try {
    const url = new URL(report.url_original);
    if (!isAllowedReportUrl(url)) {
      return {
        ...report,
        url_pdf_final: null,
        status_link: "erro",
        erro_importacao: "URL fora dos dominios permitidos."
      };
    }

    let response = await fetchWithTimeout(url.toString(), {
      method: "HEAD",
      headers: {
        "User-Agent": "fiscalizacoes-rvf-sync/1.0"
      }
    }, LINK_TIMEOUT_MS);

    if (response.status === 405 || response.status === 403) {
      response = await fetchWithTimeout(url.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "fiscalizacoes-rvf-sync/1.0",
          "Range": "bytes=0-0"
        }
      }, LINK_TIMEOUT_MS);
    }

    const active = response.status >= 200 && response.status < 400;
    return {
      ...report,
      url_pdf_final: active ? response.url : null,
      status_link: active ? "ativo" : "erro",
      erro_importacao: active ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ...report,
      url_pdf_final: null,
      status_link: "erro",
      erro_importacao: error?.name === "AbortError" ? "Timeout ao validar link." : "Falha ao validar link."
    };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function rowToRelatorio(row) {
  return {
    id: row.id,
    titulo: row.titulo || "",
    ano: Number(row.ano),
    mes: row.mes || "",
    url_original: row.url_original || "",
    url_pdf_final: row.url_pdf_final || "",
    dominio_origem: row.dominio_origem || "",
    status_link: row.status_link || "pendente",
    erro_importacao: row.erro_importacao || "",
    data_importacao: row.data_importacao ? new Date(row.data_importacao).toISOString() : "",
    data_atualizacao: row.data_atualizacao ? new Date(row.data_atualizacao).toISOString() : ""
  };
}

function buildSummary(records) {
  const years = records.map((item) => Number(item.ano)).filter(Number.isFinite);
  const updateTimes = records
    .map((item) => Date.parse(item.data_atualizacao))
    .filter(Number.isFinite);

  return {
    total: records.length,
    ativos: records.filter((item) => item.status_link === "ativo").length,
    erros: records.filter((item) => item.status_link === "erro").length,
    ultimoAno: years.length ? Math.max(...years) : null,
    ultimaAtualizacao: updateTimes.length ? new Date(Math.max(...updateTimes)).toISOString() : null
  };
}

async function listRelatorios(db) {
  const result = await db.query(`
    SELECT
      id,
      titulo,
      ano,
      mes,
      url_original,
      url_pdf_final,
      dominio_origem,
      status_link,
      erro_importacao,
      data_importacao,
      data_atualizacao
    FROM public.rvf_relatorios
    ORDER BY ano DESC, data_atualizacao DESC, titulo ASC
  `);

  return result.rows.map(rowToRelatorio);
}

async function syncRelatorios(db) {
  const html = await fetchSourcePage();
  const parsedReports = parseReportsFromHtml(html);
  const checkedReports = await mapWithConcurrency(parsedReports, LINK_CHECK_CONCURRENCY, checkReportLink);

  let inserted = 0;
  let updated = 0;

  await db.query("BEGIN");
  try {
    for (const report of checkedReports) {
      const existing = await db.query(
        `
          SELECT id
          FROM public.rvf_relatorios
          WHERE ano = $1 AND titulo = $2 AND url_original = $3
          LIMIT 1
        `,
        [report.ano, report.titulo, report.url_original]
      );

      const result = await db.query(
        `
          INSERT INTO public.rvf_relatorios (
            titulo,
            ano,
            mes,
            url_original,
            url_pdf_final,
            dominio_origem,
            status_link,
            erro_importacao,
            data_importacao,
            data_atualizacao
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (ano, titulo, url_original)
          DO UPDATE SET
            mes = EXCLUDED.mes,
            url_pdf_final = EXCLUDED.url_pdf_final,
            dominio_origem = EXCLUDED.dominio_origem,
            status_link = EXCLUDED.status_link,
            erro_importacao = EXCLUDED.erro_importacao,
            data_atualizacao = NOW()
          RETURNING id
        `,
        [
          report.titulo,
          report.ano,
          report.mes,
          report.url_original,
          report.url_pdf_final,
          report.dominio_origem,
          report.status_link,
          report.erro_importacao
        ]
      );

      if (result.rowCount) {
        if (existing.rowCount) updated += 1;
        else inserted += 1;
      }
    }

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  const relatorios = await listRelatorios(db);
  return {
    relatorios,
    summary: buildSummary(relatorios),
    sync: {
      sourceUrl: SOURCE_URL,
      encontrados: parsedReports.length,
      validados: checkedReports.length,
      novos: inserted,
      atualizados: updated,
      ativos: checkedReports.filter((item) => item.status_link === "ativo").length,
      erros: checkedReports.filter((item) => item.status_link === "erro").length
    }
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "OPTIONS"])) return;
  if (!requireBearerAuth(req, res)) return;

  const method = String(req.method || "GET").toUpperCase();

  try {
    await withDb(async (db) => {
      if (method === "GET") {
        const relatorios = await listRelatorios(db);
        res.status(200).json({ relatorios, summary: buildSummary(relatorios), sourceUrl: SOURCE_URL });
        return;
      }

      if (method === "POST") {
        const incoming = readBody(req.body);
        const force = Boolean(incoming.force);
        const rate = checkRateLimit(`rvf-sync:${getClientIp(req)}`, { limit: force ? 8 : 4, windowMs: 60_000 });
        if (!rate.allowed) {
          res.setHeader("Retry-After", String(rate.retryAfterSeconds));
          res.status(429).json({ error: "Muitas sincronizacoes em pouco tempo. Tente novamente em instantes." });
          return;
        }

        const result = await syncRelatorios(db);
        res.status(200).json(result);
        return;
      }

      res.status(405).json({ error: "Metodo nao permitido." });
    });
  } catch (error) {
    console.error("rvf relatorios api error", error);
    res.status(500).json({
      error: "Erro ao sincronizar relatorios RVF.",
      detail: error?.message || "Falha inesperada."
    });
  }
};
