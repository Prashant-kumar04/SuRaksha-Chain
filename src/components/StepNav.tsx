import React from 'react';
import {
  FolderOpen,
  UploadCloud,
  GitCompare,
  Scale,
  FileLock2,
  EyeOff,
  Binary,
  Users,
  Search,
  MessageSquare,
} from 'lucide-react';
import { UserRole } from '../types';

export type ScreenId =
  | 'dashboard'
  | 'upload'
  | 'drift'
  | 'integrity'
  | 'court'
  | 'redaction'
  | 'ledger'
  | 'users'
  | 'search'
  | 'notes';

interface StepNavProps {
  currentScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  userRole: UserRole;
  driftFlagCount?: number;
  pendingUnsealCount?: number;
}

export const StepNav: React.FC<StepNavProps> = ({
  currentScreen,
  onSelectScreen,
  userRole,
  driftFlagCount = 0,
  pendingUnsealCount = 0,
}) => {
  const steps = [
    {
      id: 'dashboard' as ScreenId,
      stepNumber: 1,
      label: 'Case Dossier',
      icon: FolderOpen,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'upload' as ScreenId,
      stepNumber: 2,
      label: 'Document Upload',
      icon: UploadCloud,
      roles: ['IO', 'FORENSIC_EXPERT', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'search' as ScreenId,
      stepNumber: 3,
      label: 'Document Search',
      icon: Search,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'notes' as ScreenId,
      stepNumber: 4,
      label: 'Case Activity',
      icon: MessageSquare,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'drift' as ScreenId,
      stepNumber: 3,
      label: 'Version Drift Check',
      badge: driftFlagCount > 0 ? `${driftFlagCount} Alert` : undefined,
      badgeColor: 'bg-[#8C1D2B] text-white',
      icon: GitCompare,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'integrity' as ScreenId,
      stepNumber: 4,
      label: 'Physical File Integrity',
      icon: Binary,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'court' as ScreenId,
      stepNumber: 5,
      label: 'Judicial Authorization Workflow',
      badge: pendingUnsealCount > 0 ? `${pendingUnsealCount} Pending` : undefined,
      badgeColor: 'bg-[#C9A227] text-[#0A2540] font-bold',
      icon: Scale,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'redaction' as ScreenId,
      stepNumber: 6,
      label: 'Sec 228A IPC Victim Record',
      icon: EyeOff,
      roles: ['IO', 'FORENSIC_EXPERT', 'PROSECUTOR', 'COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'ledger' as ScreenId,
      stepNumber: 7,
      label: 'Tamper-Evident Audit Ledger',
      icon: FileLock2,
      roles: ['COURT_OFFICER', 'ADMIN'],
    },
    {
      id: 'users' as ScreenId,
      stepNumber: 8,
      label: 'Officer Directory',
      icon: Users,
      roles: ['ADMIN'],
    },
  ];

  const visibleSteps = steps.filter((s) => s.roles.includes(userRole));

  return (
    <nav className="bg-white border-b border-[#DDD9D1] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex overflow-x-auto no-scrollbar">
        {visibleSteps.map((step) => {
          const isActive = currentScreen === step.id;
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              onClick={() => onSelectScreen(step.id)}
              className={`flex items-center gap-2 py-3 px-3.5 sm:px-4 text-xs sm:text-sm whitespace-nowrap border-b-2 transition-all cursor-pointer select-none shrink-0 ${
                isActive
                  ? 'border-[#0A2540] text-[#0A2540] font-semibold bg-[#F7F6F3]/60'
                  : 'border-transparent text-[#5B5B5B] hover:text-[#0A2540] hover:border-[#DDD9D1]'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono transition-colors ${
                  isActive ? 'bg-[#0A2540] text-white' : 'bg-[#E9E6DF] text-[#5B5B5B]'
                }`}
              >
                {step.stepNumber}
              </span>

              <Icon className="w-4 h-4 opacity-75 hidden sm:inline" />
              <span>{step.label}</span>

              {step.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-[2px] font-mono tracking-tight ${
                    step.badgeColor || 'bg-[#8C1D2B] text-white'
                  }`}
                >
                  {step.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
