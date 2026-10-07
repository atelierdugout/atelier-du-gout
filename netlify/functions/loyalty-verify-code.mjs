import { randomBytes } from 'node:crypto';
import { db } from './db.mjs';
import {
  ensureLoyalty,
  norm,
  hash
} from './loyalty.mjs';

import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  securityEvent
} from './security-guard.mjs';

import { loyaltyCookie } from './loyalty-session-cookie.mjs';

const reply = (x, s = 200) =>
  Response.json(x, {
    status: s,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

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
    const code = String(b.code || '').trim();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return reply({ error: 'Adresse email invalide.' }, 400);
    }

    if (!/^\d{6}$/.test(code)) {
      return reply({ error: 'Code incorrect ou expiré.' }, 401);
    }

    const limit = rateLimit(req, {
      namespace: 'loyalty-code-verify',
      limit: 8,
      windowMs: 15 * 60 * 1000,
      identity: email
    });

    if (!limit.allowed) {
      securityEvent(
        'loyalty_code_verify_limited',
        email,
        'Trop de tentatives de code fidélité'
      );

      return rateLimitResponse(limit);
    }

    const sql = db();

    await ensureLoyalty(sql);

    const c = (
      await sql`
        SELECT *
        FROM loyalty_login_codes
        WHERE email=${email}
          AND code_hash=${hash(code)}
          AND used_at IS NULL
          AND expires_at>NOW()
        ORDER BY id DESC
        LIMIT 1
      `
    )[0];

    if (!c) {
      return reply({
        error: 'Code incorrect ou expiré.'
      }, 401);
    }

    await sql`
      UPDATE loyalty_login_codes
      SET used_at=NOW()
      WHERE id=${c.id}
    `;

    let a = (
      await sql`
        SELECT *
        FROM loyalty_accounts
        WHERE email=${email}
        LIMIT 1
      `
    )[0];

    if (!a) {
      [a] = await sql`
        INSERT INTO loyalty_accounts(email,points)
        VALUES(${email},50)
        RETURNING *
      `;

      await sql`
        INSERT INTO loyalty_ledger(
          account_id,
          event_type,
          points,
          note
        )
        VALUES(
          ${a.id},
          'welcome',
          50,
          'Bienvenue fidélité'
        )
      `;
    }

    const token = randomBytes(32).toString('hex');

    await sql`
      INSERT INTO loyalty_sessions(
        account_id,
        token_hash,
        expires_at
      )
      VALUES(
        ${a.id},
        ${hash(token)},
        NOW()+INTERVAL '30 days'
      )
    `;

    return Response.json({
      ok: true
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Set-Cookie': loyaltyCookie(token)
      }
    });

  } catch (e) {
    console.error(e);

    return reply({
      error: 'Connexion impossible.'
    }, 500);
  }
};
