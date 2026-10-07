import {
  clearLoyaltyCookie,
  loyaltyTokenFromRequest
} from './loyalty-session-cookie.mjs';

import { db } from './db.mjs';
import { hash } from './loyalty.mjs';

export default async req => {
  if (req.method !== 'POST') {
    return Response.json(
      { error: 'Méthode non autorisée.' },
      { status: 405 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = loyaltyTokenFromRequest(req, body);

    /*
     * Invalidation de la session côté serveur.
     * Compatibilité incluse avec un ancien token localStorage.
     */
    if (token) {
      const sql = db();

      await sql`
        DELETE FROM loyalty_sessions
        WHERE token_hash=${hash(token)}
      `;
    }

    return Response.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': clearLoyaltyCookie()
        }
      }
    );

  } catch (error) {
    console.error('loyalty-logout:', error);

    /*
     * Même si la suppression DB échoue, on détruit
     * le cookie navigateur.
     */
    return Response.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': clearLoyaltyCookie()
        }
      }
    );
  }
};
