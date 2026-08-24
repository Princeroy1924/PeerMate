import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
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
  Sun,
  Moon,
  Laptop,
  Palette,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../context/ThemeContext';
import { EnglishLevel } from '../../types';
import { createMicAnalyser, playSound } from '../../lib/audio';
import { PeerMateLogo } from '../common/PeerMateLogo';
import {
  validateDisplayName,
  validateUsername,
  validateProfileForm,
} from '../../lib/validation';
import confetti from 'canvas-confetti';

interface ProfileModalProps {
  onClose: () => void;
}

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

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose }) => {
  const { user, updateProfile, logout, setIsPricingModalOpen } = useAuth();
  const { theme, preference, setPreference, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel>(user?.englishLevel || 'Intermediate');
  const [nativeLanguage, setNativeLanguage] = useState(user?.nativeLanguage || 'Hindi');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(user?.dailyGoalMinutes || 20);
  const [learningGoal, setLearningGoal] = useState(user?.learningGoal || 'Conversational Fluency');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sync state with user profile changes
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setUsername(user.username || '');
      setAvatarUrl(user.avatarUrl || '');
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

  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  ];

  const levels: EnglishLevel[] = [
    'Beginner',
    'Elementary',
    'Intermediate',
    'Upper Intermediate',
    'Advanced',
  ];

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
      confetti({ particleCount: 25, spread: 50, origin: { y: 0.6 } });
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

  const handleToggleMicTest = async () => {
    if (isTestingMic) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micAnalyserRef.current) micAnalyserRef.current.cleanup();
      setIsTestingMic(false);
      setMicLevel(0);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const analyser = createMicAnalyser(stream);
        micAnalyserRef.current = analyser;
        setIsTestingMic(true);

        const loop = () => {
          if (micAnalyserRef.current) {
            setMicLevel(micAnalyserRef.current.getVolume());
          }
          animFrameRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        alert('Could not access microphone for test.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micAnalyserRef.current) micAnalyserRef.current.cleanup();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full my-auto space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-800 transition-colors duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Learner Profile</h3>
          </div>
          <button
            id="close-profile-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plan Status Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/60 dark:to-slate-800/80 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600 text-white">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  {user?.plan === 'pro' ? 'PeerMate Pro Active' : 'Free Plan'}
                </span>
                {user?.plan === 'pro' && (
                  <span className="text-[10px] font-extrabold px-1.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">PRO</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {user?.plan === 'pro' ? 'Unlimited AI Speaking & Feedback' : 'Standard 1-to-1 Human Calls'}
              </p>
            </div>
          </div>

          {user?.plan !== 'pro' && (
            <button
              onClick={() => {
                onClose();
                setIsPricingModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs cursor-pointer"
            >
              Upgrade ₹99
            </button>
          )}
        </div>

        {/* Theme Preference in Modal */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Theme Appearance</span>
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 capitalize">
              {preference === 'system' ? `Auto (${theme})` : preference}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                playSound('pop');
                setPreference('light');
              }}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                preference === 'light'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs border border-indigo-200 dark:border-indigo-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('pop');
                setPreference('dark');
              }}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                preference === 'dark'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs border border-indigo-200 dark:border-indigo-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-500" />
              <span>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('pop');
                setPreference('system');
              }}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                preference === 'system'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs border border-indigo-200 dark:border-indigo-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Laptop className="w-3.5 h-3.5 text-slate-500" />
              <span>Auto</span>
            </button>
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

        {/* Edit Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Avatar selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Choose Profile Avatar</label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {avatarPresets.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={`w-12 h-12 rounded-full overflow-hidden shrink-0 transition-all cursor-pointer ${
                    avatarUrl === url
                      ? 'ring-3 ring-indigo-600 scale-105'
                      : 'ring-1 ring-slate-200 dark:ring-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt="preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-1">
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
              placeholder="e.g. Rahul Sharma"
              className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden transition-colors ${
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
              Min 2 characters. Letters, spaces, apostrophes, dots, and hyphens permitted.
            </p>
          </div>

          {/* Username */}
          <div className="space-y-1">
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
              <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-500">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  if (formError) setFormError(null);
                }}
                required
                maxLength={35}
                placeholder="rahul_talks"
                className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl pl-8 pr-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden transition-colors ${
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
              3–30 chars. Only lowercase letters, numbers, and underscores.
            </p>
          </div>

          {/* Native Language */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Native Language</span>
            </label>
            <select
              value={nativeLanguage}
              onChange={(e) => setNativeLanguage(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-850"
            >
              {NATIVE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Daily Goal & English Level */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Daily Goal</span>
              </label>
              <select
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
              >
                <option value={10}>10 mins/day</option>
                <option value={20}>20 mins/day</option>
                <option value={30}>30 mins/day</option>
                <option value={45}>45 mins/day</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>English Level</span>
              </label>
              <select
                value={englishLevel}
                onChange={(e) => setEnglishLevel(e.target.value as EnglishLevel)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
              >
                {levels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Microphone Test Section */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Microphone Audio Test</span>
              </span>
              <button
                type="button"
                onClick={handleToggleMicTest}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 cursor-pointer"
              >
                {isTestingMic ? 'Stop Test' : 'Test Mic'}
              </button>
            </div>

            {isTestingMic && (
              <div className="space-y-1">
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, (micLevel / 120) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Speak into your mic to check signal responsiveness.
                </p>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            id="save-profile-btn"
            type="submit"
            disabled={isSaving || !isFormValid}
            className={`w-full py-3.5 rounded-2xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !isFormValid
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Profile Saved Successfully!</span>
              </>
            ) : isSaving ? (
              <span>Saving Changes...</span>
            ) : (
              <span>Save Profile Changes</span>
            )}
          </button>
        </form>

        {/* Logout Section */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            id="logout-btn"
            type="button"
            onClick={async () => {
              await logout();
              onClose();
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 py-1 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>

          <PeerMateLogo size="xs" showText={true} showSubtitle={false} />
        </div>
      </div>
    </div>
  );
};
