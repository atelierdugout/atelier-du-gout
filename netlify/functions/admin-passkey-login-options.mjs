import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db } from "./db.mjs";
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


  if (bodyTooLarge(req, 10_000)) {
    return reply({ error: "Requête trop volumineuse." }, 413);
  }

  const passkeyLimit = rateLimit(req, {
    namespace: "admin-passkey-options",
    limit: 15,
    windowMs: 15 * 60 * 1000
  });

  if (!passkeyLimit.allowed) {
    securityEvent(
      "admin_passkey_options_limited",
      "",
      "Trop de tentatives Passkey"
    );

    return rateLimitResponse(passkeyLimit);
  }

  try {
    const sql = db();
    const { rpID } = getWebAuthnConfig(req);

    const passkeys = await sql`
      SELECT credential_id, transports
      FROM admin_passkeys
      ORDER BY id ASC
    `;

    if (!passkeys.length) {
      return reply({
        error: "Aucune passkey administrateur n'est encore enregistrée."
      }, 404);
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: Array.isArray(passkey.transports)
          ? passkey.transports
          : []
      }))
    });

    const challengeID = crypto.randomUUID();

    await sql`
      DELETE FROM admin_passkey_challenges
      WHERE created_at < NOW() - INTERVAL '10 minutes'
    `;

    await sql`
      INSERT INTO admin_passkey_challenges
        (id, challenge, purpose, created_at)
      VALUES
        (${challengeID}, ${options.challenge}, 'authentication', NOW())
    `;

    return reply({
      challengeID,
      options
    });

  } catch (error) {
    console.error("admin-passkey-login-options:", error);

    return reply({
      error: "Impossible de préparer la connexion par passkey."
    }, 500);
  }
};
