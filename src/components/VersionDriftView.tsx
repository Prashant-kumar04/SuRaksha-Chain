import React, { useState, useEffect } from 'react';
import { CaseDocument, DocumentVersion, DiffResult, User } from '../types';
import { api } from '../api';
import {
  GitCompare,
  Hash,
  AlertTriangle,
  CheckCircle2,
  UploadCloud,
  FileText,
  Clock,
  ArrowRight,
  ShieldAlert,
  Binary,
} from 'lucide-react';

interface VersionDriftViewProps {
  documents: CaseDocument[];
  activeDocumentId: string | null;
  currentUser: User;
  onSelectDocument: (docId: string) => void;
  onRefreshData: () => Promise<void>;
  onInspectFileIntegrity: (docId: string) => void;
}

export const VersionDriftView: React.FC<VersionDriftViewProps> = ({
  documents,
  activeDocumentId,
  currentUser,
  onSelectDocument,
  onRefreshData,
  onInspectFileIntegrity,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string>(
    activeDocumentId || (documents[0]?.document_id ?? '')
  );
  const [loading, setLoading] = useState(false);
  const [docData, setDocData] = useState<{ document: CaseDocument; versions: DocumentVersion[] } | null>(null);

  // New version upload state
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Diff state
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    if (activeDocumentId) {
      setSelectedDocId(activeDocumentId);
    } else if (documents.length > 0 && !selectedDocId) {
      setSelectedDocId(documents[0].document_id);
    }
  }, [activeDocumentId, documents]);

  const fetchVersions = async (docId: string) => {
    if (!docId) return;
    setLoading(true);
    try {
      const data = await api.getDocumentVersions(docId);
      setDocData(data);

      // If at least 2 versions, fetch diff between latest two
      if (data.versions.length >= 2) {
        const v1 = data.versions[data.versions.length - 2].version_id;
        const v2 = data.versions[data.versions.length - 1].version_id;
        fetchDiff(docId, v1, v2);
      } else {
        setDiffResult(null);
      }
    } catch (err) {
      console.error('Failed to load version history:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiff = async (docId: string, v1Id: string, v2Id: string) => {
    setLoadingDiff(true);
    try {
      const diff = await api.getDiff(docId, v1Id, v2Id);
      setDiffResult(diff);
    } catch (err) {
      console.error('Failed to compute diff:', err);
    } finally {
      setLoadingDiff(false);
    }
  };

  useEffect(() => {
    if (selectedDocId) {
      fetchVersions(selectedDocId);
    }
  }, [selectedDocId]);

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersionFile || !selectedDocId) return;

    setUploadingVersion(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', newVersionFile);

      await api.uploadVersion(selectedDocId, formData);
      setNewVersionFile(null);
      await fetchVersions(selectedDocId);
      await onRefreshData();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload version.');
    } finally {
      setUploadingVersion(false);
    }
  };

  const injectSampleDriftVersion = () => {
    if (!docData) return;
    const currentExcerpt = docData.versions[docData.versions.length - 1]?.text_excerpt || 'Original record text on file.';
    
    // Create an altered version with significant changes
    const altered = `${currentExcerpt}\n\n[AMENDMENT]: Suspect description revised. Registration plate now noted as DL-8C-9999 instead of previous reference. Alibi of driver corroborated by witness statement.\nNOTE: Charge section modified from IPC 376 to Section 354.`;
    
    const blob = new Blob([altered], { type: 'text/plain' });
    const file = new File([blob], `Revision_v${docData.versions.length + 1}_Amended.txt`, { type: 'text/plain' });
    setNewVersionFile(file);
    setUploadError(null);
  };

  if (documents.length === 0) {
    return (
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center">
        <GitCompare className="w-8 h-8 text-[#5B5B5B] mx-auto mb-2" />
        <h2 className="text-sm font-bold text-[#0A2540]">No Documents Available</h2>
        <p className="text-xs text-[#5B5B5B] mt-1">
          Upload an evidence document first in the Point-of-Capture tab.
        </p>
      </div>
    );
  }

  const activeDoc = docData?.document;
  const versions = docData?.versions || [];

  return (
    <div className="space-y-6">
      {/* Header & Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DDD9D1]">
        <div>
          <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-[#1F6F4A]" />
            Version History &amp; Semantic Drift Detection
          </h1>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            Every uploaded version forms a tamper-evident cryptographic hash chain. Out-of-band content revisions are flagged through word-level drift analysis.
          </p>

        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#5B5B5B]">Document:</label>
          <select
            value={selectedDocId}
            onChange={(e) => {
              setSelectedDocId(e.target.value);
              onSelectDocument(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-[#DDD9D1] rounded-[3px] text-[#0A2540] focus:outline-none focus:border-[#0A2540]"
          >
            {documents.map((d) => (
              <option key={d.document_id} value={d.document_id}>
                {d.title} (v{d.current_version_number || 1})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[#5B5B5B]">Loading version history...</div>
      ) : activeDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Version Hash Chain Nodes */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#DDD9D1] pb-2.5 mb-3">
                <div className="font-bold text-xs text-[#0A2540]">
                  Cryptographic Version Chain ({versions.length} Node{versions.length === 1 ? '' : 's'})
                </div>
                <button
                  onClick={() => onInspectFileIntegrity(activeDoc.document_id)}
                  className="text-[11px] text-[#1F6F4A] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Binary className="w-3 h-3" />
                  <span>Verify Disk File</span>
                </button>
              </div>

              {/* Version Nodes Stack */}
              <div className="space-y-3 relative before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#DDD9D1]">
                {versions.map((ver, idx) => {
                  const isLatest = idx === versions.length - 1;
                  const isFlagged = ver.drift_flag === 1;

                  return (
                    <div
                      key={ver.version_id}
                      className={`relative pl-8 p-3 rounded-[3px] border transition-all text-xs ${
                        isFlagged
                          ? 'bg-[#FBEEEE] border-[#8C1D2B]/40'
                          : isLatest
                          ? 'bg-[#EAF3EE] border-[#1F6F4A]'
                          : 'bg-[#F7F6F3] border-[#DDD9D1]'
                      }`}
                    >
                      {/* Node circle on the vertical chain line */}
                      <div
                        className={`absolute left-2 top-3.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          isFlagged
                            ? 'bg-[#8C1D2B] border-white'
                            : isLatest
                            ? 'bg-[#1F6F4A] border-white'
                            : 'bg-white border-[#5B5B5B]'
                        }`}
                      />

                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#0A2540]">
                          Version {ver.version_number} {isLatest && '(Latest)'}
                        </span>
                        {isFlagged ? (
                          <span className="px-1.5 py-0.2 bg-[#8C1D2B] text-white rounded text-[10px] font-bold">
                            DRIFT DETECTED
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 bg-[#1F6F4A] text-white rounded text-[10px] font-semibold">
                            VALID
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#5B5B5B] truncate mb-1">
                        File: {ver.original_filename}
                      </div>

                      <div className="font-mono text-[10.5px] bg-white p-1 rounded border border-[#DDD9D1] text-[#0A2540] truncate">
                        SHA: {ver.file_hash.slice(0, 16)}…
                      </div>

                      {ver.previous_version_hash && (
                        <div className="font-mono text-[9.5px] text-[#5B5B5B] truncate mt-1">
                          Prev: {ver.previous_version_hash.slice(0, 12)}…
                        </div>
                      )}

                      <div className="mt-2 text-[10px] text-[#5B5B5B] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(ver.uploaded_at).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upload New Version Card */}
            {['IO', 'FORENSIC_EXPERT', 'COURT_OFFICER', 'ADMIN'].includes(currentUser.role) && (
              <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-4 shadow-xs">
                <div className="font-bold text-xs text-[#0A2540] mb-2 flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-[#1F6F4A]" />
                  <span>Upload Version {versions.length + 1}</span>
                </div>

                {uploadError && (
                  <div className="mb-3 p-2 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-[11px] text-[#8C1D2B]">
                    {uploadError}
                  </div>
                )}

                <form onSubmit={handleUploadVersion} className="space-y-3 text-xs">
                  <button
                    type="button"
                    onClick={injectSampleDriftVersion}
                    className="w-full py-1.5 px-2 bg-[#FBF3E4] hover:bg-[#fae8c8] border border-[#C9A227]/40 rounded text-[11px] font-semibold text-[#8A6710] cursor-pointer"
                  >
                    ⚡ Pre-fill Sample Modified Revision (Test Drift Alert)
                  </button>

                  <div className="border border-dashed border-[#DDD9D1] p-3 rounded text-center bg-[#FAF9F6]">
                    <input
                      type="file"
                      id="version-file-input"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setNewVersionFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <label htmlFor="version-file-input" className="cursor-pointer block">
                      {newVersionFile ? (
                        <span className="font-semibold text-[#0A2540] text-xs">
                          {newVersionFile.name} ({(newVersionFile.size / 1024).toFixed(1)} KB)
                        </span>
                      ) : (
                        <span className="text-[#5B5B5B] text-xs">Choose revised file from disk</span>
                      )}
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingVersion || !newVersionFile}
                    className="w-full py-2 bg-[#0A2540] hover:bg-[#123258] text-white rounded font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {uploadingVersion ? 'Computing SHA-256 & Comparing...' : `Upload Revision v${versions.length + 1}`}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Right Column: Semantic & Word Diff Analysis */}
          <div className="lg:col-span-2 space-y-4">
            {diffResult ? (
              <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DDD9D1] pb-3">
                  <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-[#0A2540]" />
                    <h2 className="text-sm font-bold text-[#0A2540]">
                      Word-Level Semantic Diff Analysis (v{versions.length - 1} vs v{versions.length})
                    </h2>
                  </div>

                  {diffResult.flagged ? (
                    <span className="px-2 py-0.5 bg-[#FBEEEE] text-[#8C1D2B] border border-[#8C1D2B]/30 rounded text-xs font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      SUBSTANTIVE DRIFT DETECTED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#EAF3EE] text-[#1F6F4A] rounded text-xs font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Minor / Editorial Changes Only
                    </span>
                  )}
                </div>

                {diffResult.flagged && (
                  <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/40 rounded-[3px] flex items-start gap-2.5 text-xs text-[#8C1D2B]">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Automated Integrity Warning</div>
                      <div className="mt-0.5">
                        {diffResult.reason || 'Substantive changes exceed legal variance threshold (>20% text altered). This event has been permanently flagged in the audit ledger.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Diff Viewer Body */}
                <div className="border border-[#DDD9D1] rounded-[3px] bg-[#FAF9F6] p-4 text-xs font-mono leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {diffResult.parts && diffResult.parts.length > 0 ? (
                    diffResult.parts.map((part, i) => {
                      if (part.added) {
                        return (
                          <span
                            key={i}
                            className="bg-[#d4edda] text-[#155724] px-1 py-0.5 rounded font-semibold"
                            title="Added in new version"
                          >
                            {part.value}
                          </span>
                        );
                      }
                      if (part.removed) {
                        return (
                          <span
                            key={i}
                            className="bg-[#f8d7da] text-[#721c24] line-through px-1 py-0.5 rounded"
                            title="Removed from previous version"
                          >
                            {part.value}
                          </span>
                        );
                      }
                      return <span key={i} className="text-[#232323]">{part.value}</span>;
                    })
                  ) : (
                    <div className="text-[#5B5B5B]">No diff text extracted for non-textual or binary files. Check physical SHA-256 hash comparison.</div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#5B5B5B] pt-2 border-t border-[#DDD9D1]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-[#d4edda] border border-[#c3e6cb] inline-block rounded-xs"></span>
                      <span>Added Text</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-[#f8d7da] border border-[#f5c6cb] inline-block rounded-xs"></span>
                      <span>Removed Text</span>
                    </span>
                  </div>
                  <span>Change ratio: {(diffResult.changeRatio * 100).toFixed(1)}%</span>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center shadow-xs">
                <FileText className="w-8 h-8 text-[#DDD9D1] mx-auto mb-2" />
                <h3 className="text-xs font-bold text-[#0A2540]">Genesis Version (v1)</h3>
                <p className="text-xs text-[#5B5B5B] mt-1 max-w-md mx-auto">
                  Only 1 version exists for this document. Upload Revision v2 on the left to trigger the automatic word-level drift comparator and cryptographic linkage test.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
