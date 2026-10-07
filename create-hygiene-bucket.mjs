import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes du terminal.");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: buckets, error: listError } =
  await supabase.storage.listBuckets();

if (listError) throw listError;

if (buckets.some(b => b.name === "hygiene-evidence")) {
  console.log("OK : bucket hygiene-evidence existe déjà.");
  process.exit(0);
}

const { error } = await supabase.storage.createBucket(
  "hygiene-evidence",
  {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp"
    ]
  }
);

if (error) throw error;

console.log("OK : bucket privé hygiene-evidence créé.");
