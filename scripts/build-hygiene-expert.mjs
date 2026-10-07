import fs from "fs";

const source =
  JSON.parse(fs.readFileSync("netlify/data/supplier-products.json", "utf8"));

const template =
  fs.readFileSync("netlify/data/hygiene-expert/template.csv", "utf8")
    .trim();

const headers = template.split(";");

function clean(value = "") {
  return String(value)
    .replace(/;/g, ",")
    .replace(/\r?\n/g, " ")
    .trim();
}

function has(name, words) {
  return words.some(word => name.includes(word));
}

function classify(product) {
  const n = product.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  // CHARCUTERIES
  if (has(n, [
    "JAMBON", "PORCHETTA", "COPPA", "MORTADELLE",
    "SPECK", "FINOCCHIONA", "CHORIZO",
    "LARDON", "POITRINE FUMEE"
  ])) {
    return ["Charcuteries", "Charcuteries"];
  }

  // VIANDES
  if (has(n, [
    "POULET", "CANARD", "BOEUF", "PALERON",
    "PORC", "SAUCISSE", "FARCE", "VIANDE HACHEE"
  ])) {
    if (has(n, ["POULET"]))
      return ["Viandes", "Volaille"];

    if (has(n, ["CANARD"]))
      return ["Viandes", "Canard"];

    if (has(n, ["BOEUF", "PALERON", "VIANDE HACHEE"]))
      return ["Viandes", "Boeuf"];

    return ["Viandes", "Porc"];
  }

  // POISSONS / FRUITS DE MER
  if (has(n, [
    "SAUMON", "TRUITE", "THON", "CRABE", "SURIMI",
    "CREVET", "CALAMAR", "ENCORNET", "MERLU",
    "ANCHOIS", "FRUITS DE MER", "OEUFS DE LOMPE"
  ])) {
    if (has(n, [
      "CREVET", "CRABE", "CALAMAR",
      "ENCORNET", "FRUITS DE MER"
    ])) {
      return ["Poissons & fruits de mer", "Fruits de mer"];
    }

    return ["Poissons & fruits de mer", "Poissons"];
  }

  // OEUFS
  if (has(n, ["OEUF", "OEUFS", "ŒUF", "ŒUFS"])) {
    return ["Produits laitiers & oeufs", "Oeufs"];
  }

  // FROMAGES
  if (has(n, [
    "MOZZA", "MOZZARELLA", "BURRATA", "STRACCIATELLA",
    "PARMIGIANO", "PARMESAN", "PROVOLONE", "ASIAGO",
    "FETA", "EMMENTAL", "COMTE", "CHEDDAR",
    "CAMEMBERT", "FROMAGE", "ROCAMADOUR",
    "MARCELLIN", "HALLOUMI", "COTTAGE CHEESE"
  ])) {
    return ["Produits laitiers & oeufs", "Fromages"];
  }

  // CREMERIE
  if (has(n, [
    "CREME", "MASCARPONE", "BEURRE",
    "YAOURT", "LAIT"
  ])) {
    return ["Produits laitiers & oeufs", "Crèmerie"];
  }

  // HERBES FRAICHES
  if (has(n, [
    "BASILIC", "MENTHE", "PERSIL",
    "CIBOULETTE", "ANETH"
  ])) {
    return ["Fruits & légumes", "Herbes fraîches"];
  }

  // SALADES
  if (has(n, [
    "SALADE", "ROQUETTE", "MACHE",
    "ROMAINE", "JEUNES POUSSES",
    "MELANGE DE SAISON"
  ])) {
    return ["Fruits & légumes", "Salades"];
  }

  // LEGUMES
  if (has(n, [
    "TOMATE", "COURGETTE", "AUBERGINE", "CONCOMBRE",
    "POIVRON", "OIGNON", "ECHALOTE", "AIL",
    "CAROTTE", "CHOU-FLEUR", "PATATE DOUCE",
    "POMME DE TERRE", "CHAMPIGNON", "AVOCAT"
  ])) {
    return ["Fruits & légumes", "Légumes"];
  }

  // LEGUMES / CONSERVES
  if (has(n, [
    "MAIS", "POIS CHICHES", "PETITS POIS",
    "FEVES", "OLIVES", "CORNICHONS",
    "ANTIPASTO", "DELIZIA ASPERGES"
  ])) {
    return ["Épicerie", "Légumes & conserves"];
  }

  // FRUITS
  if (has(n, [
    "CITRON", "KIWI", "MANGUE", "PUREE DE FRUIT", "PASTEQUE",
    "MELON", "BANANE", "ABRICOT",
    "PRUNE", "POMME"
  ])) {
    return ["Fruits & légumes", "Fruits"];
  }

  // PATES / RIZ / FECULENTS
  if (has(n, [
    "GNOCCHI", "PAPPARDELLE", "LASAGNE",
    "TAGLIATELLE", "RIZ", "COUSCOUS", "POLENTA"
  ])) {
    return ["Pâtes riz & féculents", "Pâtes et féculents"];
  }

  // BOULANGERIE
  if (has(n, [
    "PAIN", "BAGUETTE", "GRISSINI",
    "TARALLI", "TORTILLA", "FOCACCIA"
  ])) {
    return ["Boulangerie", "Pains & assimilés"];
  }

  // PATES A TARTE
  if (has(n, ["PATE FEUILLETEE", "PATE BRISEE"])) {
    return ["Desserts & pâtisserie", "Pâtes de base"];
  }

  // DESSERTS
  if (has(n, [
    "CANNOLI", "TROTTOLE", "CHOCOLAT",
    "CACAO", "PANNA COTTA", "GLACE"
  ])) {
    return ["Desserts & pâtisserie", "Desserts"];
  }

  // PATISSERIE / INGREDIENTS
  if (has(n, [
    "FARINE", "LEVURE", "CASSONADE",
    "SUCRE", "AROME VANILLE", "PISTACHE"
  ])) {
    return ["Épicerie", "Pâtisserie"];
  }

  // HUILES
  if (has(n, ["HUILE"])) {
    return ["Épicerie", "Huiles"];
  }

  // SAUCES / CONDIMENTS
  if (has(n, [
    "PESTO", "SAUCE", "MAYONNAISE",
    "KETCHUP", "MOUTARDE", "TAHINI",
    "GUACAMOLE", "CREME AUX OLIVES"
  ])) {
    return ["Épicerie", "Sauces & condiments"];
  }

  // EPICES / ASSAISONNEMENTS
  if (has(n, [
    "SEL", "POIVRE", "BAIES DE GENIEVRE",
    "MELANGE POUR PAELLA", "ASSAISONNEMENT"
  ])) {
    return ["Épicerie", "Épices & assaisonnements"];
  }

  // MIEL
  if (has(n, ["MIEL"])) {
    return ["Épicerie", "Sucres & produits sucrants"];
  }

  // CAFE
  if (has(n, ["CAFE"])) {
    return ["Boissons", "Café"];
  }

  // SIROPS
  if (has(n, ["SIROP"])) {
    return ["Boissons", "Sirops"];
  }

  // BOISSONS SANS ALCOOL
  if (has(n, [
    "EAU", "EVIAN", "BADOIT", "JUS",
    "CRANBERRY", "GASSOSA", "MANDARINATA",
    "COLA", "ROSE & LEMON",
    "THE CITRON", "THE PECHE", "THE FLEUR"
  ])) {
    return ["Boissons", "Sans alcool"];
  }

  // ALCOOLS
  if (has(n, [
    "BIERE", "KRONENBOURG", "LEFFE",
    "VIN ", "CHIANTI", "BARBERA", "REGOLO",
    "RHUM", "GIN", "TUTIAC", "ODAIGA",
    "BIZUTS", "CEP'RESIST", "ORIGINES"
  ])) {
    return ["Boissons", "Alcools"];
  }

  return ["Épicerie", "À contrôler"];
}

const rows = source.products.map(product => {
  const isLeclerc =
    product.supplier === "E.LECLERC SAINT-JEAN-D'ANGELY";

  const [family, subfamily] = classify(product);

  const values = Object.fromEntries(
    headers.map(header => [header, ""])
  );

  values["Famille"] = family;
  values["Sous-famille"] = subfamily;
  values["Désignation"] = clean(product.name);
  values["Code article"] =
    isLeclerc ? "" : clean(product.reference);
  values["Code EAN"] = clean(product.ean || "");
  values["Fournisseur"] = clean(product.supplier);
  values["Conditionnement"] = clean(product.packaging || "");

  return headers.map(header => clean(values[header])).join(";");
});

fs.writeFileSync(
  "netlify/data/hygiene-expert/produits-import.csv",
  [template, ...rows].join("\n") + "\n"
);

const counts = {};

for (const product of source.products) {
  const [family] = classify(product);
  counts[family] = (counts[family] || 0) + 1;
}

console.log("Produits exportés :", rows.length);
console.log("Répartition :");

for (const [family, count] of Object.entries(counts)) {
  console.log("-", family, ":", count);
}
