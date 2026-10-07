import { generateRegistrationOptions } from "@simplewebauthn/server";
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
    const sql = db();
    const { rpID } = getWebAuthnConfig(req);

    const existing = await sql`
      SELECT credential_id, transports
      FROM admin_passkeys
      ORDER BY id ASC
    `;

    const options = await generateRegistrationOptions({
      rpName: "L'Atelier du Goût",
      rpID,
      userName: "administrateur",
      userDisplayName: "Administration L'Atelier du Goût",
      userID: new TextEncoder().encode("atelier-du-gout-admin"),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      },
      preferredAuthenticatorType: "localDevice",
      excludeCredentials: existing.map((credential) => ({
        id: credential.credential_id,
        transports: Array.isArray(credential.transports)
          ? credential.transports
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
        (${challengeID}, ${options.challenge}, 'registration', NOW())
    `;

    return reply({
      challengeID,
      options
    });

  } catch (error) {
    console.error("admin-passkey-register-options:", error);
    return reply({
      error: "Impossible de préparer l'enregistrement de la passkey."
    }, 500);
  }
};
