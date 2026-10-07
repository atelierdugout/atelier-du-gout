const API_BASE = "https://api.hygiene-expert.com";
const SITE_ID = 15651;

export async function getHygieneExpertMphSession() {
  const login = process.env.HYGIENE_EXPERT_USERNAME;
  const password = process.env.HYGIENE_EXPERT_PASSWORD;

  if (!login || !password) {
    throw new Error(
      "Identifiants Hygiène Expert non configurés."
    );
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

  if (
    !cntco ||
    !String(cntco).startsWith("cntco-")
  ) {
    throw new Error("Session CNTCO introuvable.");
  }

  const redirectResponse = await fetch(
    `${API_BASE}/authentication/redirect/company/${SITE_ID}/mph`,
    {
      method: "GET",
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

  if (
    !mphsu ||
    !String(mphsu).startsWith("mphsu-")
  ) {
    throw new Error("Session MPH introuvable.");
  }

  return mphsu;
}

export { API_BASE, SITE_ID };
