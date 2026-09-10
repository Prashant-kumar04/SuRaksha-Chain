import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { BetterSqliteWrapper } from './db';

export const BOOTSTRAP_USERS = [
  { name: 'System Administrator', email: 'admin@suraksha.gov.in', role: 'ADMIN', department: 'State Police IT Cell', jurisdiction: 'State HQ', badge_number: 'ADM-001' },
  { name: 'Investigating Officer', email: 'io@suraksha.gov.in', role: 'IO', department: 'Crime Branch', jurisdiction: 'District East', badge_number: 'IO-5821' },
  { name: 'Forensic Scientist', email: 'forensic@suraksha.gov.in', role: 'FORENSIC_EXPERT', department: 'FSL District Lab', jurisdiction: 'District East', badge_number: 'FE-2291' },
  { name: 'Public Prosecutor', email: 'prosecutor@suraksha.gov.in', role: 'PROSECUTOR', department: "Directorate of Prosecution", jurisdiction: 'District East', badge_number: 'PP-1044' },
  { name: 'Judicial Magistrate / Registrar', email: 'court@suraksha.gov.in', role: 'COURT_OFFICER', department: 'District Court Bench', jurisdiction: 'District East', badge_number: 'JM-0082' },
];

export function getBootstrapPassword(): string {
  // Use environment variable if provided
  if (process.env.BOOTSTRAP_PASSWORD) {
    return process.env.BOOTSTRAP_PASSWORD;
  }
  // Standard prototype default for SIH demo accounts
  return 'Demo@123';
}

export async function seedDatabase(db: BetterSqliteWrapper) {
  // 1. Redaction profiles
  db.prepare(`INSERT OR IGNORE INTO redaction_profiles (profile_id, case_category, fields_to_redact) VALUES (?,?,?)`)
    .run('prof-women', 'SENSITIVE_WOMEN_SAFETY', JSON.stringify(['victim_name', 'address', 'contact_number', 'photo_ref']));
  db.prepare(`INSERT OR IGNORE INTO redaction_profiles (profile_id, case_category, fields_to_redact) VALUES (?,?,?)`)
    .run('prof-pocso', 'POCSO', JSON.stringify(['victim_name', 'address', 'contact_number', 'photo_ref', 'school_name']));

  // Bootstrap users are authentication identities, not operational seed data.
  const isProduction = process.env.NODE_ENV === 'production';
  const enableBootstrapUsers = Boolean(process.env.BOOTSTRAP_PASSWORD) || !isProduction;

  if (!enableBootstrapUsers) {
    console.log('[SECURITY] No bootstrap password configured — bootstrap account seeding disabled.');
    return;
  }

  const initialPassword = getBootstrapPassword();
  if (!initialPassword) {
    console.log('[SECURITY] No BOOTSTRAP_PASSWORD provided — skipping user creation.');
    return;
  }

  // 2. Users (strictly the 5 intentional demo accounts for SIH evaluation)
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get();

  if (!userCount || userCount.c === 0) {
    const insertUser = db.prepare(`INSERT INTO users (user_id, name, email, password_hash, role, department, jurisdiction, badge_number) VALUES (?,?,?,?,?,?,?,?)`);
    for (const u of BOOTSTRAP_USERS) {
      const id = randomUUID();
      const hash = bcrypt.hashSync(initialPassword, 10);
      insertUser.run(id, u.name, u.email, hash, u.role, u.department, u.jurisdiction, u.badge_number);
    }
  }

  for (const user of BOOTSTRAP_USERS) {
    db.prepare('UPDATE users SET name = ?, role = ?, department = ?, jurisdiction = ?, badge_number = ? WHERE email = ?')
      .run(user.name, user.role, user.department, user.jurisdiction, user.badge_number, user.email);
  }

  // NOTE: Zero preloaded cases, documents, versions, victim records, or fake audit events!
  // The operational dataset starts completely empty.
}
