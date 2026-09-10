import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BetterSqliteWrapper } from './db';
import { chainHash, hashBuffer } from './utils/hash';
import { compareVersions, extractText } from './utils/drift';

const CASE_FIR = 'TC1-MANUAL-TAMPER-DRIFT';
const CASE_TITLE = 'TC1 — Tamper & Drift Verification Case';
const CATEGORY = 'SENSITIVE_WOMEN_SAFETY';
const tamperContent = 'Forensic Report Reference ID: TC1-FR-001\nDNA Match Probability: 0.02%\nConclusion: Sample excluded from match.';
const chainContents = [
  'Witness statement: Suspect wore a blue jacket.',
  'Witness statement: Suspect wore a dark blue jacket.',
  'Witness statement: Suspect wore a red jacket and carried a bag.',
];
const sealedContent = 'Medical examination record — restricted.';

function findUser(db: BetterSqliteWrapper, role: string): any {
  const found = db.prepare('SELECT user_id, name, email FROM users WHERE role = ? AND is_active = 1 LIMIT 1').get(role);
  if (!found) throw new Error(`Missing active ${role} user while creating TC1 dataset.`);
  return found;
}

function writeAudit(db: BetterSqliteWrapper, actorId: string, action: string, caseId: string | null, documentId: string | null, detail: string) {
  const last = db.prepare('SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
  const previous = last?.entry_hash || null;
  const timestamp = new Date().toISOString();
  const entryHash = chainHash({ prev: previous, actor_id: actorId, action, document_id: documentId, case_id: caseId, detail, timestamp });
  db.prepare('INSERT INTO audit_log (log_id, actor_id, action, document_id, case_id, detail, timestamp, entry_hash, previous_entry_hash) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), actorId, action, documentId, caseId, detail, timestamp, entryHash, previous);
}

function addDocument(db: BetterSqliteWrapper, uploadsDir: string, caseId: string, uploaderId: string, filename: string, docType: string, sensitivity: string, contents: string[]) {
  const documentId = randomUUID();
  db.prepare('INSERT INTO documents (document_id, case_id, doc_type, title, sensitivity_tier, created_by) VALUES (?,?,?,?,?,?)')
    .run(documentId, caseId, docType, filename, sensitivity, uploaderId);
  let previousHash: string | null = null;
  let previousText = '';
  let currentVersionId = '';
  contents.forEach((content, index) => {
    const bytes = Buffer.from(content, 'utf8');
    const versionId = randomUUID();
    const storedFilename = `${versionId}_${filename}`;
    fs.writeFileSync(path.join(uploadsDir, storedFilename), bytes);
    const fileHash = hashBuffer(bytes);
    const textExcerpt = extractText(bytes, 'text/plain', filename);
    const drift = index === 0 ? { flagged: false, reason: null } : compareVersions(previousText, textExcerpt);
    db.prepare(`INSERT INTO document_versions
      (version_id, document_id, version_number, file_path, original_filename, file_size, file_hash, previous_version_hash, text_excerpt, uploaded_by, drift_flag, drift_notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(versionId, documentId, index + 1, storedFilename, filename, bytes.length, fileHash, previousHash, textExcerpt, uploaderId, drift.flagged ? 1 : 0, drift.reason);
    currentVersionId = versionId;
    previousHash = fileHash;
    previousText = textExcerpt;
    writeAudit(db, uploaderId, index === 0 ? 'DOCUMENT_UPLOAD' : (drift.flagged ? 'VERSION_DRIFT_FLAGGED' : 'VERSION_UPLOAD'), caseId, documentId, `${filename} v${index + 1}`);
  });
  db.prepare('UPDATE documents SET current_version_id = ? WHERE document_id = ?').run(currentVersionId, documentId);
  return documentId;
}

export function ensureTc1Dataset(db: BetterSqliteWrapper): void {
  if (process.env.ENABLE_TC1_DATASET !== 'true') return;
  const existing = db.prepare('SELECT case_id FROM cases WHERE fir_number = ?').get(CASE_FIR);
  if (existing) {
    console.log(`[TC1] Dataset already exists: ${existing.case_id}`);
    return;
  }

  const uploadsDir = path.join(process.env.DATA_DIR || process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const admin = findUser(db, 'ADMIN');
  const io = findUser(db, 'IO');
  const forensic = findUser(db, 'FORENSIC_EXPERT');
  const prosecutor = findUser(db, 'PROSECUTOR');
  const caseId = randomUUID();

  db.prepare('INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction) VALUES (?,?,?,?,?,?,?)')
    .run(caseId, CASE_FIR, CASE_TITLE, CATEGORY, 'UNDER_INVESTIGATION', io.user_id, 'TC1 TEST JURISDICTION');
  writeAudit(db, io.user_id, 'CASE_CREATED', caseId, null, CASE_TITLE);
  for (const [assignedUser, access] of [[io, 'WRITE'], [forensic, 'READ'], [prosecutor, 'READ']] as const) {
    db.prepare('INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)')
      .run(randomUUID(), caseId, assignedUser.user_id, access);
    writeAudit(db, admin.user_id, 'CASE_ASSIGNED', caseId, null, `${assignedUser.email} assigned ${access}`);
  }

  addDocument(db, uploadsDir, caseId, io.user_id, 'TC1_TAMPER_TEST.txt', 'FORENSIC_REPORT', 'STANDARD', [tamperContent]);
  addDocument(db, uploadsDir, caseId, io.user_id, 'TC1_VERSION_CHAIN.txt', 'WITNESS_STATEMENT', 'STANDARD', chainContents);
  addDocument(db, uploadsDir, caseId, io.user_id, 'TC1_SEALED_RECORD.txt', 'EVIDENCE_RECORD', 'SEALED', [sealedContent]);
  db.prepare('INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, photo_ref, case_summary) VALUES (?,?,?,?,?,?,?)')
    .run(randomUUID(), caseId, 'Test Victim', '123 Test Lane, Test District', '+91-90000-00000', null, 'TC1 fictional victim record for redaction verification.');
  writeAudit(db, io.user_id, 'VICTIM_RECORD_SAVED', caseId, null, 'TC1 victim record created for manual redaction verification');
  console.log(`[TC1] Dataset created: case ${caseId}; files stored in ${uploadsDir}`);
}
