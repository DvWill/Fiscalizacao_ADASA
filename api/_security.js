const crypto = require("crypto");

function toNormalizedOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getServerOrigin(req) {
  const host = String(req.headers.host || "").trim();
  if (!host) return "";

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function getAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => toNormalizedOrigin(item))
    .filter(Boolean);
}

function isOriginAllowed(req, origin) {
  const normalizedOrigin = toNormalizedOrigin(origin);
  if (!normalizedOrigin || normalizedOrigin === "null") return false;

  const allowAll = String(process.env.CORS_ALLOW_ALL || "")
    .trim()
    .toLowerCase() === "true";
  if (allowAll) return true;

  const serverOrigin = toNormalizedOrigin(getServerOrigin(req));
  if (serverOrigin && normalizedOrigin === serverOrigin) return true;

  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(normalizedOrigin);
}

function applyCors(req, res, methods) {
  const origin = String(req.headers.origin || "").trim();

  if (origin) {
    if (!isOriginAllowed(req, origin)) {
      res.status(403).json({ error: "Origem nao permitida." });
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (String(req.method || "").toUpperCase() === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

function parseBearerToken(headerValue) {
  const raw = String(headerValue || "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function safeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireBearerAuth(req, res) {
  const expectedToken = String(process.env.API_TOKEN || process.env.APP_API_TOKEN || "").trim();
  if (!expectedToken) {
    return true;
  }

  const providedToken = parseBearerToken(req.headers.authorization);
  if (providedToken && safeEquals(providedToken, expectedToken)) {
    return true;
  }

  res.setHeader("WWW-Authenticate", "Bearer");
  res.status(401).json({ error: "Nao autorizado." });
  return false;
}

module.exports = {
  applyCors,
  requireBearerAuth
};
