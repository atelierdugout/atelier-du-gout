import { hasAdminAccess } from "./admin-session.mjs";

const API_BASE = "https://api.hygiene-expert.com";
const SITE_ID = 15651;

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

async function getMphSession() {
  const login = process.env.HYGIENE_EXPERT_USERNAME;
  const password = process.env.HYGIENE_EXPERT_PASSWORD;

  if (!login || !password) {
    throw new Error("Identifiants Hygiène Expert non configurés.");
  }

  const loginResponse = await fetch(
    `${API_BASE}/authentication/user`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "cnt",
        login,
        password
      })
    }
  );

  if (!loginResponse.ok) {
    throw new Error(
      `Connexion Hygiène Expert refusée (${loginResponse.status}).`
    );
  }

  const loginData = await loginResponse.json();

  const cntco =
    loginData?.token ||
    loginData?.data?.token;

  if (!cntco || !String(cntco).startsWith("cntco-")) {
    throw new Error("Session CNTCO introuvable.");
  }

  const redirectResponse = await fetch(
    `${API_BASE}/authentication/redirect/company/${SITE_ID}/mph`,
    {
      headers: {
        Accept: "application/json",
        Authorization: cntco
      }
    }
  );

  if (!redirectResponse.ok) {
    throw new Error(
      `Ouverture MPH refusée (${redirectResponse.status}).`
    );
  }

  const redirectData = await redirectResponse.json();

  const mphsu = redirectData?.token;

  if (!mphsu || !String(mphsu).startsWith("mphsu-")) {
    throw new Error("Session MPH introuvable.");
  }

  return mphsu;
}

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({ error: "Accès administrateur refusé." }, 401);
  }

  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const mphsu = await getMphSession();

    const testResponse = await fetch(
      `${API_BASE}/MPH/init-loading`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: mphsu
        }
      }
    );

    const text = await testResponse.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;

      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {}
      }
    } catch {}

    return reply({
      ok: testResponse.ok,
      mphAuthenticated: true,
      mphStatus: testResponse.status,
      responseType: Array.isArray(data)
        ? "array"
        : data && typeof data === "object"
          ? "object"
          : typeof data,
      itemCount: Array.isArray(data)
        ? data.length
        : null,
      responseKeys:
        data && typeof data === "object" && !Array.isArray(data)
          ? Object.keys(data)
          : [],
      rawDiagnostic: {
        contentType: testResponse.headers.get("content-type"),
        rawLength: text.length,
        firstChar: text.length ? text[0] : null,
        lastChar: text.length ? text[text.length - 1] : null,
        parsedStringLength:
          typeof data === "string" ? data.length : null,
        formatHints:
          typeof data === "string"
            ? {
                startsWithBrace: data.trim().startsWith("{"),
                startsWithBracket: data.trim().startsWith("["),
                containsEquipment:
                  /equipment/i.test(data),
                containsTemperature:
                  /temperature/i.test(data),
                containsStaff:
                  /staff/i.test(data),
                containsPeriod:
                  /period/i.test(data),
                braceCount:
                  (data.match(/\{/g) || []).length,
                bracketCount:
                  (data.match(/\[/g) || []).length
              }
            : null
      },
      topLevelStructure:
        data && typeof data === "object"
          ? Object.fromEntries(
              Object.entries(data).map(([key, value]) => [
                key,
                Array.isArray(value)
                  ? {
                      type: "array",
                      count: value.length,
                      itemKeys:
                        value[0] &&
                        typeof value[0] === "object"
                          ? Object.keys(value[0])
                          : []
                    }
                  : value && typeof value === "object"
                    ? {
                        type: "object",
                        keys: Object.keys(value)
                      }
                    : {
                        type: typeof value
                      }
              ])
            )
          : {}
    });

  } catch (error) {
    console.error(
      "Hygiène Expert MPH test:",
      error?.message || error
    );

    return reply({
      ok: false,
      error: error?.message || "Erreur Hygiène Expert."
    }, 502);
  }
};
