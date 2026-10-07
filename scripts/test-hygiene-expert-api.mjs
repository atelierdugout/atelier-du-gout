const token = process.env.HYGIENE_EXPERT_HACCP_TOKEN;

if (!token) {
  console.error("TOKEN HACCP absent.");
  process.exit(1);
}

const url =
  "https://api.hygiene-expert.com/stats/haccp/settings/token";

const methods = [
  {
    name: "Bearer",
    headers: {
      Authorization: `Bearer ${token}`
    }
  },
  {
    name: "X-API-Key",
    headers: {
      "X-API-Key": token
    }
  },
  {
    name: "Token header",
    headers: {
      token: token
    }
  }
];

for (const test of methods) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...test.headers
      }
    });

    const contentType =
      response.headers.get("content-type") || "";

    const body = await response.text();

    console.log("\n---", test.name, "---");
    console.log("HTTP:", response.status);
    console.log("Content-Type:", contentType);

    // Ne jamais afficher une réponse susceptible
    // de contenir le token.
    console.log(
      "Réponse reçue:",
      body.length ? `${body.length} caractères` : "vide"
    );

  } catch (error) {
    console.log("\n---", test.name, "---");
    console.log("ERREUR:", error.message);
  }
}
