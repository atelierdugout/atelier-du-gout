export const LOYALTY_COOKIE = 'atelier_loyalty_session';

function cookieParts(value, maxAge) {
  const parts = [
    `${LOYALTY_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict'
  ];

  // localhost/netlify dev fonctionne en HTTP.
  // En production, le cookie reste obligatoirement Secure.
  if (process.env.CONTEXT !== 'dev') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function loyaltyCookie(token) {
  return cookieParts(
    encodeURIComponent(token),
    2592000
  );
}

export function clearLoyaltyCookie() {
  return cookieParts('', 0);
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';

  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;

    const key = part.slice(0, i).trim();

    if (key === name) {
      try {
        return decodeURIComponent(
          part.slice(i + 1).trim()
        );
      } catch {
        return '';
      }
    }
  }

  return '';
}

export function loyaltyTokenFromRequest(req, body = {}) {
  /*
   * Cookie = méthode normale.
   * body.token = compatibilité temporaire avec les clients
   * déjà connectés avant la migration.
   */
  return (
    readCookie(req, LOYALTY_COOKIE) ||
    String(body?.token || '').trim()
  );
}
