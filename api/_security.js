const crypto = require("crypto");

const SESSION_COOKIE_NAME = "fiscalizacoes_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

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
    res.setHeader("Access-Control-Allow-Credentials", "true");
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

function decodeSessionToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

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
  const cookies = parseCookies(req);
  return decodeSessionToken(cookies[SESSION_COOKIE_NAME]);
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
    return true;
  }

  res.setHeader("WWW-Authenticate", "Bearer");
  res.status(401).json({ error: "Nao autorizado." });
  return false;
}

module.exports = {
  applyCors,
  requireBearerAuth,
  safeEquals,
  getLoginCredentials,
  setAuthCookie,
  clearAuthCookie,
  resolveAuthorization
};
