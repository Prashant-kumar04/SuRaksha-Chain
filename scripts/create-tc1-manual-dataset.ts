import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { initDatabase, BetterSqliteWrapper } from '../server/db';
import { chainHash, hashBuffer } from '../server/utils/hash';
import { compareVersions, extractText } from '../server/utils/drift';

const ROOT = process.cwd();
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const GUIDE_PATH = path.join(ROOT, 'TEST-CASES.md');
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

function user(db: BetterSqliteWrapper, role: string): any {
  const found = db.prepare('SELECT user_id, name, email, role FROM users WHERE role = ? AND is_active = 1 LIMIT 1').get(role);
  if (!found) throw new Error(`Missing active ${role} user. Start the application once to bootstrap users.`);
  return found;
}

function audit(db: BetterSqliteWrapper, actorId: string, action: string, caseId: string | null, documentId: string | null, detail: string) {
  const last = db.prepare('SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
  const previous = last?.entry_hash || null;
  const timestamp = new Date().toISOString();
  const entryHash = chainHash({ prev: previous, actor_id: actorId, action, document_id: documentId, case_id: caseId, detail, timestamp });
  db.prepare('INSERT INTO audit_log (log_id, actor_id, action, document_id, case_id, detail, timestamp, entry_hash, previous_entry_hash) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), actorId, action, documentId, caseId, detail, timestamp, entryHash, previous);
}

function writeVersion(
  db: BetterSqliteWrapper,
  documentId: string,
  uploaderId: string,
  filename: string,
  content: string,
  versionNumber: number,
  previousHash: string | null,
  previousText: string,
) {
  const bytes = Buffer.from(content, 'utf8');
  const versionId = randomUUID();
  const storedFilename = `${versionId}_${filename}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedFilename), bytes);
  const fileHash = hashBuffer(bytes);
  const excerpt = extractText(bytes, 'text/plain', filename);
  const drift = versionNumber === 1 ? { flagged: false, reason: null } : compareVersions(previousText, excerpt);
  db.prepare(`INSERT INTO document_versions
    (version_id, document_id, version_number, file_path, original_filename, file_size, file_hash, previous_version_hash, text_excerpt, uploaded_by, drift_flag, drift_notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(versionId, documentId, versionNumber, storedFilename, filename, bytes.length, fileHash, previousHash, excerpt, uploaderId, drift.flagged ? 1 : 0, drift.reason);
  return { versionId, storedFilename, fileHash, drift };
}

function createDocument(
  db: BetterSqliteWrapper,
  caseId: string,
  uploaderId: string,
  filename: string,
  title: string,
  docType: string,
  sensitivity: string,
  contents: string[],
) {
  const documentId = randomUUID();
  db.prepare('INSERT INTO documents (document_id, case_id, doc_type, title, sensitivity_tier, created_by) VALUES (?,?,?,?,?,?)')
    .run(documentId, caseId, docType, title, sensitivity, uploaderId);
  let previousHash: string | null = null;
  let previousText = '';
  const versions: any[] = [];
  contents.forEach((content, index) => {
    const result = writeVersion(db, documentId, uploaderId, filename, content, index + 1, previousHash, previousText);
    versions.push({ ...result, content });
    previousHash = result.fileHash;
    previousText = extractText(Buffer.from(content, 'utf8'), 'text/plain', filename);
    audit(db, uploaderId, index === 0 ? 'DOCUMENT_UPLOAD' : (result.drift.flagged ? 'VERSION_DRIFT_FLAGGED' : 'VERSION_UPLOAD'), caseId, documentId, `${filename} v${index + 1}`);
  });
  db.prepare('UPDATE documents SET current_version_id = ? WHERE document_id = ?').run(versions[versions.length - 1].versionId, documentId);
  return { documentId, filename, title, sensitivity, versions };
}

function guide(data: any): string {
  const versionRows = data.chain.versions.map((version: any, index: number) =>
    '| v' + (index + 1) + ' | ' + version.storedFilenamePath + ' | ' + version.fileHash + ' | ' + (index === 0 ? 'Baseline' : index === 1 ? 'Minor wording change; expected no drift' : 'Meaningful change; expected drift flag') + ' |'
  ).join('\n');
  return [
    '# TEST-CASES.md',
    '',
    '## TC1 — Tamper & Drift Verification Case',
    '',
    'Fictional manual verification dataset. Created: ' + new Date().toISOString(),
    'The files below are real files on disk. Hashes were computed from their original bytes at creation time. The tamper file was not modified or pre-flagged.',
    '',
    '- Case ID: ' + data.caseId,
    '- FIR number: ' + CASE_FIR,
    '- Case title: ' + CASE_TITLE,
    '- Category: ' + CATEGORY,
    '- IO assignment: io@suraksha.gov.in (WRITE)',
    '- READ assignments: forensic@suraksha.gov.in, prosecutor@suraksha.gov.in',
    '- Court Officer and Admin use normal elevated role access; no special grants were created.',
    '',
    '## Physical Files and Baseline Hashes',
    '',
    '| Test File | Real disk path | Document ID | Original SHA-256 |',
    '|---|---|---|---|',
    '| TC1_TAMPER_TEST.txt | ' + data.tamper.path + ' | ' + data.tamper.documentId + ' | ' + data.tamper.versions[0].fileHash + ' |',
    '| TC1_VERSION_CHAIN.txt v1 | ' + data.chain.versions[0].storedFilenamePath + ' | ' + data.chain.documentId + ' | ' + data.chain.versions[0].fileHash + ' |',
    '| TC1_VERSION_CHAIN.txt v2 | ' + data.chain.versions[1].storedFilenamePath + ' | ' + data.chain.documentId + ' | ' + data.chain.versions[1].fileHash + ' |',
    '| TC1_VERSION_CHAIN.txt v3 | ' + data.chain.versions[2].storedFilenamePath + ' | ' + data.chain.documentId + ' | ' + data.chain.versions[2].fileHash + ' |',
    '| TC1_SEALED_RECORD.txt | ' + data.sealed.path + ' | ' + data.sealed.documentId + ' | ' + data.sealed.versions[0].fileHash + ' |',
    '',
    'Database upload paths are relative to uploads/. The absolute paths above are the files to open.',
    '',
    '### Exact Original Content',
    '',
    '#### TC1_TAMPER_TEST.txt',
    '',
    tamperContent,
    '',
    '#### TC1_VERSION_CHAIN.txt',
    '',
    'v1: ' + chainContents[0],
    'v2: ' + chainContents[1],
    'v3: ' + chainContents[2],
    '',
    '#### TC1_SEALED_RECORD.txt',
    '',
    sealedContent,
    '',
    '## Manual Test Table',
    '',
    '| Test File | What to do | Who does it | Expected result |',
    '|---|---|---|---|',
    '| TC1_TAMPER_TEST.txt | Open the physical file, change exactly one character (for example 0.02% to 0.03%), save without using the app, then run Verify File. Do not alter it before the baseline test. | Any assigned role | Stored hash remains ' + data.tamper.versions[0].fileHash + '; actual hash differs; integrity FAIL / tamper flagged. |',
    '| TC1_VERSION_CHAIN.txt v1->v2 | Compare v1 with v2 in Version Drift Check. | Any assigned role | No drift flag. |',
    '| TC1_VERSION_CHAIN.txt v2->v3 | Compare v2 with v3. | Any assigned role | DRIFT FLAG for meaningful change. |',
    '| TC1_SEALED_RECORD.txt before order | Try to access/download before an approved order exists. | IO | HTTP 403; sealed content blocked. |',
    '| TC1_SEALED_RECORD.txt after order | IO submits request; Court Officer attaches a fictional order and approves it; IO retries. | IO, then Court Officer | IO can access after approval. |',
    '| TC1_SEALED_RECORD.txt unauthorized approval | Attempt attach/approve as Forensic Expert or Prosecutor. | Forensic Expert or Prosecutor | HTTP 403; court-only action blocked server-side. |',
    '| TC1_VICTIM_RECORD | View the record. | IO, Forensic Expert, Prosecutor | Name, address, and contact are REDACTED. |',
    '| TC1_VICTIM_RECORD | View the record. | Court Officer, Admin | UNREDACTED full record. |',
    '',
    '## Version Chain Records',
    '',
    '| Version | Stored physical file | SHA-256 | Expected drift |',
    '|---|---|---|---|',
    versionRows,
    '',
    '## Victim Record',
    '',
    'Database record linked to case ' + data.caseId + ':',
    'victim_name: Test Victim',
    'address: 123 Test Lane, Test District',
    'contact_number: +91-90000-00000',
    '',
    '## Role Hierarchy Walk-through',
    '',
    '| Role | Buttons/pages expected | Direct requests blocked |',
    '|---|---|---|',
    '| IO | Case Dossier, Document Upload, Version Drift Check, Physical File Integrity, Judicial Authorization Workflow, Sec 228A IPC Victim Record | Upload/version without WRITE; audit log and Officer Directory; court-order attach/approve. |',
    '| Forensic Expert | Case Dossier, Document Upload, Version Drift Check, Physical File Integrity, Judicial Authorization Workflow, Sec 228A IPC Victim Record | Upload/version without WRITE; court-order attach/approve; audit log and Officer Directory; victim-record POST. |',
    '| Prosecutor | Case Dossier, Version Drift Check, Physical File Integrity, Judicial Authorization Workflow, Sec 228A IPC Victim Record | Document upload/version; court-order attach/approve; audit log and Officer Directory; victim-record POST. |',
    '| Court Officer | All pages except Officer Directory, including Tamper-Evident Audit Ledger | Officer Directory; only Admin can manage users. |',
    '| Admin | All pages, including Officer Directory | Production tamper simulation remains blocked unless ENABLE_TAMPER_TESTS=true. |',
    '',
    'Hidden buttons are not the security boundary. Test copied API requests and record HTTP status. The server enforces case assignment, WRITE access, SEALED access, court-only order actions, audit role access, and victim-record permissions.',
    '',
    '## Where to Test in the App',
    '',
    'After login, select the TC1 case in Case Dossier.',
    '- View a document hash: Case Dossier -> Current SHA-256 Digest, or Version Drift Check -> version details.',
    '- Trigger integrity verification: Case Dossier -> document Actions -> Verify Integrity, or Physical File Integrity.',
    '- View the audit log: Tamper-Evident Audit Ledger (Court Officer/Admin only).',
    '- Submit/approve unseal: Judicial Authorization Workflow. Requesting user submits; Court Officer/Admin attaches and approves.',
    '- View a victim record: Sec 228A IPC Victim Record.',
    '',
    '## Important Test Order',
    '',
    '1. Verify the original tamper hash and record PASS before editing the physical file.',
    '2. Edit exactly one character outside the app and verify again for FAIL.',
    '3. Compare v1->v2, then v2->v3.',
    '4. Test sealed denial, then submit and approve an order, then test access again.',
    '5. Check victim redaction with all five roles.',
    '6. Check the audit ledger and verify its hash chain as Court Officer/Admin.',
    '',
  ].join('\n');
}

async function main() {
  const db = await initDatabase();
  const existing = db.prepare('SELECT case_id FROM cases WHERE fir_number = ?').get(CASE_FIR);
  if (existing) throw new Error(`TC1 already exists as ${existing.case_id}; no files or records were changed.`);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const admin = user(db, 'ADMIN');
  const io = user(db, 'IO');
  const forensic = user(db, 'FORENSIC_EXPERT');
  const prosecutor = user(db, 'PROSECUTOR');
  const caseId = randomUUID();
  db.prepare('INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction) VALUES (?,?,?,?,?,?,?)')
    .run(caseId, CASE_FIR, CASE_TITLE, CATEGORY, 'UNDER_INVESTIGATION', io.user_id, 'TC1 TEST JURISDICTION');
  audit(db, io.user_id, 'CASE_CREATED', caseId, null, CASE_TITLE);
  for (const [assignedUser, access] of [[io, 'WRITE'], [forensic, 'READ'], [prosecutor, 'READ']] as const) {
    db.prepare('INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)')
      .run(randomUUID(), caseId, assignedUser.user_id, access);
    audit(db, admin.user_id, 'CASE_ASSIGNED', caseId, null, `${assignedUser.email} assigned ${access}`);
  }

  const tamper = createDocument(db, caseId, io.user_id, 'TC1_TAMPER_TEST.txt', 'TC1_TAMPER_TEST.txt', 'FORENSIC_REPORT', 'STANDARD', [tamperContent]);
  const chain = createDocument(db, caseId, io.user_id, 'TC1_VERSION_CHAIN.txt', 'TC1_VERSION_CHAIN.txt', 'WITNESS_STATEMENT', 'STANDARD', chainContents);
  const sealed = createDocument(db, caseId, io.user_id, 'TC1_SEALED_RECORD.txt', 'TC1_SEALED_RECORD.txt', 'EVIDENCE_RECORD', 'SEALED', [sealedContent]);
  db.prepare('INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, photo_ref, case_summary) VALUES (?,?,?,?,?,?,?)')
    .run(randomUUID(), caseId, 'Test Victim', '123 Test Lane, Test District', '+91-90000-00000', null, 'TC1 fictional victim record for redaction verification.');
  audit(db, io.user_id, 'VICTIM_RECORD_SAVED', caseId, null, 'TC1 victim record created for manual redaction verification');

  const output = {
    caseId,
    tamper: { ...tamper, path: path.join(UPLOADS_DIR, tamper.versions[0].storedFilename), versions: tamper.versions.map((version: any) => ({ ...version, storedFilenamePath: path.join(UPLOADS_DIR, version.storedFilename) })) },
    chain: { ...chain, versions: chain.versions.map((version: any) => ({ ...version, storedFilenamePath: path.join(UPLOADS_DIR, version.storedFilename) })) },
    sealed: { ...sealed, path: path.join(UPLOADS_DIR, sealed.versions[0].storedFilename), versions: sealed.versions.map((version: any) => ({ ...version, storedFilenamePath: path.join(UPLOADS_DIR, version.storedFilename) })) },
  };
  fs.writeFileSync(GUIDE_PATH, guide(output), 'utf8');
  console.log(JSON.stringify({ caseId, firNumber: CASE_FIR, guide: GUIDE_PATH, tamperPath: output.tamper.path, tamperHash: tamper.versions[0].fileHash, chain: chain.versions.map((version: any) => ({ path: version.storedFilenamePath, hash: version.fileHash, drift: version.drift.flagged })), sealedPath: output.sealed.path, sealedHash: sealed.versions[0].fileHash }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
