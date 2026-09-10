import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BetterSqliteWrapper } from './db';
import { chainHash, hashBuffer } from './utils/hash';
import { compareVersions, extractText } from './utils/drift';

const CASE_FIR = 'TC1-ROLE-WISE-VERIFICATION';
const LEGACY_CASE_FIRS = ['TC1-MANUAL-TAMPER-DRIFT', 'TEST-DATA-TC1-CYBER-FRAUD'];
const CASE_TITLE = 'TC1';
const CATEGORY = 'SENSITIVE_WOMEN_SAFETY';
const tamperContent = 'DNA Match Probability: 0.02%. Conclusion: Sample excluded from match.';

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
  const uploadsDir = path.join(process.env.DATA_DIR || process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const existing = db.prepare(`SELECT case_id, fir_number FROM cases WHERE fir_number = ? OR fir_number IN (${LEGACY_CASE_FIRS.map(() => '?').join(',')}) LIMIT 1`).get(CASE_FIR, ...LEGACY_CASE_FIRS);
  if (existing) {
    const documentSummary = db.prepare(`SELECT COUNT(*) AS count, MAX(title) AS title FROM documents WHERE case_id = ?`).get(existing.case_id);
    if (existing.fir_number === CASE_FIR && documentSummary.count === 1 && documentSummary.title === 'TC1_TAMPER_TEST.txt') {
      console.log(`[TC1] Dataset already exists: ${existing.case_id}`);
      return;
    }
    const documents = db.prepare('SELECT document_id FROM documents WHERE case_id = ?').all(existing.case_id);
    for (const document of documents) {
      const versions = db.prepare('SELECT file_path FROM document_versions WHERE document_id = ?').all(document.document_id);
      for (const version of versions) fs.rmSync(path.join(process.env.DATA_DIR || process.cwd(), 'uploads', version.file_path), { force: true });
      db.prepare('DELETE FROM document_versions WHERE document_id = ?').run(document.document_id);
      db.prepare('DELETE FROM unseal_requests WHERE document_id = ?').run(document.document_id);
    }
    db.prepare('DELETE FROM documents WHERE case_id = ?').run(existing.case_id);
    db.prepare('DELETE FROM victim_records WHERE case_id = ?').run(existing.case_id);
    db.prepare('DELETE FROM case_assignments WHERE case_id = ?').run(existing.case_id);
    db.prepare('UPDATE cases SET fir_number = ?, case_title = ?, case_category = ?, status = ?, created_by = ?, jurisdiction = ? WHERE case_id = ?')
      .run(CASE_FIR, CASE_TITLE, CATEGORY, 'UNDER_INVESTIGATION', findUser(db, 'IO').user_id, 'TC1 TEST JURISDICTION', existing.case_id);
    console.log(`[TC1] Replaced the previous TC1 fixture in place: ${existing.case_id}`);
    createFixtureRecords(db, uploadsDir, existing.case_id);
    return;
  }

  const caseId = randomUUID();
  const io = findUser(db, 'IO');
  db.prepare('INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction) VALUES (?,?,?,?,?,?,?)')
    .run(caseId, CASE_FIR, CASE_TITLE, CATEGORY, 'UNDER_INVESTIGATION', io.user_id, 'TC1 TEST JURISDICTION');

  createFixtureRecords(db, uploadsDir, caseId);
}

function createCase(db: BetterSqliteWrapper, fir: string, title: string, category: string, creator: any, assignments: Array<[any, 'READ' | 'WRITE']>) {
  const existing = db.prepare('SELECT case_id FROM cases WHERE fir_number = ?').get(fir);
  if (existing) return existing.case_id;
  const caseId = randomUUID();
  db.prepare('INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction) VALUES (?,?,?,?,?,?,?)')
    .run(caseId, fir, title, category, 'UNDER_INVESTIGATION', creator.user_id, 'TEST JURISDICTION');
  writeAudit(db, creator.user_id, 'CASE_CREATED', caseId, null, title);
  for (const [assignedUser, access] of assignments) {
    db.prepare('INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)')
      .run(randomUUID(), caseId, assignedUser.user_id, access);
    writeAudit(db, creator.user_id, 'CASE_ASSIGNED', caseId, null, `${assignedUser.email} assigned ${access}`);
  }
  return caseId;
}

export function ensureAdditionalRoleDatasets(db: BetterSqliteWrapper): void {
  if (process.env.ENABLE_TC1_DATASET !== 'true') return;
  const uploadsDir = path.join(process.env.DATA_DIR || process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const admin = findUser(db, 'ADMIN');
  const io = findUser(db, 'IO');
  const forensic = findUser(db, 'FORENSIC_EXPERT');
  const prosecutor = findUser(db, 'PROSECUTOR');
  const court = findUser(db, 'COURT_OFFICER');

  const tc2 = createCase(db, 'TC2-DRIFT-DETECTION', 'TC2', 'GENERAL', io, [[io, 'READ'], [forensic, 'WRITE'], [prosecutor, 'READ']]);
  if (!db.prepare('SELECT 1 FROM documents WHERE case_id = ?').get(tc2)) {
    addDocument(db, uploadsDir, tc2, forensic.user_id, 'TC2_VERSION_CHAIN.txt', 'FORENSIC_REPORT', 'STANDARD', [
      `Witness statement: Suspect wore a dark jacket, height approx 5'8".`,
      `Witness statement: Suspect wore a dark blue jacket, height approx 5'8".`,
      `Witness statement: Suspect wore a red jacket, height approx 6'2".`,
    ]);
  }

  const tc3 = createCase(db, 'TC3-SEALED-EVIDENCE', 'TC3', 'GENERAL', io, [[io, 'WRITE'], [forensic, 'READ'], [prosecutor, 'READ']]);
  if (!db.prepare('SELECT 1 FROM documents WHERE case_id = ?').get(tc3)) {
    addDocument(db, uploadsDir, tc3, io.user_id, 'TC3_SEALED_RECORD.txt', 'EVIDENCE_RECORD', 'SEALED', ['Medical examination record — restricted, Case TC3.']);
  }

  const tc4 = createCase(db, 'TC4-VICTIM-REDACTION', 'TC4', CATEGORY, io, [[io, 'READ'], [forensic, 'READ'], [prosecutor, 'READ']]);
  if (!db.prepare('SELECT 1 FROM victim_records WHERE case_id = ?').get(tc4)) {
    db.prepare('INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, photo_ref, case_summary) VALUES (?,?,?,?,?,?,?)')
      .run(randomUUID(), tc4, 'Test Victim TC4', '45 Sample Road, Test District', '+91-90000-11111', null, 'TC4 fictional victim redaction fixture.');
    writeAudit(db, io.user_id, 'VICTIM_RECORD_SAVED', tc4, null, 'TC4 victim record created for role redaction testing');
  }

  const tc5a = createCase(db, 'TC5-A', 'TC5-A', 'GENERAL', io, [[io, 'WRITE']]);
  if (!db.prepare('SELECT 1 FROM documents WHERE case_id = ?').get(tc5a)) addDocument(db, uploadsDir, tc5a, io.user_id, 'TC5_A_DOCUMENT.txt', 'EVIDENCE_RECORD', 'STANDARD', ['TC5-A document for cross-case access testing.']);
  const tc5b = createCase(db, 'TC5-B', 'TC5-B', 'GENERAL', forensic, [[forensic, 'WRITE']]);
  if (!db.prepare('SELECT 1 FROM documents WHERE case_id = ?').get(tc5b)) addDocument(db, uploadsDir, tc5b, forensic.user_id, 'TC5_B_DOCUMENT.txt', 'EVIDENCE_RECORD', 'STANDARD', ['TC5-B document for cross-case access testing.']);

  console.log(`[ROLE-TESTS] TC2=${tc2} TC3=${tc3} TC4=${tc4} TC5-A=${tc5a} TC5-B=${tc5b}; court=${court.email}; admin=${admin.email}`);
}

function createFixtureRecords(db: BetterSqliteWrapper, uploadsDir: string, caseId: string): void {
  const admin = findUser(db, 'ADMIN');
  const io = findUser(db, 'IO');
  const forensic = findUser(db, 'FORENSIC_EXPERT');
  const prosecutor = findUser(db, 'PROSECUTOR');

  writeAudit(db, io.user_id, 'CASE_CREATED', caseId, null, CASE_TITLE);
  for (const [assignedUser, access] of [[io, 'WRITE'], [forensic, 'WRITE'], [prosecutor, 'READ']] as const) {
    db.prepare('INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)')
      .run(randomUUID(), caseId, assignedUser.user_id, access);
    writeAudit(db, admin.user_id, 'CASE_ASSIGNED', caseId, null, `${assignedUser.email} assigned ${access}`);
  }

  addDocument(db, uploadsDir, caseId, io.user_id, 'TC1_TAMPER_TEST.txt', 'FORENSIC_REPORT', 'STANDARD', [tamperContent]);
  db.prepare('INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, photo_ref, case_summary) VALUES (?,?,?,?,?,?,?)')
    .run(randomUUID(), caseId, 'Test Victim', '123 Test Lane, Test District', '+91-90000-00000', null, 'TC1 fictional victim record for redaction verification.');
  writeAudit(db, io.user_id, 'VICTIM_RECORD_SAVED', caseId, null, 'TC1 victim record created for manual redaction verification');
  console.log(`[TC1] Dataset created: case ${caseId}; files stored in ${uploadsDir}`);
}
