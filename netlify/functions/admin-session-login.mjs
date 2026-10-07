import {
  createAdminSession,
  adminSessionCookie
} from "./admin-session.mjs";

import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  clientIp,
  securityEvent
} from "./security-guard.mjs";

const reply = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });


export default async (req) => {
  if (req.method !== "POST") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  if (bodyTooLarge(req, 10_000)) {
    return reply({ error: "Requête trop volumineuse." }, 413);
  }

  const limit = rateLimit(req, {
    namespace: "admin-pin",
    limit: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!limit.allowed) {
    securityEvent(
      "admin_pin_rate_limited",
      clientIp(req),
      "Trop de tentatives PIN"
    );

    return rateLimitResponse(limit);
  }

  try {
    const body = await req.json();
    const pin = String(body?.pin || "");
    const expected = String(process.env.ADMIN_PIN || "");

    if (!expected) {
      return reply(
        { error: "ADMIN_PIN non configuré." },
        503
      );
    }

    if (!pin || pin !== expected) {
      securityEvent(
        "admin_pin_failed",
        clientIp(req),
        "PIN administrateur incorrect"
      );

      return reply(
        { error: "Code administrateur incorrect." },
        401
      );
    }

    const token = createAdminSession();

    securityEvent(
      "admin_pin_success",
      clientIp(req),
      "Connexion administrateur réussie"
    );

    return reply(
      {
        success: true,
        authenticated: true
      },
      200,
      {
        "Set-Cookie": adminSessionCookie(token)
      }
    );
  } catch (error) {
    console.error("admin-session-login:", error);

    return reply(
      { error: "Impossible d’ouvrir la session administrateur." },
      500
    );
  }
};
