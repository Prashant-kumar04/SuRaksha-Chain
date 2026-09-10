import {
  User,
  Case,
  CaseDocument,
  DocumentVersion,
  UnsealRequest,
  VictimRecord,
  AuditLogEntry,
  AuditVerificationResult,
  FileIntegrityResult,
  DiffResult,
  SearchResult,
  CaseNote,
} from './types';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
const API_BASE = configuredApiUrl ? `${configuredApiUrl}/api` : '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('suraksha_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('suraksha_token', token);
  } else {
    localStorage.removeItem('suraksha_token');
  }
}

export function getStoredUser(): User | null {
  const data = localStorage.getItem('suraksha_user');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  if (user) {
    localStorage.setItem('suraksha_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('suraksha_user');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      `Cannot reach the API at ${API_BASE}. Set VITE_API_URL to the public backend URL and enable this Netlify site origin in CORS_ORIGINS.`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  let data: Record<string, any> = {};
  if (responseText && contentType.includes('application/json')) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = {};
    }
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      `The API URL ${API_BASE} returned ${contentType || 'non-JSON content'} instead of JSON. Set Netlify VITE_API_URL to the deployed backend URL, then redeploy.`
    );
  }

  if (!response.ok) {
    const errorMsg = data.error || response.statusText || 'API request failed';
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const data = await request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(data.token);
    setStoredUser(data.user);
    return data;
  },

  async getMe(): Promise<User> {
    return request<User>('/auth/me');
  },

  logout(): void {
    setAuthToken(null);
    setStoredUser(null);
  },

  // Users
  async getUsers(): Promise<User[]> {
    return request<User[]>('/users');
  },

  async createUser(userData: {
    name: string;
    email: string;
    password: string;
    role: string;
    department?: string;
    jurisdiction?: string;
    badge_number?: string;
  }): Promise<{ ok: boolean; user_id: string }> {
    return request<{ ok: boolean; user_id: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Cases
  async getCases(): Promise<Case[]> {
    return request<Case[]>('/cases');
  },

  async createCase(caseData: {
    fir_number: string;
    case_title: string;
    case_category: string;
    jurisdiction?: string;
  }): Promise<{ ok: boolean; case_id: string }> {
    return request<{ ok: boolean; case_id: string }>('/cases', {
      method: 'POST',
      body: JSON.stringify(caseData),
    });
  },

  async deleteCase(caseId: string): Promise<{ ok: boolean; case_id: string; fir_number: string }> {
    return request<{ ok: boolean; case_id: string; fir_number: string }>(`/cases/${caseId}`, {
      method: 'DELETE',
    });
  },

  async assignUserToCase(caseId: string, userId: string, accessLevel = 'READ'): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/cases/${caseId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, access_level: accessLevel }),
    });
  },

  async getCaseDocuments(caseId: string): Promise<CaseDocument[]> {
    return request<CaseDocument[]>(`/cases/${caseId}/documents`);
  },

  async searchDocuments(query: string): Promise<SearchResult[]> {
    return request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
  },

  async getCaseNotes(caseId: string): Promise<CaseNote[]> {
    return request<CaseNote[]>(`/cases/${caseId}/notes`);
  },

  async addCaseNote(caseId: string, note_text: string, document_id?: string): Promise<{ note_id: string }> {
    return request<{ note_id: string }>(`/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note_text, document_id: document_id || null }),
    });
  },

  // Documents & Versions
  async uploadDocument(formData: FormData): Promise<{ document_id: string; version_id: string; file_hash: string }> {
    return request<{ document_id: string; version_id: string; file_hash: string }>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  async uploadVersion(
    documentId: string,
    formData: FormData
  ): Promise<{ version_id: string; file_hash: string; drift_flag: boolean; drift_notes?: string; change_ratio: number }> {
    return request(`/documents/${documentId}/versions`, {
      method: 'POST',
      body: formData,
    });
  },

  async getDocumentVersions(documentId: string): Promise<{ document: CaseDocument; versions: DocumentVersion[] }> {
    return request<{ document: CaseDocument; versions: DocumentVersion[] }>(`/documents/${documentId}/versions`);
  },

  async downloadDocument(documentId: string): Promise<Blob> {
    const token = getAuthToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_BASE}/documents/${documentId}/download`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(err.error || 'Failed to download document file');
    }
    return res.blob();
  },

  async downloadSection65BCertificate(documentId: string): Promise<Blob> {
    const token = getAuthToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_BASE}/documents/${documentId}/section-65b-certificate`, { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: 'Certificate generation failed' }))).error);
    return res.blob();
  },

  async getDiff(documentId: string, v1: string, v2: string): Promise<DiffResult> {
    return request<DiffResult>(`/documents/${documentId}/diff?v1=${v1}&v2=${v2}`);
  },

  // Physical File Integrity & Tamper Testing
  async verifyFileIntegrity(documentId: string): Promise<FileIntegrityResult> {
    return request<FileIntegrityResult>(`/documents/${documentId}/verify-file`);
  },

  async tamperFile(documentId: string): Promise<{ ok: boolean; message: string; stored_hash: string; new_disk_hash: string }> {
    return request(`/documents/${documentId}/tamper-file`, {
      method: 'POST',
    });
  },

  // Unseal Requests
  async getUnsealRequests(): Promise<UnsealRequest[]> {
    return request<UnsealRequest[]>('/unseal-requests');
  },

  async createUnsealRequest(documentId: string, justification: string): Promise<{ request_id: string }> {
    return request<{ request_id: string }>('/unseal-requests', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, justification }),
    });
  },

  async attachCourtOrder(requestId: string, formData: FormData): Promise<{ ok: boolean; filename: string }> {
    return request<{ ok: boolean; filename: string }>(`/unseal-requests/${requestId}/order`, {
      method: 'POST',
      body: formData,
    });
  },

  async approveUnseal(requestId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/unseal-requests/${requestId}/approve`, {
      method: 'POST',
    });
  },

  async rejectUnseal(requestId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/unseal-requests/${requestId}/reject`, {
      method: 'POST',
    });
  },

  // Victim Records (Section 228A IPC)
  async getVictimRecord(caseId: string): Promise<{ exists: boolean; redacted: boolean; record: VictimRecord | null }> {
    return request<{ exists: boolean; redacted: boolean; record: VictimRecord | null }>(`/cases/${caseId}/victim-record`);
  },

  async saveVictimRecord(caseId: string, record: Partial<VictimRecord>): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/cases/${caseId}/victim-record`, {
      method: 'POST',
      body: JSON.stringify(record),
    });
  },

  // Audit Ledger
  async getAuditLog(): Promise<AuditLogEntry[]> {
    return request<AuditLogEntry[]>('/audit-log');
  },

  async verifyAuditChain(): Promise<AuditVerificationResult> {
    return request<AuditVerificationResult>('/audit-log/verify');
  },

  async tamperAuditLog(): Promise<{ ok: boolean; tampered_log_id: string; message: string }> {
    return request<{ ok: boolean; tampered_log_id: string; message: string }>('/audit-log/tamper-test', {
      method: 'POST',
    });
  },
};
