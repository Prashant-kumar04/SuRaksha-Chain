import React, { useState } from 'react';
import { api } from '../api';
import { User } from '../types';
import { Shield, KeyRound, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

const BOOTSTRAP_CREDENTIALS = [
  { role: 'IO', label: 'Investigating Officer', email: 'io@suraksha.gov.in', dept: 'Crime Branch' },
  { role: 'FORENSIC_EXPERT', label: 'Forensic Scientist', email: 'forensic@suraksha.gov.in', dept: 'FSL District Lab' },
  { role: 'PROSECUTOR', label: 'Public Prosecutor', email: 'prosecutor@suraksha.gov.in', dept: "Directorate of Prosecution" },
  { role: 'COURT_OFFICER', label: 'Judicial Magistrate / Registrar', email: 'court@suraksha.gov.in', dept: 'District Sessions Court' },
  { role: 'ADMIN', label: 'System Administrator', email: 'admin@suraksha.gov.in', dept: 'State Police IT Cell' },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('io@suraksha.gov.in');
  const [password, setPassword] = useState('Demo@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user } = await api.login(email, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleFill = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('Demo@123');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#0A2540] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#C9A227_1px,transparent_1px)] [background-size:16px_16px]"></div>

      <div className="w-full max-w-md bg-white border border-[#DDD9D1] rounded-[4px] shadow-2xl p-8 relative z-10">
        {/* Emblem & Branding */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-[3px] bg-gradient-to-br from-[#C9A227] via-[#b8911e] to-[#8f6d0f] flex items-center justify-center font-bold text-[#0A2540] text-lg shadow-sm border border-[#e8ce6b]/40">
            SC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#0A2540] tracking-tight">SuRakSha Chain</h1>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#123258] text-[#C9A227] font-semibold">
                SIH26190
              </span>
            </div>
            <p className="text-xs text-[#5B5B5B]">National Case Document Integrity Registry</p>
          </div>
        </div>

        <div className="border-b border-[#E9E6DF] pb-4 mb-6">
          <h2 className="text-sm font-semibold text-[#0A2540] flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-[#1F6F4A]" />
            Officer Sign In
          </h2>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            Authenticate using departmental credentials with bcrypt &amp; signed JWT tokens.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded-[3px] flex items-start gap-2.5 text-xs text-[#8C1D2B]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#232323] mb-1.5">
              Official Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540] focus:ring-1 focus:ring-[#0A2540] bg-white text-[#232323]"
              placeholder="officer@suraksha.gov.in"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#232323] mb-1.5">
              Secure Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540] focus:ring-1 focus:ring-[#0A2540] bg-white text-[#232323]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0A2540] hover:bg-[#123258] text-white text-xs sm:text-sm font-semibold rounded-[3px] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span>Authenticating against SQLite...</span>
            ) : (
              <>
                <span>Sign In to Registry</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* SIH Prototype Demo Accounts */}
        <div className="mt-8 pt-5 border-t border-[#E9E6DF]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#5B5B5B] uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#1F6F4A]" />
              Role Quick-Select (Demo Password: Demo@123)
            </span>
          </div>
          <p className="text-[11px] text-[#5B5B5B] mb-2.5">
            Click any demo role to auto-populate credentials and test role-based access controls:
          </p>
          <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
            {BOOTSTRAP_CREDENTIALS.map((cred) => (
              <button
                key={cred.email}
                type="button"
                onClick={() => handleFill(cred.email)}
                className={`text-left px-2.5 py-1.5 rounded-[3px] border transition-all text-xs flex items-center justify-between cursor-pointer ${
                  email === cred.email
                    ? 'bg-[#EAF3EE] border-[#1F6F4A] text-[#0A2540] font-semibold'
                    : 'bg-[#F7F6F3] border-[#DDD9D1] text-[#5B5B5B] hover:text-[#0A2540] hover:bg-[#E9E6DF]'
                }`}
              >
                <div>
                  <div className="text-[11.5px] font-medium text-[#232323]">{cred.label}</div>
                  <div className="text-[10px] text-[#5B5B5B] font-mono">{cred.email}</div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-[#DDD9D1] font-mono text-[#0A2540] font-semibold">
                  {cred.role}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 text-center text-[10px] text-[#5B5B5B] flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#C9A227]" />
          <span>Every access and sign-in is recorded in the tamper-evident SHA-256 audit ledger.</span>
        </div>

      </div>
    </div>
  );
};
