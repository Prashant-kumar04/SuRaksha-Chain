import React, { useState } from 'react';
import { Case, CaseDocument, User } from '../types';
import { api } from '../api';
import { CaseAccessManager } from './CaseAccessManager';
import {
  FolderPlus,
  FileText,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Binary,
  Plus,
  X,
  Trash2,
  Pencil,
} from 'lucide-react';

interface CaseDashboardProps {
  cases: Case[];
  currentCase: Case | null;
  documents: CaseDocument[];
  currentUser: User;
  onSelectCase: (c: Case) => void;
  onRefreshCases: () => Promise<void>;
  onNavigateUpload: () => void;
  onInspectDocumentDrift: (docId: string) => void;
  onInspectFileIntegrity: (docId: string) => void;
  onRequestUnseal: (doc: CaseDocument) => void;
}

export const CaseDashboard: React.FC<CaseDashboardProps> = ({
  cases,
  currentCase,
  documents,
  currentUser,
  onSelectCase,
  onRefreshCases,
  onNavigateUpload,
  onInspectDocumentDrift,
  onInspectFileIntegrity,
  onRequestUnseal,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [firNumber, setFirNumber] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [caseCategory, setCaseCategory] = useState('SENSITIVE_WOMEN_SAFETY');
  const [jurisdiction, setJurisdiction] = useState(currentUser.jurisdiction || 'District East');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFirNumber, setEditFirNumber] = useState('');
  const [editCaseTitle, setEditCaseTitle] = useState('');
  const [editCaseCategory, setEditCaseCategory] = useState('GENERAL');
  const [editJurisdiction, setEditJurisdiction] = useState('');
  const [editStatus, setEditStatus] = useState('OPEN');

  const sealedCount = documents.filter((d) => d.sensitivity_tier === 'SEALED').length;
  const flaggedCount = documents.filter((d) => d.drift_flag === 1).length;

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createCase({
        fir_number: firNumber,
        case_title: caseTitle,
        case_category: caseCategory,
        jurisdiction,
      });
      await onRefreshCases();
      setShowCreateModal(false);
      setFirNumber('');
      setCaseTitle('');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create case in database.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!currentCase || currentUser.role !== 'ADMIN') return;
    if (!window.confirm(`Permanently delete case ${currentCase.fir_number} and all of its documents, notes, assignments, and audit entries?`)) return;
    setDeleting(true);
    try {
      await api.deleteCase(currentCase.case_id);
      await onRefreshCases();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to delete case.');
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = () => {
    if (!currentCase) return;
    setEditFirNumber(currentCase.fir_number);
    setEditCaseTitle(currentCase.case_title);
    setEditCaseCategory(currentCase.case_category);
    setEditJurisdiction(currentCase.jurisdiction || '');
    setEditStatus(currentCase.status || 'OPEN');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditCase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentCase) return;
    setEditing(true);
    setEditError(null);
    try {
      await api.updateCase(currentCase.case_id, {
        fir_number: editFirNumber,
        case_title: editCaseTitle,
        case_category: editCaseCategory,
        jurisdiction: editJurisdiction,
        status: editStatus,
      });
      await onRefreshCases();
      setShowEditModal(false);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update case.');
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Case Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDD9D1]">
        <div>
          <div className="text-xs text-[#5B5B5B] uppercase tracking-wider font-semibold mb-1">
            Active Legal Investigation Dossier
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0A2540]">
              {currentCase ? currentCase.case_title : 'No Case Selected'}
            </h1>
          </div>
          {currentCase && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-[#5B5B5B]">
              <span className="font-mono font-semibold px-2 py-0.5 bg-[#E9E6DF] text-[#0A2540] rounded-[2px]">
                FIR: {currentCase.fir_number}
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 bg-[#123258]/10 text-[#123258] font-medium rounded-[2px]">
                {currentCase.case_category.replace(/_/g, ' ')}
              </span>
              <span>•</span>
              <span>Jurisdiction: {currentCase.jurisdiction || 'District East'}</span>
              <span>•</span>
              <span>Registered: {new Date(currentCase.created_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {cases.length > 1 && (
            <select
              value={currentCase?.case_id || ''}
              onChange={(e) => {
                const selected = cases.find((c) => c.case_id === e.target.value);
                if (selected) onSelectCase(selected);
              }}
              className="px-3 py-2 text-xs font-semibold bg-white border border-[#DDD9D1] rounded-[3px] text-[#0A2540] focus:outline-none focus:border-[#0A2540]"
            >
              {cases.map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.fir_number} — {c.case_title}
                </option>
              ))}
            </select>
          )}

          {['IO', 'ADMIN', 'COURT_OFFICER'].includes(currentUser.role) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-2 bg-white hover:bg-[#F7F6F3] border border-[#DDD9D1] text-[#0A2540] text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#1F6F4A]" />
              <span>Create New Case</span>
            </button>
          )}

          <button
            onClick={onNavigateUpload}
            className="px-3.5 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>
          {currentCase && currentUser.role === 'ADMIN' && (
            <button
              onClick={handleDeleteCase}
              disabled={deleting}
              title="Permanently delete this case and its records"
              className="px-3 py-2 bg-white hover:bg-[#FBEEEE] border border-[#8C1D2B]/40 text-[#8C1D2B] text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deleting ? 'Deleting...' : 'Delete Case'}</span>
            </button>
          )}
          {currentCase && (currentUser.role === 'ADMIN' || (currentUser.role === 'IO' && currentCase.created_by === currentUser.user_id)) && (
            <button
              onClick={openEditModal}
              title="Edit case details"
              className="px-3 py-2 bg-white hover:bg-[#F7F6F3] border border-[#DDD9D1] text-[#0A2540] text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Case</span>
            </button>
          )}
        </div>
      </div>

      {/* Case Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-4 shadow-xs">
          <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
            Active Cases Registered
          </div>
          <div className="text-2xl font-bold text-[#0A2540]">{cases.length}</div>
          <div className="text-[11px] text-[#5B5B5B] mt-1 flex items-center gap-1">
            <FolderPlus className="w-3 h-3 text-[#1F6F4A]" />
            <span>{cases.length === 0 ? 'Zero cases filed in database' : `${cases.length} active investigation dossier${cases.length === 1 ? '' : 's'}`}</span>
          </div>
        </div>

        <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-4 shadow-xs">
          <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
            Documents on Record
          </div>
          <div className="text-2xl font-bold text-[#0A2540]">{documents.length}</div>
          <div className="text-[11px] text-[#5B5B5B] mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#1F6F4A]" />
            <span>{documents.length === 0 ? 'Zero documents registered' : 'Hashed & linked in SQLite registry'}</span>
          </div>
        </div>

        <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-4 shadow-xs">
          <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
            Sealed Records (Court Gated)
          </div>
          <div className="text-2xl font-bold text-[#C9A227]">{sealedCount}</div>
          <div className="text-[11px] text-[#5B5B5B] mt-1 flex items-center gap-1">
            <Lock className="w-3 h-3 text-[#C9A227]" />
            <span>{sealedCount === 0 ? 'Zero sealed records' : 'Requires judicial unseal order'}</span>
          </div>
        </div>
      </div>

      {/* Documents Table or Empty Case State */}
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#DDD9D1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#0A2540]" />
            <h2 className="text-sm font-bold text-[#0A2540]">Evidence &amp; Forensic Document Dossier</h2>
          </div>
          <span className="text-xs text-[#5B5B5B] font-mono">
            {documents.length} item{documents.length === 1 ? '' : 's'} on record
          </span>
        </div>

        {cases.length === 0 ? (
          <div className="p-12 text-center">
            <FolderPlus className="w-10 h-10 text-[#DDD9D1] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0A2540]">0 Active Cases Registered</p>
            <p className="text-xs text-[#5B5B5B] mt-1 max-w-sm mx-auto">
              No investigation cases have been filed in the registry yet. Create your first case to begin registering evidentiary documents.
            </p>
            {['IO', 'ADMIN', 'COURT_OFFICER'].includes(currentUser.role) && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Case</span>
              </button>
            )}
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-[#DDD9D1] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0A2540]">0 Documents Registered</p>
            <p className="text-xs text-[#5B5B5B] mt-1 max-w-sm mx-auto">
              No evidence documents uploaded for {currentCase ? `FIR ${currentCase.fir_number}` : 'this case'} yet. Every uploaded file is hashed with SHA-256 upon receipt and physically written to disk storage.
            </p>
            <button
              onClick={onNavigateUpload}
              className="mt-4 px-4 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload First Document</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DDD9D1] bg-[#F7F6F3] text-[11px] text-[#5B5B5B] uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-4">Document Title &amp; Version</th>
                  <th className="py-2.5 px-4">Classification</th>
                  <th className="py-2.5 px-4">Sensitivity</th>
                  <th className="py-2.5 px-4">Current SHA-256 Digest</th>
                  <th className="py-2.5 px-4">Integrity Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E6DF] text-xs">
                {documents.map((doc) => (
                  <tr key={doc.document_id} className="hover:bg-[#FAF9F6] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0A2540]">{doc.title}</div>
                      <div className="text-[11px] text-[#5B5B5B] flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono bg-[#E9E6DF] px-1 py-0.2 rounded text-[10px]">
                          v{doc.current_version_number || 1}
                        </span>
                        <span>•</span>
                        <span>
                          {doc.latest_upload_at
                            ? new Date(doc.latest_upload_at).toLocaleString()
                            : new Date(doc.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] px-2 py-0.5 bg-[#F7F6F3] border border-[#DDD9D1] rounded-[2px] text-[#232323]">
                        {doc.doc_type.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-bold tracking-wide uppercase ${
                          doc.sensitivity_tier === 'SEALED'
                            ? 'bg-[#FBEEEE] text-[#8C1D2B] border border-[#8C1D2B]/30'
                            : doc.sensitivity_tier === 'RESTRICTED'
                            ? 'bg-[#FBF3E4] text-[#8A6710] border border-[#C9A227]/30'
                            : 'bg-[#EEF1F5] text-[#123258] border border-[#123258]/20'
                        }`}
                      >
                        {doc.sensitivity_tier === 'SEALED' && <Lock className="w-2.5 h-2.5" />}
                        {doc.sensitivity_tier}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] bg-[#E9E6DF] text-[#0A2540] px-2 py-0.5 rounded-[2px]" title={doc.current_hash || ''}>
                        {doc.current_hash ? `${doc.current_hash.slice(0, 12)}…` : '—'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {doc.drift_flag === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FBEEEE] text-[#8C1D2B] border border-[#8C1D2B]/30 rounded-[2px] text-[11px] font-semibold">
                          <AlertTriangle className="w-3 h-3 text-[#8C1D2B]" />
                          Drift Flagged
                        </span>
                      ) : doc.sensitivity_tier === 'SEALED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FBEEEE] text-[#8C1D2B] rounded-[2px] text-[11px] font-medium">
                          <Lock className="w-3 h-3" />
                          Sealed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EAF3EE] text-[#1F6F4A] rounded-[2px] text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3 text-[#1F6F4A]" />
                          Verified Intact
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {doc.sensitivity_tier === 'SEALED' ? (
                          <button
                            onClick={() => onRequestUnseal(doc)}
                            className="px-2.5 py-1 bg-[#8C1D2B] hover:bg-[#6f1621] text-white text-xs font-semibold rounded-[2px] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Request Access</span>
                          </button>
                        ) : null}

                        <button
                          onClick={() => onInspectDocumentDrift(doc.document_id)}
                          title="View complete version chain and word-level drift analysis"
                          className="px-2 py-1 bg-white hover:bg-[#F7F6F3] border border-[#DDD9D1] text-[#0A2540] text-xs font-semibold rounded-[2px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3 text-[#123258]" />
                          <span>Versions</span>
                        </button>

                        <button
                          onClick={() => onInspectFileIntegrity(doc.document_id)}
                          title="Inspect and test physical disk file SHA-256 verification"
                          className="px-2 py-1 bg-white hover:bg-[#F7F6F3] border border-[#DDD9D1] text-[#1F6F4A] text-xs font-semibold rounded-[2px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Binary className="w-3 h-3" />
                          <span>Verify File</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {currentCase && (
        <CaseAccessManager caseId={currentCase.case_id} caseOwnerId={currentCase.created_by} currentUser={currentUser} />
      )}

      {/* Create Case Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#DDD9D1] rounded-[4px] shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDD9D1] mb-4">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[#1F6F4A]" />
                <h3 className="text-sm font-bold text-[#0A2540]">Register New Legal Investigation Case</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-[#5B5B5B] hover:text-[#232323] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-2.5 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-xs text-[#8C1D2B]">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateCase} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#232323] mb-1">
                  FIR Number / Case Reference
                </label>
                <input
                  type="text"
                  required
                  value={firNumber}
                  onChange={(e) => setFirNumber(e.target.value)}
                  placeholder="e.g. 0524/2026 or CR-1102/2026"
                  className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#232323] mb-1">
                  Case Title
                </label>
                <input
                  type="text"
                  required
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  placeholder="e.g. State vs. A. Sharma — Cyber Financial Fraud"
                  className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#232323] mb-1">
                  Statutory Category (Determines Section 228A Redaction Policy)
                </label>
                <select
                  value={caseCategory}
                  onChange={(e) => setCaseCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540] bg-white"
                >
                  <option value="SENSITIVE_WOMEN_SAFETY">SENSITIVE_WOMEN_SAFETY (IPC 354, 376 / BNS — Sec. 228A IPC Mandatory Redaction)</option>
                  <option value="POCSO">POCSO (Protection of Children from Sexual Offences — Mandatory Identity Redaction)</option>
                  <option value="GENERAL">GENERAL (Standard Criminal Law Procedure)</option>
                  <option value="CYBERCRIME">CYBERCRIME (IT Act &amp; Financial Security)</option>
                  <option value="ECONOMIC_OFFENCES">ECONOMIC_OFFENCES (Corporate / Banking Fraud)</option>
                  <option value="HOMICIDE">HOMICIDE (IPC 302 / Serious Offences)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#232323] mb-1">
                  Police Jurisdiction / Bench
                </label>
                <input
                  type="text"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="e.g. District East"
                  className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
                />
              </div>

              <div className="pt-3 border-t border-[#DDD9D1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 border border-[#DDD9D1] rounded text-xs font-semibold text-[#5B5B5B] hover:bg-[#F7F6F3] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {creating ? 'Registering...' : 'Register Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && currentCase && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#DDD9D1] rounded-[4px] shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDD9D1] mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#0A2540]" />
                <h3 className="text-sm font-bold text-[#0A2540]">Edit Case Details</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-[#5B5B5B] hover:text-[#232323] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {editError && <div className="mb-4 p-2.5 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-xs text-[#8C1D2B]">{editError}</div>}
            <form onSubmit={handleEditCase} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#232323] mb-1">FIR Number / Case Reference</label>
                <input required value={editFirNumber} onChange={(event) => setEditFirNumber(event.target.value)} className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]" />
              </div>
              <div>
                <label className="block font-semibold text-[#232323] mb-1">Case Title</label>
                <input required value={editCaseTitle} onChange={(event) => setEditCaseTitle(event.target.value)} className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]" />
              </div>
              <div>
                <label className="block font-semibold text-[#232323] mb-1">Category</label>
                <select value={editCaseCategory} onChange={(event) => setEditCaseCategory(event.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]">
                  <option value="SENSITIVE_WOMEN_SAFETY">SENSITIVE_WOMEN_SAFETY</option>
                  <option value="POCSO">POCSO</option>
                  <option value="GENERAL">GENERAL</option>
                  <option value="CYBERCRIME">CYBERCRIME</option>
                  <option value="ECONOMIC_OFFENCES">ECONOMIC_OFFENCES</option>
                  <option value="HOMICIDE">HOMICIDE</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#232323] mb-1">Status</label>
                <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]">
                  <option value="OPEN">OPEN</option>
                  <option value="UNDER_INVESTIGATION">UNDER_INVESTIGATION</option>
                  <option value="CHARGESHEET_FILED">CHARGESHEET_FILED</option>
                  <option value="IN_TRIAL">IN_TRIAL</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#232323] mb-1">Jurisdiction / Bench</label>
                <input value={editJurisdiction} onChange={(event) => setEditJurisdiction(event.target.value)} className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]" />
              </div>
              <div className="pt-3 border-t border-[#DDD9D1] flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-3 py-1.5 border border-[#DDD9D1] rounded text-xs font-semibold text-[#5B5B5B] hover:bg-[#F7F6F3] cursor-pointer">Cancel</button>
                <button type="submit" disabled={editing} className="px-4 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50">{editing ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
