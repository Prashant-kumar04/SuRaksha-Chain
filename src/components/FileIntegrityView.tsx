import React, { useState, useEffect } from 'react';
import { CaseDocument, FileIntegrityResult, User } from '../types';
import { api } from '../api';
import {
  Binary,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  RefreshCw,
  HardDrive,
  FileCode,
  Flame,
} from 'lucide-react';

interface FileIntegrityViewProps {
  documents: CaseDocument[];
  activeDocumentId: string | null;
  currentUser: User;
  onSelectDocument: (docId: string) => void;
  onRefreshData: () => Promise<void>;
}

export const FileIntegrityView: React.FC<FileIntegrityViewProps> = ({
  documents,
  activeDocumentId,
  currentUser,
  onSelectDocument,
  onRefreshData,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string>(
    activeDocumentId || (documents[0]?.document_id ?? '')
  );
  const [verifying, setVerifying] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [result, setResult] = useState<FileIntegrityResult | null>(null);
  const [tamperNotice, setTamperNotice] = useState<string | null>(null);

  useEffect(() => {
    if (activeDocumentId) {
      setSelectedDocId(activeDocumentId);
    } else if (documents.length > 0 && !selectedDocId) {
      setSelectedDocId(documents[0].document_id);
    }
  }, [activeDocumentId, documents]);

  const runVerification = async (docId: string) => {
    if (!docId) return;
    setVerifying(true);
    setTamperNotice(null);
    try {
      const res = await api.verifyFileIntegrity(docId);
      setResult(res);
      await onRefreshData();
    } catch (err: any) {
      setResult({
        valid: false,
        stored_hash: 'ERROR',
        actual_file_hash: null,
        file_path: '',
        error: err.message || 'Verification failed.',
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (selectedDocId) {
      runVerification(selectedDocId);
    }
  }, [selectedDocId]);

  const handleSimulateTamper = async () => {
    if (!selectedDocId) return;
    setTampering(true);
    try {
      const res = await api.tamperFile(selectedDocId);
      setTamperNotice(res.message);
      // Immediately re-run verification so user sees the broken state
      await runVerification(selectedDocId);
    } catch (err: any) {
      alert('Tamper simulation error: ' + (err.message || 'Failed'));
    } finally {
      setTampering(false);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center">
        <Binary className="w-8 h-8 text-[#5B5B5B] mx-auto mb-2" />
        <h2 className="text-sm font-bold text-[#0A2540]">No Documents Available</h2>
        <p className="text-xs text-[#5B5B5B] mt-1">
          Upload an evidence file in the Point-of-Capture tab first.
        </p>
      </div>
    );
  }

  const activeDoc = documents.find((d) => d.document_id === selectedDocId);

  return (
    <div className="space-y-6">
      {/* Header & Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DDD9D1]">
        <div>
          <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
            <Binary className="w-5 h-5 text-[#1F6F4A]" />
            Physical Storage &amp; Disk File Cryptographic Integrity
          </h1>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            Demonstrates authentic byte-for-byte SHA-256 verification against physical files on server disk storage.
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

          <button
            onClick={() => runVerification(selectedDocId)}
            disabled={verifying}
            className="px-3 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            <span>Verify Disk File</span>
          </button>
        </div>
      </div>

      {tamperNotice && (
        <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/40 rounded text-xs text-[#8C1D2B]">
          <strong>Simulated Tamper Notice:</strong> {tamperNotice}
        </div>
      )}

      {/* Verification Card */}
      {result && (
        <div className="bg-white border border-[#DDD9D1] rounded-[4px] p-6 shadow-xs space-y-6">
          {/* Status Banner */}
          {result.valid ? (
            <div className="p-4 bg-[#EAF3EE] border border-[#1F6F4A]/40 rounded-[3px] flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#1F6F4A] shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-[#1F6F4A]">
                  PHYSICAL INTEGRITY CONFIRMED — 100% BYTE MATCH
                </div>
                <div className="text-xs text-[#232323] mt-0.5">
                  The actual physical bytes stored in the server's filesystem match the registered SHA-256 hash perfectly. No out-of-band corruption or tampering detected.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#FBEEEE] border border-[#8C1D2B] rounded-[3px] flex items-start gap-3">
              <AlertOctagon className="w-6 h-6 text-[#8C1D2B] shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-[#8C1D2B]">
                  ❌ PHYSICAL INTEGRITY BREACH DETECTED! (SHA-256 MISMATCH)
                </div>
                <div className="text-xs text-[#8C1D2B] mt-0.5">
                  Stored Database Hash ≠ Actual Disk Hash! The physical file on the server disk was modified or corrupted outside the application authorization protocol.
                </div>
              </div>
            </div>
          )}

          {/* Side by side comparison: Stored vs Real Disk */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#F7F6F3] border border-[#DDD9D1] rounded-[3px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0A2540]" />
                  Stored Database Digest (Record of Truth)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-white rounded border border-[#DDD9D1]">
                  v{result.version_number || 1}
                </span>
              </div>
              <div className="font-mono text-xs font-semibold text-[#0A2540] bg-white p-2.5 border border-[#DDD9D1] rounded break-all">
                {result.stored_hash}
              </div>
            </div>

            <div className={`p-4 border rounded-[3px] ${result.valid ? 'bg-[#F7F6F3] border-[#DDD9D1]' : 'bg-[#FBEEEE] border-[#8C1D2B]/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${result.valid ? 'text-[#5B5B5B]' : 'text-[#8C1D2B]'}`}>
                  <HardDrive className="w-3.5 h-3.5" />
                  Live Disk File Recomputed SHA-256
                </span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${result.valid ? 'bg-white border-[#DDD9D1]' : 'bg-[#8C1D2B] text-white border-transparent'}`}>
                  {result.valid ? 'MATCH' : 'MISMATCH'}
                </span>
              </div>
              <div className={`font-mono text-xs font-semibold p-2.5 border rounded break-all ${result.valid ? 'bg-white text-[#0A2540] border-[#DDD9D1]' : 'bg-white text-[#8C1D2B] border-[#8C1D2B]'}`}>
                {result.actual_file_hash || 'File missing on server storage'}
              </div>
            </div>
          </div>

          {/* Storage Details */}
          <div className="text-xs text-[#5B5B5B] space-y-1 pt-2 border-t border-[#DDD9D1]">
            <div>
              <span className="font-semibold text-[#232323]">Server Storage Path:</span>{' '}
              <span className="font-mono text-[#0A2540]">uploads/{result.file_path}</span>
            </div>
            {result.file_size_bytes !== undefined && (
              <div>
                <span className="font-semibold text-[#232323]">Physical File Size:</span>{' '}
                <span>{result.file_size_bytes} bytes ({(result.file_size_bytes / 1024).toFixed(2)} KB)</span>
              </div>
            )}
          </div>

          {/* Tamper Demonstration Action (Admin / Testing) */}
          <div className="p-4 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#0A2540] flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-[#8C1D2B]" />
                <span>Simulate Out-of-Band File Tampering</span>
              </div>
              <div className="text-[11px] text-[#5B5B5B] mt-0.5">
                Directly alters 1 byte in the physical file on server disk to demonstrate ABC ≠ XYZ integrity failure.
              </div>
            </div>

            <button
              onClick={handleSimulateTamper}
              disabled={tampering}
              className="px-3.5 py-1.5 bg-[#8C1D2B] hover:bg-[#6f1621] text-white text-xs font-semibold rounded-[3px] transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50 shrink-0"
            >
              {tampering ? 'Mutating Disk File...' : '⚡ Simulate Disk Tampering'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
