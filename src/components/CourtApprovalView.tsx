import React, { useState, useEffect } from 'react';
import { UnsealRequest, User, CaseDocument } from '../types';
import { api } from '../api';
import {
  Scale,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  FileText,
  Upload,
  Clock,
  ShieldCheck,
  AlertCircle,
  Gavel,
} from 'lucide-react';

interface CourtApprovalViewProps {
  currentUser: User;
  documents: CaseDocument[];
  onRefreshData: () => Promise<void>;
}

export const CourtApprovalView: React.FC<CourtApprovalViewProps> = ({
  currentUser,
  documents,
  onRefreshData,
}) => {
  const [requests, setRequests] = useState<UnsealRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New request modal / form
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [justification, setJustification] = useState('');

  // Attach order state
  const [attachingToId, setAttachingToId] = useState<string | null>(null);
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [orderNumber, setOrderNumber] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await api.getUnsealRequests();
      setRequests(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch unseal requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId || !justification) return;

    setActionLoading('create');
    setError(null);
    try {
      await api.createUnsealRequest(selectedDocId, justification);
      setShowRequestModal(false);
      setSelectedDocId('');
      setJustification('');
      await fetchRequests();
      await onRefreshData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit unseal request.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAttachOrder = async (requestId: string) => {
    if (!orderFile) return;

    setActionLoading(requestId);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('order', orderFile);
      formData.append('court_order_number', orderNumber || `CRL-ORDER-${Math.floor(Math.random() * 9000 + 1000)}`);

      await api.attachCourtOrder(requestId, formData);
      setAttachingToId(null);
      setOrderFile(null);
      setOrderNumber('');
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || 'Failed to attach court order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    setError(null);
    try {
      await api.approveUnseal(requestId);
      await fetchRequests();
      await onRefreshData();
    } catch (err: any) {
      setError(err.message || 'Approval failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    setError(null);
    try {
      await api.rejectUnseal(requestId);
      await fetchRequests();
      await onRefreshData();
    } catch (err: any) {
      setError(err.message || 'Rejection failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const isJudicialAuthority = ['COURT_OFFICER', 'ADMIN'].includes(currentUser.role);
  const sealedDocs = documents.filter((d) => d.sensitivity_tier === 'SEALED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DDD9D1]">
        <div>
          <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#1F6F4A]" />
            Judicial Authorization Workflow (Unseal Registry)
          </h1>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            Documents marked SEALED require judicial authorization. Unsealing requires an official court order on record in compliance with criminal court procedure.
          </p>

        </div>

        <button
          onClick={() => setShowRequestModal(true)}
          className="px-3.5 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Lock className="w-3.5 h-3.5 text-[#C9A227]" />
          <span>Submit Unseal Request</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-xs text-[#8C1D2B] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#5B5B5B]">Loading unseal requests...</div>
        ) : requests.length === 0 ? (
          <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center">
            <Scale className="w-8 h-8 text-[#DDD9D1] mx-auto mb-2" />
            <h2 className="text-sm font-bold text-[#0A2540]">No Pending Unseal Requests</h2>
            <p className="text-xs text-[#5B5B5B] mt-1">
              Submit a formal request with statutory justification to seek judicial access to sealed files.
            </p>
          </div>
        ) : (
          requests.map((req) => (
            <div
              key={req.request_id}
              className="bg-white border border-[#DDD9D1] rounded-[4px] p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDD9D1] pb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      req.status === 'APPROVED'
                        ? 'bg-[#EAF3EE] text-[#1F6F4A]'
                        : req.status === 'REJECTED'
                        ? 'bg-[#FBEEEE] text-[#8C1D2B]'
                        : 'bg-[#FBF3E4] text-[#8A6710]'
                    }`}
                  >
                    {req.status === 'APPROVED' ? (
                      <Unlock className="w-4 h-4" />
                    ) : req.status === 'REJECTED' ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0A2540]">{req.document_title || 'Sealed Document Record'}</h3>
                    <div className="text-[11px] text-[#5B5B5B] flex items-center gap-2 mt-0.5">
                      <span>Requested by: <strong>{req.requested_by_name}</strong> ({req.requested_by_role})</span>
                      <span>•</span>
                      <span>{new Date(req.requested_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-[2px] text-xs font-bold uppercase tracking-wider self-start sm:self-auto ${
                    req.status === 'APPROVED'
                      ? 'bg-[#EAF3EE] text-[#1F6F4A] border border-[#1F6F4A]/30'
                      : req.status === 'REJECTED'
                      ? 'bg-[#FBEEEE] text-[#8C1D2B] border border-[#8C1D2B]/30'
                      : 'bg-[#FBF3E4] text-[#8A6710] border border-[#C9A227]/40'
                  }`}
                >
                  {req.status}
                </span>
              </div>

              {/* Justification Box */}
              <div className="p-3 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px] text-xs space-y-1">
                <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider">
                  Investigative Justification
                </div>
                <div className="text-[#232323] italic">"{req.justification || 'No justification provided'}"</div>
              </div>

              {/* Court Order Attachment Info */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                <div>
                  {req.court_order_path ? (
                    <div className="flex items-center gap-2 text-[#1F6F4A]">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="font-semibold">
                        Judicial Order Attached: {req.court_order_number || 'Order on record'}
                      </span>
                      <span className="text-[#5B5B5B] font-mono text-[11px]">({req.court_order_path})</span>
                    </div>
                  ) : (
                    <div className="text-[#8C1D2B] flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      <span>Court Order document pending attachment. Approval requires judicial order on file.</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!req.court_order_path && req.status === 'PENDING' && (
                    <button
                      onClick={() => setAttachingToId(req.request_id)}
                      className="px-3 py-1 bg-white hover:bg-[#F7F6F3] border border-[#DDD9D1] text-[#0A2540] rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Attach Court Order</span>
                    </button>
                  )}

                  {isJudicialAuthority && req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleApprove(req.request_id)}
                        disabled={actionLoading === req.request_id || !req.court_order_path}
                        className="px-3 py-1 bg-[#1F6F4A] hover:bg-[#18583b] text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        title={!req.court_order_path ? 'Attach a court order first' : 'Approve judicial unseal'}
                      >
                        <Gavel className="w-3 h-3" />
                        <span>Approve Unseal</span>
                      </button>

                      <button
                        onClick={() => handleReject(req.request_id)}
                        disabled={actionLoading === req.request_id}
                        className="px-3 py-1 bg-white hover:bg-[#FBEEEE] border border-[#8C1D2B]/40 text-[#8C1D2B] rounded text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline attach court order form */}
              {attachingToId === req.request_id && (
                <div className="p-3 bg-[#EEF1F5] border border-[#123258]/30 rounded text-xs space-y-3">
                  <div className="font-semibold text-[#0A2540]">Attach Court Order Warrant / Mandate</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#5B5B5B] mb-1">
                        Court Order Number
                      </label>
                      <input
                        type="text"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                        placeholder="e.g. CRL-MISC-984/2026"
                        className="w-full px-2.5 py-1.5 bg-white border border-[#DDD9D1] rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#5B5B5B] mb-1">
                        Signed Order Document
                      </label>
                      <input
                        type="file"
                        onChange={(e) => e.target.files && setOrderFile(e.target.files[0])}
                        className="w-full text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setAttachingToId(null)}
                      className="px-2.5 py-1 bg-white border border-[#DDD9D1] rounded text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAttachOrder(req.request_id)}
                      disabled={!orderFile || actionLoading === req.request_id}
                      className="px-3 py-1 bg-[#0A2540] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading === req.request_id ? 'Uploading...' : 'Save Court Order'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#DDD9D1] rounded-[4px] shadow-xl max-w-md w-full p-6">
            <h3 className="text-sm font-bold text-[#0A2540] mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#1F6F4A]" />
              Submit Formal Judicial Unseal Request
            </h3>

            <form onSubmit={handleCreateRequest} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#232323] mb-1">
                  Select Sealed Document
                </label>
                <select
                  required
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD9D1] rounded bg-white text-[#232323]"
                >
                  <option value="">— Select a document —</option>
                  {documents.map((d) => (
                    <option key={d.document_id} value={d.document_id}>
                      {d.title} ({d.sensitivity_tier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#232323] mb-1">
                  Statutory Investigative Justification
                </label>
                <textarea
                  required
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="State the legal necessity for unsealing (e.g. Under Section 173(8) CrPC further inquiry regarding forensic DNA match)."
                  className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs text-[#232323]"
                />
              </div>

              <div className="pt-3 border-t border-[#DDD9D1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-3 py-1.5 border border-[#DDD9D1] rounded text-xs font-semibold text-[#5B5B5B] hover:bg-[#F7F6F3]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'create' || !selectedDocId}
                  className="px-4 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'create' ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
