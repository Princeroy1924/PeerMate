/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { BottomNav, TabType } from './components/common/BottomNav';
import { LearnTab } from './components/learn/LearnTab';
import { PracticeTab } from './components/practice/PracticeTab';
import { LeaguesTab } from './components/leagues/LeaguesTab';
import { ProgressTab } from './components/progress/ProgressTab';
import { ProfileTab } from './components/profile/ProfileTab';
import { ProfileModal } from './components/profile/ProfileModal';
import { PricingModal } from './components/pricing/PricingModal';
import { AuthModal } from './components/auth/AuthModal';
import { PeerMateLogo } from './components/common/PeerMateLogo';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('practice');

  const {
    loading,
    isPricingModalOpen,
    setIsPricingModalOpen,
    isAuthModalOpen,
    setIsAuthModalOpen,
    isProfileModalOpen,
    setIsProfileModalOpen,
  } = useAuth();

  // Polished App Loading / Splash Screen with Official PeerMate Logo
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white selection:bg-[#02A298]">
        <div className="flex flex-col items-center text-center space-y-6 max-w-sm animate-in fade-in zoom-in-95 duration-300">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-[#0C3859] via-[#02A298] to-emerald-400 opacity-30 blur-xl animate-pulse" />
            <PeerMateLogo size="xl" showText={false} className="relative z-10" />
          </div>

          <div className="space-y-2">
            <div className="font-black text-2xl tracking-tight">
              <span className="text-white">PEER</span>
              <span className="text-[#02A298]">MATE</span>
            </div>
            <p className="text-sm font-bold text-slate-300">
              "Don't just learn English. Speak it."
            </p>
            <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
              Speak &bull; Connect &bull; Improve
            </p>
          </div>

          <div className="flex items-center gap-2 pt-4 text-xs text-[#02A298] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#02A298] animate-ping" />
            <span>Connecting to PeerMate Network...</span>
          </div>
        </div>
      </div>
    );
  }

  const handleGoHome = () => {
    setActiveTab('practice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Top Navigation Header */}
      <Header
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onGoHome={handleGoHome}
      />

      {/* Main Container - Centered Mobile-App layout with responsive desktop styling */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-4 sm:pt-6 pb-24">
        {activeTab === 'learn' && <LearnTab />}
        {activeTab === 'practice' && <PracticeTab />}
        {activeTab === 'leagues' && <LeaguesTab />}
        {activeTab === 'progress' && <ProgressTab onStartPractice={() => setActiveTab('practice')} />}
        {activeTab === 'profile' && <ProfileTab />}

        {/* Global Footer with Official Logo & Brand Taglines */}
        <footer className="pt-10 pb-8 text-center border-t border-slate-200/80 dark:border-slate-800/80 mt-12 space-y-3.5">
          <div className="flex justify-center">
            <PeerMateLogo
              size="sm"
              showText={true}
              showSubtitle={false}
              onClick={handleGoHome}
              className="cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              "Don't just learn English. Speak it."
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Speak. Connect. Improve. &bull; 24&times;7 Free Practice Platform
            </p>
          </div>

          <div className="pt-2">
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wide inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span>Developed by <strong className="text-indigo-600 dark:text-indigo-400 font-bold">Prince</strong></span>
            </p>
          </div>
        </footer>
      </main>

      {/* Fixed Bottom Navigation (5 Tabs) */}
      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* Modals */}
      {isProfileModalOpen && (
        <ProfileModal onClose={() => setIsProfileModalOpen(false)} />
      )}

      {isPricingModalOpen && (
        <PricingModal onClose={() => setIsPricingModalOpen(false)} />
      )}

      {isAuthModalOpen && (
        <AuthModal onClose={() => setIsAuthModalOpen(false)} />
      )}
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
