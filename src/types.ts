export type UserRole =
  | 'IO'
  | 'FORENSIC_EXPERT'
  | 'PROSECUTOR'
  | 'COURT_OFFICER'
  | 'ADMIN'
  | 'COMPLAINANT';

export interface User {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  jurisdiction?: string;
  badge_number?: string;
  created_at?: string;
}

export type CaseCategory =
  | 'GENERAL'
  | 'SENSITIVE_WOMEN_SAFETY'
  | 'POCSO'
  | 'CYBERCRIME'
  | 'ECONOMIC_OFFENCES'
  | 'HOMICIDE';

export type CaseStatus =
  | 'OPEN'
  | 'UNDER_INVESTIGATION'
  | 'CHARGESHEET_FILED'
  | 'IN_TRIAL'
  | 'CLOSED';

export interface Case {
  case_id: string;
  fir_number: string;
  case_title: string;
  case_category: string;
  status: string;
  jurisdiction?: string;
  created_at: string;
  created_by?: string;
}

export type DocType =
  | 'FIR'
  | 'WITNESS_STATEMENT'
  | 'CHARGESHEET'
  | 'FORENSIC_REPORT'
  | 'COURT_FILING'
  | 'EVIDENCE_RECORD'
  | 'SEIZURE_MEMO'
  | 'LEGAL_NOTICE';

export type SensitivityTier = 'STANDARD' | 'RESTRICTED' | 'SEALED';

export interface DocumentVersion {
  version_id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  original_filename: string;
  file_size?: number;
  file_hash: string;
  previous_version_hash?: string | null;
  text_excerpt?: string;
  uploaded_by?: string;
  uploaded_by_name?: string;
  uploaded_by_role?: string;
  uploaded_at: string;
  drift_flag?: number;
  drift_notes?: string;
}

export interface CaseDocument {
  document_id: string;
  case_id: string;
  doc_type: string;
  title: string;
  sensitivity_tier: string;
  current_version_id?: string;
  current_hash?: string;
  current_version_number?: number;
  drift_flag?: number;
  drift_notes?: string;
  latest_upload_at?: string;
  created_by?: string;
  created_at: string;
}

export interface UnsealRequest {
  request_id: string;
  document_id: string;
  document_title?: string;
  case_id?: string;
  requested_by: string;
  requested_by_name?: string;
  requested_by_role?: string;
  justification?: string;
  court_order_path?: string;
  court_order_number?: string;
  court_order_verified?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface VictimRecord {
  record_id?: string;
  case_id: string;
  victim_name: string;
  address?: string;
  contact_number?: string;
  photo_ref?: string;
  case_summary?: string;
  created_at?: string;
}

export interface AuditLogEntry {
  log_id: string;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  action: string;
  document_id?: string;
  case_id?: string;
  detail?: string;
  timestamp: string;
  entry_hash: string;
  previous_entry_hash?: string | null;
}

export interface AuditVerificationResult {
  valid: boolean;
  broken_at: string | null;
  total_entries: number;
  results: Array<{
    log_id: string;
    action: string;
    timestamp: string;
    hash_valid: boolean;
    link_valid: boolean;
  }>;
}

export interface FileIntegrityResult {
  valid: boolean;
  stored_hash: string;
  actual_file_hash: string | null;
  file_path: string;
  file_size_bytes?: number;
  version_number?: number;
  error?: string;
}

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DiffResult {
  flagged: boolean;
  reason: string | null;
  changeRatio: number;
  parts: DiffPart[];
}
