import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { api } from '../api';
import { KeyRound, UserPlus } from 'lucide-react';

interface CaseAccessManagerProps {
  caseId: string;
  caseOwnerId?: string;
  currentUser: User;
}

interface LocalAssignment {
  userId: string;
  userName: string;
  accessLevel: 'READ' | 'WRITE';
}

export const CaseAccessManager: React.FC<CaseAccessManagerProps> = ({ caseId, caseOwnerId, currentUser }) => {
  const canManageAccess = currentUser.role === 'ADMIN' || (currentUser.role === 'IO' && caseOwnerId === currentUser.user_id);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [manualUserId, setManualUserId] = useState('');
  const [accessLevel, setAccessLevel] = useState<'READ' | 'WRITE'>('READ');
  const [assignments, setAssignments] = useState<LocalAssignment[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageAccess) return;
    setLoadingUsers(true);
    api.getUsers()
      .then((availableUsers) => {
        setUsers(availableUsers);
        setSelectedUserId(availableUsers[0]?.user_id || '');
      })
      .catch(() => {
        setUsers([]);
      })
      .finally(() => {
        setLoadingUsers(false);
        setAssignments([]);
      });
  }, [canManageAccess, caseId]);

  if (!canManageAccess || !caseId) return null;

  const targetUserId = users.length > 0 ? selectedUserId : manualUserId.trim();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!targetUserId) {
      setError('Select a user or enter a user ID.');
      return;
    }

    setSubmitting(true);
    try {
      await api.assignUserToCase(caseId, targetUserId, accessLevel);
      const selectedUser = users.find((user) => user.user_id === targetUserId);
      setAssignments((current) => [
        ...current.filter((assignment) => assignment.userId !== targetUserId),
        {
          userId: targetUserId,
          userName: selectedUser?.name || targetUserId,
          accessLevel,
        },
      ]);
      setNotice('Case access assigned successfully.');
      setManualUserId('');
    } catch (err: any) {
      setError(err.message || 'Failed to assign case access.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white border border-[#DDD9D1] rounded-[3px] shadow-xs overflow-hidden">
      <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#DDD9D1] flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-[#0A2540]" />
        <div>
          <h2 className="text-sm font-bold text-[#0A2540]">Manage Access</h2>
          <p className="text-[11px] text-[#5B5B5B]">Assign READ or WRITE access to this case.</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px_auto] gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-[#232323] mb-1">User</label>
            {users.length > 0 ? (
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                disabled={loadingUsers || submitting}
                className="w-full px-3 py-2 text-xs bg-white border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
              >
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={manualUserId}
                onChange={(event) => setManualUserId(event.target.value)}
                disabled={submitting}
                placeholder="Enter user ID"
                className="w-full px-3 py-2 text-xs border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#232323] mb-1">Access</label>
            <select
              value={accessLevel}
              onChange={(event) => setAccessLevel(event.target.value as 'READ' | 'WRITE')}
              disabled={submitting}
              className="w-full px-3 py-2 text-xs bg-white border border-[#DDD9D1] rounded-[3px] focus:outline-none focus:border-[#0A2540]"
            >
              <option value="READ">READ</option>
              <option value="WRITE">WRITE</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || loadingUsers}
            className="px-3 py-2 bg-[#0A2540] hover:bg-[#123258] text-white text-xs font-semibold rounded-[3px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {submitting ? 'Assigning...' : 'Assign User'}
          </button>
        </form>

        {users.length === 0 && !loadingUsers && (
          <p className="text-[11px] text-[#5B5B5B]">User directory access is restricted for this role. Enter the target user ID.</p>
        )}
        {error && <p className="text-xs text-[#8C1D2B]">{error}</p>}
        {notice && <p className="text-xs text-[#1F6F4A]">{notice}</p>}

        <div className="border-t border-[#E9E6DF] pt-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5B5B5B] mb-2">Current access assignments</h3>
          {assignments.length === 0 ? (
            <p className="text-xs text-[#5B5B5B]">No assignments made from this view yet.</p>
          ) : (
            <ul className="divide-y divide-[#E9E6DF]">
              {assignments.map((assignment) => (
                <li key={assignment.userId} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-[#0A2540]">{assignment.userName}</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#EEF1F5] text-[#123258] rounded-[2px]">{assignment.accessLevel}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};