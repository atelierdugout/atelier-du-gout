const token = process.env.HYGIENE_EXPERT_HACCP_TOKEN;

if (!token) {
  console.log("TOKEN ABSENT");
  process.exit(1);
}

console.log("TOKEN OK — longueur :", token.length);
