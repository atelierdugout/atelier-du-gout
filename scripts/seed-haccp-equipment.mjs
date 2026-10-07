import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const equipment = [
  ["Grand réfrigérateur", "Froid positif"],
  ["Frigo / plan de travail réfrigéré 3 portes", "Froid positif"],
  ["Grande vitrine réfrigérée comptoir", "Froid positif"],
  ["Petite vitrine réfrigérée 98L", "Froid positif"],
  ["Congélateur", "Froid négatif"]
];

for (const [name, category] of equipment) {
  const existing = await sql`
    SELECT id
    FROM haccp_equipment
    WHERE LOWER(name) = LOWER(${name})
    LIMIT 1
  `;

  if (!existing.length) {
    await sql`
      INSERT INTO haccp_equipment (
        name,
        category,
        active
      )
      VALUES (
        ${name},
        ${category},
        true
      )
    `;
    console.log("Ajouté :", name);
  } else {
    console.log("Déjà présent :", name);
  }
}

const rows = await sql`
  SELECT id, name, category, active
  FROM haccp_equipment
  ORDER BY id
`;

console.table(rows);
