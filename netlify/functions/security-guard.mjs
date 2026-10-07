import { createHash } from "node:crypto";
import { db } from "./db.mjs";

const buckets = new Map();

function now() {
  return Date.now();
}

function cleanIp(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .slice(0, 100);
}

export function clientIp(req) {
  return cleanIp(
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    ""
  );
}

export function fingerprint(value) {
  return createHash("sha256")
    .update(String(value || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

export function rateLimit(req, {
  namespace = "default",
  limit = 10,
  windowMs = 60_000,
  identity = ""
} = {}) {
  const ip = clientIp(req) || "unknown";
  const extra = identity ? fingerprint(identity) : "";
  const key = `${namespace}:${ip}:${extra}`;
  const t = now();

  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= t) {
    bucket = {
      count: 0,
      resetAt: t + windowMs
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= t) buckets.delete(k);
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.max(
      1,
      Math.ceil((bucket.resetAt - t) / 1000)
    )
  };
}

export function rateLimitResponse(result) {
  return new Response(
    JSON.stringify({
      error: "Trop de tentatives. Réessayez dans quelques instants."
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": String(result.retryAfter)
      }
    }
  );
}

export function bodyTooLarge(req, maxBytes = 100_000) {
  const raw = req.headers.get("content-length");

  if (!raw) return false;

  const size = Number(raw);

  return Number.isFinite(size) && size > maxBytes;
}

export function sameSiteRequest(req) {
  const configured =
    process.env.SITE_PUBLIC_URL ||
    process.env.URL ||
    "";

  if (!configured) return true;

  let expected;

  try {
    expected = new URL(configured).origin;
  } catch {
    return true;
  }

  const origin = req.headers.get("origin");

  if (origin) {
    try {
      return new URL(origin).origin === expected;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");

  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }

  return true;
}

export function securityHeaders(extra = {}) {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra
  };
}

/*
 * Rate limiting mémoire :
 * première barrière anti-spam par instance serverless.
 *
 * Il ne remplace PAS un rate limiter distribué/WAF.
 * Une protection réseau supplémentaire sera ajoutée
 * lors de l'étape Netlify/edge.
 */

export async function ensureSecurityAuditTable() {
  const sql = db();

  await sql`
    CREATE TABLE IF NOT EXISTS security_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      fingerprint TEXT,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function securityEvent(
  eventType,
  identity = "",
  details = ""
) {
  try {
    await ensureSecurityAuditTable();

    const sql = db();

    await sql`
      INSERT INTO security_events(
        event_type,
        fingerprint,
        details
      )
      VALUES(
        ${String(eventType).slice(0,100)},
        ${identity ? fingerprint(identity) : null},
        ${String(details || "").slice(0,500) || null}
      )
    `;
  } catch (error) {
    console.error("securityEvent:", error);
  }
}
