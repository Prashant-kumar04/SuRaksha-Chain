import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api';
import {
  Users,
  UserPlus,
  Shield,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Building,
  MapPin,
  Award,
} from 'lucide-react';

interface UserManagementViewProps {
  currentUser: User;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Officer@123');
  const [role, setRole] = useState<UserRole>('IO');
  const [department, setDepartment] = useState('Crime Investigation Branch');
  const [jurisdiction, setJurisdiction] = useState('District East');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await api.createUser({
        name,
        email,
        password,
        role,
        department,
        jurisdiction,
        badge_number: badgeNumber,
      });

      setNotice(`Officer account created for ${name} (${role}). Password hashed with bcrypt.`);
      setShowAddForm(false);
      setName('');
      setEmail('');
      setBadgeNumber('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create officer account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DDD9D1]">
        <div>
          <h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#1F6F4A]" />
            Departmental Officer Directory &amp; Role Access Control
          </h1>
          <p className="text-xs text-[#5B5B5B] mt-0.5">
            System Administrators provision verified officers with bcrypt passwords and assigned roles.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="px-3.5 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Register New Officer</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-[#EAF3EE] border border-[#1F6F4A]/40 rounded text-xs text-[#1F6F4A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FBEEEE] border border-[#8C1D2B]/30 rounded text-xs text-[#8C1D2B] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Register New Officer Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#DDD9D1] rounded-[4px] shadow-xl max-w-lg w-full p-6">
            <div className="border-b border-[#DDD9D1] pb-3 mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0A2540] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#1F6F4A]" />
                Register New Authorized Officer
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-[#5B5B5B] hover:text-[#232323] text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#232323] mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vikramaditya Singh"
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#232323] mb-1">Official Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. vsingh@suraksha.gov.in"
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#232323] mb-1">Initial Password *</label>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#232323] mb-1">Designated Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540] bg-white"
                  >
                    <option value="IO">IO (Investigating Officer)</option>
                    <option value="FORENSIC_EXPERT">FORENSIC_EXPERT (FSL Scientist)</option>
                    <option value="PROSECUTOR">PROSECUTOR (Public Prosecutor)</option>
                    <option value="COURT_OFFICER">COURT_OFFICER (Judicial Magistrate / Registrar)</option>
                    <option value="ADMIN">ADMIN (System Administrator)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#232323] mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Crime Branch"
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#232323] mb-1">Jurisdiction / District</label>
                  <input
                    type="text"
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="e.g. District East"
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#232323] mb-1">Official Badge / ID Number</label>
                  <input
                    type="text"
                    value={badgeNumber}
                    onChange={(e) => setBadgeNumber(e.target.value)}
                    placeholder="e.g. IO-9921 or JM-204"
                    className="w-full px-3 py-2 border border-[#DDD9D1] rounded text-xs focus:outline-none focus:border-[#0A2540]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#DDD9D1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 border border-[#DDD9D1] rounded text-xs font-semibold text-[#5B5B5B] hover:bg-[#F7F6F3]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#0A2540] hover:bg-[#123258] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Creating Officer...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-[#DDD9D1] rounded-[3px] shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#DDD9D1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0A2540]" />
            <h2 className="text-sm font-bold text-[#0A2540]">Registered Officers in SQLite Database</h2>
          </div>
          <span className="text-xs font-mono text-[#5B5B5B]">
            {users.length} Account{users.length === 1 ? '' : 's'} Active
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#5B5B5B]">Loading officer directory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#DDD9D1] bg-[#F7F6F3] text-[11px] text-[#5B5B5B] uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-4">Officer Name</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Official Email</th>
                  <th className="py-2.5 px-4">Department &amp; Jurisdiction</th>
                  <th className="py-2.5 px-4">Badge / ID</th>
                  <th className="py-2.5 px-4 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E6DF]">
                {users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-[#FAF9F6] transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#0A2540]">
                      {u.name}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-mono text-[10.5px] px-2 py-0.5 rounded bg-[#0A2540] text-white font-semibold">
                        {u.role}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-[#5B5B5B]">
                      {u.email}
                    </td>

                    <td className="py-3 px-4 text-[#232323]">
                      <div>{u.department || '—'}</div>
                      <div className="text-[10.5px] text-[#5B5B5B]">{u.jurisdiction || '—'}</div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-[#0A2540]">
                      {u.badge_number || '—'}
                    </td>

                    <td className="py-3 px-4 text-right text-[11px] text-[#5B5B5B]">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Active'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
