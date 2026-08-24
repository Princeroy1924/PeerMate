import React from 'react';
import { BookOpen, PhoneCall, Trophy, BarChart3, User } from 'lucide-react';
import { playSound } from '../../lib/audio';

export type TabType = 'learn' | 'practice' | 'leagues' | 'progress' | 'profile';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  const tabs: Array<{ id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'learn', label: 'Learn', icon: BookOpen },
    { id: 'practice', label: 'Practice', icon: PhoneCall },
    { id: 'leagues', label: 'Leagues', icon: Trophy },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const handleTabClick = (tabId: TabType) => {
    playSound('click');
    onChangeTab(tabId);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-100 dark:border-slate-800 py-1.5 px-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] sm:pb-3 transition-colors duration-200">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
              }`}
            >
              <div
                className={`relative p-1.5 rounded-xl transition-colors ${
                  isActive ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5 transition-transform" />
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
