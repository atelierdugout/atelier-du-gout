export default async () => {
  const envNames = Object.keys(process.env).sort();
  const matchingAdmin = envNames.filter(k => /ADMIN|PIN/i.test(k));
  const matchingDb = envNames.filter(k => /DATABASE|NEON/i.test(k));
  const matchingMollie = envNames.filter(k => /MOLLIE/i.test(k));
  const adminValue = process.env.ADMIN_PIN;

  return Response.json({
    ok: true,
    adminPin: {
      hasExactKey: Object.prototype.hasOwnProperty.call(process.env, 'ADMIN_PIN'),
      hasNonEmptyValue: typeof adminValue === 'string' && adminValue.length > 0,
      valueLength: typeof adminValue === 'string' ? adminValue.length : 0,
      matchingVariableNames: matchingAdmin
    },
    database: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      matchingVariableNames: matchingDb
    },
    mollie: {
      hasApiKey: Boolean(process.env.MOLLIE_API_KEY),
      matchingVariableNames: matchingMollie
    },
    netlify: {
      context: process.env.CONTEXT || null,
      siteName: process.env.SITE_NAME || null,
      deployIdPresent: Boolean(process.env.DEPLOY_ID)
    },
    note: 'Aucune valeur secrète n’est affichée.'
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
};
