import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "_site");

const publicRootFiles = [
  "_headers",
  "analytics.js",
  "privacy-consent.js",
  "app.js",
  "boissons.html",
  "cadeau-retour.html",
  "cadeaux.html",
  "cgv.html",
  "coffrets.html",
  "compte.html",
  "confidentialite.html",
  "epicerie.html",
  "faq.html",
  "food-1.jpg",
  "food-2.jpg",
  "food-3.jpg",
  "food-4.jpg",
  "gifts.js",
  "googlefbbe71a637e9be64.html",
  "hero-planche.jpg",
  "index.html",
  "livraison.html",
  "manger.html",
  "manifest.webmanifest",
  "mentions-legales.html",
  "minargent-coco.jpg",
  "minargent-duo.jpg",
  "minargent-valton.jpg",
  "minargent.html",
  "mobile-nav.js",
  "paiement-retour.html",
  "pasta-1.jpg",
  "pasta-2.jpg",
  "planche.jpg",
  "products.json",
  "public-ui-2026.css",
  "reservation.html",
  "reservation.js",
  "robots.txt",
  "sitemap.xml",
  "style.css",
  "sw.js",
  "wine-1.jpg",
  "wine-2.jpg",
  "wine-3.jpg"
];

function forbidden(name) {
  return (
    name.includes(".before-") ||
    name.includes(".stable")
  );
}

function copyFile(relative) {
  const src = path.join(ROOT, relative);
  const dest = path.join(OUT, relative);

  if (!fs.existsSync(src)) {
    throw new Error("Fichier public absent : " + relative);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyAdmin(dir = "admin") {
  const absolute = path.join(ROOT, dir);

  for (const entry of fs.readdirSync(absolute, {
    withFileTypes: true
  })) {
    if (forbidden(entry.name)) continue;

    const relative = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      copyAdmin(relative);
    } else if (entry.isFile()) {
      copyFile(relative);
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const file of publicRootFiles) {
  copyFile(file);
}


for (const file of publicRootFiles) {
  if (!file.endsWith(".html")) continue;

  if (
    file === "googlefbbe71a637e9be64.html"
  ) continue;

  const outputFile = path.join(OUT, file);

  if (!fs.existsSync(outputFile)) continue;

  let html = fs.readFileSync(outputFile, "utf8");

  if (
    !html.includes('src="/privacy-consent.js"') &&
    html.includes("</body>")
  ) {
    html = html.replace(
      "</body>",
      '<script src="/privacy-consent.js"></script>\n</body>'
    );

    fs.writeFileSync(outputFile, html);
  }
}

copyAdmin();

console.log("Build public créé :", OUT);
