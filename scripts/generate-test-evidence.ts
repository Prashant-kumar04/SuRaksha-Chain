import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { randomUUID } from 'crypto';
import { initDatabase, BetterSqliteWrapper } from '../server/db';
import { hashBuffer, chainHash } from '../server/utils/hash';
import { extractText, compareVersions } from '../server/utils/drift';

const ROOT = process.cwd();
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const TEST_PREFIX = 'TEST-DATA-';
const MARKER = 'TEST DATA - NOT REAL EVIDENCE';

type FixtureFile = {
  filename: string;
  content: Buffer;
  docType: string;
  sensitivity: 'STANDARD' | 'SEALED';
  title: string;
  versions?: Buffer[];
};

type FixtureCase = {
  fir: string;
  title: string;
  category: string;
  files: FixtureFile[];
  victim?: boolean;
  sealedIndex?: number;
};

const colors = {
  background: [248, 247, 243, 255],
  ink: [10, 37, 64, 255],
  accent: [31, 111, 74, 255],
  gold: [201, 162, 39, 255],
  white: [255, 255, 255, 255],
} as const;

const glyphs: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'], G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'], I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'], K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'], W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'], X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'], Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'], '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'], '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'], '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'], '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'], ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'], ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'], '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'], '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'], '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
};

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function makePng(label: string, lines: string[]): Buffer {
  const width = 900;
  const height = 420;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(colors.background, offset);
  const pixel = (x: number, y: number, color: readonly number[]) => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels.set(color, (y * width + x) * 4);
  };
  const rect = (x: number, y: number, w: number, h: number, color: readonly number[]) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pixel(xx, yy, color);
  };
  const text = (value: string, x: number, y: number, scale: number, color: readonly number[]) => {
    let cursor = x;
    for (const character of value.toUpperCase()) {
      const glyph = glyphs[character] || glyphs[' '];
      glyph.forEach((row, rowIndex) => [...row].forEach((bit, columnIndex) => {
        if (bit === '1') rect(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
      }));
      cursor += 6 * scale;
    }
  };
  text(MARKER, 42, 30, 4, colors.ink);
  text(label, 42, 75, 4, colors.accent);
  const boxY = 160;
  const boxWidth = 220;
  lines.forEach((line, index) => {
    const x = 40 + (index % 3) * 290;
    const y = boxY + Math.floor(index / 3) * 125;
    rect(x, y, boxWidth, 72, colors.white);
    rect(x, y, boxWidth, 4, colors.gold);
    text(line.slice(0, 24), x + 18, y + 28, 3, colors.ink);
    if (index < lines.length - 1) {
      const nextX = 40 + ((index + 1) % 3) * 290;
      const nextY = boxY + Math.floor((index + 1) / 3) * 125 + 36;
      const startX = x + boxWidth;
      const endX = nextX - 18;
      for (let xx = Math.min(startX, endX); xx < Math.max(startX, endX); xx++) rect(xx, y + 35, 3, 3, colors.accent);
      text('>', Math.max(startX, endX) - 18, nextY - 10, 3, colors.accent);
    }
  });
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function makePdf(title: string, lines: string[]): Buffer {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = ['BT', '/F1 16 Tf', '50 760 Td', `(${escape(MARKER)}) Tj`, '0 -30 Td', `(${escape(title)}) Tj`, ...lines.map((line) => `0 -22 Td (${escape(line)}) Tj`), 'ET'].join('\n');
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(pdf); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

const text = (filename: string, body: string): FixtureFile => ({ filename, content: Buffer.from(`${MARKER}\n\n${body}\n\nAll values are fictional and created solely for application testing.`, 'utf8'), docType: 'EVIDENCE_RECORD', sensitivity: 'STANDARD', title: `${MARKER} - ${filename}` });
const csv = (filename: string, body: string): FixtureFile => ({ ...text(filename, body), content: Buffer.from(`${MARKER}\n${body}\n`, 'utf8') });
const image = (filename: string, label: string, lines: string[]): FixtureFile => ({ filename, content: makePng(label, lines), docType: 'EVIDENCE_RECORD', sensitivity: 'STANDARD', title: `${MARKER} - ${label}` });
const pdf = (filename: string, title: string, lines: string[]): FixtureFile => ({ filename, content: makePdf(title, lines), docType: 'EVIDENCE_RECORD', sensitivity: 'STANDARD', title: `${MARKER} - ${title}` });

const cases: FixtureCase[] = [
  {
    fir: `${TEST_PREFIX}TC1-CYBER-FRAUD`, title: 'TEST CASE 1 - CYBER FRAUD', category: 'CYBERCRIME', victim: true,
    files: [
      text('TC1_transaction_timeline.txt', 'CYBER FRAUD INVESTIGATION\nTransaction 001: Synthetic Account A -> Synthetic Account B\nAmount: INR 25,000\nReference: TEST-TXN-001\nTransaction 002: Synthetic Account B -> Synthetic Account C\nAmount: INR 12,500\nReference: TEST-TXN-002'),
      text('TC1_chat_transcript.txt', 'TEST CHAT - FICTIONAL\nTEST ACCOUNT A: Please confirm the synthetic transfer.\nTEST ACCOUNT B: This is a fictional test conversation.'),
      csv('TC1_bank_statement.csv', 'Date,Reference,Type,Amount,Status\n2026-09-01,TEST-TXN-001,DEBIT,25000,TEST\n2026-09-02,TEST-TXN-002,CREDIT,12500,TEST\n2026-09-03,TEST-TXN-003,DEBIT,5000,TEST'),
      image('TC1_transaction_flow.png', 'TC1 TRANSACTION FLOW', ['TEST ACCOUNT A', 'TEST ACCOUNT B', 'TEST ACCOUNT C']),
      { ...pdf('TC1_investigation_notes.pdf', 'TC1 SYNTHETIC INVESTIGATION NOTES', ['Initial synthetic investigation note.', 'Synthetic transaction observation added.', 'Synthetic verification observation added.']), versions: [makePdf('TC1 SYNTHETIC INVESTIGATION NOTES V1', ['Initial synthetic investigation note.']), makePdf('TC1 SYNTHETIC INVESTIGATION NOTES V2', ['Initial synthetic investigation note.', 'Added synthetic transaction observation.']), makePdf('TC1 SYNTHETIC INVESTIGATION NOTES V3', ['Initial synthetic investigation note.', 'Added synthetic transaction observation.', 'Added synthetic verification observation.'])] },
      text('TC1_TAMPER_TEST.txt', 'TEST TAMPER FILE\nThis file is intentionally created for SHA-256 integrity testing.\nOriginal content.'),
    ],
  },
  {
    fir: `${TEST_PREFIX}TC2-VEHICLE-THEFT`, title: 'TEST CASE 2 - VEHICLE THEFT', category: 'GENERAL',
    files: [text('TC2_vehicle_report.txt', 'Vehicle: TEST VEHICLE\nRegistration: TEST-REG-001\nColor: TEST BLUE\nThis is a fictional stolen-vehicle scenario.'), text('TC2_witness_statement.txt', 'TEST WITNESS STATEMENT\nFICTIONAL TEST DATA\nA synthetic witness observed TEST VEHICLE near the test parking area.'), csv('TC2_vehicle_details.csv', 'Field,Value\nVehicle,TEST VEHICLE\nRegistration,TEST-REG-001\nColor,TEST BLUE\nModel,TEST MODEL\nStatus,TEST'), image('TC2_vehicle_scene.png', 'TC2 VEHICLE SCENE', ['TEST PARKING AREA', 'TEST VEHICLE', 'EXIT ROUTE']), text('TC2_recovery_notes.txt', 'Synthetic recovery notes for TEST VEHICLE. No real persons, locations, or registration data are present.')],
  },
  {
    fir: `${TEST_PREFIX}TC3-PROPERTY-BURGLARY`, title: 'TEST CASE 3 - PROPERTY BURGLARY', category: 'GENERAL',
    files: [text('TC3_scene_notes.txt', 'Synthetic burglary scene notes. TEST ROOM, TEST WINDOW, TEST TABLE, and TEST SAFE are fictional.'), csv('TC3_inventory.csv', 'Item,Condition,Reference\nTEST ITEM A,TEST,TEST-INV-001\nTEST ITEM B,TEST,TEST-INV-002'), text('TC3_witness_statement.txt', 'TEST WITNESS STATEMENT\nFICTIONAL TEST DATA\nSynthetic statement about a fictional test property.'), image('TC3_scene_diagram.png', 'TC3 SCENE DIAGRAM', ['TEST ROOM', 'WINDOW', 'TABLE SAFE', 'DOOR']), pdf('TC3_investigator_notes.pdf', 'TC3 SYNTHETIC INVESTIGATOR NOTES', ['Test-only scene review.', 'No real property or people are represented.'])],
  },
  {
    fir: `${TEST_PREFIX}TC4-ASSAULT`, title: 'TEST CASE 4 - ASSAULT INVESTIGATION', category: 'GENERAL',
    files: [text('TC4_incident_timeline.txt', 'Synthetic incident timeline. TEST LOCATION A -> INCIDENT POINT -> EXIT ROUTE.'), text('TC4_witness_statement.txt', 'TEST WITNESS STATEMENT\nFICTIONAL TEST DATA\nNeutral synthetic account for workflow testing.'), text('TC4_medical_summary.txt', 'TEST DATA - FICTIONAL MEDICAL SUMMARY\nGeneric non-graphic test summary. No real medical information.'), image('TC4_scene_diagram.png', 'TC4 NEUTRAL SCENE', ['TEST LOCATION A', 'INCIDENT POINT', 'EXIT ROUTE']), pdf('TC4_investigation_notes.pdf', 'TC4 SYNTHETIC INVESTIGATION NOTES', ['Neutral test notes only.', 'No graphic content is included.'])],
  },
  {
    fir: `${TEST_PREFIX}TC5-DIGITAL-EXTORTION`, title: 'TEST CASE 5 - DIGITAL EXTORTION', category: 'CYBERCRIME', sealedIndex: 1,
    files: [text('TC5_message_log.txt', 'TEST MESSAGE LOG\nFICTIONAL TEST DATA\nSynthetic extortion messages for workflow testing.'), { ...text('TC5_metadata.csv', 'Field,Value\nDevice,TEST DEVICE A\nRouter,TEST ROUTER\nServer,TEST SERVER'), sensitivity: 'SEALED', title: `${MARKER} - TEST SEALED RECORD` }, image('TC5_network_diagram.png', 'TC5 NETWORK DIAGRAM', ['TEST DEVICE A', 'TEST ROUTER', 'TEST SERVER', 'TEST DEVICE B']), text('TC5_investigation_notes.txt', 'Synthetic digital-extortion investigation notes. All identities and network references are fictional.'), pdf('TC5_evidence_summary.pdf', 'TC5 SYNTHETIC EVIDENCE SUMMARY', ['TEST SEALED RECORD', 'Fictional network evidence summary only.'])],
  },
];

function findUser(db: BetterSqliteWrapper, role: string): any {
  const user = db.prepare('SELECT user_id, name FROM users WHERE role = ? AND is_active = 1 LIMIT 1').get(role);
  if (!user) throw new Error(`Missing active ${role} user. Start the application once or configure bootstrap users first.`);
  return user;
}

function audit(db: BetterSqliteWrapper, actorId: string, action: string, caseId: string | null, documentId: string | null, detail: string) {
  const last = db.prepare('SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
  const previous = last?.entry_hash || null;
  const timestamp = new Date().toISOString();
  const entryHash = chainHash({ prev: previous, actor_id: actorId, action, document_id: documentId, case_id: caseId, detail, timestamp });
  db.prepare('INSERT INTO audit_log (log_id, actor_id, action, document_id, case_id, detail, timestamp, entry_hash, previous_entry_hash) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), actorId, action, documentId, caseId, detail, timestamp, entryHash, previous);
}

function writeVersion(db: BetterSqliteWrapper, documentId: string, userId: string, versionNumber: number, filename: string, bytes: Buffer, previousHash: string | null, previousText: string): any {
  const versionId = randomUUID();
  const physicalFilename = `${versionId}_${filename}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, physicalFilename), bytes);
  const fileHash = hashBuffer(bytes);
  const excerpt = extractText(bytes, filename.endsWith('.txt') ? 'text/plain' : undefined, filename);
  const drift = versionNumber > 1 ? compareVersions(previousText, excerpt) : { flagged: false, reason: null };
  db.prepare('INSERT INTO document_versions (version_id, document_id, version_number, file_path, original_filename, file_size, file_hash, previous_version_hash, text_excerpt, uploaded_by, drift_flag, drift_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(versionId, documentId, versionNumber, physicalFilename, filename, bytes.length, fileHash, previousHash, excerpt, userId, drift.flagged ? 1 : 0, drift.reason);
  return { versionId, fileHash, excerpt, drift };
}

async function createDataset() {
  const db = await initDatabase();
  const existing = db.prepare(`SELECT case_id FROM cases WHERE fir_number LIKE '${TEST_PREFIX}%'`).all();
  if (existing.length) throw new Error('Test dataset already exists. Run npm run testdata:clean first. Existing operational data was not changed.');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const admin = findUser(db, 'ADMIN');
  const io = findUser(db, 'IO');
  const forensic = findUser(db, 'FORENSIC_EXPERT');
  const prosecutor = findUser(db, 'PROSECUTOR');
  const court = findUser(db, 'COURT_OFFICER');
  const assignmentRoles = [[admin, 'WRITE'], [io, 'WRITE'], [forensic, 'READ'], [prosecutor, 'READ'], [court, 'READ']] as const;
  let documentCount = 0;
  let versionCount = 0;
  const createdCases: string[] = [];

  for (const fixture of cases) {
    const caseId = randomUUID();
    createdCases.push(caseId);
    db.prepare('INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction) VALUES (?,?,?,?,?,?,?)').run(caseId, fixture.fir, fixture.title, fixture.category, 'UNDER_INVESTIGATION', io.user_id, 'TEST JURISDICTION');
    audit(db, io.user_id, 'CASE_CREATED', caseId, null, `${MARKER}: ${fixture.title}`);
    for (const [user, access] of assignmentRoles.filter((_, index) => fixture.fir.includes('TC1') || index < 4)) {
      db.prepare('INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)').run(randomUUID(), caseId, user.user_id, access);
      audit(db, admin.user_id, 'CASE_ASSIGNED', caseId, null, `${MARKER}: ${user.name} assigned ${access}`);
    }
    for (let index = 0; index < fixture.files.length; index++) {
      const file = fixture.files[index];
      const documentId = randomUUID();
      const versions = file.versions || [file.content];
      db.prepare('INSERT INTO documents (document_id, case_id, doc_type, title, sensitivity_tier, created_by) VALUES (?,?,?,?,?,?)').run(documentId, caseId, file.docType, file.title, file.sensitivity, io.user_id);
      let previousHash: string | null = null;
      let previousText = '';
      let currentVersionId = '';
      for (let version = 0; version < versions.length; version++) {
        const result = writeVersion(db, documentId, io.user_id, version + 1, file.filename, versions[version], previousHash, previousText);
        currentVersionId = result.versionId; previousHash = result.fileHash; previousText = result.excerpt; versionCount++;
        audit(db, io.user_id, version === 0 ? 'DOCUMENT_UPLOAD' : (result.drift.flagged ? 'VERSION_DRIFT_FLAGGED' : 'VERSION_UPLOAD'), caseId, documentId, `${MARKER}: ${file.filename} v${version + 1}`);
      }
      db.prepare('UPDATE documents SET current_version_id = ? WHERE document_id = ?').run(currentVersionId, documentId);
      documentCount++;
    }
    if (fixture.victim) {
      db.prepare('INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, photo_ref, case_summary) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), caseId, 'TEST VICTIM', 'TEST ADDRESS - FICTIONAL', 'TEST-CONTACT-001', null, `${MARKER}: synthetic victim record for redaction testing.`);
      audit(db, io.user_id, 'VICTIM_RECORD_SAVED', caseId, null, `${MARKER}: victim redaction fixture`);
    }
    if (fixture.sealedIndex !== undefined) {
      const sealedDoc = db.prepare('SELECT document_id FROM documents WHERE case_id = ? ORDER BY rowid LIMIT 1 OFFSET ?').get(caseId, fixture.sealedIndex);
      if (sealedDoc) audit(db, io.user_id, 'SEALED_FIXTURE_CREATED', caseId, sealedDoc.document_id, `${MARKER}: TEST SEALED RECORD; request judicial authorization to test access.`);
    }
  }
  console.log(`\n========================================\nSuRakSha Chain Test Dataset\n========================================\nCases created: ${createdCases.length}\nDocuments created: ${documentCount}\nVersions created: ${versionCount}\nImages: 5\nSealed test record: 1\nVictim test record: 1\nPhysical files: ${versionCount}\nClassification: TEST DATA ONLY\nAll files: PHYSICALLY PRESENT\nSHA-256: CALCULATED FROM PHYSICAL FILES\n\nManual tamper test:\n1. Locate TC1_TAMPER_TEST.txt through the application and record its original hash.\n2. Verify integrity and confirm PASS.\n3. Modify exactly one byte in its physical file under uploads/.\n4. Verify integrity again; stored hash must remain unchanged and result must be FAIL / TAMPER DETECTED.\n5. Restore the original bytes or create a new version before continuing.\n`);
}

async function cleanDataset() {
  const db = await initDatabase();
  const testCases = db.prepare(`SELECT case_id FROM cases WHERE fir_number LIKE '${TEST_PREFIX}%'`).all();
  const caseIds = testCases.map((row: any) => row.case_id);
  if (!caseIds.length) { console.log('No TEST-DATA cases found. No data changed.'); return; }
  const placeholders = caseIds.map(() => '?').join(',');
  const docs = db.prepare(`SELECT document_id FROM documents WHERE case_id IN (${placeholders})`).all(caseIds);
  const documentIds = docs.map((row: any) => row.document_id);
  if (documentIds.length) {
    const docPlaceholders = documentIds.map(() => '?').join(',');
    const versions = db.prepare(`SELECT file_path FROM document_versions WHERE document_id IN (${docPlaceholders})`).all(documentIds);
    for (const version of versions) fs.rmSync(path.join(UPLOADS_DIR, version.file_path), { force: true });
    db.prepare(`DELETE FROM document_versions WHERE document_id IN (${docPlaceholders})`).run(documentIds);
    db.prepare(`DELETE FROM unseal_requests WHERE document_id IN (${docPlaceholders})`).run(documentIds);
    db.prepare(`DELETE FROM documents WHERE document_id IN (${docPlaceholders})`).run(documentIds);
  }
  db.prepare(`DELETE FROM victim_records WHERE case_id IN (${placeholders})`).run(caseIds);
  db.prepare(`DELETE FROM case_assignments WHERE case_id IN (${placeholders})`).run(caseIds);
  db.prepare(`DELETE FROM audit_log WHERE case_id IN (${placeholders}) OR detail LIKE '${MARKER}%'`).run(caseIds);
  db.prepare(`DELETE FROM cases WHERE case_id IN (${placeholders})`).run(caseIds);
  console.log(`Removed ${caseIds.length} TEST-DATA cases and their generated records/files. Demo users and unrelated data were preserved.`);
}

async function verifyDataset() {
  const db = await initDatabase();
  const testCases = db.prepare(`SELECT case_id FROM cases WHERE fir_number LIKE '${TEST_PREFIX}%'`).all();
  const caseIds = testCases.map((row: any) => row.case_id);
  if (!caseIds.length) throw new Error('No TEST-DATA cases found. Run npm run testdata:create first.');
  const casePlaceholders = caseIds.map(() => '?').join(',');
  const documents = db.prepare(`SELECT document_id, case_id FROM documents WHERE case_id IN (${casePlaceholders})`).all(caseIds);
  const documentIds = documents.map((row: any) => row.document_id);
  const documentPlaceholders = documentIds.map(() => '?').join(',');
  const versions = db.prepare(`SELECT dv.*, d.case_id FROM document_versions dv JOIN documents d ON d.document_id = dv.document_id WHERE dv.document_id IN (${documentPlaceholders})`).all(documentIds);
  let hashMatches = 0;
  let missingFiles = 0;
  let outsideRoot = 0;
  let pngFiles = 0;
  let pdfFiles = 0;
  let versionChainMismatches = 0;
  for (const version of versions) {
    const resolved = path.resolve(UPLOADS_DIR, version.file_path);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) outsideRoot++;
    if (!fs.existsSync(resolved)) { missingFiles++; continue; }
    const bytes = fs.readFileSync(resolved);
    if (hashBuffer(bytes) === version.file_hash) hashMatches++;
    if (version.original_filename.endsWith('.png') && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) pngFiles++;
    if (version.original_filename.endsWith('.pdf') && bytes.subarray(0, 5).toString() === '%PDF-') pdfFiles++;
  }
  for (const document of documents) {
    const documentVersions = db.prepare('SELECT version_number, file_hash, previous_version_hash FROM document_versions WHERE document_id = ? ORDER BY version_number ASC').all(document.document_id);
    for (let index = 1; index < documentVersions.length; index++) {
      if (documentVersions[index].previous_version_hash !== documentVersions[index - 1].file_hash) versionChainMismatches++;
    }
  }
  const auditCount = db.prepare(`SELECT COUNT(*) AS count FROM audit_log WHERE case_id IN (${casePlaceholders})`).get(caseIds).count;
  const victimCount = db.prepare(`SELECT COUNT(*) AS count FROM victim_records WHERE case_id IN (${casePlaceholders})`).get(caseIds).count;
  const sealedCount = db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE sensitivity_tier = 'SEALED' AND case_id IN (${casePlaceholders})`).get(caseIds).count;
  const expectedFileCount = versions.length;
  const passed = hashMatches === expectedFileCount && missingFiles === 0 && outsideRoot === 0 && pngFiles === 5 && pdfFiles >= 5 && versionChainMismatches === 0;
  console.log(JSON.stringify({ cases: caseIds.length, documents: documents.length, versions: versions.length, physicalFiles: expectedFileCount, hashMatches, hashMismatches: expectedFileCount - hashMatches, missingFiles, outsideRoot, pngFiles, pdfFiles, versionChainMismatches, auditCount, victimCount, sealedCount, passed }, null, 2));
  if (!passed) process.exitCode = 1;
}

const command = process.argv[2];
if (command === 'create') createDataset().catch((error) => { console.error(error.message); process.exit(1); });
else if (command === 'clean') cleanDataset().catch((error) => { console.error(error.message); process.exit(1); });
else if (command === 'verify') verifyDataset().catch((error) => { console.error(error.message); process.exit(1); });
else { console.error('Usage: tsx scripts/generate-test-evidence.ts <create|verify|clean>'); process.exit(1); }
