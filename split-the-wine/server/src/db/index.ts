import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH ?? path.join(dataDir, "splitthewine.db");
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  restaurant TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  host_method TEXT,
  host_handle TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fees (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  person_contact TEXT,
  units INTEGER NOT NULL,
  owner_token TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_receipt ON items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_fees_receipt ON fees(receipt_id);
CREATE INDEX IF NOT EXISTS idx_claims_receipt ON claims(receipt_id);
CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
`);
