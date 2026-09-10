import React from 'react';
import { User, UserRole } from '../types';
import { ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';

interface TopBarProps {
  currentUser: User;
  onLogout: () => void;
  onOpenLedger: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentUser, onLogout, onOpenLedger }) => {
  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'IO':
        return 'bg-[#123258] text-white';
      case 'FORENSIC_EXPERT':
        return 'bg-[#1F6F4A] text-white';
      case 'PROSECUTOR':
        return 'bg-[#5a3825] text-white';
      case 'COURT_OFFICER':
        return 'bg-[#8C1D2B] text-white';
      case 'ADMIN':
        return 'bg-[#232323] text-[#C9A227] border border-[#C9A227]/40';
      case 'COMPLAINANT':
        return 'bg-[#3b4754] text-white';
    }
  };

  const getUserInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="bg-[#0A2540] text-white border-b border-[#123258] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Emblem */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[3px] bg-gradient-to-br from-[#C9A227] via-[#b8911e] to-[#8f6d0f] flex items-center justify-center font-bold text-[#0A2540] text-sm shadow-sm border border-[#e8ce6b]/40">
            SC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">SuRakSha Chain</span>
              <span className="text-[9px] tracking-wider uppercase font-mono px-1.5 py-0.5 rounded-[2px] bg-[#123258] text-[#C9A227] border border-[#C9A227]/30 font-semibold">
                SIH26190
              </span>
            </div>
            <div className="text-[11px] text-[#B9C4D3] flex items-center gap-1.5">
              <span>National Judicial &amp; Investigation Document Registry</span>
              <span className="text-[#64748b]">•</span>
              <span className="text-[#cbd5e1]/80">MHA / NCRB Protocol</span>
            </div>
          </div>
        </div>

        {/* Right Section: Ledger status + Active Session User & Sign Out */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          {/* Integrity Indicator */}
          <button
            onClick={onOpenLedger}
            title="Click to view real-time append-only ledger"
            className="hidden md:flex items-center gap-2 px-2.5 py-1.5 bg-[#123258]/80 hover:bg-[#123258] border border-[#2b4c73] rounded-[3px] text-[#D9E0EA] transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#34d399]" />
            <span className="font-mono text-[11px]">Database Ledger Active</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse"></span>
          </button>

          {/* Active User Pill */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#123258] border border-[#2b4c73] rounded-[3px]">
            <div className="w-7 h-7 rounded-full bg-[#3A5A82] flex items-center justify-center font-bold text-xs text-white shrink-0">
              {getUserInitials(currentUser.name)}
            </div>
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white text-xs">{currentUser.name}</span>
                <span className={`text-[9px] px-1 py-0.2 rounded font-mono font-semibold ${getRoleBadgeColor(currentUser.role)}`}>
                  {currentUser.role}
                </span>
              </div>
              <div className="text-[10.5px] text-[#B9C4D3] truncate max-w-[180px]">
                {currentUser.department || 'Authorized Personnel'}
                {currentUser.badge_number ? ` (${currentUser.badge_number})` : ''}
              </div>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={onLogout}
            title="Sign out of active cryptographic session"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C1D2B]/80 hover:bg-[#8C1D2B] border border-[#a82a3b] rounded-[3px] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
