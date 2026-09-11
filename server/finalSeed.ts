import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BetterSqliteWrapper } from './db';
import { extractText } from './utils/drift';
import { chainHash, hashBuffer } from './utils/hash';

export const FINAL_SEED_NAME = 'FINAL_DEMO_DATASET_V1';

type SeedUser = { user_id: string; email: string };
type SeedDocument = {
  key: string;
  caseKey: string;
  filename: string;
  docType: string;
  title: string;
  sensitivity: string;
  text: string;
  uploader: string;
};

const CASES = [
  { key: 'search', fir: '2201/2026', title: 'Search Demo', category: 'GENERAL' },
  { key: 'drift', fir: '2202/2026', title: 'Drift Demo', category: 'GENERAL' },
  { key: 'tamper', fir: '2203/2026', title: 'Tamper Demo', category: 'SENSITIVE_WOMEN_SAFETY' },
];

const DRIFT_TEXT = 'Forensic Report Reference ID: DRIFT-DEMO-001\nDNA Match Probability: 0.02%\nConclusion: Sample excluded from match.';
const TAMPER_TEXT = 'Forensic Report Reference ID: TAMPER-DEMO-001\nDNA Match Probability: 0.02%\nConclusion: Sample excluded from match.';

const DOCUMENTS: SeedDocument[] = [
  { key: 'search-fir', caseKey: 'search', filename: 'SEARCH_DEMO_FIR.txt', docType: 'FIR', title: 'Search Demo FIR', sensitivity: 'STANDARD', uploader: 'io@suraksha.gov.in', text: 'FIR record: blue Maruti vehicle near District East market.' },
  { key: 'search-witness', caseKey: 'search', filename: 'SEARCH_DEMO_WITNESS.txt', docType: 'WITNESS_STATEMENT', title: 'Search Demo Witness Statement', sensitivity: 'STANDARD', uploader: 'io@suraksha.gov.in', text: 'Witness statement: witness heard a loud noise near the market entrance.' },
  { key: 'search-charge', caseKey: 'search', filename: 'SEARCH_DEMO_CHARGESHEET.txt', docType: 'CHARGESHEET', title: 'Search Demo Chargesheet', sensitivity: 'STANDARD', uploader: 'io@suraksha.gov.in', text: 'Chargesheet filed citing Section 379 IPC.' },
  { key: 'drift-v1', caseKey: 'drift', filename: 'DRIFT_DEMO_v1.txt', docType: 'FORENSIC_REPORT', title: 'Drift Demo Forensic Report', sensitivity: 'STANDARD', uploader: 'io@suraksha.gov.in', text: DRIFT_TEXT },
  { key: 'tamper', caseKey: 'tamper', filename: 'TAMPER_TEST.txt', docType: 'FORENSIC_REPORT', title: 'Tamper Demo Forensic Report', sensitivity: 'STANDARD', uploader: 'io@suraksha.gov.in', text: TAMPER_TEXT },
  { key: 'sealed', caseKey: 'tamper', filename: 'TAMPER_DEMO_SEALED.txt', docType: 'EVIDENCE_RECORD', title: 'Tamper Demo Sealed Record', sensitivity: 'SEALED', uploader: 'io@suraksha.gov.in', text: 'Sealed judicial record for the Tamper Demo case. Access requires an approved unseal request.' },
];

function writeAudit(db: BetterSqliteWrapper, actorId: string, action: string, caseId: string | null, documentId: string | null, detail: string) {
  const last = db.prepare('SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
  const timestamp = new Date().toISOString();
  const entryHash = chainHash({ prev: last?.entry_hash || null, actor_id: actorId, action, document_id: documentId, case_id: caseId, detail, timestamp });
  db.prepare(`INSERT INTO audit_log (log_id, actor_id, action, document_id, case_id, detail, timestamp, entry_hash, previous_entry_hash)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), actorId, action, documentId, caseId, detail, timestamp, entryHash, last?.entry_hash || null);
}

function removeAllFiles(uploadsDir: string): void {
  fs.mkdirSync(uploadsDir, { recursive: true });
  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    fs.rmSync(path.join(uploadsDir, entry.name), { recursive: true, force: true });
  }
}

function getUsers(db: BetterSqliteWrapper): Record<string, SeedUser> {
  const rows = db.prepare('SELECT user_id, email FROM users WHERE email IN (?,?,?,?,?)').all(
    'io@suraksha.gov.in', 'forensic@suraksha.gov.in', 'prosecutor@suraksha.gov.in', 'court@suraksha.gov.in', 'admin@suraksha.gov.in'
  );
  const users = Object.fromEntries(rows.map((user: SeedUser) => [user.email, user]));
  for (const email of ['io@suraksha.gov.in', 'forensic@suraksha.gov.in', 'admin@suraksha.gov.in']) {
    if (!users[email]) throw new Error(`Required seed account is missing: ${email}`);
  }
  return users;
}

export function runFinalSeed(db: BetterSqliteWrapper, uploadsDir: string, triggeredBy: string) {
  const marker = db.prepare('SELECT completed_at FROM final_seed_runs WHERE seed_name = ?').get(FINAL_SEED_NAME);
  if (marker) throw new Error('Already seeded — reset marker manually to re-run.');

  const users = getUsers(db);
  const io = users['io@suraksha.gov.in'].user_id;
  const forensic = users['forensic@suraksha.gov.in'].user_id;
  const admin = users['admin@suraksha.gov.in'].user_id;

  removeAllFiles(uploadsDir);
  db.exec(`DELETE FROM document_versions; DELETE FROM unseal_requests; DELETE FROM documents; DELETE FROM case_notes;
           DELETE FROM victim_records; DELETE FROM case_assignments; DELETE FROM audit_log; DELETE FROM cases;`);

  const caseIds: Record<string, string> = {};
  for (const kase of CASES) {
    caseIds[kase.key] = randomUUID();
    db.prepare(`INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction)
                VALUES (?,?,?,?,?,?,?)`).run(caseIds[kase.key], kase.fir, kase.title, kase.category, 'UNDER_INVESTIGATION', io, 'District East');
  }

  const assignments = [
    [caseIds.search, io, 'WRITE'], [caseIds.search, forensic, 'READ'],
    [caseIds.drift, io, 'WRITE'], [caseIds.drift, forensic, 'WRITE'],
    [caseIds.tamper, io, 'WRITE'], [caseIds.tamper, forensic, 'WRITE'],
  ];
  for (const [caseId, userId, access] of assignments) {
    db.prepare('INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)').run(randomUUID(), caseId, userId, access);
  }

  const documentResults: Record<string, any> = {};
  for (const document of DOCUMENTS) {
    const documentId = randomUUID();
    const versionId = randomUUID();
    const bytes = Buffer.from(document.text, 'utf8');
    const storedFilename = `${versionId}_${document.filename}`;
    fs.writeFileSync(path.join(uploadsDir, storedFilename), bytes);
    const fileHash = hashBuffer(bytes);
    db.prepare(`INSERT INTO documents (document_id, case_id, doc_type, title, sensitivity_tier, created_by, current_version_id)
                VALUES (?,?,?,?,?,?,?)`).run(documentId, caseIds[document.caseKey], document.docType, document.title, document.sensitivity, document.uploader === 'io@suraksha.gov.in' ? io : forensic, versionId);
    db.prepare(`INSERT INTO document_versions (version_id, document_id, version_number, file_path, original_filename, file_size, file_hash, text_excerpt, uploaded_by)
                VALUES (?,?,?,?,?,?,?,?,?)`).run(versionId, documentId, 1, storedFilename, document.filename, bytes.length, fileHash, extractText(bytes, 'text/plain', document.filename), document.uploader === 'io@suraksha.gov.in' ? io : forensic);
    documentResults[document.key] = { document_id: documentId, version_id: versionId, file_path: path.resolve(uploadsDir, storedFilename), file_hash: fileHash, version_count: 1, drift_flag: 0 };
  }

  db.prepare(`INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, case_summary)
              VALUES (?,?,?,?,?,?)`).run(randomUUID(), caseIds.tamper, 'Demo Victim', 'Test Address', '+91-90000-00000', 'Fictional demo victim record for redaction testing.');

  for (const kase of CASES) writeAudit(db, admin, 'CASE_CREATED', caseIds[kase.key], null, `Final demo case created: FIR ${kase.fir} — ${kase.title}`);
  for (const document of DOCUMENTS) writeAudit(db, io, 'DOCUMENT_UPLOAD', documentResults[document.key].document_id, caseIds[document.caseKey], `Final demo document seeded: ${document.filename}, SHA-256: ${documentResults[document.key].file_hash}`);
  writeAudit(db, admin, 'VICTIM_RECORD_SAVED', caseIds.tamper, null, 'Final demo victim record seeded for redaction testing.');

  const completedAt = new Date().toISOString();
  db.prepare('INSERT INTO final_seed_runs (seed_name, completed_at, triggered_by) VALUES (?,?,?)').run(FINAL_SEED_NAME, completedAt, triggeredBy);
  return { seed_name: FINAL_SEED_NAME, completed_at: completedAt, cases: CASES.map((kase) => ({ ...kase, case_id: caseIds[kase.key] })), documents: documentResults };
}