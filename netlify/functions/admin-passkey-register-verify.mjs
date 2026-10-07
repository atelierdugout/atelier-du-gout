import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

const auth = (req) => hasAdminAccess(req);

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

  if (!auth(req)) {
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  try {
    const body = await req.json();
    const challengeID = String(body?.challengeID || "");
    const response = body?.response;
    const deviceName =
      String(body?.deviceName || "").trim().slice(0, 100) ||
      "Appareil administrateur";

    if (!challengeID || !response) {
      return reply({ error: "Données d'enregistrement incomplètes." }, 400);
    }

    const sql = db();
    const { origin, rpID } = getWebAuthnConfig(req);

    const challenges = await sql`
      SELECT challenge, created_at
      FROM admin_passkey_challenges
      WHERE id = ${challengeID}
        AND purpose = 'registration'
      LIMIT 1
    `;

    if (!challenges.length) {
      return reply({ error: "Demande d'enregistrement expirée ou invalide." }, 400);
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

      return reply({ error: "La demande d'enregistrement a expiré." }, 400);
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true
    });

    if (!verification.verified || !verification.registrationInfo) {
      return reply({ error: "La passkey n'a pas pu être vérifiée." }, 400);
    }

    const credential = verification.registrationInfo.credential;

    const publicKey = Buffer.from(credential.publicKey).toString("base64url");
    const transports = Array.isArray(credential.transports)
      ? credential.transports
      : [];

    await sql`
      INSERT INTO admin_passkeys
        (
          credential_id,
          public_key,
          counter,
          transports,
          device_name,
          created_at
        )
      VALUES
        (
          ${credential.id},
          ${publicKey},
          ${credential.counter},
          ${JSON.stringify(transports)}::jsonb,
          ${deviceName},
          NOW()
        )
      ON CONFLICT (credential_id)
      DO UPDATE SET
        public_key = EXCLUDED.public_key,
        counter = EXCLUDED.counter,
        transports = EXCLUDED.transports,
        device_name = EXCLUDED.device_name
    `;

    await sql`
      DELETE FROM admin_passkey_challenges
      WHERE id = ${challengeID}
    `;

    return reply({
      success: true,
      deviceName
    });

  } catch (error) {
    console.error("admin-passkey-register-verify:", error);

    return reply({
      error: "Impossible de valider l'enregistrement de la passkey."
    }, 400);
  }
};
