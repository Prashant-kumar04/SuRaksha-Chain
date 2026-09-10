import React, { useState, useEffect } from 'react';
import { Case, User, VictimRecord } from '../types';
import { api } from '../api';
import {
  EyeOff,
  Eye,
  Shield,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Save,
  Plus,
  FileText,
} from 'lucide-react';

interface RedactionViewProps {
  currentCase: Case | null;
  currentUser: User;
  onRefreshData: () => Promise<void>;
}

export const RedactionView: React.FC<RedactionViewProps> = ({
  currentCase,
  currentUser,
  onRefreshData,
}) => {
  const [loading, setLoading] = useState(false);
  const [recordData, setRecordData] = useState<{
    exists: boolean;
    redacted: boolean;
    record: VictimRecord | null;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [victimName, setVictimName] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [caseSummary, setCaseSummary] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const fetchRecord = async () => {
    if (!currentCase) return;
    setLoading(true);
    try {
      const data = await api.getVictimRecord(currentCase.case_id);
      setRecordData(data);
      if (data.record) {
        setVictimName(data.record.victim_name);
        setAddress(data.record.address || '');
        setContactNumber(data.record.contact_number || '');
        setCaseSummary(data.record.case_summary || '');
      }
    } catch (err: any) {
      console.error('Failed to load victim record:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecord();
  }, [currentCase]);

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCase || !victimName) return;

    setSaving(true);
    setNotice(null);
    try {
      await api.saveVictimRecord(currentCase.case_id, {
        victim_name: victimName,
        address,
        contact_number: contactNumber,
        case_summary: caseSummary,
      });
      setNotice('Victim record saved to database under Section 228A IPC protocol.');
      setShowEntryForm(false);
      await fetchRecord();
      await onRefreshData();
    } catch (err: any) {
      setNotice('Error saving record: ' + (err.message || 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  if (!currentCase) {
    return (
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center">
        <h2 className="text-sm font-bold text-[#0A2540]">No Case Selected</h2>
        <p className="text-xs text-[#5B5B5B] mt-1">Please select or create a case first.</p>
      </div>
    );
  }

  const isJudicialOfficer = ['COURT_OFFICER', 'ADMIN'].includes(currentUser.role);
  const record = recordData?.record;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DDD9D1]">
        <div>
          <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
            <EyeOff className="w-5 h-5 text-[#1F6F4A]" />
            Section 228A IPC Statutory Victim Redaction
          </h1>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            Automatic role-based identity redaction for sensitive women safety &amp; POCSO matters. Judicial masters require judge/admin clearance.
          </p>
        </div>

        {['IO', 'ADMIN', 'COURT_OFFICER'].includes(currentUser.role) && !recordData?.exists && (
          <button
            onClick={() => setShowEntryForm(true)}
            className="px-3.5 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Enter Victim Record</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-[#EAF3EE] border border-[#1F6F4A]/40 rounded text-xs text-[#1F6F4A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Role Access Indicator */}
      <div className={`p-4 border rounded-[4px] flex items-start gap-3 ${isJudicialOfficer ? 'bg-[#EAF3EE] border-[#1F6F4A]/40' : 'bg-[#FBF3E4] border-[#C9A227]/40'}`}>
        {isJudicialOfficer ? (
          <Unlock className="w-5 h-5 text-[#1F6F4A] shrink-0 mt-0.5" />
        ) : (
          <Lock className="w-5 h-5 text-[#8A6710] shrink-0 mt-0.5" />
        )}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <span className={isJudicialOfficer ? 'text-[#1F6F4A]' : 'text-[#8A6710]'}>
              {isJudicialOfficer ? 'Judicial Master Copy Unlocked' : 'Redacted Investigation Copy Enforced'}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-white rounded border">
              Role: {currentUser.role}
            </span>
          </div>
          <div className="text-xs text-[#232323] mt-0.5">
            {isJudicialOfficer
              ? 'You have judicial authority. Full unredacted records are visible to your account. This view event has been logged to the tamper-evident hash-chained ledger.'
              : 'Pursuant to Section 228A IPC and Supreme Court guidelines in Nipun Saxena v. Union of India, victim-identifying fields are masked on non-judicial terminals.'}

          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[#5B5B5B]">Loading victim record from SQLite database...</div>
      ) : recordData?.exists && record ? (
        <div className="bg-white border border-[#DDD9D1] rounded-[4px] p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-[#DDD9D1] pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0A2540]" />
              <h2 className="text-sm font-bold text-[#0A2540]">
                Victim Master Confidential File — Case {currentCase.fir_number}
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#5B5B5B]">
              Registered: {record.created_at ? new Date(record.created_at).toLocaleDateString() : 'Active'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Victim Name */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px]">
              <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
                Victim / Complainant Identity
              </div>
              <div className={`font-mono text-sm font-semibold ${recordData.redacted ? 'text-[#8C1D2B] bg-[#FBEEEE] p-1.5 rounded' : 'text-[#0A2540]'}`}>
                {record.victim_name}
              </div>
            </div>

            {/* Contact Number */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px]">
              <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
                Contact Telephone
              </div>
              <div className={`font-mono text-sm font-semibold ${recordData.redacted ? 'text-[#8C1D2B] bg-[#FBEEEE] p-1.5 rounded' : 'text-[#0A2540]'}`}>
                {record.contact_number || 'Not provided'}
              </div>
            </div>

            {/* Address */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px] md:col-span-2">
              <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
                Residential Location / Address
              </div>
              <div className={`font-mono text-sm font-semibold ${recordData.redacted ? 'text-[#8C1D2B] bg-[#FBEEEE] p-1.5 rounded' : 'text-[#0A2540]'}`}>
                {record.address || 'Not provided'}
              </div>
            </div>

            {/* Case Summary */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#DDD9D1] rounded-[3px] md:col-span-2">
              <div className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider mb-1">
                Incident &amp; Evidentiary Context (Unredacted Summary)
              </div>
              <div className="text-xs text-[#232323] leading-relaxed mt-1">
                {record.case_summary || 'No incident summary recorded on file.'}
              </div>
            </div>
          </div>

          {/* Statutory Notice */}
          <div className="text-[11px] text-[#5B5B5B] p-3 bg-[#F7F6F3] rounded border border-[#DDD9D1] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#1F6F4A] shrink-0" />
            <span>
              Section 228A IPC carries mandatory penal sanctions for disclosing the identity of victims in proceedings relating to specified sexual offences.
            </span>
          </div>
        </div>
      ) : showEntryForm ? (
        <form onSubmit={handleSaveRecord} className="bg-white border border-[#DDD9D1] rounded-[4px] p-6 shadow-xs space-y-4 text-xs">
          <div className="border-b border-[#DDD9D1] pb-3">
            <h2 className="text-sm font-bold text-[#0A2540]">Create Genuine Database Victim Record</h2>
            <p className="text-[11px] text-[#5B5B5B] mt-0.5">
              This will be stored in the SQLite database `victim_records` table and governed by Section 228A IPC redaction profiles.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[#232323] mb-1">Victim / Complainant Name *</label>
              <input
                type="text"
                required
                value={victimName}
                onChange={(e) => setVictimName(e.target.value)}
                placeholder="e.g. K. Sundari"
                className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#232323] mb-1">Confidential Contact Number</label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. +91-98765-43210"
                className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#232323] mb-1">Residential Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Flat 402, Green Glen Towers, District East"
                className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#232323] mb-1">Incident Summary</label>
              <textarea
                rows={3}
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
                placeholder="Enter incident context and evidentiary notes."
                className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#DDD9D1] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEntryForm(false)}
              className="px-3 py-1.5 border border-[#DDD9D1] rounded text-xs font-semibold text-[#5B5B5B] hover:bg-[#F7F6F3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !victimName}
              className="px-4 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Victim Record to DB'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white border border-[#DDD9D1] rounded-[3px] p-8 text-center">
          <EyeOff className="w-8 h-8 text-[#DDD9D1] mx-auto mb-2" />
          <h2 className="text-sm font-bold text-[#0A2540]">No Victim Record Registered for this Case</h2>
          <p className="text-xs text-[#5B5B5B] mt-1">
            Click "Enter Victim Record" above to register a protected complainant profile in the SQLite database.
          </p>
        </div>
      )}
    </div>
  );
};
