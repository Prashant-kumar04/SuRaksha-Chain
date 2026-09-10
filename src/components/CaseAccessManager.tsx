import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { api } from '../api';
import { KeyRound, UserPlus, Trash2 } from 'lucide-react';

interface CaseAccessManagerProps {
  caseId: string;
  caseOwnerId?: string;
  currentUser: User;
}

interface LocalAssignment {
  assignmentId: string;
  userId: string;
  userName: string;
  accessLevel: 'READ' | 'WRITE';
}

const roleLabels: Record<string, string> = {
  IO: 'Investigating Officers',
  FORENSIC_EXPERT: 'Forensic Scientists',
  PROSECUTOR: 'Public Prosecutors',
  COURT_OFFICER: 'Judicial / Court Officers',
  ADMIN: 'Administrators',
};

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
    Promise.all([
      api.getCaseAssignments(caseId),
      currentUser.role === 'ADMIN' ? api.getUsers() : Promise.resolve([] as User[]),
    ])
      .then(([existingAssignments, availableUsers]) => {
        setAssignments(existingAssignments.map((assignment) => ({
          assignmentId: assignment.assignment_id,
          userId: assignment.user_id,
          userName: assignment.name,
          accessLevel: assignment.access_level,
        })));
        setUsers(availableUsers);
        setSelectedUserId(availableUsers[0]?.user_id || '');
      })
      .catch(() => {
        setAssignments([]);
        setUsers([]);
      })
      .finally(() => setLoadingUsers(false));
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
      const result = await api.assignUserToCase(caseId, targetUserId, accessLevel);
      const selectedUser = users.find((user) => user.user_id === targetUserId);
      setAssignments((current) => [
        ...current.filter((assignment) => assignment.userId !== targetUserId),
        {
          assignmentId: result.assignment_id,
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

  const handleAccessChange = async (assignment: LocalAssignment, nextAccess: 'READ' | 'WRITE') => {
    setError(null);
    try {
      await api.updateCaseAssignment(caseId, assignment.assignmentId, nextAccess);
      setAssignments((current) => current.map((item) => item.userId === assignment.userId ? { ...item, accessLevel: nextAccess } : item));
      setNotice(`${assignment.userName} now has ${nextAccess} access.`);
    } catch (err: any) {
      setError(err.message || 'Failed to update case access.');
    }
  };

  const handleRemove = async (assignment: LocalAssignment) => {
    if (!window.confirm(`Remove ${assignment.userName} from this case?`)) return;
    setError(null);
    try {
      await api.removeCaseAssignment(caseId, assignment.assignmentId);
      setAssignments((current) => current.filter((item) => item.userId !== assignment.userId));
      setNotice(`${assignment.userName} was removed from this case.`);
    } catch (err: any) {
      setError(err.message || 'Failed to remove case access.');
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
                {Object.entries(roleLabels).map(([role, label]) => {
                  const roleUsers = users.filter((user) => user.role === role);
                  if (roleUsers.length === 0) return null;
                  return (
                    <optgroup key={role} label={label}>
                      {roleUsers.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
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
                  <div className="flex items-center gap-2">
                    <select
                      value={assignment.accessLevel}
                      onChange={(event) => handleAccessChange(assignment, event.target.value as 'READ' | 'WRITE')}
                      className="font-mono text-[10px] px-2 py-1 bg-[#EEF1F5] text-[#123258] rounded-[2px] border border-[#DDD9D1]"
                    >
                      <option value="READ">READ</option>
                      <option value="WRITE">WRITE</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemove(assignment)}
                      title={`Remove ${assignment.userName}`}
                      className="p-1 text-[#8C1D2B] hover:bg-[#FBEEEE] rounded-[2px] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};