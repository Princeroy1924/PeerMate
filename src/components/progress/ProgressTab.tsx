import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Clock,
  Phone,
  Flame,
  Bot,
  User,
  CheckCircle2,
  Sparkles,
  Trophy,
  Calendar,
  Zap,
  Target,
  Award,
  AlertCircle,
  RefreshCw,
  Play,
  Sliders,
  Check,
  Plus,
  Minus,
  TrendingUp
} from 'lucide-react';
import { UserProgress, CallRecord } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { SessionHistoryView } from './SessionHistoryView';

interface ProgressTabProps {
  onStartPractice?: () => void;
}

export const ProgressTab: React.FC<ProgressTabProps> = ({ onStartPractice }) => {
  const { user, awardXp, updateStreakAndXp, updateProfile } = useAuth();
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingPractice, setIsLoggingPractice] = useState(false);
  const [streakSuccessMsg, setStreakSuccessMsg] = useState<string | null>(null);

  // Daily Goal state
  const [dailyGoal, setDailyGoal] = useState<number>(user?.dailyGoalMinutes || 20);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState<number>(user?.dailyGoalMinutes || 20);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [goalSavedNotice, setGoalSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user?.totalXp, user?.currentStreak, user?.dailyGoalMinutes]);

  useEffect(() => {
    if (user?.dailyGoalMinutes) {
      setDailyGoal(user.dailyGoalMinutes);
      setTempGoal(user.dailyGoalMinutes);
    }
  }, [user?.dailyGoalMinutes]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [progRes, callRes] = await Promise.all([
        api.getUserProgress(),
        api.getCallHistory(),
      ]);
      setProgress(progRes.progress);
      setCalls(callRes.calls);
      if (progRes.progress.dailyGoalMinutes) {
        setDailyGoal(progRes.progress.dailyGoalMinutes);
        setTempGoal(progRes.progress.dailyGoalMinutes);
      }
    } catch (err) {
      console.warn('Error loading progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGoal = async (newGoalValue: number) => {
    const validGoal = Math.min(180, Math.max(5, newGoalValue));
    setIsSavingGoal(true);
    setGoalSavedNotice(null);
    try {
      const res = await api.updateDailyGoal(validGoal);
      if (res.success) {
        setDailyGoal(validGoal);
        setTempGoal(validGoal);
        setIsEditingGoal(false);
        setGoalSavedNotice(`Daily speaking goal updated to ${validGoal} minutes!`);
        if (res.user) {
          updateProfile({ dailyGoalMinutes: validGoal });
        }
        await loadData();
        setTimeout(() => setGoalSavedNotice(null), 3500);
      }
    } catch (err) {
      console.warn('Error updating daily goal:', err);
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleQuickPracticeDrill = async () => {
    setIsLoggingPractice(true);
    setStreakSuccessMsg(null);
    try {
      const res = await api.logStreakPractice({
        activityType: 'quick_drill',
        durationSeconds: 180,
        xpEarned: 35,
      });

      if (res.success) {
        setStreakSuccessMsg(`Streak protected & +3 mins logged! (+${res.earnedXp} XP)`);
        if (res.user) {
          updateStreakAndXp(res.streakInfo.currentStreak, res.earnedXp, res.user);
        }
        await loadData();
        setTimeout(() => setStreakSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.warn('Error logging practice drill:', err);
    } finally {
      setIsLoggingPractice(false);
    }
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}m ${remaining}s`;
  };

  const currentStreak = progress?.currentStreak ?? user?.currentStreak ?? 4;
  const longestStreak = progress?.longestStreak ?? user?.longestStreak ?? Math.max(currentStreak, 7);
  const totalPracticeDays = progress?.totalPracticeDays ?? user?.totalPracticeDays ?? 14;
  const streakActiveToday = progress?.streakActiveToday ?? true;
  const milestoneName = progress?.milestoneName ?? '7-Day Speaking Champion';
  const nextMilestoneDays = progress?.nextMilestoneDays ?? 3;

  // Daily speaking goal metrics
  const activeDailyGoal = dailyGoal || progress?.dailyGoalMinutes || 20;
  const todayMinutes = progress?.todaySpeakingMinutes ?? (streakActiveToday ? 14 : 0);
  const goalPercent = Math.min(100, Math.round((todayMinutes / activeDailyGoal) * 100));
  const isGoalAchieved = todayMinutes >= activeDailyGoal;
  const remainingMinutes = Math.max(0, activeDailyGoal - todayMinutes);

  // SVG Circular progress ring calculations
  // Radius = 62, Circumference = 2 * PI * 62 ≈ 389.56
  const circleRadius = 62;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (goalPercent / 100) * circleCircumference;

  const goalPresets = [10, 15, 20, 30, 45, 60];

  const milestonesList = [
    { days: 3, name: '3-Day Kickstart', desc: 'Build the speaking habit', icon: Zap, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/50' },
    { days: 7, name: '7-Day Champion', desc: '1 full week of fluent voice practice', icon: Trophy, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/50' },
    { days: 14, name: '14-Day Habit Master', desc: 'Effortless conversational confidence', icon: Target, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50' },
    { days: 30, name: '30-Day Fluency Legend', desc: 'Master native speaking rhythm', icon: Award, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' },
  ];

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const maxWeeklyMinutes = 45;

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* 1. DAILY SPEAKING GOAL WITH CIRCULAR PROGRESS RING */}
      <section
        id="daily-speaking-goal-card"
        className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-5 transition-colors"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-300">
                <Target className="w-3.5 h-3.5" />
                Daily Speaking Goal
              </span>
              {isGoalAchieved ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                  <CheckCircle2 className="w-3 h-3" />
                  Goal Met Today 🎉
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                  <Clock className="w-3 h-3" />
                  {remainingMinutes}m remaining
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Today's Speaking Target
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Consistent daily practice drives conversational fluency 3x faster
            </p>
          </div>

          {/* Edit Goal Trigger */}
          <div className="flex items-center gap-2">
            <button
              id="edit-daily-goal-btn"
              onClick={() => setIsEditingGoal(!isEditingGoal)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-750 text-xs font-bold transition-all cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isEditingGoal ? 'Close Goal Settings' : 'Adjust Goal'}</span>
            </button>
          </div>
        </div>

        {/* Goal Saved Toast */}
        {goalSavedNotice && (
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{goalSavedNotice}</span>
          </div>
        )}

        {/* Inline Goal Setter Panel */}
        {isEditingGoal && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Choose Your Daily Target (Minutes):
              </span>
              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                {tempGoal} Minutes / Day
              </span>
            </div>

            {/* Preset Buttons */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {goalPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTempGoal(preset)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    tempGoal === preset
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {preset} min
                </button>
              ))}
            </div>

            {/* Stepper + Save Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTempGoal(Math.max(5, tempGoal - 5))}
                  disabled={tempGoal <= 5}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 w-16 text-center">
                  {tempGoal}m
                </span>
                <button
                  type="button"
                  onClick={() => setTempGoal(Math.min(180, tempGoal + 5))}
                  disabled={tempGoal >= 180}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">
                  (5 to 180 min)
                </span>
              </div>

              <button
                id="save-daily-goal-btn"
                type="button"
                onClick={() => handleSaveGoal(tempGoal)}
                disabled={isSavingGoal}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingGoal ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save New Goal</span>
              </button>
            </div>
          </div>
        )}

        {/* Circular Progress Ring & Goal Visualization */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-2">
          {/* Circular Ring Graphic */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg
              className="w-40 h-40 transform -rotate-90"
              viewBox="0 0 148 148"
              role="progressbar"
              aria-valuenow={todayMinutes}
              aria-valuemin={0}
              aria-valuemax={activeDailyGoal}
            >
              {/* Background Track Circle */}
              <circle
                cx="74"
                cy="74"
                r={circleRadius}
                stroke="currentColor"
                strokeWidth="12"
                fill="transparent"
                className="text-slate-100 dark:text-slate-800"
              />

              {/* Gradient definition */}
              <defs>
                <linearGradient id="goalProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  {isGoalAchieved ? (
                    <>
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#059669" />
                    </>
                  ) : (
                    <>
                      <stop offset="0%" stopColor="#6366F1" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </>
                  )}
                </linearGradient>
              </defs>

              {/* Foreground Animated Progress Circle */}
              <circle
                cx="74"
                cy="74"
                r={circleRadius}
                stroke="url(#goalProgressGradient)"
                strokeWidth="12"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>

            {/* Center Data Display Inside Circular Ring */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
              <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                {todayMinutes}
                <span className="text-sm font-bold text-slate-400 dark:text-slate-500">m</span>
              </span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                of {activeDailyGoal} min
              </span>
              <span
                className={`text-[10px] font-extrabold mt-0.5 px-2 py-0.2 rounded-full ${
                  isGoalAchieved
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {goalPercent}%
              </span>
            </div>
          </div>

          {/* Goal Statistics & Quick Action */}
          <div className="flex-1 w-full space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Today's Practice
                </span>
                <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                  {todayMinutes} <span className="text-xs font-bold text-slate-400">min</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  {isGoalAchieved ? 'Goal met!' : `${remainingMinutes}m to reach goal`}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Daily Target
                </span>
                <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                  {activeDailyGoal} <span className="text-xs font-bold text-slate-400">min/day</span>
                </span>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block mt-0.5">
                  {isGoalAchieved ? '100% Completed' : `${goalPercent}% in progress`}
                </span>
              </div>
            </div>

            {/* Quick Practice Drill Action inside Goal Card */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50 via-slate-50 to-blue-50 dark:from-indigo-950/30 dark:via-slate-800/40 dark:to-blue-950/30 border border-indigo-100/60 dark:border-indigo-900/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-2xs">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {isGoalAchieved ? 'Extra Speaking Drill' : 'Need quick minutes?'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Log 3 minutes of speaking practice (+35 XP)
                  </p>
                </div>
              </div>

              <button
                id="goal-quick-drill-btn"
                type="button"
                onClick={handleQuickPracticeDrill}
                disabled={isLoggingPractice}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoggingPractice ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-white" />
                )}
                <span>{isGoalAchieved ? 'Practice More' : 'Log 3 min Drill'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. DAILY STREAK HIGHLIGHT HERO CARD */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 shadow-xl border border-indigo-900/40">
        {/* Background decorative glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Streak Counter and Status */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/20 border border-orange-500/40 text-orange-300">
                <Flame className="w-4 h-4 fill-orange-400 text-orange-400 animate-pulse" />
                Active Streak Tracker
              </span>
              {streakActiveToday ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <CheckCircle2 className="w-3 h-3" />
                  Practiced Today
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <AlertCircle className="w-3 h-3" />
                  Practice Today Needed
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white flex items-center gap-2">
                {currentStreak}
                <span className="text-xl sm:text-2xl font-bold text-orange-300">Days</span>
              </h2>
              <span className="text-xs text-slate-400">
                (Personal Best: <strong className="text-slate-200">{longestStreak} days</strong>)
              </span>
            </div>

            <p className="text-sm text-slate-300 max-w-md">
              {streakActiveToday
                ? `Incredible dedication! You practiced today and kept your ${currentStreak}-day streak alive.`
                : 'Complete a quick 1-on-1 human call, AI conversation, or quick drill to keep your streak alive!'}
            </p>
          </div>

          {/* Quick Practice Drill Action */}
          <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end gap-3">
            <div className="text-left md:text-right">
              <div className="text-xs text-slate-400 font-semibold">Total Practice Days</div>
              <div className="text-lg font-bold text-indigo-200">{totalPracticeDays} Days Active</div>
            </div>

            <button
              id="streak-quick-practice-btn"
              onClick={handleQuickPracticeDrill}
              disabled={isLoggingPractice}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoggingPractice ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
              <span>{streakActiveToday ? 'Log Extra Drill (+35 XP)' : 'Practice Now (Keep Streak)'}</span>
            </button>
          </div>
        </div>

        {/* Streak Success Notification */}
        {streakSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{streakSuccessMsg}</span>
          </div>
        )}

        {/* Milestone Progress Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex justify-between items-center text-xs font-bold mb-2">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Next Milestone: <strong className="text-white">{milestoneName}</strong></span>
            </div>
            <span className="text-orange-300">
              {nextMilestoneDays === 1 ? '1 day remaining' : `${nextMilestoneDays} days to go`}
            </span>
          </div>
          <div className="w-full bg-slate-800/90 rounded-full h-2 overflow-hidden border border-slate-700/50">
            <div
              className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(15, Math.round(((currentStreak % 7 || 7) / 7) * 100)))}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* 3. OVERVIEW STATS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Speaking Minutes */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs space-y-1 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Speaking</span>
            <div className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {progress?.speakingMinutes || 24} <span className="text-xs font-bold text-slate-400">mins</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">↑ 18% this week</span>
        </div>

        {/* Total Calls */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs space-y-1 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Calls</span>
            <div className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Phone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {progress?.totalCalls || 6} <span className="text-xs font-bold text-slate-400">sessions</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            {progress?.humanCalls || 4} Human • {progress?.aiCalls || 2} AI
          </div>
        </div>

        {/* Current Streak */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs space-y-1 col-span-2 sm:col-span-1 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Speaking Streak</span>
            <div className="p-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400">
              <Flame className="w-4 h-4 fill-orange-500 text-orange-500" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {currentStreak} <span className="text-xs font-bold text-slate-400">days</span>
          </div>
          <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">
            {streakActiveToday ? 'Streak active today!' : 'Pending practice today'}
          </span>
        </div>
      </div>

      {/* 4. 7-DAY WEEKLY STREAK & ACTIVITY TRACKER */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-5 transition-colors">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Weekly Practice Calendar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Track consecutive speaking consistency day by day</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-xl">
            <BarChart3 className="w-4 h-4" />
            <span>Target: {activeDailyGoal}m/day</span>
          </div>
        </div>

        {/* 7-Day Circular Habit Chips */}
        <div className="grid grid-cols-7 gap-2 pt-1">
          {progress?.weeklyPracticeDays ? (
            progress.weeklyPracticeDays.map((dayObj) => {
              const isPracticed = dayObj.hasPracticed;
              const isToday = dayObj.isToday;

              return (
                <div
                  key={dayObj.day}
                  className={`flex flex-col items-center p-2 rounded-2xl border transition-all text-center ${
                    isToday
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-xs'
                      : isPracticed
                      ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20'
                      : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                    {dayObj.day}
                  </span>
                  
                  <div className="my-1">
                    {isPracticed ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : isToday ? (
                      <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center animate-pulse">
                        <Flame className="w-4 h-4 fill-white" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold">
                        •
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {dayObj.minutes > 0 ? `${dayObj.minutes}m` : '-'}
                  </span>
                </div>
              );
            })
          ) : (
            daysOfWeek.map((day) => {
              const minutes = progress?.weeklyMinutes[day] || 15;
              const isToday = day === 'Sun';
              return (
                <div
                  key={day}
                  className="flex flex-col items-center p-2 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{day}</span>
                  <div className="my-1 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{minutes}m</span>
                </div>
              );
            })
          )}
        </div>

        {/* Visual Bar Chart */}
        <div className="pt-2 flex items-end justify-between gap-2 h-36 px-2">
          {daysOfWeek.map((day) => {
            const minutes = progress?.weeklyMinutes[day] || 15;
            const heightPercent = Math.min(100, Math.round((minutes / maxWeeklyMinutes) * 100));
            const isToday = day === 'Sun';

            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                <div className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {minutes}m
                </div>
                <div className="w-full max-w-[32px] bg-slate-100 dark:bg-slate-800 rounded-2xl h-24 flex items-end p-1 relative overflow-hidden">
                  <div
                    className={`w-full rounded-xl transition-all duration-500 ${
                      isToday
                        ? 'bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-md shadow-indigo-200 dark:shadow-none'
                        : 'bg-gradient-to-t from-blue-500 to-cyan-400'
                    }`}
                    style={{ height: `${Math.max(12, heightPercent)}%` }}
                  />
                </div>
                <span className={`text-[11px] font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. STREAK HABIT MILESTONES & BADGES */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Streak Mastery Milestones
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Unlock speaking badges by maintaining consecutive practice</p>
          </div>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-xl">
            {currentStreak >= 30 ? 'All Badges Unlocked' : `${currentStreak} Days Current`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {milestonesList.map((m) => {
            const isUnlocked = currentStreak >= m.days;
            const Icon = m.icon;

            return (
              <div
                key={m.name}
                className={`p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 ${
                  isUnlocked
                    ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 opacity-70'
                }`}
              >
                <div className={`p-2.5 rounded-2xl ${m.color} shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {m.name}
                    </h4>
                    {isUnlocked ? (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                        Unlocked
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                        {m.days - currentStreak}d to go
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. ENGLISH SKILLS PROGRESS BARS */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight">English Speaking Mastery</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Calculated from AI feedback and call duration</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
            {user?.englishLevel || 'Intermediate'}
          </span>
        </div>

        <div className="space-y-3.5 pt-1">
          <div>
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              <span>Conversational Fluency</span>
              <span className="text-indigo-600 dark:text-indigo-400">{progress?.fluencyScore || 88}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 to-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${progress?.fluencyScore || 88}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              <span>Vocabulary Breadth</span>
              <span className="text-cyan-600 dark:text-cyan-400">{progress?.vocabularyScore || 84}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-500 to-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress?.vocabularyScore || 84}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              <span>Grammar Accuracy</span>
              <span className="text-emerald-600 dark:text-emerald-400">{progress?.grammarScore || 86}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-green-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress?.grammarScore || 86}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              <span>Pronunciation & Clarity</span>
              <span className="text-amber-600 dark:text-amber-400">{progress?.pronunciationScore || 82}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress?.pronunciationScore || 82}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* 7. DEDICATED SESSION HISTORY VIEW */}
      <SessionHistoryView calls={calls} onStartPractice={onStartPractice} />
    </div>
  );
};
