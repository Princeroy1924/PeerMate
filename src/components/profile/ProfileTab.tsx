import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  User,
  Crown,
  Mic,
  Shield,
  LogOut,
  Check,
  Sparkles,
  Volume2,
  Globe,
  Clock,
  Target,
  AlertCircle,
  AtSign,
  Flame,
  Zap,
  Phone,
  Settings,
  Edit3,
  ShieldCheck,
  CreditCard,
  Sun,
  Moon,
  Laptop,
  Palette,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../context/ThemeContext';
import { EnglishLevel } from '../../types';
import { createMicAnalyser, playSound } from '../../lib/audio';
import {
  validateDisplayName,
  validateUsername,
  validateProfileForm,
} from '../../lib/validation';
import { api } from '../../lib/api';
import { AdminPaymentVerification } from '../admin/AdminPaymentVerification';
import { PeerMateLogo } from '../common/PeerMateLogo';
import confetti from 'canvas-confetti';

const NATIVE_LANGUAGES = [
  'Hindi',
  'Spanish',
  'Arabic',
  'Bengali',
  'Portuguese',
  'French',
  'Russian',
  'Tamil',
  'Telugu',
  'Urdu',
  'Marathi',
  'German',
  'Japanese',
  'Other',
];

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

const ENGLISH_LEVELS: EnglishLevel[] = [
  'Beginner',
  'Elementary',
  'Intermediate',
  'Upper Intermediate',
  'Advanced',
];

export const ProfileTab: React.FC = () => {
  const { user, updateProfile, logout, refreshUser, setIsPricingModalOpen, setIsAuthModalOpen } = useAuth();
  const { theme, preference, setPreference, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || AVATAR_PRESETS[0]);
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel>(user?.englishLevel || 'Intermediate');
  const [nativeLanguage, setNativeLanguage] = useState(user?.nativeLanguage || 'Hindi');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(user?.dailyGoalMinutes || 20);
  const [learningGoal, setLearningGoal] = useState(user?.learningGoal || 'Conversational Fluency');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin Verification State
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Check admin authorization on mount
  useEffect(() => {
    if (user?.email) {
      api
        .checkAdminStatus()
        .then((res) => {
          if (res && res.isAdmin) {
            setIsAdmin(true);
          }
        })
        .catch(() => {});
    }
  }, [user?.email]);

  // Sync state when user profile changes
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setUsername(user.username || '');
      setAvatarUrl(user.avatarUrl || AVATAR_PRESETS[0]);
      setEnglishLevel(user.englishLevel || 'Intermediate');
      setNativeLanguage(user.nativeLanguage || 'Hindi');
      setDailyGoalMinutes(user.dailyGoalMinutes || 20);
      setLearningGoal(user.learningGoal || 'Conversational Fluency');
    }
  }, [user]);

  // Real-time Validation
  const displayNameValidation = useMemo(
    () => validateDisplayName(displayName),
    [displayName]
  );

  const usernameValidation = useMemo(
    () => validateUsername(username),
    [username]
  );

  const isFormValid = displayNameValidation.isValid && usernameValidation.isValid;

  // Audio mic test
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micAnalyserRef = useRef<{ cleanup: () => void; getVolume: () => number } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (micAnalyserRef.current) {
        micAnalyserRef.current.cleanup();
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const toggleMicTest = async () => {
    if (isTestingMic) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micAnalyserRef.current) micAnalyserRef.current.cleanup();
      setIsTestingMic(false);
      setMicLevel(0);
      return;
    }

    try {
      playSound('click');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const analyser = createMicAnalyser(stream);
      micAnalyserRef.current = analyser;
      setIsTestingMic(true);

      const updateMeter = () => {
        if (micAnalyserRef.current) {
          const vol = micAnalyserRef.current.getVolume();
          setMicLevel(vol);
        }
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (err) {
      console.warn('Microphone permission denied:', err);
      setIsTestingMic(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate entire form
    const validation = validateProfileForm({
      displayName,
      username,
      dailyGoalMinutes,
      englishLevel,
      nativeLanguage,
    });

    if (!validation.isValid) {
      const firstError =
        validation.errors.displayName ||
        validation.errors.username ||
        validation.errors.dailyGoalMinutes ||
        'Please check the form for invalid input.';
      setFormError(firstError);
      playSound('warning');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: validation.cleanData.displayName,
        username: validation.cleanData.username,
        avatarUrl,
        englishLevel,
        nativeLanguage,
        dailyGoalMinutes: validation.cleanData.dailyGoalMinutes,
        learningGoal,
      });
      setSavedSuccess(true);
      playSound('success');
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      setTimeout(() => {
        setSavedSuccess(false);
      }, 2500);
    } catch (err: any) {
      console.warn('Error updating profile:', err);
      setFormError(err.message || 'Failed to update profile. Please try again.');
      playSound('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeSelect = (newPref: ThemePreference) => {
    playSound('pop');
    setPreference(newPref);
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* Profile Header Summary Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors duration-200">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div className="relative group">
            <img
              src={avatarUrl || user?.avatarUrl || AVATAR_PRESETS[0]}
              alt={displayName}
              className="w-20 h-20 rounded-3xl object-cover ring-4 ring-indigo-50 dark:ring-indigo-950 border-2 border-white dark:border-slate-800 shadow-md"
              referrerPolicy="no-referrer"
            />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[10px] text-white">
              ✓
            </span>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {displayName || user?.displayName || 'Learner'}
              </h2>
              {user?.plan === 'pro' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  Pro
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Free Member
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              @{username || user?.username || 'learner'} • {user?.email}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-100/50 dark:border-indigo-900/40">
                <Globe className="w-3.5 h-3.5" />
                {englishLevel}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 text-xs font-bold border border-orange-100/50 dark:border-orange-900/40">
                <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                {user?.currentStreak || 1} Day Streak
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-100/50 dark:border-amber-900/40">
                <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                {user?.totalXp || 0} XP
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100/50 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Daily Goal</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">{dailyGoalMinutes} mins</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100/50 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Native Lang</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">{nativeLanguage}</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100/50 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Target</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5 truncate">{learningGoal.split(' ')[0]}</div>
          </div>
        </div>
      </div>

      {/* Theme & Appearance Switcher Section */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4 transition-colors duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>App Theme & Appearance</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 uppercase">
                  {preference === 'system' ? `Auto (${theme})` : theme}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose between clean light mode, eye-safe dark mode, or system auto
              </p>
            </div>
          </div>

          {/* 1-Click Fast Toggle Switch */}
          <button
            type="button"
            id="theme-quick-switch-btn"
            onClick={toggleTheme}
            className="p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline text-xs font-bold">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline text-xs font-bold">Dark Mode</span>
              </>
            )}
          </button>
        </div>

        {/* 3-Option Interactive Segmented Grid */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {/* Light Mode Option */}
          <button
            type="button"
            id="theme-select-light-btn"
            onClick={() => handleThemeSelect('light')}
            className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${
              preference === 'light'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/50 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className={`p-2 rounded-xl ${preference === 'light' ? 'bg-amber-100 text-amber-700' : 'bg-white dark:bg-slate-800 text-slate-500'}`}>
                <Sun className="w-4 h-4" />
              </div>
              {preference === 'light' && (
                <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Light Mode</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Clean & Bright</div>
            </div>
          </button>

          {/* Dark Mode Option */}
          <button
            type="button"
            id="theme-select-dark-btn"
            onClick={() => handleThemeSelect('dark')}
            className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${
              preference === 'dark'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/50 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className={`p-2 rounded-xl ${preference === 'dark' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}>
                <Moon className="w-4 h-4" />
              </div>
              {preference === 'dark' && (
                <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Dark Mode</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Night & Eye-Safe</div>
            </div>
          </button>

          {/* System Auto Option */}
          <button
            type="button"
            id="theme-select-system-btn"
            onClick={() => handleThemeSelect('system')}
            className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${
              preference === 'system'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/50 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className={`p-2 rounded-xl ${preference === 'system' ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}>
                <Laptop className="w-4 h-4" />
              </div>
              {preference === 'system' && (
                <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">System Auto</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Follows Device OS</div>
            </div>
          </button>
        </div>

        {/* Visual Info Tagline */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span>
            Theme is saved to your browser and automatically applies across all practice tabs and call screens.
          </span>
        </p>
      </div>

      {/* Authorized Admin Section (Only displayed for verified admins) */}
      {isAdmin && (
        <div className="p-5 rounded-3xl bg-slate-900 dark:bg-slate-950 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 font-black text-sm uppercase tracking-wide text-amber-400">
              <ShieldCheck className="w-4 h-4" />
              <span>PeerMate Admin Console</span>
            </div>
            <p className="text-xs text-slate-300 max-w-sm">
              Review and verify user UPI payments, inspect receipts, and approve Pro subscriptions.
            </p>
          </div>
          <button
            type="button"
            id="admin-verify-modal-btn"
            onClick={() => setIsAdminModalOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-2xl shadow-md transition-transform active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <CreditCard className="w-4 h-4 text-amber-300" />
            <span>Verify UPI Payments</span>
          </button>
        </div>
      )}

      {/* Pro Plan Banner */}
      {user?.plan === 'pro' ? (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 font-black text-sm uppercase tracking-wide text-emerald-100">
              <Crown className="w-4 h-4 text-amber-300" />
              <span>PeerMate Pro Membership Active</span>
            </div>
            <p className="text-xs text-emerald-50 max-w-sm">
              Unlimited AI Teacher calls, in-depth speaking feedback, and priority matchmaking active.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-white/20 backdrop-blur-xs text-white text-xs font-bold border border-white/30">
              ₹99/mo Active
            </span>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 font-black text-sm uppercase tracking-wide text-amber-100">
              <Crown className="w-4 h-4 text-amber-200" />
              <span>Unlock PeerMate Pro</span>
            </div>
            <p className="text-xs text-amber-50 max-w-sm">
              Get unlimited AI speaking calls, smart feedback analysis, and priority queue matching for ₹99/month.
            </p>
          </div>
          <button
            type="button"
            id="profile-upgrade-btn"
            onClick={() => setIsPricingModalOpen(true)}
            className="px-4 py-2.5 bg-white text-orange-600 hover:bg-orange-50 font-black text-xs rounded-2xl shadow-md transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            Upgrade for ₹99
          </button>
        </div>
      )}

      {/* Profile Settings & Edit Form */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-6 transition-colors duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Edit Learner Profile</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Update your details, fluency goals, and preferences</p>
          </div>
        </div>

        {/* Error Notification */}
        {formError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Validation Error</span>
              <p className="text-[11px] text-rose-600 dark:text-rose-300">{formError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Avatar Presets Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Choose Profile Avatar</span>
            </label>
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
              {AVATAR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setAvatarUrl(preset);
                    playSound('click');
                  }}
                  className={`relative shrink-0 rounded-2xl overflow-hidden p-0.5 transition-all cursor-pointer ${
                    avatarUrl === preset
                      ? 'ring-3 ring-indigo-600 dark:ring-indigo-400 scale-105 shadow-md'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={preset}
                    alt={`Avatar ${idx + 1}`}
                    className="w-12 h-12 rounded-xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {avatarUrl === preset && (
                    <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white drop-shadow-md" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Display Name</span>
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                {displayName.trim().length > 0 && (
                  <span
                    className={`font-semibold flex items-center gap-1 ${
                      displayNameValidation.isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                    }`}
                  >
                    {displayNameValidation.isValid ? (
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                    )}
                  </span>
                )}
                <span className={`text-[10px] ${displayName.length > 50 ? 'text-rose-600 font-bold' : 'text-slate-400 dark:text-slate-500'}`}>
                  {displayName.length}/50
                </span>
              </div>
            </div>

            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (formError) setFormError(null);
              }}
              required
              maxLength={60}
              placeholder="e.g. Alex Morgan"
              className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden transition-colors ${
                displayName.trim().length > 0 && !displayNameValidation.isValid
                  ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500 focus:bg-rose-50/20'
                  : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800'
              }`}
            />
            {displayName.trim().length > 0 && !displayNameValidation.isValid && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium leading-tight">
                {displayNameValidation.error}
              </p>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Min 2 characters. Letters, spaces, apostrophes, and hyphens permitted.
            </p>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <AtSign className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Username (Peer ID)</span>
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                {username.trim().length > 0 && (
                  <span
                    className={`font-semibold flex items-center gap-1 ${
                      usernameValidation.isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                    }`}
                  >
                    {usernameValidation.isValid ? (
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                    )}
                  </span>
                )}
                <span className={`text-[10px] ${username.length > 30 ? 'text-rose-600 font-bold' : 'text-slate-400 dark:text-slate-500'}`}>
                  {username.length}/30
                </span>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-3 text-xs font-bold text-slate-400 dark:text-slate-500">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  if (formError) setFormError(null);
                }}
                required
                maxLength={35}
                placeholder="english_explorer"
                className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-2xl pl-9 pr-4 py-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden transition-colors ${
                  username.trim().length > 0 && !usernameValidation.isValid
                    ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500 focus:bg-rose-50/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800'
                }`}
              />
            </div>
            {username.trim().length > 0 && !usernameValidation.isValid && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium leading-tight">
                {usernameValidation.error}
              </p>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              3–30 characters. Lowercase letters, numbers, and underscores.
            </p>
          </div>

          {/* Grid: Native Language & English Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Native Language</span>
              </label>
              <select
                value={nativeLanguage}
                onChange={(e) => setNativeLanguage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-colors"
              >
                {NATIVE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>English Level</span>
              </label>
              <select
                value={englishLevel}
                onChange={(e) => setEnglishLevel(e.target.value as EnglishLevel)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-colors"
              >
                {ENGLISH_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Daily Goal & Learning Focus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Daily Practice Goal (Minutes)</span>
              </label>
              <input
                type="number"
                min="5"
                max="180"
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(parseInt(e.target.value) || 20)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Primary Goal</span>
              </label>
              <select
                value={learningGoal}
                onChange={(e) => setLearningGoal(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-colors"
              >
                <option value="Conversational Fluency">Conversational Fluency</option>
                <option value="Career & Job Interviews">Career & Job Interviews</option>
                <option value="IELTS / TOEFL Prep">IELTS / TOEFL Prep</option>
                <option value="Travel & Relocation">Travel & Relocation</option>
                <option value="Pronunciation & Accent Reduction">Pronunciation & Accent</option>
              </select>
            </div>
          </div>

          {/* Microphone Test Section */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Microphone Audio Test</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Test voice clarity before entering peer calls</div>
                </div>
              </div>
              <button
                type="button"
                id="profile-tab-mic-test-btn"
                onClick={toggleMicTest}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                  isTestingMic
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-200'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
                }`}
              >
                {isTestingMic ? 'Stop Test' : 'Test Mic'}
              </button>
            </div>

            {isTestingMic && (
              <div className="space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Input Volume Level</span>
                  <span>{Math.round(micLevel)}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 transition-all duration-75"
                    style={{ width: `${Math.min(100, micLevel * 2.5)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            id="save-profile-tab-btn"
            type="submit"
            disabled={isSaving || !isFormValid}
            className={`w-full py-4 rounded-2xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !isFormValid
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white shadow-indigo-200 dark:shadow-none'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Profile Saved Successfully!</span>
              </>
            ) : isSaving ? (
              <span>Saving Changes...</span>
            ) : (
              <span>Save Profile Changes</span>
            )}
          </button>
        </form>
      </div>

      {/* Account / Session Management Card */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm space-y-3 transition-colors duration-200">
        <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account Actions</div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {user?.isGuest ? (
            <button
              type="button"
              id="profile-tab-signin-btn"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex-1 py-3 px-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>Create Account / Sign In</span>
            </button>
          ) : (
            <button
              type="button"
              id="profile-tab-logout-btn"
              onClick={async () => {
                playSound('pop');
                await logout();
              }}
              className="flex-1 py-3 px-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out of PeerMate</span>
            </button>
          )}

          <button
            type="button"
            id="profile-tab-feedback-btn"
            onClick={() => {
              playSound('click');
              alert('Thank you for learning with PeerMate! Email support: support@peermate.com');
            }}
            className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs transition-colors text-center cursor-pointer"
          >
            Help & Support
          </button>
        </div>
      </div>

      {/* App & Developer Information Card */}
      <div className="p-5 rounded-3xl bg-indigo-50/70 dark:bg-slate-900 border border-indigo-100/80 dark:border-slate-800 text-center space-y-2 flex flex-col items-center transition-colors duration-200">
        <PeerMateLogo size="sm" showText={true} showSubtitle={true} />
        <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
          Developed by <span className="font-extrabold text-indigo-900 dark:text-indigo-200 underline decoration-indigo-300 dark:decoration-indigo-700">Prince</span>
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Version 1.0.0 • AI & Real-Time Peer Audio Communication
        </p>
      </div>

      {/* Admin Payment Verification Modal */}
      {isAdminModalOpen && (
        <AdminPaymentVerification
          onClose={() => setIsAdminModalOpen(false)}
          onPaymentApproved={async () => {
            await refreshUser().catch(() => {});
          }}
        />
      )}
    </div>
  );
};
