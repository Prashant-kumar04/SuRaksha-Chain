import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';

import { initDatabase, BetterSqliteWrapper } from './server/db';
import { hashBuffer, chainHash } from './server/utils/hash';
import { extractText, compareVersions } from './server/utils/drift';
import { requireAuth, requireRole, JWT_SECRET, AuthRequest } from './server/middleware/auth';
import { seedDatabase } from './server/seed';

const VALID_ROLES = ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'];
const VALID_DOC_TYPES = ['FIR', 'WITNESS_STATEMENT', 'CHARGESHEET', 'FORENSIC_REPORT', 'COURT_FILING', 'EVIDENCE_RECORD', 'SEIZURE_MEMO', 'LEGAL_NOTICE'];
const VALID_SENSITIVITY_TIERS = ['STANDARD', 'RESTRICTED', 'SEALED'];

async function startServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port number.');
  if (isProduction) {
    if (!process.env.APP_URL) throw new Error('APP_URL must be set in production.');
    if (!process.env.CORS_ORIGINS || process.env.CORS_ORIGINS.includes('*')) throw new Error('CORS_ORIGINS must be an explicit production origin allowlist.');
    if (!process.env.BOOTSTRAP_PASSWORD) throw new Error('BOOTSTRAP_PASSWORD must be set in production to provision the SIH bootstrap accounts.');
    const parsedAppUrl = new URL(appUrl);
    if (parsedAppUrl.protocol !== 'https:') throw new Error('APP_URL must use HTTPS in production.');
  }
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (isProduction && appUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (isProduction) res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'");
    next();
  });
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'suraksha-chain-api' });
  });

  // Initialize DB and Seed
  const db: BetterSqliteWrapper = await initDatabase();
  await seedDatabase(db);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  const uploadsDir = path.join(process.env.DATA_DIR || process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Security Helper: Safe physical upload path generation preventing directory traversal attacks
  function getSafeUploadPath(baseDir: string, originalname: string, prefix: string): { filename: string; filePath: string } {
    // Strip any leading/trailing slashes, backslashes, and directory parts
    const safeBaseName = path.basename(originalname).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'document.dat';
    const safeFilename = `${prefix}_${safeBaseName}`;
    const resolvedPath = path.resolve(baseDir, safeFilename);
    const resolvedBase = path.resolve(baseDir);

    // Verify path stays strictly within the uploads directory
    if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
      throw new Error('Path traversal rejected: Filename contains invalid characters or traversal sequence.');
    }
    return { filename: safeFilename, filePath: resolvedPath };
  }

  // Security Helper: Resolve an existing stored filename safely within uploads directory
  function resolveSafeUploadPath(baseDir: string, storedFilename: string): string {
    const safeBase = path.basename(storedFilename);
    const resolvedPath = path.resolve(baseDir, safeBase);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
      throw new Error('Path traversal rejected: Attempted to access file outside allowed storage root.');
    }
    return resolvedPath;
  }

  // Helper: write a chained audit log entry
  function writeAudit({
    actor_id,
    action,
    document_id = null,
    case_id = null,
    detail = null,
  }: {
    actor_id: string;
    action: string;
    document_id?: string | null;
    case_id?: string | null;
    detail?: string | null;
  }) {
    const last = db.prepare('SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
    const prev = last ? last.entry_hash : null;
    const timestamp = new Date().toISOString();
    const entry_hash = chainHash({ prev, actor_id, action, document_id, case_id, detail, timestamp });
    const log_id = randomUUID();
    db.prepare(`INSERT INTO audit_log (log_id, actor_id, action, document_id, case_id, detail, timestamp, entry_hash, previous_entry_hash)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(log_id, actor_id, action, document_id, case_id, detail, timestamp, entry_hash, prev);
    return log_id;
  }

  function userCanAccessCase(user: any, case_id: string): boolean {
    if (!user || !case_id) return false;
    if (['ADMIN', 'COURT_OFFICER'].includes(user.role)) return true;
    const row = db.prepare(`SELECT 1 FROM case_assignments WHERE case_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`).get(case_id, user.user_id);
    return !!row;
  }

  function userCanWriteCase(user: any, case_id: string): boolean {
    if (!user || !case_id) return false;
    if (user.role === 'ADMIN') return true;
    const row = db.prepare(`SELECT 1 FROM case_assignments
      WHERE case_id = ? AND user_id = ? AND access_level = 'WRITE'
      AND (expires_at IS NULL OR expires_at > datetime('now'))`).get(case_id, user.user_id);
    return !!row;
  }

  function hasApprovedUnseal(document_id: string): boolean {
    const request = db.prepare(`SELECT status FROM unseal_requests
      WHERE document_id = ? ORDER BY requested_at DESC, rowid DESC LIMIT 1`).get(document_id);
    return request?.status === 'APPROVED';
  }

  function canViewSealedContent(user: any, doc: any): boolean {
    return doc.sensitivity_tier !== 'SEALED'
      || ['ADMIN', 'COURT_OFFICER'].includes(user.role)
      || hasApprovedUnseal(doc.document_id);
  }

  // =====================================================================
  // AUTH
  // =====================================================================
  app.post('/api/auth/login', (req, res) => {
    const clientKey = req.ip || 'unknown';
    const now = Date.now();
    const attempt = loginAttempts.get(clientKey);
    if (attempt && attempt.resetAt > now && attempt.count >= 10) {
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    const { email, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid email and password strings are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.trim());
    if (!user) {
      const current = loginAttempts.get(clientKey);
      loginAttempts.set(clientKey, { count: (current?.resetAt > now ? current.count : 0) + 1, resetAt: now + 15 * 60 * 1000 });
      return res.status(401).json({ error: 'Invalid credentials or user not found.' });
    }

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      const current = loginAttempts.get(clientKey);
      loginAttempts.set(clientKey, { count: (current?.resetAt > now ? current.count : 0) + 1, resetAt: now + 15 * 60 * 1000 });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    loginAttempts.delete(clientKey);

    const token = jwt.sign(
      {
        user_id: user.user_id,
        name: user.name,
        role: user.role,
        department: user.department,
        jurisdiction: user.jurisdiction,
        badge_number: user.badge_number,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    writeAudit({ actor_id: user.user_id, action: 'AUTH_LOGIN', detail: `User logged in: ${user.email} (${user.role})` });
    res.json({
      token,
      user: {
        id: user.user_id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        jurisdiction: user.jurisdiction,
        badge_number: user.badge_number,
      },
    });
  });


  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    const user = db.prepare('SELECT user_id, name, email, role, department, jurisdiction, badge_number FROM users WHERE user_id = ?').get(req.user!.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ...user, id: user.user_id });
  });

  // =====================================================================
  // USERS (Admin Management)
  // =====================================================================
  app.get('/api/users', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const rows = db.prepare('SELECT user_id, name, email, role, department, jurisdiction, badge_number, created_at FROM users WHERE is_active = 1').all();
    res.json(rows.map((r) => ({ ...r, id: r.user_id })));
  });

  app.post('/api/users', requireAuth, requireRole('ADMIN'), (req: AuthRequest, res) => {
    const { name, email, password, role, department, jurisdiction, badge_number } = req.body;
    if (!name || !email || !password || !role || typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid user role.' });
    const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'User with this email already exists.' });
    if (role === 'ADMIN' && db.prepare('SELECT 1 FROM users WHERE role = ? AND is_active = 1 LIMIT 1').get('ADMIN')) {
      return res.status(409).json({ error: 'Only one active Administrator account is permitted.' });
    }

    const user_id = randomUUID();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`INSERT INTO users (user_id, name, email, password_hash, role, department, jurisdiction, badge_number) VALUES (?,?,?,?,?,?,?,?)`)
      .run(user_id, name, email, hash, role, department || null, jurisdiction || null, badge_number || null);

    writeAudit({
      actor_id: req.user!.user_id,
      action: 'USER_CREATED',
      detail: `Admin created officer account: ${name} (${role}, ${email})`,
    });

    res.json({ ok: true, user_id });
  });

  // =====================================================================
  // CASES
  // =====================================================================
  app.get('/api/cases', requireAuth, (req: AuthRequest, res) => {
    let rows;
    if (['ADMIN', 'COURT_OFFICER'].includes(req.user!.role)) {
      rows = db.prepare('SELECT * FROM cases ORDER BY created_at DESC').all();
    } else {
      rows = db.prepare(`
        SELECT c.* FROM cases c
        JOIN case_assignments ca ON ca.case_id = c.case_id
        WHERE ca.user_id = ? AND (ca.expires_at IS NULL OR ca.expires_at > datetime('now'))
        ORDER BY c.created_at DESC
      `).all(req.user!.user_id);
    }
    res.json(rows);
  });

  app.get('/api/cases/:id', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });
    if (!userCanAccessCase(req.user, case_id)) {
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }
    res.json(kase);
  });

  app.post('/api/cases', requireAuth, requireRole('IO', 'ADMIN', 'COURT_OFFICER'), (req: AuthRequest, res) => {
    const { fir_number, case_title, case_category, jurisdiction } = req.body;
    if (!fir_number || !case_title) {
      return res.status(400).json({ error: 'FIR number and Case Title are required.' });
    }

    const existing = db.prepare('SELECT 1 FROM cases WHERE fir_number = ?').get(fir_number);
    if (existing) return res.status(400).json({ error: `Case with FIR number ${fir_number} already exists.` });

    const case_id = randomUUID();
    db.prepare(`INSERT INTO cases (case_id, fir_number, case_title, case_category, status, created_by, jurisdiction)
                VALUES (?,?,?,?,?,?,?)`)
      .run(case_id, fir_number, case_title, case_category || 'GENERAL', 'UNDER_INVESTIGATION', req.user!.user_id, jurisdiction || req.user!.jurisdiction || 'District East');

    // Automatically assign the creator to the case
    db.prepare(`INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)`)
      .run(randomUUID(), case_id, req.user!.user_id, 'WRITE');

    writeAudit({
      actor_id: req.user!.user_id,
      action: 'CASE_CREATED',
      case_id,
      detail: `Registered new case FIR: ${fir_number} — ${case_title}`,
    });

    res.json({ ok: true, case_id });
  });

  app.patch('/api/cases/:id', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });
    if (!['ADMIN', 'IO'].includes(req.user!.role) || (req.user!.role === 'IO' && kase.created_by !== req.user!.user_id)) {
      return res.status(403).json({ error: 'Only Administrators or the case-owning IO may edit this case.' });
    }

    const { fir_number, case_title, case_category, jurisdiction, status } = req.body;
    if (!fir_number || !case_title) return res.status(400).json({ error: 'FIR number and Case Title are required.' });
    const duplicate = db.prepare('SELECT case_id FROM cases WHERE fir_number = ? AND case_id <> ?').get(fir_number, case_id);
    if (duplicate) return res.status(409).json({ error: `Case with FIR number ${fir_number} already exists.` });

    db.prepare(`UPDATE cases SET fir_number = ?, case_title = ?, case_category = ?, jurisdiction = ?, status = ? WHERE case_id = ?`)
      .run(fir_number, case_title, case_category || 'GENERAL', jurisdiction || null, status || kase.status, case_id);
    writeAudit({ actor_id: req.user!.user_id, action: 'CASE_UPDATED', case_id, detail: `Updated case FIR: ${fir_number} — ${case_title}` });
    res.json({ ok: true, case_id });
  });

  app.post('/api/cases/:id/assignments', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });

    // Only Admin or the IO who owns the case may manage assignments.
    if (!['ADMIN', 'IO'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Only Administrators and Investigating Officers may manage case assignments.' });
    }
    if (req.user!.role === 'IO' && kase.created_by !== req.user!.user_id) {
      return res.status(403).json({ error: 'You can only manage assignments for cases you own.' });
    }

    const { user_id, access_level } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    if (!['READ', 'WRITE'].includes(access_level || 'READ')) return res.status(400).json({ error: 'access_level must be READ or WRITE.' });
    const targetUser = db.prepare('SELECT 1 FROM users WHERE user_id = ? AND is_active = 1').get(user_id);
    if (!targetUser) return res.status(404).json({ error: 'Target user does not exist.' });

    const assignmentId = randomUUID();
    try {
      db.prepare(`INSERT INTO case_assignments (assignment_id, case_id, user_id, access_level) VALUES (?,?,?,?)`)
        .run(assignmentId, case_id, user_id, access_level || 'READ');
    } catch {
      return res.status(409).json({ error: 'User is already assigned to this case.' });
    }

    writeAudit({
      actor_id: req.user!.user_id,
      action: 'CASE_ASSIGNED',
      case_id,
      detail: `Assigned user ${user_id} with access ${access_level || 'READ'}`,
    });

    res.json({ ok: true, assignment_id: assignmentId });
  });

  app.get('/api/cases/:id/assignments', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT created_by FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });
    const isManager = req.user!.role === 'ADMIN' || (req.user!.role === 'IO' && kase.created_by === req.user!.user_id);
    if (!isManager) return res.status(403).json({ error: 'Only Administrators and the case-owning IO may view assignments.' });

    const assignments = db.prepare(`
      SELECT ca.assignment_id, ca.case_id, ca.user_id, ca.access_level, ca.assigned_at,
             u.name, u.email, u.role
      FROM case_assignments ca
      JOIN users u ON u.user_id = ca.user_id
      WHERE ca.case_id = ?
      ORDER BY ca.assigned_at ASC, ca.rowid ASC
    `).all(case_id);
    res.json(assignments);
  });

  app.patch('/api/cases/:id/assignments/:assignmentId', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT created_by FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });
    const isManager = req.user!.role === 'ADMIN' || (req.user!.role === 'IO' && kase.created_by === req.user!.user_id);
    if (!isManager) return res.status(403).json({ error: 'Only Administrators or the case-owning IO may modify assignments.' });
    const { access_level } = req.body;
    if (!['READ', 'WRITE'].includes(access_level)) return res.status(400).json({ error: 'access_level must be READ or WRITE.' });
    const assignment = db.prepare('SELECT user_id FROM case_assignments WHERE assignment_id = ? AND case_id = ?').get(req.params.assignmentId, case_id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    db.prepare('UPDATE case_assignments SET access_level = ? WHERE assignment_id = ?').run(access_level, req.params.assignmentId);
    writeAudit({ actor_id: req.user!.user_id, action: 'CASE_ASSIGNMENT_UPDATED', case_id, detail: `Updated user ${assignment.user_id} access to ${access_level}` });
    res.json({ ok: true });
  });

  app.delete('/api/cases/:id/assignments/:assignmentId', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT created_by FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });
    const isManager = req.user!.role === 'ADMIN' || (req.user!.role === 'IO' && kase.created_by === req.user!.user_id);
    if (!isManager) return res.status(403).json({ error: 'Only Administrators or the case-owning IO may modify assignments.' });
    const assignment = db.prepare('SELECT user_id FROM case_assignments WHERE assignment_id = ? AND case_id = ?').get(req.params.assignmentId, case_id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    if (assignment.user_id === kase.created_by) return res.status(400).json({ error: 'The case owner cannot be removed from the case.' });
    db.prepare('DELETE FROM case_assignments WHERE assignment_id = ?').run(req.params.assignmentId);
    writeAudit({ actor_id: req.user!.user_id, action: 'CASE_ASSIGNMENT_REMOVED', case_id, detail: `Removed user ${assignment.user_id} from case` });
    res.json({ ok: true });
  });

  app.delete('/api/cases/:id', requireAuth, requireRole('ADMIN'), (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT case_id, fir_number FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });

    const documents = db.prepare('SELECT document_id FROM documents WHERE case_id = ?').all(case_id);
    const documentIds = documents.map((document) => document.document_id);
    if (documentIds.length) {
      const placeholders = documentIds.map(() => '?').join(',');
      const versions = db.prepare(`SELECT file_path FROM document_versions WHERE document_id IN (${placeholders})`).all(documentIds);
      for (const version of versions) {
        fs.rmSync(resolveSafeUploadPath(uploadsDir, version.file_path), { force: true });
      }
      db.prepare(`DELETE FROM document_versions WHERE document_id IN (${placeholders})`).run(documentIds);
      db.prepare(`DELETE FROM unseal_requests WHERE document_id IN (${placeholders})`).run(documentIds);
      db.prepare(`DELETE FROM documents WHERE document_id IN (${placeholders})`).run(documentIds);
    }

    db.prepare('DELETE FROM case_notes WHERE case_id = ?').run(case_id);
    db.prepare('DELETE FROM victim_records WHERE case_id = ?').run(case_id);
    db.prepare('DELETE FROM case_assignments WHERE case_id = ?').run(case_id);
    writeAudit({
      actor_id: req.user!.user_id,
      action: 'CASE_DELETED',
      case_id,
      detail: `Deleted case FIR: ${kase.fir_number}`,
    });
    db.prepare('DELETE FROM cases WHERE case_id = ?').run(case_id);

    res.json({ ok: true, case_id, fir_number: kase.fir_number });
  });

  app.get('/api/cases/:id/documents', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    if (!userCanAccessCase(req.user, case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', case_id, detail: 'Attempted to list documents without case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }
    const docs = db.prepare(`
      SELECT d.*, v.file_hash AS current_hash, v.version_number AS current_version_number, v.drift_flag, v.drift_notes, v.uploaded_at AS latest_upload_at
      FROM documents d
      LEFT JOIN document_versions v ON v.version_id = d.current_version_id
      WHERE d.case_id = ?
      ORDER BY d.created_at DESC
    `).all(case_id);
    res.json(docs.map((doc: any) => canViewSealedContent(req.user, doc) ? doc : {
      ...doc,
      current_hash: null,
      drift_flag: null,
      drift_notes: null,
      latest_upload_at: null,
    }));
  });

  app.get('/api/search', requireAuth, (req: AuthRequest, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) return res.json([]);
    const pattern = `%${query}%`;
    const elevated = ['ADMIN', 'COURT_OFFICER'].includes(req.user!.role);
    const rows = elevated
      ? db.prepare(`SELECT d.document_id, d.case_id, d.title, d.doc_type, d.sensitivity_tier, c.fir_number, c.case_title,
          v.original_filename, v.text_excerpt, v.uploaded_at
          FROM documents d JOIN cases c ON c.case_id = d.case_id
          LEFT JOIN document_versions v ON v.version_id = d.current_version_id
          WHERE d.title LIKE ? OR d.doc_type LIKE ? OR v.text_excerpt LIKE ?
          ORDER BY d.created_at DESC`).all(pattern, pattern, pattern)
      : db.prepare(`SELECT d.document_id, d.case_id, d.title, d.doc_type, d.sensitivity_tier, c.fir_number, c.case_title,
          v.original_filename, v.text_excerpt, v.uploaded_at
          FROM documents d JOIN cases c ON c.case_id = d.case_id
          JOIN case_assignments ca ON ca.case_id = d.case_id
          LEFT JOIN document_versions v ON v.version_id = d.current_version_id
          WHERE ca.user_id = ? AND (ca.expires_at IS NULL OR ca.expires_at > datetime('now'))
            AND (d.title LIKE ? OR d.doc_type LIKE ? OR v.text_excerpt LIKE ?)
          ORDER BY d.created_at DESC`).all(req.user!.user_id, pattern, pattern, pattern);
    res.json(rows.map((row: any) => canViewSealedContent(req.user, row) ? row : { ...row, text_excerpt: null }));
  });

  app.get('/api/cases/:id/notes', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    if (!userCanAccessCase(req.user, case_id)) return res.status(403).json({ error: 'You are not assigned to this case.' });
    const notes = db.prepare(`SELECT n.*, u.name AS author_name, u.role AS author_role
      FROM case_notes n JOIN users u ON u.user_id = n.author_id
      WHERE n.case_id = ? ORDER BY n.created_at DESC`).all(case_id);
    res.json(notes);
  });

  app.post('/api/cases/:id/notes', requireAuth, (req: AuthRequest, res) => {
    const case_id = req.params.id;
    if (!userCanAccessCase(req.user, case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', case_id, detail: 'Attempted to add case note without case access' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }
    const note_text = typeof req.body.note_text === 'string' ? req.body.note_text.trim() : '';
    const document_id = typeof req.body.document_id === 'string' && req.body.document_id ? req.body.document_id : null;
    if (!note_text || note_text.length > 4000) return res.status(400).json({ error: 'note_text is required and must be 1-4000 characters.' });
    if (document_id) {
      const doc = db.prepare('SELECT case_id FROM documents WHERE document_id = ?').get(document_id);
      if (!doc || doc.case_id !== case_id) return res.status(400).json({ error: 'Document does not belong to this case.' });
    }
    const note_id = randomUUID();
    db.prepare('INSERT INTO case_notes (note_id, case_id, document_id, author_id, note_text) VALUES (?,?,?,?,?)')
      .run(note_id, case_id, document_id, req.user!.user_id, note_text);
    writeAudit({ actor_id: req.user!.user_id, action: 'CASE_NOTE_ADDED', case_id, document_id, detail: `Case note added: ${note_text.slice(0, 160)}` });
    res.json({ note_id });
  });

  // =====================================================================
  // DOCUMENT UPLOAD, VERSIONING & SECURE DOWNLOAD
  // =====================================================================
  app.post('/api/documents/upload', requireAuth, upload.single('file'), (req: AuthRequest, res) => {
    try {
      const { case_id, doc_type, title, sensitivity_tier } = req.body;
      if (!req.file) return res.status(400).json({ error: 'No file received.' });
      if (!case_id) return res.status(400).json({ error: 'case_id is required.' });
      if (doc_type && !VALID_DOC_TYPES.includes(doc_type)) return res.status(400).json({ error: 'Invalid document type.' });
      if (sensitivity_tier && !VALID_SENSITIVITY_TIERS.includes(sensitivity_tier)) return res.status(400).json({ error: 'Invalid sensitivity tier.' });

      // IDOR & Authorization check
      if (!userCanWriteCase(req.user, case_id)) {
        writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', case_id, detail: 'Attempted to upload document without WRITE access' });
        return res.status(403).json({ error: 'You have READ access to this case, but WRITE access is required for uploads.' });
      }

      const file_hash = hashBuffer(req.file.buffer);
      const document_id = randomUUID();
      const version_id = randomUUID();

      // Safe path creation preventing traversal
      const { filename, filePath } = getSafeUploadPath(uploadsDir, req.file.originalname, version_id);
      fs.writeFileSync(filePath, req.file.buffer);

      const text_excerpt = extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

      try {
        db.prepare(`INSERT INTO documents (document_id, case_id, doc_type, title, sensitivity_tier, created_by) VALUES (?,?,?,?,?,?)`)
          .run(document_id, case_id, doc_type || 'EVIDENCE_RECORD', title || req.file.originalname, sensitivity_tier || 'STANDARD', req.user!.user_id);
        db.prepare(`INSERT INTO document_versions (version_id, document_id, version_number, file_path, original_filename, file_size, file_hash, previous_version_hash, text_excerpt, uploaded_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(version_id, document_id, 1, filename, req.file.originalname, req.file.size, file_hash, null, text_excerpt, req.user!.user_id);
        db.prepare(`UPDATE documents SET current_version_id = ? WHERE document_id = ?`).run(version_id, document_id);
      } catch (dbError) {
        try { db.prepare('DELETE FROM document_versions WHERE version_id = ?').run(version_id); } catch {}
        try { db.prepare('DELETE FROM documents WHERE document_id = ?').run(document_id); } catch {}
        fs.rmSync(filePath, { force: true });
        throw dbError;
      }

      writeAudit({
        actor_id: req.user!.user_id,
        action: 'DOCUMENT_UPLOAD',
        document_id,
        case_id,
        detail: `v1 uploaded: "${title || req.file.originalname}", SHA-256: ${file_hash}`,
      });

      res.json({ document_id, version_id, file_hash });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Document upload failed.' });
    }
  });

  app.post('/api/documents/:id/versions', requireAuth, upload.single('file'), (req: AuthRequest, res) => {
    try {
      const document_id = req.params.id;
      const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
      if (!doc) return res.status(404).json({ error: 'Document not found.' });

      // IDOR & Authorization check
      if (!userCanWriteCase(req.user, doc.case_id)) {
        writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', document_id, case_id: doc.case_id, detail: 'Attempted to upload version without WRITE access' });
        return res.status(403).json({ error: 'You have READ access to this case, but WRITE access is required for version uploads.' });
      }
      if (!req.file) return res.status(400).json({ error: 'No file received.' });

      const prevVersion = db.prepare('SELECT * FROM document_versions WHERE version_id = ?').get(doc.current_version_id);
      const file_hash = hashBuffer(req.file.buffer);
      const version_id = randomUUID();

      // Safe path creation preventing traversal
      const { filename, filePath } = getSafeUploadPath(uploadsDir, req.file.originalname, version_id);
      fs.writeFileSync(filePath, req.file.buffer);

      const text_excerpt = extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
      const { flagged, reason, changeRatio } = compareVersions(prevVersion ? prevVersion.text_excerpt : '', text_excerpt);

      const version_number = prevVersion ? prevVersion.version_number + 1 : 1;
      try {
        db.prepare(`INSERT INTO document_versions (version_id, document_id, version_number, file_path, original_filename, file_size, file_hash, previous_version_hash, text_excerpt, uploaded_by, drift_flag, drift_notes)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(version_id, document_id, version_number, filename, req.file.originalname, req.file.size, file_hash, prevVersion ? prevVersion.file_hash : null, text_excerpt, req.user!.user_id, flagged ? 1 : 0, reason);
        db.prepare(`UPDATE documents SET current_version_id = ? WHERE document_id = ?`).run(version_id, document_id);
      } catch (dbError) {
        try { db.prepare('DELETE FROM document_versions WHERE version_id = ?').run(version_id); } catch {}
        fs.rmSync(filePath, { force: true });
        throw dbError;
      }

      writeAudit({
        actor_id: req.user!.user_id,
        action: flagged ? 'VERSION_DRIFT_FLAGGED' : 'VERSION_UPLOAD',
        document_id,
        case_id: doc.case_id,
        detail: flagged ? `v${version_number} uploaded — DRIFT DETECTED: ${reason}` : `v${version_number} uploaded, SHA-256: ${file_hash}`,
      });

      res.json({ version_id, file_hash, drift_flag: flagged, drift_notes: reason, change_ratio: changeRatio });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Version upload failed.' });
    }
  });

  app.get('/api/documents/:id/versions', requireAuth, (req: AuthRequest, res) => {
    const document_id = req.params.id;
    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // IDOR & Authorization check
    if (!userCanAccessCase(req.user, doc.case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', document_id, case_id: doc.case_id, detail: 'Attempted to view versions without case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    const versions = db.prepare(`
      SELECT dv.*, u.name as uploaded_by_name, u.role as uploaded_by_role
      FROM document_versions dv
      LEFT JOIN users u ON u.user_id = dv.uploaded_by
      WHERE dv.document_id = ?
      ORDER BY dv.version_number ASC
    `).all(document_id);

    writeAudit({ actor_id: req.user!.user_id, action: 'VIEW_VERSIONS', document_id, case_id: doc.case_id, detail: 'Inspected document version history' });
    if (!canViewSealedContent(req.user, doc)) {
      return res.json({
        document: { ...doc, current_version_id: null },
        versions: versions.map((version: any) => ({
          ...version,
          file_path: null,
          file_hash: null,
          previous_version_hash: null,
          text_excerpt: null,
        })),
      });
    }
    res.json({ document: doc, versions });
  });

  // Secure, authorized document file download endpoint
  app.get('/api/documents/:id/download', requireAuth, (req: AuthRequest, res) => {
    const document_id = req.params.id;
    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // IDOR check: Verify caller has case access
    if (!userCanAccessCase(req.user, doc.case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'UNAUTHORIZED_DOWNLOAD_BLOCKED', document_id, case_id: doc.case_id, detail: 'Download denied: no case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    // Sensitivity check: SEALED documents require judicial authorization
    if (doc.sensitivity_tier === 'SEALED' && !['COURT_OFFICER', 'ADMIN'].includes(req.user!.role)) {
      const unseal = db.prepare(`SELECT * FROM unseal_requests WHERE document_id = ? AND status = 'APPROVED'`).get(document_id);
      if (!unseal) {
        writeAudit({ actor_id: req.user!.user_id, action: 'SEALED_DOWNLOAD_BLOCKED', document_id, case_id: doc.case_id, detail: 'Download blocked: document is sealed without approved unseal order' });
        return res.status(403).json({ error: 'Document is SEALED. A judicial unseal order is required to access or download.' });
      }
    }

    const currentVersion = db.prepare('SELECT * FROM document_versions WHERE version_id = ?').get(doc.current_version_id);
    if (!currentVersion) return res.status(404).json({ error: 'Version record not found.' });

    try {
      const physicalPath = resolveSafeUploadPath(uploadsDir, currentVersion.file_path);
      if (!fs.existsSync(physicalPath)) return res.status(404).json({ error: 'Physical evidence file missing on disk.' });

      writeAudit({
        actor_id: req.user!.user_id,
        action: 'DOCUMENT_DOWNLOADED',
        document_id,
        case_id: doc.case_id,
        detail: `Downloaded document: "${doc.title}" (v${currentVersion.version_number})`,
      });

      res.download(physicalPath, currentVersion.original_filename || 'evidence.dat');
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'File access error.' });
    }
  });

  app.get('/api/documents/:id/section-65b-certificate', requireAuth, (req: AuthRequest, res) => {
    const document_id = req.params.id;
    const row = db.prepare(`SELECT d.*, v.file_hash, v.original_filename, v.uploaded_at, u.name AS uploader_name, u.email AS uploader_email
      FROM documents d JOIN document_versions v ON v.version_id = d.current_version_id
      LEFT JOIN users u ON u.user_id = v.uploaded_by WHERE d.document_id = ?`).get(document_id);
    if (!row) return res.status(404).json({ error: 'Document not found.' });
    if (!userCanAccessCase(req.user, row.case_id)) return res.status(403).json({ error: 'You are not assigned to this case.' });
    if (!canViewSealedContent(req.user, row)) return res.status(403).json({ error: 'Document content is SEALED pending judicial authorization.' });
    writeAudit({ actor_id: req.user!.user_id, action: 'SECTION_65B_CERTIFICATE_GENERATED', document_id, case_id: row.case_id, detail: `Generated certificate for SHA-256 ${row.file_hash}` });
    const certificate = [
      'SECTION 65B ELECTRONIC RECORD CERTIFICATE',
      '==========================================',
      `Document title: ${row.title}`,
      `Original filename: ${row.original_filename || 'Not recorded'}`,
      `SHA-256 hash: ${row.file_hash}`,
      `Upload timestamp: ${row.uploaded_at}`,
      `Uploader identity: ${row.uploader_name || 'Unknown'} (${row.uploader_email || 'Unknown'})`,
      '',
      'DECLARATION',
      'This certificate records the identifying particulars of the electronic record stored in the SuRakSha Chain registry. The record was produced from the information system in the ordinary course of activity, and the system was operating properly at the relevant time. The SHA-256 value above is the hash recorded for the uploaded version.',
      '',
      'This is a structured evidence record and not legal advice. Its use and sufficiency should be assessed by the appropriate legal authority.',
    ].join('\n');
    res.type('text/plain').setHeader('Content-Disposition', `attachment; filename="${document_id}-section-65b-certificate.txt"`).send(certificate);
  });

  app.get('/api/documents/:id/diff', requireAuth, (req: AuthRequest, res) => {
    const document_id = req.params.id;
    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // IDOR check
    if (!userCanAccessCase(req.user, doc.case_id)) {
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    if (!canViewSealedContent(req.user, doc)) {
      return res.status(403).json({ error: 'Document content is SEALED pending judicial authorization.' });
    }

    const { v1, v2 } = req.query as { v1: string; v2: string };
    const a = db.prepare('SELECT * FROM document_versions WHERE version_id = ? AND document_id = ?').get(v1, document_id);
    const b = db.prepare('SELECT * FROM document_versions WHERE version_id = ? AND document_id = ?').get(v2, document_id);
    if (!a || !b) return res.status(404).json({ error: 'Version not found.' });
    const result = compareVersions(a.text_excerpt, b.text_excerpt);
    res.json(result);
  });

  // =====================================================================
  // PHYSICAL FILE INTEGRITY & FILE TAMPER TEST
  // =====================================================================
  app.get('/api/documents/:id/verify-file', requireAuth, (req: AuthRequest, res) => {
    const document_id = req.params.id;
    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // IDOR check
    if (!userCanAccessCase(req.user, doc.case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', document_id, case_id: doc.case_id, detail: 'Attempted to verify file without case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    if (!canViewSealedContent(req.user, doc)) {
      return res.status(403).json({ error: 'Document content is SEALED pending judicial authorization.' });
    }

    const currentVersion = db.prepare('SELECT * FROM document_versions WHERE version_id = ?').get(doc.current_version_id);
    if (!currentVersion) return res.status(404).json({ error: 'No version record on file.' });

    let physicalPath: string;
    try {
      physicalPath = resolveSafeUploadPath(uploadsDir, currentVersion.file_path);
    } catch (err: any) {
      return res.status(400).json({ valid: false, error: err.message });
    }

    if (!fs.existsSync(physicalPath)) {
      return res.status(404).json({
        valid: false,
        error: 'Physical file missing on server storage disk.',
        stored_hash: currentVersion.file_hash,
        actual_file_hash: null,
      });
    }

    const diskBuffer = fs.readFileSync(physicalPath);
    const recomputedDiskHash = hashBuffer(diskBuffer);
    const match = recomputedDiskHash === currentVersion.file_hash;
    const historicalVersions = db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number ASC').all(document_id);
    const historicalIssues = historicalVersions.flatMap((version: any) => {
      let versionPath: string;
      try {
        versionPath = resolveSafeUploadPath(uploadsDir, version.file_path);
      } catch {
        return [{ version_number: version.version_number, issue: 'INVALID_PATH', stored_hash: version.file_hash, actual_file_hash: null }];
      }
      if (!fs.existsSync(versionPath)) {
        return [{ version_number: version.version_number, issue: 'FILE_MISSING', stored_hash: version.file_hash, actual_file_hash: null }];
      }
      const actualHash = hashBuffer(fs.readFileSync(versionPath));
      return actualHash === version.file_hash ? [] : [{ version_number: version.version_number, issue: 'FILE_TAMPERED', stored_hash: version.file_hash, actual_file_hash: actualHash }];
    });
    const historyValid = historicalIssues.length === 0;

    writeAudit({
      actor_id: req.user!.user_id,
      action: match && historyValid ? 'FILE_INTEGRITY_VERIFIED' : 'FILE_TAMPER_DETECTED',
      document_id,
      case_id: doc.case_id,
      detail: match
        ? `Physical disk file verified intact (SHA-256 matches: ${recomputedDiskHash.slice(0, 12)}...)`
        : `PHYSICAL INTEGRITY FAILURE: Stored=${currentVersion.file_hash.slice(0, 12)} vs Disk=${recomputedDiskHash.slice(0, 12)}${historyValid ? '' : `; historical issues: ${historicalIssues.length}`}`,
    });

    res.json({
      valid: match && historyValid,
      stored_hash: currentVersion.file_hash,
      actual_file_hash: recomputedDiskHash,
      file_path: currentVersion.file_path,
      file_size_bytes: diskBuffer.length,
      version_number: currentVersion.version_number,
      history_valid: historyValid,
      historical_issues: historicalIssues,
    });
  });

  app.post('/api/documents/:id/tamper-file', requireAuth, requireRole('ADMIN'), (req: AuthRequest, res) => {
    // Production protection: Tamper simulation disabled unless explicitly authorized
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TAMPER_TESTS !== 'true') {
      return res.status(403).json({ error: 'Tamper simulation endpoints are disabled in production mode.' });
    }

    const document_id = req.params.id;
    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const currentVersion = db.prepare('SELECT * FROM document_versions WHERE version_id = ?').get(doc.current_version_id);
    if (!currentVersion) return res.status(404).json({ error: 'No version record on file.' });

    let physicalPath: string;
    try {
      physicalPath = resolveSafeUploadPath(uploadsDir, currentVersion.file_path);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    if (!fs.existsSync(physicalPath)) {
      return res.status(404).json({ error: 'Physical file not found.' });
    }

    // Mutate the physical file on disk directly
    const buffer = fs.readFileSync(physicalPath);
    const mutated = Buffer.from(buffer);
    mutated[0] = mutated[0] ^ 0xff; // Flip bits in first byte
    fs.writeFileSync(physicalPath, mutated);

    const newHash = hashBuffer(mutated);

    writeAudit({
      actor_id: req.user!.user_id,
      action: 'FILE_TAMPER_SIMULATED',
      document_id,
      case_id: doc.case_id,
      detail: `Admin simulated physical file tamper. Byte mutated on disk. New physical hash: ${newHash.slice(0, 12)}...`,
    });

    res.json({
      ok: true,
      message: `Physical file on disk was modified out-of-band. Stored record remains ${currentVersion.file_hash}, but physical file now hashes to ${newHash}. Call Verify File to demonstrate detection.`,
      stored_hash: currentVersion.file_hash,
      new_disk_hash: newHash,
    });
  });

  // =====================================================================
  // UNSEAL REQUESTS (Judicial Workflow)
  // =====================================================================
  app.post('/api/unseal-requests', requireAuth, (req: AuthRequest, res) => {
    const { document_id, justification } = req.body;
    if (!document_id) return res.status(400).json({ error: 'document_id is required.' });

    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // IDOR check
    if (!userCanAccessCase(req.user, doc.case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', document_id, case_id: doc.case_id, detail: 'Attempted unseal request without case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    const request_id = randomUUID();
    db.prepare(`INSERT INTO unseal_requests (request_id, document_id, requested_by, justification) VALUES (?,?,?,?)`)
      .run(request_id, document_id, req.user!.user_id, justification || null);

    writeAudit({
      actor_id: req.user!.user_id,
      action: 'UNSEAL_REQUESTED',
      document_id,
      case_id: doc.case_id,
      detail: `Unseal access requested by ${req.user!.name}: "${justification || 'No justification'}"`,
    });
    res.json({ request_id });
  });

  app.get('/api/unseal-requests', requireAuth, (req: AuthRequest, res) => {
    let rows;
    if (['ADMIN', 'COURT_OFFICER'].includes(req.user!.role)) {
      rows = db.prepare(`
        SELECT ur.*, d.title AS document_title, d.case_id, u.name AS requested_by_name, u.role AS requested_by_role
        FROM unseal_requests ur
        JOIN documents d ON d.document_id = ur.document_id
        JOIN users u ON u.user_id = ur.requested_by
        ORDER BY ur.requested_at DESC
      `).all();
    } else {
      // Non-judicial users only see unseal requests for cases they are assigned to
      rows = db.prepare(`
        SELECT ur.*, d.title AS document_title, d.case_id, u.name AS requested_by_name, u.role AS requested_by_role
        FROM unseal_requests ur
        JOIN documents d ON d.document_id = ur.document_id
        JOIN users u ON u.user_id = ur.requested_by
        WHERE d.case_id IN (
          SELECT case_id FROM case_assignments WHERE user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
        )
        ORDER BY ur.requested_at DESC
      `).all(req.user!.user_id);
    }
    res.json(rows);
  });

  app.post('/api/unseal-requests/:id/order', requireAuth, requireRole('COURT_OFFICER', 'ADMIN'), upload.single('order'), (req: AuthRequest, res) => {
    try {
      const request_id = req.params.id;
      const unsealReq = db.prepare('SELECT * FROM unseal_requests WHERE request_id = ?').get(request_id);
      if (!unsealReq) return res.status(404).json({ error: 'Unseal request not found.' });
      if (unsealReq.status !== 'PENDING') return res.status(409).json({ error: 'Only pending requests can receive a court order.' });

      const doc = db.prepare('SELECT case_id FROM documents WHERE document_id = ?').get(unsealReq.document_id);
      if (!doc || !userCanAccessCase(req.user, doc.case_id)) {
        return res.status(403).json({ error: 'You are not assigned to the case associated with this unseal request.' });
      }

      const { court_order_number } = req.body;
      if (!req.file) return res.status(400).json({ error: 'No order file received.' });

      const { filename, filePath } = getSafeUploadPath(uploadsDir, req.file.originalname, 'order_' + randomUUID());
      fs.writeFileSync(filePath, req.file.buffer);

      db.prepare(`UPDATE unseal_requests SET court_order_path = ?, court_order_number = ? WHERE request_id = ?`)
        .run(filename, court_order_number || 'CRL-ORDER-' + Math.floor(Math.random() * 9000 + 1000), request_id);

      writeAudit({
        actor_id: req.user!.user_id,
        action: 'COURT_ORDER_ATTACHED',
        document_id: unsealReq.document_id,
        case_id: doc.case_id,
        detail: `Judicial court order attached to request ${request_id}: "${court_order_number || filename}"`,
      });

      res.json({ ok: true, filename });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Court order attachment failed.' });
    }
  });

  app.post('/api/unseal-requests/:id/approve', requireAuth, requireRole('COURT_OFFICER', 'ADMIN'), (req: AuthRequest, res) => {
    const reqRow = db.prepare('SELECT * FROM unseal_requests WHERE request_id = ?').get(req.params.id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });
    if (reqRow.status !== 'PENDING') return res.status(409).json({ error: 'Only pending requests can be approved.' });
    if (!reqRow.court_order_path) return res.status(400).json({ error: 'Cannot approve: no judicial order attached yet.' });
    let orderPath: string;
    try {
      orderPath = resolveSafeUploadPath(uploadsDir, reqRow.court_order_path);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Invalid court order path.' });
    }
    if (!fs.existsSync(orderPath)) return res.status(400).json({ error: 'Cannot approve: attached court order is missing.' });

    db.prepare(`UPDATE unseal_requests SET status = 'APPROVED', court_order_verified = 1, resolved_at = datetime('now'), resolved_by = ? WHERE request_id = ?`)
      .run(req.user!.user_id, req.params.id);

    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(reqRow.document_id);
    writeAudit({
      actor_id: req.user!.user_id,
      action: 'UNSEAL_APPROVED',
      document_id: reqRow.document_id,
      case_id: doc ? doc.case_id : null,
      detail: `Court order ${reqRow.court_order_number || 'attached'} verified and approved by ${req.user!.name} (${req.user!.role})`,
    });
    res.json({ ok: true });
  });

  app.post('/api/unseal-requests/:id/reject', requireAuth, requireRole('COURT_OFFICER', 'ADMIN'), (req: AuthRequest, res) => {
    const reqRow = db.prepare('SELECT * FROM unseal_requests WHERE request_id = ?').get(req.params.id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });

    db.prepare(`UPDATE unseal_requests SET status = 'REJECTED', resolved_at = datetime('now'), resolved_by = ? WHERE request_id = ?`)
      .run(req.user!.user_id, req.params.id);

    const doc = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(reqRow.document_id);
    writeAudit({
      actor_id: req.user!.user_id,
      action: 'UNSEAL_REJECTED',
      document_id: reqRow.document_id,
      case_id: doc ? doc.case_id : null,
      detail: `Unseal request rejected by ${req.user!.name} (${req.user!.role})`,
    });
    res.json({ ok: true });
  });

  // =====================================================================
  // VICTIM RECORD (Section 228A IPC) - GENUINE DATABASE PERSISTENCE
  // =====================================================================
  app.get('/api/cases/:id/victim-record', requireAuth, (req: AuthRequest, res) => {
    const kase = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(req.params.id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });

    // IDOR check: Verify caller has access to this case
    if (!userCanAccessCase(req.user, kase.case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', case_id: kase.case_id, detail: 'Attempted to access victim record without case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    const victimRow = db.prepare('SELECT * FROM victim_records WHERE case_id = ?').get(kase.case_id);
    if (!victimRow) {
      return res.json({ exists: false, record: null, redacted: false });
    }

    const canSeeUnredacted = ['COURT_OFFICER', 'ADMIN'].includes(req.user!.role);
    if (canSeeUnredacted) {
      writeAudit({ actor_id: req.user!.user_id, action: 'VICTIM_RECORD_VIEW_UNREDACTED', case_id: kase.case_id, detail: 'Viewed UNREDACTED judicial master record' });
      return res.json({ exists: true, redacted: false, record: victimRow });
    }

    // Role is non-judicial (IO, Forensic, Prosecutor) -> Apply profile redaction
    const profile = db.prepare('SELECT * FROM redaction_profiles WHERE case_category = ?').get(kase.case_category);
    const fields: string[] = profile ? JSON.parse(profile.fields_to_redact) : ['victim_name', 'address', 'contact_number'];

    const redacted: Record<string, any> = { ...victimRow };
    fields.forEach((f) => {
      if (redacted[f] !== undefined) {
        redacted[f] = '█████ REDACTED (Sec. 228A IPC) █████';
      }
    });

    writeAudit({ actor_id: req.user!.user_id, action: 'VICTIM_RECORD_VIEW_REDACTED', case_id: kase.case_id, detail: 'Viewed REDACTED investigation copy' });
    res.json({ exists: true, redacted: true, record: redacted });
  });

  app.post('/api/cases/:id/victim-record', requireAuth, requireRole('IO', 'ADMIN', 'COURT_OFFICER'), (req: AuthRequest, res) => {
    const case_id = req.params.id;
    const kase = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(case_id);
    if (!kase) return res.status(404).json({ error: 'Case not found.' });

    // IDOR check: Verify caller has access to this case
    if (!userCanAccessCase(req.user, case_id)) {
      writeAudit({ actor_id: req.user!.user_id, action: 'ACCESS_DENIED', case_id, detail: 'Attempted to save victim record without case assignment' });
      return res.status(403).json({ error: 'You are not assigned to this case.' });
    }

    const { victim_name, address, contact_number, photo_ref, case_summary } = req.body;
    if (!victim_name || typeof victim_name !== 'string' || !victim_name.trim()) {
      return res.status(400).json({ error: 'victim_name is required and must be a non-empty string.' });
    }

    const existing = db.prepare('SELECT record_id FROM victim_records WHERE case_id = ?').get(case_id);
    if (existing) {
      db.prepare(`UPDATE victim_records SET victim_name = ?, address = ?, contact_number = ?, photo_ref = ?, case_summary = ? WHERE case_id = ?`)
        .run(victim_name.trim(), address || null, contact_number || null, photo_ref || null, case_summary || null, case_id);
    } else {
      db.prepare(`INSERT INTO victim_records (record_id, case_id, victim_name, address, contact_number, photo_ref, case_summary) VALUES (?,?,?,?,?,?,?)`)
        .run(randomUUID(), case_id, victim_name.trim(), address || null, contact_number || null, photo_ref || null, case_summary || null);
    }

    writeAudit({
      actor_id: req.user!.user_id,
      action: 'VICTIM_RECORD_SAVED',
      case_id,
      detail: `Victim record entered/updated under Section 228A IPC protocol`,
    });

    res.json({ ok: true });
  });

  // =====================================================================
  // AUDIT LOG + HASH CHAIN VERIFICATION
  // =====================================================================
  app.get('/api/audit-log', requireAuth, requireRole('ADMIN', 'COURT_OFFICER'), (_req, res) => {
    const rows = db.prepare(`
      SELECT a.*, u.name AS actor_name, u.role AS actor_role
      FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
      ORDER BY a.rowid DESC
    `).all();
    res.json(rows);
  });

  app.get('/api/audit-log/verify', requireAuth, requireRole('ADMIN', 'COURT_OFFICER'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY rowid ASC').all();
    let prevExpected: string | null = null;
    const results = [];
    let brokenAt: string | null = null;

    for (const row of rows) {
      const recomputed = chainHash({
        prev: row.previous_entry_hash,
        actor_id: row.actor_id,
        action: row.action,
        document_id: row.document_id,
        case_id: row.case_id,
        detail: row.detail,
        timestamp: row.timestamp,
      });
      const hashMatches = recomputed === row.entry_hash;
      const chainLinkMatches = (row.previous_entry_hash || null) === (prevExpected || null);
      const ok = hashMatches && chainLinkMatches;
      if (!ok && brokenAt === null) brokenAt = row.log_id;
      results.push({
        log_id: row.log_id,
        action: row.action,
        timestamp: row.timestamp,
        hash_valid: hashMatches,
        link_valid: chainLinkMatches,
      });
      prevExpected = row.entry_hash;
    }

    res.json({ valid: brokenAt === null, broken_at: brokenAt, total_entries: rows.length, results });
  });

  app.post('/api/audit-log/tamper-test', requireAuth, requireRole('ADMIN'), (_req, res) => {
    // Production protection: Tamper simulation disabled unless explicitly authorized
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TAMPER_TESTS !== 'true') {
      return res.status(403).json({ error: 'Tamper simulation endpoints are disabled in production mode.' });
    }

    const target = db.prepare('SELECT * FROM audit_log ORDER BY rowid ASC LIMIT 1 OFFSET 1').get();
    if (!target) return res.status(400).json({ error: 'Not enough log entries to tamper with yet — create a case or document first.' });
    db.prepare(`UPDATE audit_log SET detail = ? WHERE log_id = ?`).run('[SIMULATED TAMPER EVENT — row modified out-of-band to test cryptographic detection]', target.log_id);
    res.json({
      ok: true,
      tampered_log_id: target.log_id,
      message: 'One log row was directly altered in the database bypassing application logic. Call GET /api/audit-log/verify to see the cryptographic chain break detected.',
    });
  });

  // Evidence files are served only through the authorized download route.
  app.use('/uploads', (_req, res) => res.status(404).json({ error: 'Not found.' }));


  // Vite Middleware Setup for dev & static for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SuRakSha Chain full-stack server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
