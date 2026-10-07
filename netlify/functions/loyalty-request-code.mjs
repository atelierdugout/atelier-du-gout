import { db } from './db.mjs';
import { sendLoginCode, norm } from './loyalty.mjs';

import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  securityEvent
} from './security-guard.mjs';

const reply = (x, s = 200) =>
  Response.json(x, {
    status: s,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });


export const config = {
  path: "/.netlify/functions/loyalty-request-code",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["domain", "ip"]
  }
};

export default async req => {
  if (req.method !== 'POST') {
    return reply({ error: 'Méthode non autorisée.' }, 405);
  }

  if (bodyTooLarge(req, 10_000)) {
    return reply({ error: 'Requête trop volumineuse.' }, 413);
  }

  try {
    const b = await req.json();
    const email = norm(b.email);

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return reply({ error: 'Adresse email invalide.' }, 400);
    }

    const limit = rateLimit(req, {
      namespace: 'loyalty-code-request',
      limit: 3,
      windowMs: 15 * 60 * 1000,
      identity: email
    });

    if (!limit.allowed) {
      securityEvent(
        'loyalty_code_request_limited',
        email,
        'Trop de demandes de code fidélité'
      );

      return rateLimitResponse(limit);
    }

    await sendLoginCode(db(), email);

    return reply({
      ok: true,
      message: 'Code envoyé par email.'
    });
  } catch (e) {
    console.error(e);

    return reply({
      error: 'Impossible d’envoyer le code.'
    }, 500);
  }
};
