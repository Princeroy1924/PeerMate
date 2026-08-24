import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Sparkles,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  Globe,
  Target,
  Clock,
  MessageCircle,
  ArrowRight,
  ArrowLeft,
  Flame,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Info,
  RefreshCw,
  Send,
  CheckCircle2,
  Inbox,
  Edit3,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EnglishLevel } from '../../types';
import { playSound } from '../../lib/audio';
import confetti from 'canvas-confetti';
import { PeerMateLogo } from '../common/PeerMateLogo';

interface AuthModalProps {
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
  'Indonesian',
  'Vietnamese',
  'German',
  'Japanese',
  'Other',
];

const ENGLISH_LEVELS: Array<{ level: EnglishLevel; label: string; desc: string }> = [
  {
    level: 'Beginner',
    label: 'Beginner (A1)',
    desc: 'Learning basic words and forming first simple sentences.',
  },
  {
    level: 'Elementary',
    label: 'Elementary (A2)',
    desc: 'Can introduce myself and talk about routine everyday topics.',
  },
  {
    level: 'Intermediate',
    label: 'Intermediate (B1)',
    desc: 'Comfortable holding conversations with some pauses for vocabulary.',
  },
  {
    level: 'Upper Intermediate',
    label: 'Upper Intermediate (B2)',
    desc: 'Fluent in workplace English and complex discussions with ease.',
  },
  {
    level: 'Advanced',
    label: 'Advanced (C1-C2)',
    desc: 'Near-native fluency with sophisticated idioms and expressions.',
  },
];

const LEARNING_GOALS = [
  { id: 'fluency', label: 'Spoken Fluency & Confidence', icon: '🗣️' },
  { id: 'interview', label: 'Job Interview Preparation', icon: '💼' },
  { id: 'exams', label: 'IELTS / TOEFL / Duolingo Exam', icon: '🎯' },
  { id: 'business', label: 'Business English & Workplace Calls', icon: '📊' },
  { id: 'travel', label: 'Travel & Making Global Friends', icon: '✈️' },
  { id: 'study', label: 'Studying Abroad in English', icon: '🎓' },
];

const TOPIC_INTERESTS = [
  'Daily Life & Routine',
  'Career & Technology',
  'Travel & Global Cultures',
  'Movies, Music & Art',
  'Business & Startups',
  'Science & Future',
  'Food & Cooking',
  'Deep Debates & Ideas',
];

const AVATAR_OPTIONS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
];

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { login, register, resendVerification } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup' | 'verification'>('signup');
  const [signupStep, setSignupStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('Hindi');
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel>('Intermediate');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(20);
  const [learningGoal, setLearningGoal] = useState('Spoken Fluency & Confidence');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Daily Life & Routine',
    'Career & Technology',
    'Travel & Global Cultures',
  ]);
  const [avatarUrl, setAvatarUrl] = useState(AVATAR_OPTIONS[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Verification Pending & Resend state
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [customPendingEmail, setCustomPendingEmail] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [unconfirmedEmailPrompt, setUnconfirmedEmailPrompt] = useState<string | null>(null);

  // Countdown timer for resend email cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Real-time password strength evaluation
  const passwordStrength = useMemo(() => {
    const minLength = password.length >= 8;
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasCaseMix = hasUpper && hasLower;

    let score = 0;
    if (minLength) score += 1;
    if (hasSpecial) score += 1;
    if (hasNumber) score += 1;
    if (hasUpper) score += 1;
    if (hasLower) score += 1;

    let label = 'Too Weak';
    let colorClass = 'bg-rose-500 text-rose-600';
    let barColor = 'bg-rose-500';

    if (password.length === 0) {
      label = '';
      colorClass = 'text-slate-400';
      barColor = 'bg-slate-200';
    } else if (score <= 2) {
      label = 'Weak';
      colorClass = 'text-rose-600';
      barColor = 'bg-rose-500';
    } else if (score === 3) {
      label = 'Fair';
      colorClass = 'text-amber-600';
      barColor = 'bg-amber-500';
    } else if (score === 4) {
      label = 'Good';
      colorClass = 'text-blue-600';
      barColor = 'bg-blue-500';
    } else if (score >= 5) {
      label = 'Strong';
      colorClass = 'text-emerald-600';
      barColor = 'bg-emerald-500';
    }

    return {
      score,
      label,
      colorClass,
      barColor,
      minLength,
      hasSpecial,
      hasNumber,
      hasUpper,
      hasLower,
      hasCaseMix,
      isValid: minLength && (hasSpecial || hasNumber),
    };
  }, [password]);

  const toggleInterest = (topic: string) => {
    playSound('click');
    if (selectedInterests.includes(topic)) {
      setSelectedInterests(selectedInterests.filter((t) => t !== topic));
    } else {
      setSelectedInterests([...selectedInterests, topic]);
    }
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (signupStep === 1) {
      if (!displayName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      if (!password) {
        setError('Please create a password for your account.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (!passwordStrength.hasSpecial && !passwordStrength.hasNumber) {
        setError('Please include at least one number or special character (!@#$%...) for security.');
        return;
      }
      playSound('click');
      setSignupStep(2);
      return;
    }

    if (signupStep === 2) {
      playSound('click');
      setSignupStep(3);
      return;
    }

    if (signupStep === 3) {
      playSound('click');
      setSignupStep(4);
      return;
    }

    if (signupStep === 4) {
      handleFinalRegister();
    }
  };

  const handleFinalRegister = async () => {
    setError('');
    setLoading(true);
    playSound('click');

    try {
      const cleanEmail = email.trim();
      const result = await register({
        email: cleanEmail,
        password,
        displayName: displayName.trim(),
        username: (username || cleanEmail.split('@')[0]).trim(),
        englishLevel,
        avatarUrl,
        nativeLanguage,
        dailyGoalMinutes,
        learningGoal,
        interests: selectedInterests,
      });

      if (result.requiresEmailConfirmation) {
        setPendingVerificationEmail(cleanEmail);
        setCustomPendingEmail(cleanEmail);
        setTab('verification');
        setResendCooldown(60);
        playSound('pop');
        return;
      }

      playSound('success');
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnconfirmedEmailPrompt(null);

    if (!email.trim()) {
      setError('Please enter your email or username.');
      return;
    }

    setLoading(true);
    playSound('click');

    try {
      await login(email.trim(), password);
      playSound('success');
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Login failed. Please check your credentials.';
      setError(msg);
      // Check if the user needs email confirmation
      if (
        msg.toLowerCase().includes('confirm') ||
        msg.toLowerCase().includes('verification') ||
        msg.toLowerCase().includes('not confirmed')
      ) {
        setUnconfirmedEmailPrompt(email.trim());
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (targetEmailOverride?: string) => {
    if (resendCooldown > 0 || isResending) return;
    const target = (targetEmailOverride || customPendingEmail || pendingVerificationEmail || email).trim();
    if (!target || !target.includes('@')) {
      setResendError('Please provide a valid email address.');
      return;
    }

    setIsResending(true);
    setResendError(null);
    setResendSuccess(null);

    try {
      const res = await resendVerification(target);
      setResendSuccess(res.message || `Verification email sent to ${target}. Please check your inbox and spam folder.`);
      setPendingVerificationEmail(target);
      setResendCooldown(60);
      setIsEditingEmail(false);
      playSound('success');
    } catch (err: any) {
      setResendError(err.message || 'Failed to resend verification link. Please wait a moment and try again.');
      playSound('warning');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full my-auto space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Modal Top Nav */}
        <div className="flex items-center justify-between">
          <PeerMateLogo size="md" showText={true} showSubtitle={true} />

          <button
            id="close-auth-modal-btn"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 rounded-2xl bg-slate-100 text-xs font-bold text-slate-600">
          <button
            type="button"
            id="auth-signup-tab"
            onClick={() => {
              setTab('signup');
              setError('');
              setUnconfirmedEmailPrompt(null);
            }}
            className={`py-2 rounded-xl transition-all ${
              tab === 'signup' ? 'bg-white text-indigo-600 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            Create Real Account
          </button>
          <button
            type="button"
            id="auth-login-tab"
            onClick={() => {
              setTab('login');
              setError('');
              setUnconfirmedEmailPrompt(null);
            }}
            className={`py-2 rounded-xl transition-all ${
              tab === 'login' ? 'bg-white text-indigo-600 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium leading-relaxed flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Unconfirmed Email Action Prompt */}
        {unconfirmedEmailPrompt && tab === 'login' && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Pending email confirmation for this account?</span>
            </div>
            <button
              type="button"
              id="auth-go-to-verify-btn"
              onClick={() => {
                setPendingVerificationEmail(unconfirmedEmailPrompt);
                setCustomPendingEmail(unconfirmedEmailPrompt);
                setTab('verification');
                setError('');
                setUnconfirmedEmailPrompt(null);
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-[11px] shrink-0 transition-colors shadow-xs"
            >
              Verify Email Now
            </button>
          </div>
        )}

        {/* ===================== 1. SIGN UP MULTI-STEP FLOW ===================== */}
        {tab === 'signup' && (
          <div className="space-y-4">
            {/* Step Progress Indicators */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span className="text-indigo-600">
                  Step {signupStep} of 4:{' '}
                  {signupStep === 1
                    ? 'Account Essentials'
                    : signupStep === 2
                    ? 'English Level & Language'
                    : signupStep === 3
                    ? 'Speaking Goals'
                    : 'Profile Avatar'}
                </span>
                <span>{signupStep * 25}% Complete</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${signupStep * 25}%` }}
                />
              </div>
            </div>

            <form onSubmit={handleNextStep} className="space-y-4">
              {/* STEP 1: Account Credentials */}
              {signupStep === 1 && (
                <div className="space-y-3.5 animate-in fade-in">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Full Name</label>
                    <div className="relative mt-1">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700">Username (Peer ID)</label>
                    <div className="relative mt-1">
                      <span className="text-xs font-bold text-slate-400 absolute left-3.5 top-2.5">@</span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="rahul_talks"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700">Email Address</label>
                    <div className="relative mt-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="rahul@example.com"
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">Create Password</label>
                      {password.length > 0 && (
                        <div className="flex items-center gap-1.5 animate-in fade-in">
                          {passwordStrength.score >= 5 ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          ) : passwordStrength.score <= 2 ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          <span className={`text-[11px] font-extrabold ${passwordStrength.colorClass}`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="relative mt-1">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 chars, 1 number & special char"
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-10 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* 4-Segment Animated Strength Meter */}
                    <div className="mt-2.5 space-y-2">
                      <div className="grid grid-cols-4 gap-1.5 h-1.5">
                        <div
                          className={`rounded-full transition-all duration-300 ${
                            password.length === 0
                              ? 'bg-slate-200'
                              : passwordStrength.score >= 1
                              ? passwordStrength.score <= 2
                                ? 'bg-rose-500'
                                : passwordStrength.score === 3
                                ? 'bg-amber-500'
                                : passwordStrength.score === 4
                                ? 'bg-blue-500'
                                : 'bg-emerald-500'
                              : 'bg-slate-200'
                          }`}
                        />
                        <div
                          className={`rounded-full transition-all duration-300 ${
                            passwordStrength.score >= 3
                              ? passwordStrength.score === 3
                                ? 'bg-amber-500'
                                : passwordStrength.score === 4
                                ? 'bg-blue-500'
                                : 'bg-emerald-500'
                              : 'bg-slate-200'
                          }`}
                        />
                        <div
                          className={`rounded-full transition-all duration-300 ${
                            passwordStrength.score >= 4
                              ? passwordStrength.score === 4
                                ? 'bg-blue-500'
                                : 'bg-emerald-500'
                              : 'bg-slate-200'
                          }`}
                        />
                        <div
                          className={`rounded-full transition-all duration-300 ${
                            passwordStrength.score >= 5 ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      </div>

                      {/* Real-time Requirement Checklist Badges */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                        {/* 1. 8+ chars */}
                        <div
                          className={`flex items-center gap-1.5 transition-colors ${
                            passwordStrength.minLength
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              passwordStrength.minLength
                                ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </div>
                          <span>8+ characters</span>
                        </div>

                        {/* 2. Special char */}
                        <div
                          className={`flex items-center gap-1.5 transition-colors ${
                            passwordStrength.hasSpecial
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              passwordStrength.hasSpecial
                                ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </div>
                          <span>Special symbol (!@#$%)</span>
                        </div>

                        {/* 3. Number */}
                        <div
                          className={`flex items-center gap-1.5 transition-colors ${
                            passwordStrength.hasNumber
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              passwordStrength.hasNumber
                                ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </div>
                          <span>Number (0-9)</span>
                        </div>

                        {/* 4. Case mix */}
                        <div
                          className={`flex items-center gap-1.5 transition-colors ${
                            passwordStrength.hasCaseMix
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              passwordStrength.hasCaseMix
                                ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </div>
                          <span>Uppercase & lowercase</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: English Level & Native Language */}
              {signupStep === 2 && (
                <div className="space-y-4 animate-in fade-in">
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-600" />
                      <span>What is your native / mother tongue?</span>
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-2">
                      {NATIVE_LANGUAGES.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setNativeLanguage(lang);
                          }}
                          className={`py-2 px-1.5 rounded-xl text-xs font-semibold text-center border transition-all ${
                            nativeLanguage === lang
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Select your current spoken English level:</span>
                    </label>
                    <div className="space-y-2">
                      {ENGLISH_LEVELS.map((lvl) => (
                        <button
                          key={lvl.level}
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setEnglishLevel(lvl.level);
                          }}
                          className={`w-full p-3 rounded-2xl text-left border transition-all flex items-start justify-between gap-3 ${
                            englishLevel === lvl.level
                              ? 'border-indigo-600 bg-indigo-50/80 ring-1 ring-indigo-600'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs text-slate-900">{lvl.label}</div>
                            <p className="text-[11px] text-slate-500 leading-tight">{lvl.desc}</p>
                          </div>
                          {englishLevel === lvl.level && (
                            <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Goals & Topic Interests */}
              {signupStep === 3 && (
                <div className="space-y-4 animate-in fade-in">
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-indigo-600" />
                      <span>What is your primary English learning motivation?</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {LEARNING_GOALS.map((goal) => (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setLearningGoal(goal.label);
                          }}
                          className={`p-3 rounded-2xl text-left border transition-all flex items-center gap-2.5 ${
                            learningGoal === goal.label
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span className="text-lg">{goal.icon}</span>
                          <span className="text-xs font-bold leading-tight">{goal.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Daily Speaking Practice Goal:</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {[10, 20, 30, 45].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setDailyGoalMinutes(mins);
                          }}
                          className={`py-2 rounded-2xl text-center border font-bold text-xs transition-all ${
                            dailyGoalMinutes === mins
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {mins} mins
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Topics you enjoy chatting about:</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {TOPIC_INTERESTS.map((topic) => {
                        const isSelected = selectedInterests.includes(topic);
                        return (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => toggleInterest(topic)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {topic}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Choose Avatar */}
              {signupStep === 4 && (
                <div className="space-y-4 animate-in fade-in text-center">
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900">Choose Your Profile Avatar</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      This photo is displayed to your conversation partners and AI tutors.
                    </p>
                  </div>

                  {/* Active Selected Avatar Preview */}
                  <div className="w-24 h-24 rounded-full p-1 border-4 border-indigo-600 mx-auto shadow-lg relative">
                    <img
                      src={avatarUrl}
                      alt="Selected Avatar"
                      className="w-full h-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0 right-0 p-1 rounded-full bg-indigo-600 text-white shadow-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <div className="grid grid-cols-6 gap-2 pt-2">
                    {AVATAR_OPTIONS.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setAvatarUrl(img);
                        }}
                        className={`rounded-full p-0.5 border-2 transition-all hover:scale-105 ${
                          avatarUrl === img ? 'border-indigo-600 ring-2 ring-indigo-400' : 'border-transparent'
                        }`}
                      >
                        <img
                          src={img}
                          alt="Avatar option"
                          className="w-10 h-10 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>

                  {/* Welcome Bonus Box */}
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center gap-2.5 text-xs text-amber-900 font-bold">
                    <Flame className="w-4 h-4 text-amber-600" />
                    <span>+100 Welcome League XP will be awarded upon account activation!</span>
                  </div>
                </div>
              )}

              {/* Step Navigation Buttons */}
              <div className="flex items-center gap-3 pt-2">
                {signupStep > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      setSignupStep((prev) => (prev - 1) as any);
                    }}
                    className="py-3 px-4 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                )}

                <button
                  type="submit"
                  id="auth-next-step-btn"
                  disabled={loading}
                  className="flex-1 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span>Creating your account...</span>
                  ) : signupStep === 4 ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Complete Account Setup & Start Speaking</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ===================== 2. SIGN IN FLOW ===================== */}
        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 animate-in fade-in">
            <div>
              <label className="text-xs font-bold text-slate-700">Email Address or Username</label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="learner@peermate.com"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Password</label>
              </div>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your secure password"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-10 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="auth-login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to PeerMate</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* ===================== 3. VERIFICATION PENDING STATE ===================== */}
        {tab === 'verification' && (
          <div className="space-y-4 animate-in fade-in text-center py-1">
            {/* Header Icon & Badges */}
            <div className="relative inline-flex items-center justify-center mx-auto mt-1">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                <Inbox className="w-8 h-8 text-indigo-600 animate-bounce" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-indigo-600 items-center justify-center text-white text-[10px]">
                  <Mail className="w-3 h-3" />
                </span>
              </span>
            </div>

            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-extrabold mb-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Verification Link Sent
              </span>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Check Your Inbox</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                We sent a secure confirmation link to verify your email address and activate your PeerMate profile.
              </p>
            </div>

            {/* Target Email Box with inline edit */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-left">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 text-slate-600">
                  <Mail className="w-4 h-4" />
                </div>
                {isEditingEmail ? (
                  <input
                    type="email"
                    value={customPendingEmail}
                    onChange={(e) => setCustomPendingEmail(e.target.value)}
                    placeholder="learner@peermate.com"
                    className="w-full bg-white border border-indigo-400 rounded-xl px-2.5 py-1 text-xs text-slate-900 font-semibold focus:outline-hidden"
                  />
                ) : (
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-extrabold text-slate-400">Recipient Email</div>
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {customPendingEmail || pendingVerificationEmail || email || 'learner@peermate.com'}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isEditingEmail ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (customPendingEmail.trim() && customPendingEmail.includes('@')) {
                        setPendingVerificationEmail(customPendingEmail.trim());
                        setIsEditingEmail(false);
                        handleResend(customPendingEmail.trim());
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors"
                  >
                    Save & Resend
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPendingEmail(pendingVerificationEmail || email);
                      setIsEditingEmail(true);
                    }}
                    className="px-2 py-1 rounded-xl hover:bg-white text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1 text-[11px] font-semibold border border-transparent hover:border-slate-200"
                    title="Edit email"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            </div>

            {/* Resend Status Alerts */}
            {resendSuccess && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2 text-left animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{resendSuccess}</span>
              </div>
            )}

            {resendError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2 text-left animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{resendError}</span>
              </div>
            )}

            {/* Quick 3-Step Guide */}
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 text-left space-y-2.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                Quick 3-step activation
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Open your email inbox and look for the confirmation message from PeerMate.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>Click the <strong>"Confirm your email"</strong> link inside the message.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>Return here and sign in to claim your <strong>+100 Welcome XP</strong>!</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                id="auth-verified-signin-btn"
                onClick={() => {
                  playSound('click');
                  setEmail(customPendingEmail || pendingVerificationEmail || email);
                  setTab('login');
                  setError('');
                }}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>I've Confirmed My Email → Sign In</span>
              </button>

              <button
                type="button"
                id="auth-resend-verification-btn"
                onClick={() => handleResend()}
                disabled={resendCooldown > 0 || isResending}
                className="w-full py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 disabled:opacity-60 disabled:hover:bg-transparent text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin text-indigo-600' : ''}`} />
                <span>
                  {isResending
                    ? 'Sending confirmation email...'
                    : resendCooldown > 0
                    ? `Resend Verification Email (${resendCooldown}s)`
                    : 'Resend Verification Email'}
                </span>
              </button>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    setTab('signup');
                    setSignupStep(1);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors inline-block pt-1 underline"
                >
                  Need to change details or start over?
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

