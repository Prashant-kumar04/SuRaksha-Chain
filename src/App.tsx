/**
 * SuRakSha Chain — Judicially-Gated Chain-of-Custody & Document Integrity Platform
 * SIH Problem Statement ID: SIH26190 | Ministry of Home Affairs — NCRB, Women Safety Division
 * Full-stack SQLite & Express connected architecture
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, Case, CaseDocument, UnsealRequest } from './types';
import { api, getStoredUser } from './api';

import { LoginScreen } from './components/LoginScreen';
import { TopBar } from './components/TopBar';
import { StepNav, ScreenId } from './components/StepNav';
import { CaseDashboard } from './components/CaseDashboard';
import { DocumentUpload } from './components/DocumentUpload';
import { VersionDriftView } from './components/VersionDriftView';
import { FileIntegrityView } from './components/FileIntegrityView';
import { CourtApprovalView } from './components/CourtApprovalView';
import { RedactionView } from './components/RedactionView';
import { AuditLedgerView } from './components/AuditLedgerView';
import { UserManagementView } from './components/UserManagementView';
import { SearchView } from './components/SearchView';
import { CaseNotesView } from './components/CaseNotesView';

import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('dashboard');

  // Case & Document State (Fetched from SQLite Backend)
  const [cases, setCases] = useState<Case[]>([]);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [unsealRequests, setUnsealRequests] = useState<UnsealRequest[]>([]);
  const [activeDriftDocId, setActiveDriftDocId] = useState<string | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{ message: string; type: 'SUCCESS' | 'ERROR' } | null>(null);

  const showNotification = (message: string, type: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Verify auth session with backend
  useEffect(() => {
    if (currentUser) {
      api.getMe()
        .then((user) => setCurrentUser(user))
        .catch(() => {
          api.logout();
          setCurrentUser(null);
        });
    }
  }, []);

  // Fetch Cases
  const refreshCases = useCallback(async () => {
    if (!currentUser) return;
    try {
      const caseList = await api.getCases();
      setCases(caseList);
      if (caseList.length > 0) {
        // Retain selection if valid, else choose first
        setCurrentCase((prev) => {
          if (prev && caseList.some((c) => c.case_id === prev.case_id)) {
            return caseList.find((c) => c.case_id === prev.case_id) || caseList[0];
          }
          return caseList[0];
        });
      } else {
        setCurrentCase(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch cases:', err);
    }
  }, [currentUser]);

  // Fetch Documents for Current Case
  const refreshDocuments = useCallback(async () => {
    if (!currentUser || !currentCase) {
      setDocuments([]);
      return;
    }
    try {
      const docs = await api.getCaseDocuments(currentCase.case_id);
      setDocuments(docs);
      if (!activeDriftDocId && docs.length > 0) {
        setActiveDriftDocId(docs[0].document_id);
      }
    } catch (err: any) {
      console.error('Failed to fetch documents:', err);
    }
  }, [currentUser, currentCase, activeDriftDocId]);

  // Fetch Unseal Requests
  const refreshUnsealRequests = useCallback(async () => {
    if (!currentUser) return;
    try {
      const reqs = await api.getUnsealRequests();
      setUnsealRequests(reqs);
    } catch (err: any) {
      console.error('Failed to fetch unseal requests:', err);
    }
  }, [currentUser]);

  const refreshAllData = useCallback(async () => {
    await Promise.all([refreshCases(), refreshDocuments(), refreshUnsealRequests()]);
  }, [refreshCases, refreshDocuments, refreshUnsealRequests]);

  useEffect(() => {
    if (currentUser) {
      refreshCases();
      refreshUnsealRequests();
    }
  }, [currentUser, refreshCases, refreshUnsealRequests]);

  useEffect(() => {
    if (currentCase) {
      refreshDocuments();
    }
  }, [currentCase, refreshDocuments]);

  // Handlers
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setCurrentScreen('dashboard');
    showNotification(`Welcome, ${user.name}. Signed into ${user.department || 'Registry'}.`);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setCurrentCase(null);
    setDocuments([]);
    showNotification('You have been securely signed out.', 'SUCCESS');
  };

  const handleInspectDrift = (docId: string) => {
    setActiveDriftDocId(docId);
    setCurrentScreen('drift');
  };

  const handleInspectFileIntegrity = (docId: string) => {
    setActiveDriftDocId(docId);
    setCurrentScreen('integrity');
  };

  const handleRequestUnseal = (doc: CaseDocument) => {
    setActiveDriftDocId(doc.document_id);
    setCurrentScreen('court');
  };

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const driftFlagCount = documents.filter((d) => d.drift_flag === 1).length;
  const pendingUnsealCount = unsealRequests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col font-sans text-[#232323]">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-[3px] shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
            notification.type === 'SUCCESS'
              ? 'bg-[#EAF3EE] text-[#1F6F4A] border-[#1F6F4A]/40'
              : 'bg-[#FBEEEE] text-[#8C1D2B] border-[#8C1D2B]/40'
          }`}
        >
          {notification.type === 'SUCCESS' ? (
            <CheckCircle2 className="w-4 h-4 text-[#1F6F4A]" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#8C1D2B]" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Bar with real user identity & sign out */}
      <TopBar
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenLedger={() => setCurrentScreen('ledger')}
      />

      {/* Step Navigation Bar */}
      <StepNav
        currentScreen={currentScreen}
        onSelectScreen={setCurrentScreen}
        userRole={currentUser.role}
        driftFlagCount={driftFlagCount}
        pendingUnsealCount={pendingUnsealCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {currentScreen === 'dashboard' && (
          <CaseDashboard
            cases={cases}
            currentCase={currentCase}
            documents={documents}
            currentUser={currentUser}
            onSelectCase={(c) => setCurrentCase(c)}
            onRefreshCases={refreshCases}
            onNavigateUpload={() => setCurrentScreen('upload')}
            onInspectDocumentDrift={handleInspectDrift}
            onInspectFileIntegrity={handleInspectFileIntegrity}
            onRequestUnseal={handleRequestUnseal}
          />
        )}

        {currentScreen === 'upload' && (
          <DocumentUpload
            currentCase={currentCase}
            currentUser={currentUser}
            onUploadSuccess={refreshDocuments}
            onNavigateDashboard={() => setCurrentScreen('dashboard')}
          />
        )}

        {currentScreen === 'search' && <SearchView />}

        {currentScreen === 'notes' && <CaseNotesView currentCase={currentCase} documents={documents} />}

        {currentScreen === 'drift' && (
          <VersionDriftView
            documents={documents}
            activeDocumentId={activeDriftDocId}
            currentUser={currentUser}
            onSelectDocument={setActiveDriftDocId}
            onRefreshData={refreshDocuments}
            onInspectFileIntegrity={handleInspectFileIntegrity}
          />
        )}

        {currentScreen === 'integrity' && (
          <FileIntegrityView
            documents={documents}
            activeDocumentId={activeDriftDocId}
            currentUser={currentUser}
            onSelectDocument={setActiveDriftDocId}
            onRefreshData={refreshDocuments}
          />
        )}

        {currentScreen === 'court' && (
          <CourtApprovalView
            currentUser={currentUser}
            documents={documents}
            onRefreshData={refreshAllData}
          />
        )}

        {currentScreen === 'redaction' && (
          <RedactionView
            currentCase={currentCase}
            currentUser={currentUser}
            onRefreshData={refreshAllData}
          />
        )}

        {currentScreen === 'ledger' && (
          <AuditLedgerView currentUser={currentUser} />
        )}

        {currentScreen === 'users' && currentUser.role === 'ADMIN' && (
          <UserManagementView currentUser={currentUser} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DDD9D1] bg-white py-3 px-4 sm:px-6 text-center text-xs text-[#5B5B5B]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>SuRakSha Chain</strong> (SIH26190) — Judicially-Gated Document Registry.
          </div>
          <div className="font-mono text-[11px] text-[#0A2540]">
            SQLite + SHA-256 Chained Ledger · Zero Mock Architecture
          </div>
        </div>
      </footer>
    </div>
  );
}
