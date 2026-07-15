import { Storage } from "@google-cloud/storage";
import fs from "node:fs";
import { DB_PATH } from "./config.js";

// Persist the SQLite file to a Google Cloud Storage bucket so data survives
// Cloud Run restarts (its local filesystem is ephemeral). Fully disabled — a
// no-op — when ZAPP_DB_BUCKET is unset, so local dev needs no cloud at all.
const BUCKET = process.env.ZAPP_DB_BUCKET;
const OBJECT = process.env.ZAPP_DB_OBJECT || "zapp.db";

const storage = BUCKET ? new Storage() : null;
const bucket = storage ? storage.bucket(BUCKET) : null;
const gcsFile = bucket ? bucket.file(OBJECT) : null;

// Download the saved DB before the app opens it. MUST run before ./db.js loads.
export async function restoreDb() {
  if (!gcsFile) return;
  try {
    const [exists] = await gcsFile.exists();
    if (!exists) {
      console.log(`[persistence] no saved DB at gs://${BUCKET}/${OBJECT} — starting fresh`);
      return;
    }
    await gcsFile.download({ destination: DB_PATH });
    console.log(`[persistence] restored DB from gs://${BUCKET}/${OBJECT}`);
  } catch (e) {
    console.error("[persistence] restore failed:", e?.message);
  }
}

// A cheap fingerprint of the DB files so we only upload when something changed.
function dbSignature() {
  let sig = "";
  for (const p of [DB_PATH, `${DB_PATH}-wal`]) {
    try {
      const s = fs.statSync(p);
      sig += `${p}:${s.size}:${s.mtimeMs};`;
    } catch {
      /* file may not exist yet */
    }
  }
  return sig;
}

let busy = false;
let lastSig = "";

// Fold the WAL into the main file for a consistent snapshot, then upload it.
async function saveDb(db, force = false) {
  if (!gcsFile || busy) return;
  if (!force && dbSignature() === lastSig) return; // nothing changed
  busy = true;
  try {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      /* best effort — still upload what's on disk */
    }
    await bucket.upload(DB_PATH, { destination: OBJECT, resumable: false });
    lastSig = dbSignature();
  } catch (e) {
    console.error("[persistence] save failed:", e?.message);
  } finally {
    busy = false;
  }
}

// Periodically snapshot changes, and flush on shutdown so a graceful stop
// (which Cloud Run does before recycling an instance) never loses data.
export function startPersistence(db) {
  if (!gcsFile) return;
  const timer = setInterval(() => saveDb(db), 10000);
  timer.unref?.();

  let shuttingDown = false;
  const flush = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    await saveDb(db, true);
    process.exit(0);
  };
  process.on("SIGTERM", flush);
  process.on("SIGINT", flush);
  console.log(`[persistence] enabled -> gs://${BUCKET}/${OBJECT}`);
}
