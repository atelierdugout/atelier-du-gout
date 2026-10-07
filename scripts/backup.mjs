import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BACKUP_ROOT = path.resolve(ROOT, "../atelier-du-gout-backups");

function readEnvFile() {
  const text = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  const result = {};

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const pos = line.indexOf("=");
    if (pos < 1) continue;

    result[line.slice(0, pos).trim()] =
      line.slice(pos + 1).trim();
  }

  return result;
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
}

function writeJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2) + "\n",
    { mode: 0o600 }
  );
}

const localEnv = readEnvFile();

const databaseUrl =
  String(process.env.BACKUP_DATABASE_URL || "").trim();

if (!databaseUrl.startsWith("postgres")) {
  throw new Error(
    "BACKUP_DATABASE_URL absente. La sauvegarde est annulée."
  );
}

const supabaseUrl = localEnv.SUPABASE_URL;
const supabaseKey = localEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Configuration Supabase absente. La sauvegarde est annulée."
  );
}

const backupDir = path.join(
  BACKUP_ROOT,
  `complete-${timestamp()}`
);

const neonDir = path.join(backupDir, "neon");
const supabaseDir = path.join(backupDir, "supabase");
const storageDir = path.join(supabaseDir, "storage");
const codeDir = path.join(backupDir, "code");

for (const dir of [
  backupDir,
  neonDir,
  supabaseDir,
  storageDir,
  codeDir
]) {
  fs.mkdirSync(dir, {
    recursive: true,
    mode: 0o700
  });
}

const manifest = {
  created_at: new Date().toISOString(),
  format_version: 1,
  status: "IN_PROGRESS",
  neon: {},
  supabase: {},
  code: {}
};

writeJson(path.join(backupDir, "manifest.json"), manifest);

/* ---------- NEON ---------- */

console.log("Sauvegarde Neon...");

const sql = neon(databaseUrl);

const neonTablesResult = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`;

const neonTables = neonTablesResult.map(r => r.table_name);

manifest.neon.tables = {};

for (const table of neonTables) {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error(`Nom de table inattendu : ${table}`);
  }

  const rows = await sql.query(
    `SELECT * FROM public."${table}"`
  );

  writeJson(
    path.join(neonDir, `${table}.json`),
    rows
  );

  manifest.neon.tables[table] = rows.length;

  console.log(
    `  ${table}: ${rows.length} ligne(s)`
  );
}

/* ---------- SUPABASE TABLES ---------- */

console.log("\nSauvegarde Supabase...");

const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const supabaseTables = [
  "products",
  "stock_events",
  "site_settings",
  "admin_passkeys",
  "admin_passkey_challenges"
];

manifest.supabase.tables = {};

for (const table of supabaseTables) {
  const allRows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `Supabase ${table}: ${error.message}`
      );
    }

    allRows.push(...data);

    if (data.length < pageSize) break;

    from += pageSize;
  }

  writeJson(
    path.join(supabaseDir, `${table}.json`),
    allRows
  );

  manifest.supabase.tables[table] = allRows.length;

  console.log(
    `  ${table}: ${allRows.length} ligne(s)`
  );
}

/* ---------- SUPABASE STORAGE ---------- */

console.log("\nSauvegarde Storage...");

const bucket = "product-images";
const bucketDir = path.join(storageDir, bucket);

fs.mkdirSync(bucketDir, {
  recursive: true,
  mode: 0o700
});

async function backupStorageFolder(prefix = "") {
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } =
      await supabase.storage
        .from(bucket)
        .list(prefix, {
          limit,
          offset,
          sortBy: {
            column: "name",
            order: "asc"
          }
        });

    if (error) {
      throw new Error(
        `Storage ${prefix || "/"}: ${error.message}`
      );
    }

    if (!data.length) break;

    for (const item of data) {
      const remotePath = prefix
        ? `${prefix}/${item.name}`
        : item.name;

      if (item.id === null) {
        await backupStorageFolder(remotePath);
        continue;
      }

      const { data: blob, error: downloadError } =
        await supabase.storage
          .from(bucket)
          .download(remotePath);

      if (downloadError) {
        throw new Error(
          `Téléchargement ${remotePath}: ${downloadError.message}`
        );
      }

      const destination =
        path.join(bucketDir, remotePath);

      fs.mkdirSync(
        path.dirname(destination),
        { recursive: true }
      );

      const buffer = Buffer.from(
        await blob.arrayBuffer()
      );

      fs.writeFileSync(destination, buffer);

      manifest.supabase.storage_files =
        (manifest.supabase.storage_files || 0) + 1;

      console.log(`  ${remotePath}`);
    }

    if (data.length < limit) break;

    offset += limit;
  }
}

await backupStorageFolder();

/* ---------- CODE ---------- */

console.log("\nSauvegarde du code...");

execFileSync(
  "/usr/bin/rsync",
  [
    "-a",
    "--exclude=.git",
    "--exclude=.netlify",
    "--exclude=node_modules",
    "--exclude=.env",
    "--exclude=.env.*",
    `${ROOT}/`,
    `${codeDir}/`
  ],
  { stdio: "inherit" }
);

manifest.code.copied = true;

/* ---------- FINALISATION ---------- */

manifest.status = "COMPLETE";
manifest.completed_at = new Date().toISOString();

writeJson(
  path.join(backupDir, "manifest.json"),
  manifest
);

console.log("\n================================");
console.log("SAUVEGARDE COMPLÈTE");
console.log("================================");
console.log(backupDir);
console.log(`Tables Neon : ${neonTables.length}`);
console.log(
  `Fichiers Storage : ${manifest.supabase.storage_files || 0}`
);
console.log("Secrets .env copiés : NON");

/* ---------- INTÉGRITÉ SHA-256 ---------- */

console.log("\nContrôle d'intégrité...");

const checksumFile = path.join(
  backupDir,
  "SHA256SUMS.txt"
);

const checksumOutput = execFileSync(
  "/bin/zsh",
  [
    "-c",
    `
      cd "$1" || exit 1
      /usr/bin/find . -type f \
        ! -name 'SHA256SUMS.txt' \
        -print0 \
      | /usr/bin/sort -z \
      | /usr/bin/xargs -0 /usr/bin/shasum -a 256
    `,
    "backup-checksum",
    backupDir
  ],
  {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  }
);

fs.writeFileSync(
  checksumFile,
  checksumOutput,
  { mode: 0o600 }
);

execFileSync(
  "/bin/zsh",
  [
    "-c",
    `
      cd "$1" || exit 1
      /usr/bin/shasum -a 256 -c SHA256SUMS.txt >/dev/null
    `,
    "backup-verify",
    backupDir
  ],
  { stdio: "inherit" }
);

console.log("Intégrité locale : OK");

/* ---------- COPIE ICLOUD ---------- */

console.log("\nCopie vers iCloud Drive...");

const home = process.env.HOME;

if (!home) {
  throw new Error("HOME absent.");
}

const iCloudRoot = path.join(
  home,
  "Library",
  "Mobile Documents",
  "com~apple~CloudDocs"
);

if (!fs.existsSync(iCloudRoot)) {
  throw new Error(
    "iCloud Drive n'est pas accessible."
  );
}

const iCloudBackupRoot = path.join(
  iCloudRoot,
  "L Atelier du Gout",
  "Sauvegardes Boutique"
);

fs.mkdirSync(
  iCloudBackupRoot,
  { recursive: true }
);

const iCloudBackupDir = path.join(
  iCloudBackupRoot,
  path.basename(backupDir)
);

execFileSync(
  "/usr/bin/rsync",
  [
    "-a",
    `${backupDir}/`,
    `${iCloudBackupDir}/`
  ],
  { stdio: "inherit" }
);

execFileSync(
  "/bin/zsh",
  [
    "-c",
    `
      cd "$1" || exit 1
      /usr/bin/shasum -a 256 -c SHA256SUMS.txt >/dev/null
    `,
    "icloud-verify",
    iCloudBackupDir
  ],
  { stdio: "inherit" }
);

console.log("Intégrité iCloud : OK");

console.log("\n================================");
console.log("SAUVEGARDE SÉCURISÉE : OK");
console.log("================================");
console.log(`Locale : ${backupDir}`);
console.log(`iCloud : ${iCloudBackupDir}`);
