import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Sparkles, Flame, Users, Bell, Crown, Sun, Moon } from 'lucide-react';
import { PeerMateLogo } from './PeerMateLogo';
import { playSound } from '../../lib/audio';

interface HeaderProps {
  onOpenProfile?: () => void;
  onGoHome?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenProfile, onGoHome }) => {
  const { user, setIsPricingModalOpen, setIsProfileModalOpen } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = [
    {
      id: '1',
      title: 'Daily Streak Maintained! 🔥',
      desc: `You have practiced English for ${user?.currentStreak || 4} days in a row!`,
      time: '2 hours ago',
      unread: true,
    },
    {
      id: '2',
      title: 'Weekly League Update 🏆',
      desc: 'You are currently in Bronze League (Top 3)! Keep speaking to promote.',
      time: 'Yesterday',
      unread: false,
    },
    {
      id: '3',
      title: 'New Vocabulary Unlocked 📖',
      desc: "5 new high-frequency words are waiting for today's practice.",
      time: 'Today',
      unread: false,
    }
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 px-4 py-3 sm:px-6 transition-colors duration-200">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Logo - Clickable to Home */}
        <div className="flex items-center gap-2">
          <PeerMateLogo
            size="md"
            showText={true}
            showSubtitle={true}
            onClick={onGoHome}
            className="cursor-pointer"
          />
          {user?.plan === 'pro' && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 ml-1">
              <Crown className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
              PRO
            </span>
          )}
        </div>

        {/* Center Live Learners Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <Users className="w-3.5 h-3.5" />
          <span>1,842 Active Peers Online</span>
        </div>

        {/* Right Action Items */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Streak Flame */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900/60 text-orange-700 dark:text-orange-300 text-xs font-bold">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <span>{user?.currentStreak || 1}</span>
          </div>

          {/* Pro Upgrade / Badge Button */}
          {user?.plan !== 'pro' ? (
            <button
              id="upgrade-pro-header-btn"
              onClick={() => setIsPricingModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pro ₹99</span>
            </button>
          ) : (
            <button
              id="pro-active-header-btn"
              onClick={() => setIsPricingModalOpen(true)}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span>Pro Member</span>
            </button>
          )}

          {/* Quick Header Theme Toggle Button */}
          <button
            id="quick-theme-toggle-header-btn"
            onClick={() => {
              playSound('pop');
              toggleTheme();
            }}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              id="notifications-toggle-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Notifications</h3>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium cursor-pointer" onClick={() => setShowNotifications(false)}>Close</span>
                </div>
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{n.title}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile Avatar */}
          <button
            id="open-profile-btn"
            onClick={() => {
              setIsProfileModalOpen(true);
              if (onOpenProfile) onOpenProfile();
            }}
            className="flex items-center gap-2 p-0.5 rounded-full ring-2 ring-indigo-500/20 hover:ring-indigo-500/60 dark:ring-indigo-400/30 transition-all cursor-pointer"
            title="Open Profile"
          >
            <div className="relative">
              <img
                src={user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                alt={user?.displayName || 'Profile'}
                className="w-9 h-9 rounded-full object-cover border border-white dark:border-slate-800"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
