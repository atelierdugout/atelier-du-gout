import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { db } from "./db.mjs";
import { createAdminSession, adminSessionCookie } from "./admin-session.mjs";
import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  securityEvent
} from "./security-guard.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

function getWebAuthnConfig(req) {
  const configuredOrigin = String(process.env.SITE_PUBLIC_URL || "").replace(/\/+$/, "");
  const origin = configuredOrigin || new URL(req.url).origin;
  const rpID = new URL(origin).hostname;

  return { origin, rpID };
}

export default async (req) => {
  if (req.method !== "POST") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }


  if (bodyTooLarge(req, 50_000)) {
    return reply({ error: "Requête trop volumineuse." }, 413);
  }

  const passkeyLimit = rateLimit(req, {
    namespace: "admin-passkey-verify",
    limit: 15,
    windowMs: 15 * 60 * 1000
  });

  if (!passkeyLimit.allowed) {
    securityEvent(
      "admin_passkey_verify_limited",
      "",
      "Trop de tentatives Passkey"
    );

    return rateLimitResponse(passkeyLimit);
  }

  try {
    const body = await req.json();
    const challengeID = String(body?.challengeID || "");
    const response = body?.response;

    if (!challengeID || !response?.id) {
      return reply({ error: "Données de connexion incomplètes." }, 400);
    }

    const sql = db();
    const { origin, rpID } = getWebAuthnConfig(req);

    const challenges = await sql`
      SELECT challenge, created_at
      FROM admin_passkey_challenges
      WHERE id = ${challengeID}
        AND purpose = 'authentication'
      LIMIT 1
    `;

    if (!challenges.length) {
      return reply({
        error: "Demande de connexion expirée ou invalide."
      }, 400);
    }

    const challenge = challenges[0];

    if (
      Date.now() - new Date(challenge.created_at).getTime() >
      10 * 60 * 1000
    ) {
      await sql`
        DELETE FROM admin_passkey_challenges
        WHERE id = ${challengeID}
      `;

      return reply({ error: "La demande de connexion a expiré." }, 400);
    }

    const rows = await sql`
      SELECT credential_id, public_key, counter, transports
      FROM admin_passkeys
      WHERE credential_id = ${response.id}
      LIMIT 1
    `;

    if (!rows.length) {
      return reply({ error: "Passkey administrateur inconnue." }, 401);
    }

    const stored = rows[0];

    const credential = {
      id: stored.credential_id,
      publicKey: new Uint8Array(
        Buffer.from(stored.public_key, "base64url")
      ),
      counter: Number(stored.counter || 0),
      transports: Array.isArray(stored.transports)
        ? stored.transports
        : []
    };

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: true
    });

    if (!verification.verified) {
      return reply({
        error: "L'authentification par passkey a échoué."
      }, 401);
    }

    await sql`
      UPDATE admin_passkeys
      SET
        counter = ${verification.authenticationInfo.newCounter},
        last_used_at = NOW()
      WHERE credential_id = ${stored.credential_id}
    `;

    await sql`
      DELETE FROM admin_passkey_challenges
      WHERE id = ${challengeID}
    `;

    const sessionToken = createAdminSession();

    return Response.json(
      {
        success: true,
        authenticated: true
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": adminSessionCookie(sessionToken)
        }
      }
    );

  } catch (error) {
    console.error("admin-passkey-login-verify:", error);

    return reply({
      error: "Impossible de vérifier la connexion par passkey."
    }, 401);
  }
};
