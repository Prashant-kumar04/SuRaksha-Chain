import React, { useState } from 'react';
import { Case, User, DocType, SensitivityTier } from '../types';
import { api } from '../api';
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  Hash,
  Shield,
  FileText,
  Lock,
  ArrowRight,
} from 'lucide-react';

interface DocumentUploadProps {
  currentCase: Case | null;
  currentUser: User;
  onUploadSuccess: () => Promise<void>;
  onNavigateDashboard: () => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  currentCase,
  currentUser,
  onUploadSuccess,
  onNavigateDashboard,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocType>('EVIDENCE_RECORD');
  const [sensitivityTier, setSensitivityTier] = useState<SensitivityTier>('STANDARD');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    document_id: string;
    version_id: string;
    file_hash: string;
  } | null>(null);

  if (!currentCase) {
    return (
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center">
        <AlertCircle className="w-8 h-8 text-[#8C1D2B] mx-auto mb-2" />
        <h2 className="text-base font-bold text-[#0A2540]">No Case Selected</h2>
        <p className="text-xs text-[#5B5B5B] mt-1">Please select or create a case first.</p>
        <button
          onClick={onNavigateDashboard}
          className="mt-4 px-4 py-2 bg-[#0A2540] text-white text-xs font-semibold rounded-[3px]"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const loadSampleDocument = (type: 'FIR' | 'FSL' | 'STATEMENT') => {
    let content = '';
    let filename = '';
    let docTitle = '';
    let sTier: SensitivityTier = 'STANDARD';
    let dType: DocType = 'EVIDENCE_RECORD';

    const safeFir = currentCase.fir_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (type === 'FIR') {
      filename = `FIR_${safeFir}_Information_Report.txt`;
      docTitle = 'FIR Initial First Information Report';
      dType = 'FIR';
      sTier = 'STANDARD';
      content = `FIRST INFORMATION REPORT (Under Section 154 Cr.P.C.)\nState Police Crime Branch | FIR No: ${currentCase.fir_number}\nDate of Occurrence: 10-02-2026 21:30 hrs\nPlace: Commercial Complex, Sector 4\nComplainant: Witness Statement on file\nIncident Description: Complainant reported stalking and threat by unknown driver of silver sedan vehicle. CCTV footage retrieved from intersection camera 12B.\nInvestigating Officer: ${currentUser.name}, Badge ${currentUser.badge_number || 'IO-01'}.`;
    } else if (type === 'FSL') {
      filename = 'FSL_Digital_Forensic_Phone_Extraction.txt';
      docTitle = 'FSL Forensic Digital Memory Extraction Report';
      dType = 'FORENSIC_REPORT';
      sTier = 'RESTRICTED';
      content = `FORENSIC SCIENCE LABORATORY (FSL) EXAMINATION REPORT\nCase FIR: ${currentCase.fir_number}\nEvidence Parcel: 1x Mobile Handset (Samsung SM-A536E)\nIMEI: 354892109847291\nExtraction Tool: Cellebrite UFED Physical Analyzer v7.59\nMD5 Checksum: a6b7c8d9e0f123456789abcdef012345\nSHA-256 Physical Hash: 8f3d6c1b4e2a90123456789abcdef0123456789abcdef0123456789abcdef01\nExamined by: Dr. Anjali Menon, Senior Scientific Officer.`;
    } else {
      filename = 'Victim_Confidential_Statement_Sec164.txt';
      docTitle = 'Magisterial In-Camera Statement (Section 164 CrPC)';
      dType = 'WITNESS_STATEMENT';
      sTier = 'SEALED';
      content = `CONFIDENTIAL MAGISTERIAL STATEMENT RECORDED UNDER SECTION 164 Cr.P.C.\nCase: ${currentCase.fir_number}\nRecorded in Closed Chambers by Judicial Magistrate.\nStrict confidentiality mandated under Section 228A IPC.\nAny unsealing requires judicial court order endorsement on this record.`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const sampleFile = new File([blob], filename, { type: 'text/plain' });
    setFile(sampleFile);
    setTitle(docTitle);
    setDocType(dType);
    setSensitivityTier(sTier);
    setError(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select or create a file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('case_id', currentCase.case_id);
      formData.append('doc_type', docType);
      formData.append('title', title || file.name);
      formData.append('sensitivity_tier', sensitivityTier);

      const result = await api.uploadDocument(formData);
      setUploadResult(result);
      await onUploadSuccess();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setDocType('EVIDENCE_RECORD');
    setSensitivityTier('STANDARD');
    setUploadResult(null);
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#DDD9D1] pb-3">
        <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-[#1F6F4A]" />
          Point-of-Capture Document Ingestion
        </h1>
        <p className="text-xs text-[#5B5B5B] mt-1">
          Every document uploaded is physically written to the secure backend filesystem and immediately hashed with SHA-256. Its cryptographic fingerprint is permanently recorded in the tamper-evident hash-chained audit ledger.
        </p>

      </div>

      {uploadResult ? (
        <div className="bg-white border border-[#DDD9D1] rounded-[4px] p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 text-[#1F6F4A]">
            <div className="w-10 h-10 rounded-full bg-[#EAF3EE] flex items-center justify-center">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0A2540]">Document Successfully Ingested</h2>
              <p className="text-xs text-[#5B5B5B]">
                Physical file committed to disk storage &amp; logged to the cryptographic chain.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#F7F6F3] border border-[#DDD9D1] rounded-[3px] space-y-2.5 text-xs">
            <div>
              <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider">
                Computed SHA-256 Cryptographic Digest
              </div>
              <div className="font-mono text-xs font-semibold text-[#0A2540] bg-white p-2 border border-[#DDD9D1] rounded break-all mt-1 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-[#1F6F4A] shrink-0" />
                <span>{uploadResult.file_hash}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <span className="text-[#5B5B5B]">Document ID:</span>{' '}
                <span className="font-mono font-semibold text-[#232323]">{uploadResult.document_id}</span>
              </div>
              <div>
                <span className="text-[#5B5B5B]">Initial Version:</span>{' '}
                <span className="font-mono font-semibold text-[#232323]">v1 (Genesis Version)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-[#DDD9D1] text-[#0A2540] text-xs font-semibold rounded-[3px] hover:bg-[#F7F6F3] cursor-pointer"
            >
              Upload Another Document
            </button>
            <button
              onClick={onNavigateDashboard}
              className="px-4 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 cursor-pointer"
            >
              <span>View in Case Dossier</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleUpload} className="bg-white border border-[#DDD9D1] rounded-[4px] p-6 shadow-xs space-y-5">
          {error && (
            <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-xs text-[#8C1D2B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Standard legal document templates for evaluation */}
          <div className="p-3 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px]">
            <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[#0A2540]" />
              <span>Standard Legal Templates (Pre-formatted Evidentiary Drafts)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadSampleDocument('FIR')}
                className="px-2.5 py-1 bg-white hover:bg-[#E9E6DF] border border-[#DDD9D1] rounded text-[11px] font-semibold text-[#0A2540] cursor-pointer"
              >
                + Template: Police FIR Document
              </button>
              <button
                type="button"
                onClick={() => loadSampleDocument('FSL')}
                className="px-2.5 py-1 bg-white hover:bg-[#E9E6DF] border border-[#DDD9D1] rounded text-[11px] font-semibold text-[#1F6F4A] cursor-pointer"
              >
                + Template: FSL Forensic Report
              </button>
              <button
                type="button"
                onClick={() => loadSampleDocument('STATEMENT')}
                className="px-2.5 py-1 bg-white hover:bg-[#E9E6DF] border border-[#DDD9D1] rounded text-[11px] font-semibold text-[#8C1D2B] cursor-pointer"
              >
                + Template: Sealed In-Camera Statement
              </button>
            </div>
          </div>

          {/* File input dropzone */}
          <div>
            <label className="block text-xs font-semibold text-[#232323] mb-1.5">
              Select Evidence File (PDF, TXT, DOCX, JPG, PNG, etc.)
            </label>
            <div className="border-2 border-dashed border-[#DDD9D1] hover:border-[#0A2540] rounded-[4px] p-6 text-center bg-[#FAF9F6] transition-colors">
              <input
                type="file"
                id="file-upload"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <UploadCloud className="w-8 h-8 text-[#5B5B5B] mx-auto mb-2" />
                {file ? (
                  <div>
                    <span className="font-semibold text-xs text-[#0A2540]">{file.name}</span>
                    <span className="text-[11px] text-[#5B5B5B] block mt-0.5">
                      ({(file.size / 1024).toFixed(1)} KB) — Click to choose different file
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-semibold text-[#0A2540]">
                      Click to browse your device or select a legal template above
                    </span>
                    <span className="text-[11px] text-[#5B5B5B] block mt-1">
                      Max file size: 25 MB
                    </span>
                  </div>
                )}
              </label>
            </div>
          </div>


          {/* Metadata fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#232323] mb-1">
                Document Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CCTV Footprints Analysis Report"
                className="w-full px-3 py-2 border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#232323] mb-1">
                Document Classification
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full px-3 py-2 border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540] bg-white"
              >
                <option value="FIR">FIR (First Information Report)</option>
                <option value="WITNESS_STATEMENT">Witness Statement (Sec. 161 / 164 CrPC)</option>
                <option value="CHARGESHEET">Chargesheet / Police Final Report</option>
                <option value="FORENSIC_REPORT">Forensic Laboratory Report (FSL)</option>
                <option value="EVIDENCE_RECORD">Physical / Digital Evidence Record</option>
                <option value="SEIZURE_MEMO">Seizure / Recovery Memo</option>
                <option value="COURT_FILING">Court Judicial Filing / Order</option>
                <option value="LEGAL_NOTICE">Legal Notice / Summons</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#232323] mb-1">
                Sensitivity Tier (Chain-of-Custody Governance)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className={`p-3 border rounded-[3px] cursor-pointer transition-all ${sensitivityTier === 'STANDARD' ? 'border-[#0A2540] bg-[#EEF1F5]' : 'border-[#DDD9D1] bg-white'}`}>
                  <input
                    type="radio"
                    name="tier"
                    value="STANDARD"
                    checked={sensitivityTier === 'STANDARD'}
                    onChange={() => setSensitivityTier('STANDARD')}
                    className="sr-only"
                  />
                  <div className="font-semibold text-xs text-[#0A2540]">STANDARD</div>
                  <div className="text-[11px] text-[#5B5B5B] mt-0.5">
                    Accessible to all assigned case officers (IO, Forensic, Prosecutor).
                  </div>
                </label>

                <label className={`p-3 border rounded-[3px] cursor-pointer transition-all ${sensitivityTier === 'RESTRICTED' ? 'border-[#C9A227] bg-[#FBF3E4]' : 'border-[#DDD9D1] bg-white'}`}>
                  <input
                    type="radio"
                    name="tier"
                    value="RESTRICTED"
                    checked={sensitivityTier === 'RESTRICTED'}
                    onChange={() => setSensitivityTier('RESTRICTED')}
                    className="sr-only"
                  />
                  <div className="font-semibold text-xs text-[#8A6710]">RESTRICTED</div>
                  <div className="text-[11px] text-[#5B5B5B] mt-0.5">
                    Sensitive investigation material. Read logged with elevated audit.
                  </div>
                </label>

                <label className={`p-3 border rounded-[3px] cursor-pointer transition-all ${sensitivityTier === 'SEALED' ? 'border-[#8C1D2B] bg-[#FBEEEE]' : 'border-[#DDD9D1] bg-white'}`}>
                  <input
                    type="radio"
                    name="tier"
                    value="SEALED"
                    checked={sensitivityTier === 'SEALED'}
                    onChange={() => setSensitivityTier('SEALED')}
                    className="sr-only"
                  />
                  <div className="font-semibold text-xs text-[#8C1D2B] flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    SEALED (Judicial Gate)
                  </div>
                  <div className="text-[11px] text-[#5B5B5B] mt-0.5">
                    Cryptographically locked. Access strictly requires judicial court order.
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#DDD9D1] flex items-center justify-between">
            <div className="text-[11px] text-[#5B5B5B] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#1F6F4A]" />
              <span>Officer: {currentUser.name} ({currentUser.role})</span>
            </div>

            <button
              type="submit"
              disabled={uploading || !file}
              className="px-5 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] transition-colors cursor-pointer disabled:opacity-50"
            >
              {uploading ? 'Hashing & Uploading...' : 'Upload & Compute SHA-256'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
