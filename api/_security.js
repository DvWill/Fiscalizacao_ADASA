const crypto = require("crypto");

const SESSION_COOKIE_NAME = "fiscalizacoes_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const revokedSessions = new Map();
const rateLimitBuckets = new Map();

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

function setBaseSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
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
  const allowAllInProduction = String(process.env.CORS_ALLOW_ALL_IN_PRODUCTION || "")
    .trim()
    .toLowerCase() === "true";
  if (allowAll && (!isProductionLike() || allowAllInProduction)) return true;

  const serverOrigin = toNormalizedOrigin(getServerOrigin(req));
  if (serverOrigin && normalizedOrigin === serverOrigin) return true;

  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(normalizedOrigin);
}

function applyCors(req, res, methods) {
  setBaseSecurityHeaders(res);
  const origin = String(req.headers.origin || "").trim();

  if (origin) {
    if (!isOriginAllowed(req, origin)) {
      res.status(403).json({ error: "Origem nao permitida." });
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-CSRF-Token, X-Confirm-Bulk-Operation"
  );

  if (String(req.method || "").toUpperCase() === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

function isProductionLike() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "production" || String(process.env.VERCEL || "") === "1";
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim() || "unknown";
}

function checkRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucketKey = String(key || "default");
  const bucket = rateLimitBuckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitBuckets.set(bucketKey, bucket);

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
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

function getExpectedBearerToken() {
  return String(process.env.API_TOKEN || process.env.APP_API_TOKEN || "").trim();
}

function getLoginCredentials() {
  const login = String(
    process.env.AUTH_LOGIN ||
    process.env.LOGIN_USER ||
    process.env.APP_LOGIN ||
    process.env.APP_USER ||
    ""
  ).trim();

  const password = String(
    process.env.AUTH_PASSWORD ||
    process.env.LOGIN_PASSWORD ||
    process.env.APP_PASSWORD ||
    ""
  );

  return {
    login,
    password,
    enabled: Boolean(login && password)
  };
}

function getSessionSecret() {
  const explicitSecret = String(
    process.env.AUTH_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    ""
  ).trim();
  if (explicitSecret) return explicitSecret;

  const bearerToken = getExpectedBearerToken();
  if (bearerToken) return bearerToken;

  const credentials = getLoginCredentials();
  if (credentials.enabled) {
    return `${credentials.login}:${credentials.password}`;
  }

  return "";
}

function getSessionTtlSeconds() {
  const parsed = Number(process.env.AUTH_SESSION_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.floor(parsed);
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "").trim();
  if (!raw) return {};

  const cookies = {};
  raw.split(";").forEach((part) => {
    const [namePart, ...valueParts] = part.split("=");
    const name = String(namePart || "").trim();
    if (!name) return;
    const value = valueParts.join("=").trim();
    cookies[name] = value ? decodeURIComponent(value) : "";
  });

  return cookies;
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req);
  return String(cookies[SESSION_COOKIE_NAME] || "").trim();
}

function sign(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(String(value))
    .digest("hex");
}

function buildSessionToken(login) {
  const secret = getSessionSecret();
  if (!secret) return "";

  const payload = {
    login: String(login || "").trim(),
    iat: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function cleanupRevokedSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of revokedSessions.entries()) {
    if (expiresAt <= now) revokedSessions.delete(token);
  }
}

function decodeSessionToken(token, options = {}) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  cleanupRevokedSessions();
  if (!options.ignoreRevocation && revokedSessions.has(raw)) return null;

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEquals(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;

    const login = String(payload.login || "").trim();
    const iat = Number(payload.iat || 0);
    if (!login || !Number.isFinite(iat) || iat <= 0) return null;

    const maxAgeMs = getSessionTtlSeconds() * 1000;
    if (Date.now() - iat > maxAgeMs) return null;

    return { login, iat };
  } catch {
    return null;
  }
}

function revokeSession(req) {
  const token = getSessionTokenFromRequest(req);
  const session = decodeSessionToken(token, { ignoreRevocation: true });
  if (!token || !session) return false;

  revokedSessions.set(token, session.iat + getSessionTtlSeconds() * 1000);
  return true;
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  if (forwardedProto === "https") return true;
  if (String(process.env.VERCEL || "") === "1") return true;
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") return true;
  return false;
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [String(current), cookieValue]);
}

function setAuthCookie(req, res, login) {
  const token = buildSessionToken(login);
  if (!token) return false;

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${getSessionTtlSeconds()}`
  ];
  if (isSecureRequest(req)) parts.push("Secure");

  appendSetCookie(res, parts.join("; "));
  return true;
}

function clearAuthCookie(req, res) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function readSession(req) {
  return decodeSessionToken(getSessionTokenFromRequest(req));
}

function buildCsrfToken(req) {
  const sessionToken = getSessionTokenFromRequest(req);
  const secret = getSessionSecret();
  if (!sessionToken || !secret) return "";
  return sign(`csrf:${sessionToken}`, secret);
}

function isCsrfValid(req, auth) {
  const method = String(req.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  if (auth?.mode !== "session") return true;

  const expected = buildCsrfToken(req);
  const provided = String(req.headers["x-csrf-token"] || "").trim();
  return Boolean(expected && provided && safeEquals(provided, expected));
}

function resolveAuthorization(req) {
  const expectedToken = getExpectedBearerToken();
  const providedToken = parseBearerToken(req.headers.authorization);

  if (expectedToken && providedToken && safeEquals(providedToken, expectedToken)) {
    return {
      authenticated: true,
      authRequired: true,
      mode: "bearer",
      login: "token"
    };
  }

  const session = readSession(req);
  if (session) {
    return {
      authenticated: true,
      authRequired: true,
      mode: "session",
      login: session.login
    };
  }

  const loginConfig = getLoginCredentials();
  const authRequired = Boolean(expectedToken || loginConfig.enabled);

  if (!authRequired) {
    if (isProductionLike()) {
      return {
        authenticated: false,
        authRequired: true,
        mode: "unconfigured",
        login: ""
      };
    }

    return {
      authenticated: true,
      authRequired: false,
      mode: "open",
      login: ""
    };
  }

  return {
    authenticated: false,
    authRequired: true,
    mode: "required",
    login: ""
  };
}

function requireBearerAuth(req, res) {
  const auth = resolveAuthorization(req);
  if (auth.authenticated) {
    if (!isCsrfValid(req, auth)) {
      res.status(403).json({ error: "Token CSRF ausente ou invalido." });
      return false;
    }
    return auth;
  }

  res.setHeader("WWW-Authenticate", "Bearer");
  const status = auth.mode === "unconfigured" ? 503 : 401;
  const message = auth.mode === "unconfigured"
    ? "Autenticacao obrigatoria nao configurada no servidor."
    : "Nao autorizado.";
  res.status(status).json({ error: message });
  return false;
}

function requireBulkConfirmation(req, res, expectedValue) {
  const provided = String(req.headers["x-confirm-bulk-operation"] || "").trim();
  if (provided === expectedValue) return true;

  res.status(400).json({ error: "Confirmacao de operacao em massa ausente." });
  return false;
}

module.exports = {
  applyCors,
  requireBearerAuth,
  requireBulkConfirmation,
  safeEquals,
  checkRateLimit,
  getClientIp,
  getLoginCredentials,
  setAuthCookie,
  clearAuthCookie,
  revokeSession,
  resolveAuthorization,
  buildCsrfToken
};
