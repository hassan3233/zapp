// Entry point. Restore the persisted database from cloud storage BEFORE any
// module opens it, then load the app. (db.js opens the SQLite file at import
// time, so the download must complete first — hence the dynamic import.)
import { restoreDb } from "./persistence.js";

await restoreDb();
await import("./server.js");
