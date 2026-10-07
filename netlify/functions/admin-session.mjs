import crypto from "node:crypto";

const COOKIE_NAME = "atelier_admin_session";
const SESSION_DURATION = 7 * 24 * 60 * 60;

function secret() {
  const value = String(process.env.ADMIN_SESSION_SECRET || "");

  if (!value) {
    throw new Error("ADMIN_SESSION_SECRET non configuré.");
  }

  return value;
}

function sign(payload) {
  return crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function createAdminSession() {
  const payload = Buffer.from(
    JSON.stringify({
      admin: true,
      exp: Math.floor(Date.now() / 1000) + SESSION_DURATION
    })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

function cookieSecurityAttribute() {
  return process.env.CONTEXT === "dev" ? [] : ["Secure"];
}

export function adminSessionCookie(token) {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_DURATION}`,
    "HttpOnly",
    ...cookieSecurityAttribute(),
    "SameSite=Strict"
  ].join("; ");
}

export function clearAdminSessionCookie() {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    ...cookieSecurityAttribute(),
    "SameSite=Strict"
  ].join("; ");
}

export function hasValidAdminSession(req) {
  try {
    const cookieHeader = String(req.headers.get("cookie") || "");

    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
          const index = part.indexOf("=");
          return index === -1
            ? [part, ""]
            : [part.slice(0, index), part.slice(index + 1)];
        })
    );

    const token = cookies[COOKIE_NAME];

    if (!token) return false;

    const separator = token.lastIndexOf(".");
    if (separator === -1) return false;

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = sign(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    return (
      data?.admin === true &&
      Number(data.exp) > Math.floor(Date.now() / 1000)
    );

  } catch {
    return false;
  }
}

export function hasAdminAccess(req) {
  return hasValidAdminSession(req);
}
