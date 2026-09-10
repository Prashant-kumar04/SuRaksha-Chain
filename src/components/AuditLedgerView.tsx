import React, { useState, useEffect } from 'react';
import { AuditLogEntry, AuditVerificationResult, User } from '../types';
import { api } from '../api';
import {
  FileLock2,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  Flame,
  ShieldCheck,
  Hash,
  Clock,
  UserCheck,
} from 'lucide-react';

interface AuditLedgerViewProps {
  currentUser: User;
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [tamperMessage, setTamperMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLog();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    setTamperMessage(null);
    try {
      const result = await api.verifyAuditChain();
      setVerification(result);
    } catch (err: any) {
      setError(err.message || 'Chain verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleTamperTest = async () => {
    setTampering(true);
    try {
      const res = await api.tamperAuditLog();
      setTamperMessage(res.message);
      await fetchLogs();
      await handleVerifyChain();
    } catch (err: any) {
      alert('Tamper test error: ' + (err.message || 'Failed'));
    } finally {
      setTampering(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    handleVerifyChain();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DDD9D1]">
        <div>
          <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
            <FileLock2 className="w-5 h-5 text-[#1F6F4A]" />
            Tamper-Evident Hash-Chained Audit Ledger
          </h1>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            Every administrative, forensic, and investigative event is recorded in a tamper-evident SHA-256 hash-chained ledger in SQLite.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="px-3.5 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            <span>Verify Cryptographic Chain</span>
          </button>

          {currentUser.role === 'ADMIN' && (
            <button
              onClick={handleTamperTest}
              disabled={tampering}
              className="px-3 py-1.5 bg-[#8C1D2B] hover:bg-[#6f1621] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Deliberately alters a database row directly to demonstrate chain break detection"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Simulate DB Tamper</span>
            </button>
          )}
        </div>
      </div>

      {tamperMessage && (
        <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/40 rounded text-xs text-[#8C1D2B]">
          <strong>Tamper Test Executed:</strong> {tamperMessage}
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-xs text-[#8C1D2B]">
          {error}
        </div>
      )}

      {/* Verification Status Banner */}
      {verification && (
        <div
          className={`p-4 rounded-[4px] border flex items-start gap-3 ${
            verification.valid
              ? 'bg-[#EAF3EE] border-[#1F6F4A]/40 text-[#1F6F4A]'
              : 'bg-[#FBEEEE] border-[#8C1D2B] text-[#8C1D2B]'
          }`}
        >
          {verification.valid ? (
            <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5" />
          ) : (
            <AlertOctagon className="w-6 h-6 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="text-sm font-bold">
              {verification.valid
                ? verification.total_entries === 0
                  ? 'AUDIT LEDGER READY — 0 Operational Blocks on Chain'
                  : `LEDGER INTEGRITY CONFIRMED — All ${verification.total_entries} Blocks Cryptographically Valid`
                : `❌ CRYPTOGRAPHIC CHAIN BREAK DETECTED AT BLOCK #${verification.broken_at}`}
            </div>
            <div className="text-xs text-[#232323] mt-0.5">
              {verification.valid
                ? verification.total_entries === 0
                  ? 'The cryptographic audit ledger is initialized. Every future officer action (logins, uploads, unseals) will be appended to the SHA-256 hash chain in real time.'
                  : 'Every block hashes correctly to its payload and links seamlessly to its predecessor. Hash-chain integrity verified.'
                : 'A database row has been altered or a block hash was modified out-of-band! The mathematical link between blocks is broken.'}
            </div>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#DDD9D1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0A2540]" />
            <h2 className="text-sm font-bold text-[#0A2540]">Append-Only Chain Entries</h2>
          </div>
          <span className="text-xs font-mono text-[#5B5B5B]">
            {logs.length} Block{logs.length === 1 ? '' : 's'} on Chain
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#5B5B5B]">Loading audit ledger from database...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#5B5B5B]">No audit records recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#DDD9D1] bg-[#F7F6F3] text-[11px] text-[#5B5B5B] uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Officer / Actor</th>
                  <th className="py-2.5 px-4">Audit Detail</th>
                  <th className="py-2.5 px-4">SHA-256 Entry Hash &amp; Previous Link</th>
                  <th className="py-2.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E6DF]">
                {logs.map((log) => {
                  const isTampered = log.detail?.includes('[TAMPERED');
                  return (
                    <tr
                      key={log.log_id}
                      className={`hover:bg-[#FAF9F6] transition-colors ${
                        isTampered ? 'bg-[#FBEEEE]' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono text-[10.5px] px-2 py-0.5 rounded bg-[#EEF1F5] text-[#0A2540] font-semibold">
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0A2540] flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-[#1F6F4A]" />
                          <span>{log.actor_name || 'System / Genesis'}</span>
                        </div>
                        {log.actor_role && (
                          <div className="text-[10px] text-[#5B5B5B] font-mono mt-0.5">
                            {log.actor_role}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className={`text-xs ${isTampered ? 'text-[#8C1D2B] font-bold' : 'text-[#232323]'}`}>
                          {log.detail || '—'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="font-mono text-[10px] text-[#0A2540] bg-[#E9E6DF] px-1.5 py-0.5 rounded truncate max-w-xs" title={log.entry_hash}>
                            Curr: {log.entry_hash.slice(0, 20)}…
                          </div>
                          <div className="font-mono text-[9px] text-[#5B5B5B] truncate max-w-xs" title={log.previous_entry_hash || 'None'}>
                            Prev: {log.previous_entry_hash ? `${log.previous_entry_hash.slice(0, 16)}…` : 'Genesis Block 0'}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right text-[11px] text-[#5B5B5B]">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
