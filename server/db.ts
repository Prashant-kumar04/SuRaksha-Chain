import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase, Statement } from 'sql.js';

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = path.join(DATA_DIR, 'suraksha.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface PreparedStmt {
  run(...params: any[]): { changes: number; lastInsertRowid: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface BetterSqliteWrapper {
  pragma(sql: string): void;
  exec(sql: string): void;
  prepare(sql: string): PreparedStmt;
}

let dbInstance: BetterSqliteWrapper | null = null;

function normalizeParams(args: any[]): any[] {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0];
  }
  return args;
}

export async function initDatabase(): Promise<BetterSqliteWrapper> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  let sqlDb: SqlJsDatabase;

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      sqlDb = new SQL.Database(fileBuffer);
    } catch {
      sqlDb = new SQL.Database();
    }
  } else {
    sqlDb = new SQL.Database();
  }

  function persist() {
    try {
      const data = sqlDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('Failed to persist database to file:', err);
    }
  }

  const wrapper: BetterSqliteWrapper = {
    pragma(_sql: string) {},
    exec(sql: string) {
      sqlDb.run(sql);
      persist();
    },
    prepare(sql: string): PreparedStmt {
      return {
        run(...params: any[]) {
          const flatParams = normalizeParams(params);
          sqlDb.run(sql, flatParams);
          persist();
          return { changes: 1, lastInsertRowid: 0 };
        },
        get(...params: any[]) {
          const flatParams = normalizeParams(params);
          const stmt: Statement = sqlDb.prepare(sql);
          try {
            stmt.bind(flatParams);
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params: any[]) {
          const flatParams = normalizeParams(params);
          const stmt: Statement = sqlDb.prepare(sql);
          const rows: any[] = [];
          try {
            stmt.bind(flatParams);
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
      };
    },
  };

  // Schema creation
  wrapper.exec(
    `
CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  department    TEXT,
  jurisdiction  TEXT,
  badge_number  TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cases (
  case_id       TEXT PRIMARY KEY,
  fir_number    TEXT UNIQUE NOT NULL,
  case_title    TEXT NOT NULL,
  case_category TEXT NOT NULL DEFAULT 'GENERAL',
  status        TEXT NOT NULL DEFAULT 'OPEN',
  created_by    TEXT,
  jurisdiction  TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_assignments (
  assignment_id TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  access_level  TEXT NOT NULL DEFAULT 'READ',
  assigned_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at    TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  document_id        TEXT PRIMARY KEY,
  case_id            TEXT NOT NULL,
  doc_type           TEXT NOT NULL,
  title              TEXT NOT NULL,
  sensitivity_tier   TEXT NOT NULL DEFAULT 'STANDARD',
  current_version_id TEXT,
  created_by         TEXT,
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_versions (
  version_id            TEXT PRIMARY KEY,
  document_id           TEXT NOT NULL,
  version_number         INTEGER NOT NULL,
  file_path               TEXT NOT NULL,
  original_filename       TEXT,
  file_size               INTEGER DEFAULT 0,
  file_hash               TEXT NOT NULL,
  previous_version_hash   TEXT,
  text_excerpt             TEXT,
  uploaded_by              TEXT,
  uploaded_at              TEXT DEFAULT CURRENT_TIMESTAMP,
  drift_flag               INTEGER DEFAULT 0,
  drift_notes              TEXT
);

CREATE TABLE IF NOT EXISTS unseal_requests (
  request_id            TEXT PRIMARY KEY,
  document_id            TEXT NOT NULL,
  requested_by            TEXT,
  justification            TEXT,
  court_order_path         TEXT,
  court_order_number       TEXT,
  court_order_verified     INTEGER DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'PENDING',
  requested_at              TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at                TEXT,
  resolved_by                 TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  log_id                TEXT PRIMARY KEY,
  actor_id               TEXT,
  action                  TEXT NOT NULL,
  document_id             TEXT,
  case_id                  TEXT,
  detail                    TEXT,
  timestamp                 TEXT DEFAULT CURRENT_TIMESTAMP,
  entry_hash                TEXT NOT NULL,
  previous_entry_hash        TEXT
);

CREATE TABLE IF NOT EXISTS case_notes (
  note_id       TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL,
  document_id   TEXT,
  author_id     TEXT NOT NULL,
  note_text     TEXT NOT NULL,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS redaction_profiles (
  profile_id     TEXT PRIMARY KEY,
  case_category    TEXT NOT NULL UNIQUE,
  fields_to_redact  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS victim_records (
  record_id      TEXT PRIMARY KEY,
  case_id        TEXT NOT NULL UNIQUE,
  victim_name    TEXT NOT NULL,
  address        TEXT,
  contact_number TEXT,
  photo_ref      TEXT,
  case_summary   TEXT,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS final_seed_runs (
  seed_name      TEXT PRIMARY KEY,
  completed_at   TEXT NOT NULL,
  triggered_by   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_case_assignments_case_user
  ON case_assignments(case_id, user_id);
    `);

  // Safe schema migrations for existing databases
  try {
    wrapper.exec(`ALTER TABLE users ADD COLUMN badge_number TEXT;`);
  } catch (_e) {
    // Column may already exist
  }

  try {
    wrapper.exec(`ALTER TABLE document_versions ADD COLUMN file_size INTEGER DEFAULT 0;`);
  } catch (_e) {
    // Column may already exist
  }

  dbInstance = wrapper;
  return wrapper;
}
