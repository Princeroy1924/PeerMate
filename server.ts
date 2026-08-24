import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { AccessToken } from 'livekit-server-sdk';
import {
  getSupabase,
  validatePassword,
  validateEmail,
  validateDisplayName,
  validateUsername,
  updateSupabaseUserMetadata,
  resendSupabaseVerificationEmail,
  formatSupabaseAuthError,
} from './serverSupabase';
import {
  getPaymentConfig,
  submitUpiPayment,
  createPaymentIntent,
  getPaymentSessionStatus,
  attachPaymentProof,
  getUserPayments,
  isUserProActive,
  getUserSubscriptionState,
  isAuthorizedAdmin,
  getAdminPaymentsList,
  adminVerifyPayment,
} from './serverPayment';

const app = express();
const PORT = 3000;

// Enable JSON body parser (supports large base64 screenshot uploads up to 10mb)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Initialize Gemini AI client server-side safely
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set. Using smart AI tutor fallback logic.');
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-Memory Database Store for MVP
interface DBUser {
  id: string;
  email: string;
  passwordHash?: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  englishLevel: string;
  nativeLanguage?: string;
  dailyGoalMinutes?: number;
  learningGoal?: string;
  interests?: string[];
  plan: 'free' | 'pro';
  planExpiresAt?: string;
  currentStreak: number;
  longestStreak?: number;
  lastPracticeDate?: string;
  totalPracticeDays?: number;
  practiceDates?: string[];
  totalXp: number;
  createdAt: string;
}

export interface PracticeRecord {
  id: string;
  userId: string;
  activityType: 'human_call' | 'ai_call' | 'vocabulary' | 'quick_drill';
  date: string; // YYYY-MM-DD
  durationSeconds: number;
  xpEarned: number;
  createdAt: string;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`peermate_auth_salt_${password}`).digest('hex');
}

interface DBCall {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callerLevel: string;
  receiverId: string;
  receiverName: string;
  receiverAvatar: string;
  receiverLevel: string;
  callType: 'human' | 'ai';
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  status: 'completed' | 'missed' | 'rejected' | 'in_progress';
  aiFeedbackId?: string;
  topic?: string;
  targetLevel?: string;
  country?: string;
  xpEarned?: number;
  notes?: string;
}

interface DBAiFeedback {
  id: string;
  callId: string;
  userId: string;
  grammarScore: number;
  vocabularyScore: number;
  fluencyScore: number;
  pronunciationScore: number;
  confidenceScore: number;
  overallScore: number;
  generalComment: string;
  mistakes: Array<{ original: string; correction: string; explanation: string }>;
  newVocabulary: Array<{ word: string; meaning: string; example: string }>;
  createdAt: string;
}

const users: Map<string, DBUser> = new Map();
const tokens: Map<string, string> = new Map(); // token -> userId
const calls: DBCall[] = [];
const aiFeedbacks: Map<string, DBAiFeedback> = new Map();
const userLearnedVocab: Map<string, Set<string>> = new Map(); // userId -> Set of vocabIds
const userSavedVocab: Map<string, Set<string>> = new Map();
const userPracticeHistory: Map<string, PracticeRecord[]> = new Map(); // userId -> practice logs

function getDateStrDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function getEffectiveUserStreak(user: DBUser): {
  currentStreak: number;
  longestStreak: number;
  streakActiveToday: boolean;
  totalPracticeDays: number;
  lastPracticeDate?: string;
  nextMilestoneDays: number;
  milestoneName: string;
} {
  const today = getDateStrDaysAgo(0);
  const yesterday = getDateStrDaysAgo(1);

  const longestStreak = Math.max(user.longestStreak || 1, user.currentStreak || 1);
  const totalPracticeDays = user.totalPracticeDays || (user.practiceDates ? user.practiceDates.length : (user.currentStreak || 1));

  let currentStreak = user.currentStreak || 1;
  let streakActiveToday = false;

  if (user.lastPracticeDate === today) {
    currentStreak = user.currentStreak || 1;
    streakActiveToday = true;
  } else if (user.lastPracticeDate === yesterday) {
    // Practiced yesterday, streak is actively alive awaiting today's session
    currentStreak = user.currentStreak || 1;
    streakActiveToday = false;
  } else if (user.lastPracticeDate && user.lastPracticeDate < yesterday) {
    // Streak broken because more than 1 day missed
    currentStreak = 0;
    streakActiveToday = false;
  } else {
    // No last practice date recorded yet, keep existing streak as pending today
    currentStreak = user.currentStreak || 1;
    streakActiveToday = false;
  }

  // Calculate milestone
  let milestone = 7;
  let milestoneName = '7-Day Speaking Champion';
  if (currentStreak < 3) {
    milestone = 3;
    milestoneName = '3-Day Fluency Kickstart';
  } else if (currentStreak < 7) {
    milestone = 7;
    milestoneName = '7-Day Speaking Champion';
  } else if (currentStreak < 14) {
    milestone = 14;
    milestoneName = '14-Day Habit Master';
  } else if (currentStreak < 30) {
    milestone = 30;
    milestoneName = '30-Day Fluency Legend';
  } else {
    milestone = (Math.floor(currentStreak / 10) + 1) * 10;
    milestoneName = `${milestone}-Day Master Speaker`;
  }

  return {
    currentStreak,
    longestStreak,
    streakActiveToday,
    totalPracticeDays,
    lastPracticeDate: user.lastPracticeDate,
    nextMilestoneDays: Math.max(1, milestone - currentStreak),
    milestoneName,
  };
}

function recordActivePractice(
  user: DBUser,
  activityType: 'human_call' | 'ai_call' | 'vocabulary' | 'quick_drill',
  durationSeconds: number,
  xpEarned: number
): {
  currentStreak: number;
  longestStreak: number;
  isConsecutive: boolean;
  isNewDayPractice: boolean;
  streakActiveToday: boolean;
  totalPracticeDays: number;
  lastPracticeDate: string;
} {
  const today = getDateStrDaysAgo(0);
  const yesterday = getDateStrDaysAgo(1);

  if (!user.practiceDates) {
    user.practiceDates = [];
  }
  if (!user.longestStreak) {
    user.longestStreak = Math.max(user.currentStreak || 1, 1);
  }

  let isNewDayPractice = false;
  let isConsecutive = false;

  if (!user.lastPracticeDate) {
    // First practice recorded
    user.currentStreak = 1;
    user.longestStreak = Math.max(user.longestStreak, 1);
    user.lastPracticeDate = today;
    if (!user.practiceDates.includes(today)) {
      user.practiceDates.push(today);
    }
    user.totalPracticeDays = user.practiceDates.length;
    isNewDayPractice = true;
    isConsecutive = true;
  } else if (user.lastPracticeDate === today) {
    // Already practiced today; maintain current streak, do not double-increment
    if (!user.practiceDates.includes(today)) {
      user.practiceDates.push(today);
    }
    user.totalPracticeDays = user.practiceDates.length;
    isNewDayPractice = false;
    isConsecutive = true;
  } else if (user.lastPracticeDate === yesterday) {
    // Consecutive day streak increment!
    user.currentStreak = (user.currentStreak || 0) + 1;
    user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
    user.lastPracticeDate = today;
    if (!user.practiceDates.includes(today)) {
      user.practiceDates.push(today);
    }
    user.totalPracticeDays = user.practiceDates.length;
    isNewDayPractice = true;
    isConsecutive = true;
  } else {
    // Streak broken (missed day) -> Restart from 1
    user.currentStreak = 1;
    user.longestStreak = Math.max(user.longestStreak, 1);
    user.lastPracticeDate = today;
    if (!user.practiceDates.includes(today)) {
      user.practiceDates.push(today);
    }
    user.totalPracticeDays = user.practiceDates.length;
    isNewDayPractice = true;
    isConsecutive = false;
  }

  // Record practice log entry
  const log: PracticeRecord = {
    id: `practice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: user.id,
    activityType,
    date: today,
    durationSeconds: Math.max(durationSeconds, 10),
    xpEarned,
    createdAt: new Date().toISOString(),
  };

  const logs = userPracticeHistory.get(user.id) || [];
  logs.push(log);
  userPracticeHistory.set(user.id, logs);

  users.set(user.id, user);

  // Sync to Supabase user metadata if available
  const supabase = getSupabase();
  if (supabase && user.id && !user.id.startsWith('user_guest_') && user.id !== 'user_demo_learner_1') {
    updateSupabaseUserMetadata(user.id, {
      current_streak: user.currentStreak,
      longest_streak: user.longestStreak,
      last_practice_date: user.lastPracticeDate,
      total_practice_days: user.totalPracticeDays,
    }).catch(err => {
      console.warn('Failed to sync streak metadata to Supabase:', err);
    });
  }

  return {
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    isConsecutive,
    isNewDayPractice,
    streakActiveToday: true,
    totalPracticeDays: user.totalPracticeDays || 1,
    lastPracticeDate: user.lastPracticeDate,
  };
}

// Seed initial demo user with 4 consecutive active practice days (3 days ago, 2 days ago, yesterday, today)
const initialDemoPracticeDates = [
  getDateStrDaysAgo(3),
  getDateStrDaysAgo(2),
  getDateStrDaysAgo(1),
  getDateStrDaysAgo(0),
];

const defaultUser: DBUser = {
  id: 'user_demo_1',
  email: 'learner@peermate.com',
  username: 'english_explorer',
  displayName: 'Alex Morgan',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  englishLevel: 'Intermediate',
  plan: 'pro',
  planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  currentStreak: 4,
  longestStreak: 7,
  lastPracticeDate: getDateStrDaysAgo(0),
  totalPracticeDays: 14,
  practiceDates: [
    getDateStrDaysAgo(10),
    getDateStrDaysAgo(9),
    getDateStrDaysAgo(8),
    getDateStrDaysAgo(6),
    getDateStrDaysAgo(5),
    ...initialDemoPracticeDates,
  ],
  totalXp: 850,
  createdAt: new Date().toISOString(),
};
users.set(defaultUser.id, defaultUser);
tokens.set('demo_token', defaultUser.id);

// Seed practice logs for demo user
userPracticeHistory.set(defaultUser.id, [
  {
    id: 'demo_prac_1',
    userId: defaultUser.id,
    activityType: 'human_call',
    date: getDateStrDaysAgo(3),
    durationSeconds: 900,
    xpEarned: 120,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo_prac_2',
    userId: defaultUser.id,
    activityType: 'ai_call',
    date: getDateStrDaysAgo(2),
    durationSeconds: 650,
    xpEarned: 100,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo_prac_3',
    userId: defaultUser.id,
    activityType: 'vocabulary',
    date: getDateStrDaysAgo(1),
    durationSeconds: 300,
    xpEarned: 60,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo_prac_4',
    userId: defaultUser.id,
    activityType: 'human_call',
    date: getDateStrDaysAgo(0),
    durationSeconds: 680,
    xpEarned: 110,
    createdAt: new Date().toISOString(),
  },
]);

// Seed Vocabularies
const vocabularyBank = [
  {
    id: 'vocab_1',
    word: 'Articulate',
    phonetic: '/ɑːrˈtɪkjʊlət/',
    partOfSpeech: 'adjective / verb',
    meaning: 'Having or showing the ability to speak fluently and coherently.',
    example: 'She gave an articulate and persuasive speech at the global summit.',
    difficulty: 'Upper Intermediate' as const,
  },
  {
    id: 'vocab_2',
    word: 'Serendipity',
    phonetic: '/ˌsɛrənˈdɪpɪti/',
    partOfSpeech: 'noun',
    meaning: 'The occurrence of events by chance in a happy or beneficial way.',
    example: 'Finding this English conversation partner was pure serendipity.',
    difficulty: 'Advanced' as const,
  },
  {
    id: 'vocab_3',
    word: 'Pragmatic',
    phonetic: '/præɡˈmætɪk/',
    partOfSpeech: 'adjective',
    meaning: 'Dealing with things sensibly and realistically in a way based on practical considerations.',
    example: 'We need a pragmatic approach to improve speaking fluency every day.',
    difficulty: 'Intermediate' as const,
  },
  {
    id: 'vocab_4',
    word: 'Meticulous',
    phonetic: '/məˈtɪkjʊləs/',
    partOfSpeech: 'adjective',
    meaning: 'Showing great attention to detail; very careful and precise.',
    example: 'He is meticulous about his grammar and English pronunciation.',
    difficulty: 'Upper Intermediate' as const,
  },
  {
    id: 'vocab_5',
    word: 'Resilience',
    phonetic: '/rɪˈzɪliəns/',
    partOfSpeech: 'noun',
    meaning: 'The capacity to recover quickly from difficulties; mental toughness.',
    example: 'Language learning requires patience, discipline, and emotional resilience.',
    difficulty: 'Intermediate' as const,
  },
  {
    id: 'vocab_6',
    word: 'Enthusiastic',
    phonetic: '/ɪnˌθjuːziˈæstɪk/',
    partOfSpeech: 'adjective',
    meaning: 'Having or showing intense and eager enjoyment, interest, or approval.',
    example: 'The students were enthusiastic about practicing spoken English with native speakers.',
    difficulty: 'Beginner' as const,
  },
  {
    id: 'vocab_7',
    word: 'Eloquence',
    phonetic: '/ˈɛləkwəns/',
    partOfSpeech: 'noun',
    meaning: 'Fluent or persuasive speaking or writing.',
    example: 'His eloquence during the job interview impressed the hiring panel.',
    difficulty: 'Advanced' as const,
  }
];

// Seed other active league peers
const leaguePeers: DBUser[] = [
  {
    id: 'peer_1',
    email: 'priya@example.com',
    username: 'priya_speaks',
    displayName: 'Priya Sharma',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    englishLevel: 'Upper Intermediate',
    plan: 'pro',
    currentStreak: 12,
    totalXp: 1280,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'peer_2',
    email: 'diego@example.com',
    username: 'diego_polyglot',
    displayName: 'Diego Fernandez',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    englishLevel: 'Intermediate',
    plan: 'free',
    currentStreak: 9,
    totalXp: 1040,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'peer_3',
    email: 'yuki@example.com',
    username: 'yuki_english',
    displayName: 'Yuki Tanaka',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    englishLevel: 'Advanced',
    plan: 'pro',
    currentStreak: 15,
    totalXp: 960,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'peer_4',
    email: 'hassan@example.com',
    username: 'hassan_k',
    displayName: 'Hassan Al-Mansoor',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    englishLevel: 'Intermediate',
    plan: 'free',
    currentStreak: 3,
    totalXp: 790,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'peer_5',
    email: 'elena@example.com',
    username: 'elena_rostova',
    displayName: 'Elena Rostova',
    avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
    englishLevel: 'Upper Intermediate',
    plan: 'pro',
    currentStreak: 7,
    totalXp: 720,
    createdAt: new Date().toISOString(),
  }
];

leaguePeers.forEach(p => users.set(p.id, p));

// Seed sample past call history with topics and duration
calls.push({
  id: 'call_seed_1',
  callerId: defaultUser.id,
  callerName: defaultUser.displayName,
  callerAvatar: defaultUser.avatarUrl,
  callerLevel: defaultUser.englishLevel,
  receiverId: 'peer_1',
  receiverName: 'Priya Sharma',
  receiverAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  receiverLevel: 'Upper Intermediate',
  callType: 'human',
  topic: 'Travel & Culture',
  country: 'India',
  xpEarned: 75,
  startedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  endedAt: new Date(Date.now() - 3600000 * 4 + 680000).toISOString(),
  durationSeconds: 680,
  status: 'completed',
  notes: 'Discussed best travel destinations in Europe and cultural festival experiences.',
});

calls.push({
  id: 'call_seed_2',
  callerId: defaultUser.id,
  callerName: defaultUser.displayName,
  callerAvatar: defaultUser.avatarUrl,
  callerLevel: defaultUser.englishLevel,
  receiverId: 'peer_4',
  receiverName: 'Hassan Al-Mansoor',
  receiverAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  receiverLevel: 'Intermediate',
  callType: 'human',
  topic: 'Job Interview Prep',
  country: 'UAE',
  xpEarned: 90,
  startedAt: new Date(Date.now() - 3600000 * 22).toISOString(),
  endedAt: new Date(Date.now() - 3600000 * 22 + 840000).toISOString(),
  durationSeconds: 840,
  status: 'completed',
  notes: 'Practiced behavioral interview questions and the STAR method for leadership examples.',
});

calls.push({
  id: 'call_seed_3',
  callerId: defaultUser.id,
  callerName: defaultUser.displayName,
  callerAvatar: defaultUser.avatarUrl,
  callerLevel: defaultUser.englishLevel,
  receiverId: 'peer_5',
  receiverName: 'Elena Rostova',
  receiverAvatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
  receiverLevel: 'Upper Intermediate',
  callType: 'human',
  topic: 'Business & Tech',
  country: 'Global',
  xpEarned: 60,
  startedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
  endedAt: new Date(Date.now() - 3600000 * 48 + 520000).toISOString(),
  durationSeconds: 520,
  status: 'completed',
  notes: 'Discussed remote workplace collaboration tools and AI tech trends.',
});

calls.push({
  id: 'call_seed_4',
  callerId: defaultUser.id,
  callerName: defaultUser.displayName,
  callerAvatar: defaultUser.avatarUrl,
  callerLevel: defaultUser.englishLevel,
  receiverId: 'peer_2',
  receiverName: 'Liam Vance',
  receiverAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  receiverLevel: 'Advanced',
  callType: 'human',
  topic: 'Movies & Pop Culture',
  country: 'UK',
  xpEarned: 85,
  startedAt: new Date(Date.now() - 3600000 * 72).toISOString(),
  endedAt: new Date(Date.now() - 3600000 * 72 + 760000).toISOString(),
  durationSeconds: 760,
  status: 'completed',
  notes: 'Exchanged thoughts on classic cinema, storytelling pacing, and book adaptations.',
});

calls.push({
  id: 'call_seed_5',
  callerId: defaultUser.id,
  callerName: defaultUser.displayName,
  callerAvatar: defaultUser.avatarUrl,
  callerLevel: defaultUser.englishLevel,
  receiverId: 'ai_tutor_emma',
  receiverName: 'Emma (AI Tutor)',
  receiverAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  receiverLevel: 'Advanced',
  callType: 'ai',
  topic: 'Daily Life & Routine',
  country: 'AI Studio',
  xpEarned: 50,
  startedAt: new Date(Date.now() - 3600000 * 26).toISOString(),
  endedAt: new Date(Date.now() - 3600000 * 26 + 420000).toISOString(),
  durationSeconds: 420,
  status: 'completed',
  aiFeedbackId: 'feedback_seed_1',
});

aiFeedbacks.set('feedback_seed_1', {
  id: 'feedback_seed_1',
  callId: 'call_seed_2',
  userId: defaultUser.id,
  grammarScore: 86,
  vocabularyScore: 84,
  fluencyScore: 90,
  pronunciationScore: 82,
  confidenceScore: 88,
  overallScore: 86,
  generalComment: 'Fantastic conversation about your travel plans! You expressed ideas smoothly with clear sentence flow.',
  mistakes: [
    {
      original: 'I went to there last year.',
      correction: 'I went there last year.',
      explanation: '"There" is an adverb here, so we do not use the preposition "to".',
    },
    {
      original: 'She gave me some advices.',
      correction: 'She gave me some advice.',
      explanation: '"Advice" is an uncountable noun in English.',
    }
  ],
  newVocabulary: [
    {
      word: 'Breathtaking',
      meaning: 'Astonishing or awe-inspiring in quality.',
      example: 'The mountain view was breathtaking.',
    },
    {
      word: 'Spontaneous',
      meaning: 'Performed or occurring as a result of a sudden impulse.',
      example: 'We took a spontaneous weekend road trip.',
    }
  ],
  createdAt: new Date(Date.now() - 3600000 * 26).toISOString(),
});

// Middleware to resolve user
function getUserFromToken(req: express.Request): DBUser {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const userId = tokens.get(token);
    if (userId && users.has(userId)) {
      return users.get(userId)!;
    }
  }

  // Check client ID header for unique multi-device / multi-tab guest instances
  const clientIdHeader = (req.headers['x-client-id'] as string) || '';
  if (clientIdHeader) {
    const sanitized = clientIdHeader.replace(/[^a-zA-Z0-9_]/g, '');
    const guestId = `user_guest_${sanitized}`;
    let guestUser = users.get(guestId);
    if (!guestUser) {
      const shortSuffix = sanitized.slice(-4) || Math.random().toString(36).substring(2, 6);
      const avatars = [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      ];
      const charSum = sanitized.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const avatarUrl = avatars[charSum % avatars.length];
      const names = ['Aarav Patel', 'Rohan Verma', 'Ananya Roy', 'Pooja Iyer', 'Rahul Mehra', 'Sneha Kapoor', 'Vikram Singh'];
      const displayName = `${names[charSum % names.length]} (${shortSuffix.toUpperCase()})`;

      guestUser = {
        id: guestId,
        email: `learner_${shortSuffix}@peermate.app`,
        username: `learner_${shortSuffix}`,
        displayName,
        avatarUrl,
        englishLevel: 'Intermediate',
        nativeLanguage: 'Hindi',
        dailyGoalMinutes: 20,
        learningGoal: 'Conversational Fluency',
        interests: ['Daily Life & Routine', 'Travel & Culture', 'Job Interview Prep'],
        plan: 'free',
        currentStreak: 1,
        totalXp: 150,
        createdAt: new Date().toISOString(),
      };
      users.set(guestId, guestUser);
    }
    return guestUser;
  }

  // Fallback demo user
  return defaultUser;
}

// LiveKit Token Generator & Realtime Session Management
async function generateLiveKitToken(
  roomName: string,
  participantIdentity: string,
  participantName: string,
  metadataObj?: Record<string, any>
): Promise<{ token: string; url: string; roomName: string; identity: string; participantName: string }> {
  const apiKey = process.env.LIVEKIT_API_KEY || 'peermate_dev_key';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'peermate_dev_secret_key_1234567890abcdef';
  const livekitUrl = process.env.LIVEKIT_URL || 'wss://peermate.livekit.cloud';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    metadata: metadataObj ? JSON.stringify(metadataObj) : undefined,
    ttl: '3h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return {
    token,
    url: livekitUrl,
    roomName,
    identity: participantIdentity,
    participantName,
  };
}

// Matchmaking Queue & Call Sessions in Memory
interface QueueEntry {
  queueId: string;
  userId: string;
  clientId?: string;
  user: DBUser;
  englishLevel: string;
  targetLevel?: string;
  preferredTopic?: string;
  matchedTopic?: string;
  mediaMode: 'audio' | 'video';
  joinedAt: number;
  matchedPeer?: DBUser;
  callId?: string;
  isInitiator?: boolean;
  livekitRoom?: string;
  livekitToken?: string;
  livekitUrl?: string;
}

interface CallSignal {
  id: number;
  fromUserId: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'mute-state' | 'camera-state' | 'hangup' | 'chat';
  payload: any;
  timestamp: number;
}

interface ActiveCallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  caller: DBUser;
  callee: DBUser;
  status: 'connecting' | 'connected' | 'ended';
  mediaMode: 'audio' | 'video';
  livekitRoom?: string;
  matchedTopic?: string;
  startedAt: number;
  endedAt?: number;
  callerMuted?: boolean;
  calleeMuted?: boolean;
  callerCameraOff?: boolean;
  calleeCameraOff?: boolean;
  signals: CallSignal[];
  signalCounter: number;
}

const matchmakingQueue: Map<string, QueueEntry> = new Map();
const activeCallSessions: Map<string, ActiveCallSession> = new Map();

// API ROUTES

// 1. Auth routes
app.get('/api/auth/status', (req, res) => {
  const supabase = getSupabase();
  res.json({
    supabaseConfigured: !!supabase,
    provider: supabase ? 'supabase' : 'local',
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      email,
      password,
      username,
      displayName,
      englishLevel,
      avatarUrl,
      nativeLanguage,
      dailyGoalMinutes,
      learningGoal,
      interests,
    } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'Display Name is required.' });
    }

    // 1. Email format validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }

    // 2. Password strength validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = (username || email.split('@')[0])
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

    if (normalizedUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }

    const supabase = getSupabase();

    // If Supabase is connected, handle via Supabase Auth
    if (supabase) {
      const { data: sbData, error: sbError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: password,
        options: {
          data: {
            display_name: displayName.trim(),
            username: normalizedUsername,
            english_level: englishLevel || 'Intermediate',
            native_language: nativeLanguage || 'Hindi',
            daily_goal_minutes: dailyGoalMinutes || 20,
            learning_goal: learningGoal || 'Conversational Fluency',
            avatar_url:
              avatarUrl ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          },
        },
      });

      if (sbError) {
        return res.status(400).json({ error: formatSupabaseAuthError(sbError) });
      }

      const sbUser = sbData.user;
      if (!sbUser) {
        return res.status(400).json({ error: 'Failed to create user account in Supabase.' });
      }

      const userId = sbUser.id;
      const newUser: DBUser = {
        id: userId,
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: displayName.trim(),
        avatarUrl:
          avatarUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        englishLevel: englishLevel || 'Intermediate',
        nativeLanguage: nativeLanguage || 'Hindi',
        dailyGoalMinutes: dailyGoalMinutes || 20,
        learningGoal: learningGoal || 'Conversational Fluency',
        interests: interests || ['Daily Life & Routine', 'Travel & Culture', 'Job Interview Prep'],
        plan: 'free',
        currentStreak: 1,
        totalXp: 100, // Welcome bonus
        createdAt: sbUser.created_at || new Date().toISOString(),
      };

      users.set(newUser.id, newUser);

      const token =
        sbData.session?.access_token ||
        `token_${newUser.id}_${crypto.randomBytes(16).toString('hex')}`;
      tokens.set(token, newUser.id);

      const requiresEmailConfirmation = !sbData.session && !sbUser.email_confirmed_at;

      const { passwordHash: _, ...safeUser } = newUser;
      return res.json({
        user: safeUser,
        token: requiresEmailConfirmation ? undefined : token,
        provider: 'supabase',
        session: sbData.session,
        emailConfirmed: !!sbUser.email_confirmed_at,
        requiresEmailConfirmation,
        notice: requiresEmailConfirmation
          ? 'Account registered. A verification link has been sent to your email.'
          : undefined,
      });
    }

    // Local in-memory store auth flow (when Supabase credentials are not yet supplied)
    const existingByEmail = Array.from(users.values()).find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );
    if (existingByEmail) {
      return res
        .status(400)
        .json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const existingByUsername = Array.from(users.values()).find(
      (u) => u.username.toLowerCase() === normalizedUsername
    );
    if (existingByUsername) {
      return res
        .status(400)
        .json({ error: 'This username is already taken. Please choose another one.' });
    }

    const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const passwordHash = hashPassword(password);

    const newUser: DBUser = {
      id,
      email: normalizedEmail,
      passwordHash,
      username: normalizedUsername,
      displayName: displayName.trim(),
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      englishLevel: englishLevel || 'Intermediate',
      nativeLanguage: nativeLanguage || 'Hindi',
      dailyGoalMinutes: dailyGoalMinutes || 20,
      learningGoal: learningGoal || 'Conversational Fluency',
      interests: interests || ['Daily Life & Routine', 'Travel & Culture', 'Job Interview Prep'],
      plan: 'free',
      currentStreak: 1,
      totalXp: 100, // Welcome XP bonus for new real user
      createdAt: new Date().toISOString(),
    };

    users.set(newUser.id, newUser);
    const token = `token_${newUser.id}_${crypto.randomBytes(16).toString('hex')}`;
    tokens.set(token, newUser.id);

    const { passwordHash: _, ...safeUser } = newUser;
    return res.json({
      user: safeUser,
      token,
      provider: 'local',
      emailConfirmed: true,
      requiresEmailConfirmation: false,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: formatSupabaseAuthError(err) });
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required to resend verification link.' });
    }
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }

    const result = await resendSupabaseVerificationEmail(email);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to resend verification email.' });
    }

    return res.json({
      success: true,
      message: result.message || 'Verification email resent successfully. Please check your inbox.',
    });
  } catch (err: any) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ error: formatSupabaseAuthError(err) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email or username is required.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required to sign in.' });
    }

    const query = email.trim().toLowerCase();
    const supabase = getSupabase();

    if (supabase) {
      // Resolve email if username was provided
      let targetEmail = query;
      if (!query.includes('@')) {
        const foundUser = Array.from(users.values()).find(
          (u) => u.username.toLowerCase() === query
        );
        if (foundUser) {
          targetEmail = foundUser.email;
        }
      }

      const { data: sbData, error: sbError } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: password,
      });

      if (sbError) {
        return res.status(400).json({ error: formatSupabaseAuthError(sbError) });
      }

      const sbUser = sbData.user;
      if (!sbUser) {
        return res.status(400).json({ error: 'Failed to authenticate user.' });
      }

      // Sync into users store
      let existingUser = users.get(sbUser.id);
      if (!existingUser) {
        existingUser = {
          id: sbUser.id,
          email: sbUser.email || targetEmail,
          username:
            sbUser.user_metadata?.username ||
            sbUser.email?.split('@')[0] ||
            `learner_${Date.now().toString().slice(-4)}`,
          displayName:
            sbUser.user_metadata?.display_name ||
            sbUser.user_metadata?.displayName ||
            'English Learner',
          avatarUrl:
            sbUser.user_metadata?.avatar_url ||
            sbUser.user_metadata?.avatarUrl ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          englishLevel:
            sbUser.user_metadata?.english_level ||
            sbUser.user_metadata?.englishLevel ||
            'Intermediate',
          nativeLanguage:
            sbUser.user_metadata?.native_language ||
            sbUser.user_metadata?.nativeLanguage ||
            'Hindi',
          dailyGoalMinutes: sbUser.user_metadata?.daily_goal_minutes || 20,
          learningGoal: sbUser.user_metadata?.learning_goal || 'Conversational Fluency',
          interests: sbUser.user_metadata?.interests || [
            'Daily Life & Routine',
            'Travel & Culture',
            'Job Interview Prep',
          ],
          plan: 'free',
          currentStreak: 1,
          totalXp: 120,
          createdAt: sbUser.created_at || new Date().toISOString(),
        };
        users.set(existingUser.id, existingUser);
      }

      const token = sbData.session?.access_token || `token_${existingUser.id}_${crypto.randomBytes(16).toString('hex')}`;
      tokens.set(token, existingUser.id);

      const { passwordHash: _, ...safeUser } = existingUser;
      return res.json({
        user: safeUser,
        token,
        session: sbData.session,
        provider: 'supabase',
      });
    }

    // Local fallback sign in
    const user = Array.from(users.values()).find(
      (u) => u.email.toLowerCase() === query || u.username.toLowerCase() === query
    );

    if (!user) {
      return res.status(400).json({
        error: 'No account found with this email or username. Please click Create Account.',
      });
    }

    if (user.passwordHash) {
      const hashed = hashPassword(password);
      if (hashed !== user.passwordHash) {
        return res.status(400).json({ error: 'Incorrect password. Please verify and try again.' });
      }
    }

    const token = `token_${user.id}_${crypto.randomBytes(16).toString('hex')}`;
    tokens.set(token, user.id);

    const { passwordHash: _, ...safeUser } = user;
    return res.json({ user: safeUser, token, provider: 'local' });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: formatSupabaseAuthError(err) });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // 1. Check in-memory tokens first
    const userId = tokens.get(token);
    if (userId && users.has(userId)) {
      const user = users.get(userId)!;
      const isPro = await isUserProActive(user.id);
      user.plan = isPro ? 'pro' : 'free';
      users.set(user.id, user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser });
    }

    // 2. Validate JWT with Supabase if Supabase is active
    const supabase = getSupabase();
    if (supabase && token.startsWith('eyJ')) {
      try {
        const { data: sbData, error } = await supabase.auth.getUser(token);
        if (!error && sbData.user) {
          const sbUser = sbData.user;
          let user = users.get(sbUser.id);
          if (!user) {
            user = {
              id: sbUser.id,
              email: sbUser.email || '',
              username:
                sbUser.user_metadata?.username || sbUser.email?.split('@')[0] || 'learner',
              displayName: sbUser.user_metadata?.display_name || 'English Learner',
              avatarUrl:
                sbUser.user_metadata?.avatar_url ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
              englishLevel: sbUser.user_metadata?.english_level || 'Intermediate',
              nativeLanguage: sbUser.user_metadata?.native_language || 'Hindi',
              dailyGoalMinutes: 20,
              learningGoal: 'Conversational Fluency',
              interests: ['Daily Life & Routine', 'Travel & Culture'],
              plan: 'free',
              currentStreak: 1,
              totalXp: 120,
              createdAt: sbUser.created_at || new Date().toISOString(),
            };
            users.set(user.id, user);
          }
          tokens.set(token, user.id);
          const isPro = await isUserProActive(user.id);
          user.plan = isPro ? 'pro' : 'free';
          users.set(user.id, user);
          const { passwordHash: _, ...safeUser } = user;
          return res.json({ user: safeUser });
        }
      } catch (e) {
        console.warn('Supabase token check warning:', e);
      }
    }
  }

  // Return unique guest user profile for this client instance if not authenticated
  const guestUser = getUserFromToken(req);
  const { passwordHash: _, ...safeGuest } = guestUser;
  res.json({ user: safeGuest });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    tokens.delete(token);
  }
  res.json({ success: true });
});

app.put('/api/auth/update-profile', async (req, res) => {
  const user = getUserFromToken(req);
  const {
    displayName,
    username,
    avatarUrl,
    englishLevel,
    nativeLanguage,
    dailyGoalMinutes,
    learningGoal,
    interests,
  } = req.body;

  // 1. Validate Display Name
  if (displayName !== undefined) {
    const dnValidation = validateDisplayName(displayName);
    if (!dnValidation.valid) {
      return res.status(400).json({ error: dnValidation.error });
    }
    user.displayName = dnValidation.cleanValue!;
  }

  // 2. Validate Username
  if (username !== undefined) {
    const unValidation = validateUsername(username);
    if (!unValidation.valid) {
      return res.status(400).json({ error: unValidation.error });
    }

    const cleanUsername = unValidation.cleanValue!;
    // Check if another user has this username
    const existingUser = Array.from(users.values()).find(
      (u) => u.id !== user.id && u.username.toLowerCase() === cleanUsername
    );
    if (existingUser) {
      return res.status(400).json({ error: 'This username is already taken by another learner. Please choose a different handle.' });
    }

    user.username = cleanUsername;
  }

  // 3. Validate Daily Goal Minutes
  if (dailyGoalMinutes !== undefined) {
    const goal = Number(dailyGoalMinutes);
    if (isNaN(goal) || goal < 5 || goal > 180) {
      return res.status(400).json({ error: 'Daily speaking goal must be between 5 and 180 minutes.' });
    }
    user.dailyGoalMinutes = Math.round(goal);
  }

  if (avatarUrl) user.avatarUrl = avatarUrl;
  if (englishLevel) user.englishLevel = englishLevel;
  if (nativeLanguage) user.nativeLanguage = nativeLanguage;
  if (learningGoal) user.learningGoal = learningGoal;
  if (interests && Array.isArray(interests)) user.interests = interests;

  users.set(user.id, user);

  // Sync to Supabase user metadata if available
  const supabase = getSupabase();
  if (supabase && user.id && !user.id.startsWith('user_guest_') && user.id !== 'user_demo_learner_1') {
    updateSupabaseUserMetadata(user.id, {
      display_name: user.displayName,
      username: user.username,
      avatar_url: user.avatarUrl,
      english_level: user.englishLevel,
      native_language: user.nativeLanguage,
      daily_goal_minutes: user.dailyGoalMinutes,
      learning_goal: user.learningGoal,
      interests: user.interests,
    }).catch((err) => {
      console.warn('Failed to sync profile update to Supabase:', err);
    });
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// 2. Vocabulary routes
app.get('/api/vocabulary/today', (req, res) => {
  const user = getUserFromToken(req);
  const learnedSet = userLearnedVocab.get(user.id) || new Set<string>();
  const savedSet = userSavedVocab.get(user.id) || new Set<string>();

  const items = vocabularyBank.map(v => ({
    ...v,
    learned: learnedSet.has(v.id),
    saved: savedSet.has(v.id),
  }));

  const wordOfTheDay = items[0];

  res.json({
    items: items.slice(0, 5),
    wordOfTheDay,
    totalLearned: learnedSet.size,
  });
});

app.post('/api/vocabulary/action', (req, res) => {
  const user = getUserFromToken(req);
  const { vocabId, action } = req.body;

  if (!userLearnedVocab.has(user.id)) userLearnedVocab.set(user.id, new Set());
  if (!userSavedVocab.has(user.id)) userSavedVocab.set(user.id, new Set());

  const learnedSet = userLearnedVocab.get(user.id)!;
  const savedSet = userSavedVocab.get(user.id)!;

  let streakInfo;
  if (action === 'learned') {
    learnedSet.add(vocabId);
    user.totalXp += 15;
    streakInfo = recordActivePractice(user, 'vocabulary', 60, 15);
  } else if (action === 'unlearned') {
    learnedSet.delete(vocabId);
  } else if (action === 'saved') {
    if (savedSet.has(vocabId)) {
      savedSet.delete(vocabId);
    } else {
      savedSet.add(vocabId);
    }
  }

  users.set(user.id, user);
  res.json({
    success: true,
    totalLearned: learnedSet.size,
    streakInfo,
    currentStreak: user.currentStreak,
    totalXp: user.totalXp,
  });
});

// Helper: Check if user is in an active WebRTC call
function isUserInActiveCall(userId: string): boolean {
  for (const session of activeCallSessions.values()) {
    if (
      (session.callerId === userId || session.calleeId === userId) &&
      (session.status === 'connecting' || session.status === 'connected')
    ) {
      return true;
    }
  }
  return false;
}

// Public runtime configuration for client-side Supabase Realtime and LiveKit
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    livekitUrl: process.env.LIVEKIT_URL || 'wss://peermate.livekit.cloud',
  });
});

// LiveKit Token Provisioning Endpoint
app.get('/api/livekit/token', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const callId = req.query.callId as string | undefined;
    let roomName = (req.query.room as string) || '';

    if (callId) {
      const session = activeCallSessions.get(callId);
      if (session) {
        if (session.callerId !== user.id && session.calleeId !== user.id) {
          return res.status(403).json({ error: 'You are not a participant in this call session.' });
        }
        roomName = session.livekitRoom || `peermate-${callId}`;
      }
    }

    if (!roomName) {
      roomName = `peermate-call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }

    // Sanitize room name
    const sanitizedRoom = roomName.replace(/[^a-zA-Z0-9_-]/g, '_');

    const tokenData = await generateLiveKitToken(sanitizedRoom, user.id, user.displayName, {
      avatarUrl: user.avatarUrl,
      englishLevel: user.englishLevel,
    });
    console.log(`[TOKEN GENERATED] Generated LiveKit token for user ${user.displayName} (${user.id}) in room ${sanitizedRoom}`);
    res.json(tokenData);
  } catch (err: any) {
    console.error('Error creating LiveKit token:', err);
    res.status(500).json({ error: 'Failed to generate LiveKit token' });
  }
});

// 3. Matchmaking routes (Strict 1-to-1 Real Human Queue with Supabase & LiveKit)
app.post('/api/matchmaking/join', async (req, res) => {
  const user = getUserFromToken(req);
  const clientId = (req.headers['x-client-id'] as string) || '';
  const {
    englishLevel,
    mediaMode = 'audio',
    targetLevel = 'Any',
    preferredTopic = 'Any',
  } = req.body;
  const queueId = `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  console.log(
    `[MATCHMAKING] User ${user.displayName} (${user.id}) joining queue (Level: ${user.englishLevel}, Target: ${targetLevel}, Topic: ${preferredTopic})...`
  );

  // 1. DUPLICATE-CALL & SELF-MATCH GUARD: Clean up previous queue entries for this user
  for (const [id, entry] of matchmakingQueue.entries()) {
    if (
      entry.userId === user.id ||
      (clientId && entry.clientId === clientId) ||
      now - entry.joinedAt > 120000 // 2 minute timeout
    ) {
      matchmakingQueue.delete(id);
    }
  }

  // 2. DUPLICATE-CALL GUARD: End any stale active calls for this user
  for (const [cId, session] of activeCallSessions.entries()) {
    if (
      (session.callerId === user.id || session.calleeId === user.id) &&
      session.status !== 'ended' &&
      now - session.startedAt > 1800000 // 30m safeguard
    ) {
      session.status = 'ended';
      console.log(`[CALL ENDED] Cleaned up stale call session ${cId} for user ${user.id}`);
    }
  }

  // 3. FILTER-AWARE REAL PEER SELECTION (Priority + FIFO Queue)
  // Gather all eligible real authenticated peers waiting in queue (strictly excluding self)
  const eligibleCandidates: Array<{ entry: QueueEntry; score: number }> = [];
  const userLevel = englishLevel || user.englishLevel || 'Intermediate';

  for (const entry of matchmakingQueue.values()) {
    const isDifferentUser = entry.userId !== user.id;
    const isDifferentClient = clientId && entry.clientId ? entry.clientId !== clientId : true;
    
    // Strict requirement: Never match a user with themselves or a user in an active call
    if (
      isDifferentUser &&
      isDifferentClient &&
      !entry.matchedPeer &&
      now - entry.joinedAt < 120000 &&
      !isUserInActiveCall(entry.userId)
    ) {
      const candidateLevel = entry.englishLevel || entry.user.englishLevel || 'Intermediate';
      const candidateTarget = entry.targetLevel || 'Any';
      const candidateTopic = entry.preferredTopic || 'Any';

      let score = 0;

      // 1. English Level Compatibility Scoring
      const targetMatchesCandidate = targetLevel === 'Any' || targetLevel === candidateLevel;
      const candidateTargetMatchesUser = candidateTarget === 'Any' || candidateTarget === userLevel;

      if (targetMatchesCandidate && candidateTargetMatchesUser) {
        if (targetLevel !== 'Any' && candidateTarget !== 'Any') {
          score += 40; // Exact mutual level preference match
        } else if (targetLevel !== 'Any' || candidateTarget !== 'Any') {
          score += 25; // One-way specific preference satisfied
        } else {
          score += 15; // Both open to Any Level
        }
      } else if (targetMatchesCandidate || candidateTargetMatchesUser) {
        score += 8; // Partial level tolerance
      } else {
        score += 2; // Different levels, lower priority fallback
      }

      // 2. Conversation Topic Compatibility Scoring
      const topicMutualMatch =
        preferredTopic !== 'Any' &&
        candidateTopic !== 'Any' &&
        preferredTopic.toLowerCase() === candidateTopic.toLowerCase();

      const topicOpenMatch =
        preferredTopic === 'Any' ||
        candidateTopic === 'Any';

      if (topicMutualMatch) {
        score += 50; // Exact mutual topic match!
      } else if (topicOpenMatch) {
        score += 20; // Open to any topic
      } else {
        score += 5; // Different preferred topic
      }

      eligibleCandidates.push({ entry, score });
    }
  }

  // Sort by match score descending, then by joinedAt ascending (longest waiting first among same score)
  eligibleCandidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.entry.joinedAt - b.entry.joinedAt;
  });

  const bestMatch = eligibleCandidates[0];
  const matchedEntry = bestMatch ? bestMatch.entry : null;

  if (matchedEntry) {
    const uniqueCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const peerUser = matchedEntry.user;
    const roomName = `peermate-${uniqueCallId}`;

    // Resolve conversation topic
    let resolvedTopic = 'Daily Life & Free Chit-Chat';
    if (preferredTopic !== 'Any' && matchedEntry.preferredTopic !== 'Any' && preferredTopic === matchedEntry.preferredTopic) {
      resolvedTopic = preferredTopic;
    } else if (preferredTopic !== 'Any') {
      resolvedTopic = preferredTopic;
    } else if (matchedEntry.preferredTopic && matchedEntry.preferredTopic !== 'Any') {
      resolvedTopic = matchedEntry.preferredTopic;
    }

    console.log(
      `[MATCHMAKING] Real human match found! (Score: ${bestMatch.score}, Topic: ${resolvedTopic}) User A: ${peerUser.displayName} <-> User B: ${user.displayName}`
    );
    console.log(`[ROOM CREATED] Shared LiveKit room name generated: ${roomName}`);

    // Generate separate LiveKit tokens for each participant with unique identity
    const [initiatorLiveKit, calleeLiveKit] = await Promise.all([
      generateLiveKitToken(roomName, peerUser.id, peerUser.displayName, {
        avatarUrl: peerUser.avatarUrl,
        englishLevel: peerUser.englishLevel,
      }),
      generateLiveKitToken(roomName, user.id, user.displayName, {
        avatarUrl: user.avatarUrl,
        englishLevel: user.englishLevel,
      }),
    ]);

    // Atomically assign match on the waiting partner (Initiator role)
    matchedEntry.matchedPeer = user;
    matchedEntry.matchedTopic = resolvedTopic;
    matchedEntry.callId = uniqueCallId;
    matchedEntry.isInitiator = true;
    matchedEntry.livekitRoom = roomName;
    matchedEntry.livekitToken = initiatorLiveKit.token;
    matchedEntry.livekitUrl = initiatorLiveKit.url;

    // Create Active Call Session
    const callSession: ActiveCallSession = {
      callId: uniqueCallId,
      callerId: matchedEntry.userId,
      calleeId: user.id,
      caller: peerUser,
      callee: user,
      status: 'connecting',
      mediaMode: (mediaMode === 'video' || matchedEntry.mediaMode === 'video') ? 'video' : 'audio',
      livekitRoom: roomName,
      matchedTopic: resolvedTopic,
      startedAt: Date.now(),
      signals: [],
      signalCounter: 0,
    };
    activeCallSessions.set(uniqueCallId, callSession);

    // Store callee entry in matchmaking queue
    const currentEntry: QueueEntry = {
      queueId,
      userId: user.id,
      clientId,
      user,
      englishLevel: englishLevel || user.englishLevel,
      targetLevel,
      preferredTopic,
      matchedTopic: resolvedTopic,
      mediaMode: callSession.mediaMode,
      joinedAt: Date.now(),
      matchedPeer: peerUser,
      callId: uniqueCallId,
      isInitiator: false,
      livekitRoom: roomName,
      livekitToken: calleeLiveKit.token,
      livekitUrl: calleeLiveKit.url,
    };
    matchmakingQueue.set(queueId, currentEntry);

    return res.json({
      queueId,
      status: 'matched',
      estimatedWaitSec: 0,
      match: {
        callId: uniqueCallId,
        isInitiator: false,
        mediaMode: callSession.mediaMode,
        livekitRoom: roomName,
        livekitToken: calleeLiveKit.token,
        livekitUrl: calleeLiveKit.url,
        matchedTopic: resolvedTopic,
        peer: {
          id: peerUser.id,
          displayName: peerUser.displayName,
          username: peerUser.username,
          avatarUrl: peerUser.avatarUrl,
          englishLevel: peerUser.englishLevel,
          country: peerUser.nativeLanguage === 'Hindi' ? 'India' : peerUser.nativeLanguage === 'French' ? 'France' : peerUser.nativeLanguage === 'Spanish' ? 'Spain' : 'Global',
          nativeLanguage: peerUser.nativeLanguage,
          learningGoal: peerUser.learningGoal,
          targetLevel: matchedEntry.targetLevel || 'Any',
          preferredTopic: matchedEntry.preferredTopic || 'Any',
          matchedTopic: resolvedTopic,
        },
      },
    });
  }

  // 4. No matching peer yet available: Add to queue as next waiting real human
  const currentEntry: QueueEntry = {
    queueId,
    userId: user.id,
    clientId,
    user,
    englishLevel: englishLevel || user.englishLevel,
    targetLevel,
    preferredTopic,
    mediaMode: mediaMode === 'video' ? 'video' : 'audio',
    joinedAt: Date.now(),
  };
  matchmakingQueue.set(queueId, currentEntry);
  console.log(
    `[MATCHMAKING] User ${user.displayName} (${user.id}) queued. Target: ${targetLevel}, Topic: ${preferredTopic}. (Queue size: ${matchmakingQueue.size})`
  );

  res.json({ queueId, status: 'searching', estimatedWaitSec: 10 });
});

app.get('/api/matchmaking/poll', async (req, res) => {
  const queueId = req.query.queueId as string;
  const now = Date.now();

  if (!queueId || !matchmakingQueue.has(queueId)) {
    return res.status(404).json({ error: 'Queue entry not found' });
  }

  const entry = matchmakingQueue.get(queueId)!;
  const elapsedSeconds = Math.floor((now - entry.joinedAt) / 1000);

  // If already matched with a real peer
  if (entry.matchedPeer && entry.callId) {
    const matchedUser = entry.matchedPeer;
    const callId = entry.callId;
    const isInitiator = !!entry.isInitiator;
    const livekitRoom = entry.livekitRoom;
    const livekitToken = entry.livekitToken;
    const livekitUrl = entry.livekitUrl;
    const mediaMode = entry.mediaMode || 'audio';
    const matchedTopic = entry.matchedTopic || 'Daily Life & Free Chit-Chat';

    console.log(`[MATCHMAKING] Returning match details to polled user ${entry.userId}: Room=${livekitRoom}, Peer=${matchedUser.displayName}, Topic=${matchedTopic}`);
    matchmakingQueue.delete(queueId);

    return res.json({
      status: 'matched',
      match: {
        callId,
        isInitiator,
        mediaMode,
        livekitRoom,
        livekitToken,
        livekitUrl,
        matchedTopic,
        peer: {
          id: matchedUser.id,
          displayName: matchedUser.displayName,
          username: matchedUser.username,
          avatarUrl: matchedUser.avatarUrl,
          englishLevel: matchedUser.englishLevel,
          country: matchedUser.nativeLanguage === 'Hindi' ? 'India' : matchedUser.nativeLanguage === 'French' ? 'France' : matchedUser.nativeLanguage === 'Spanish' ? 'Spain' : 'Global',
          nativeLanguage: matchedUser.nativeLanguage,
          learningGoal: matchedUser.learningGoal,
          matchedTopic,
        },
      },
    });
  }

  // Active learners online calculation
  const onlineCount = Math.max(1, matchmakingQueue.size + 12);

  return res.json({
    status: 'searching',
    elapsedSeconds,
    onlineLearnersCount: onlineCount,
  });
});

app.post('/api/matchmaking/leave', (req, res) => {
  const { queueId } = req.body;
  if (queueId && matchmakingQueue.has(queueId)) {
    const entry = matchmakingQueue.get(queueId);
    console.log(`[MATCHMAKING] User ${entry?.userId} left matchmaking queue.`);
    matchmakingQueue.delete(queueId);
  }
  res.json({ success: true });
});

// 4. LiveKit Real-Time Signaling & Fallback Call Session Management
app.post('/api/calls/:callId/signal', (req, res) => {
  const user = getUserFromToken(req);
  const { callId } = req.params;
  const { type, payload } = req.body;

  let session = activeCallSessions.get(callId);
  if (!session) {
    // If session was created on the fly
    session = {
      callId,
      callerId: user.id,
      calleeId: 'peer',
      caller: user,
      callee: defaultUser,
      status: 'connected',
      mediaMode: 'audio',
      startedAt: Date.now(),
      signals: [],
      signalCounter: 0,
    };
    activeCallSessions.set(callId, session);
  }

  session.signalCounter += 1;
  const signalMsg: CallSignal = {
    id: session.signalCounter,
    fromUserId: user.id,
    type,
    payload,
    timestamp: Date.now(),
  };

  session.signals.push(signalMsg);

  // Keep only last 100 signals in memory
  if (session.signals.length > 100) {
    session.signals.shift();
  }

  if (type === 'hangup') {
    session.status = 'ended';
    session.endedAt = Date.now();
  } else if (type === 'mute-state') {
    if (user.id === session.callerId) {
      session.callerMuted = !!payload?.isMuted;
    } else {
      session.calleeMuted = !!payload?.isMuted;
    }
  } else if (type === 'camera-state') {
    if (user.id === session.callerId) {
      session.callerCameraOff = !payload?.isEnabled;
    } else {
      session.calleeCameraOff = !payload?.isEnabled;
    }
  }

  res.json({ success: true, signalId: signalMsg.id });
});

app.get('/api/calls/:callId/signals', (req, res) => {
  const user = getUserFromToken(req);
  const { callId } = req.params;
  const since = parseInt(req.query.since as string) || 0;

  const session = activeCallSessions.get(callId);
  if (!session) {
    return res.json({
      signals: [],
      status: 'ended',
      peerMuted: false,
      peerCameraOff: false,
      lastSignalId: 0,
    });
  }

  // Filter signals intended for this user
  const newSignals = session.signals.filter(
    (s) => s.fromUserId !== user.id && s.id > since
  );

  const isCaller = user.id === session.callerId;
  const peerMuted = isCaller ? session.calleeMuted : session.callerMuted;
  const peerCameraOff = isCaller ? session.calleeCameraOff : session.callerCameraOff;
  const lastSignalId = session.signals.length > 0 ? session.signals[session.signals.length - 1].id : 0;

  res.json({
    signals: newSignals,
    status: session.status,
    peerMuted: !!peerMuted,
    peerCameraOff: !!peerCameraOff,
    lastSignalId,
  });
});

app.post('/api/calls/:callId/end', (req, res) => {
  const user = getUserFromToken(req);
  const { callId } = req.params;
  const { durationSeconds } = req.body;

  const session = activeCallSessions.get(callId);
  if (session) {
    session.status = 'ended';
    session.endedAt = Date.now();
    session.signalCounter += 1;
    session.signals.push({
      id: session.signalCounter,
      fromUserId: user.id,
      type: 'hangup',
      payload: { reason: 'user_ended' },
      timestamp: Date.now(),
    });
  }

  const secs = Math.max(durationSeconds || 0, 5);
  const earnedXp = Math.min(150, Math.floor(secs / 10) * 5 + 40);
  
  // Update consecutive daily streak via database practice recorder
  const streakInfo = recordActivePractice(user, 'human_call', secs, earnedXp);
  user.totalXp += earnedXp;
  users.set(user.id, user);

  const { passwordHash: _, ...safeUser } = user;
  res.json({
    success: true,
    earnedXp,
    currentStreak: streakInfo.currentStreak,
    longestStreak: streakInfo.longestStreak,
    streakActiveToday: streakInfo.streakActiveToday,
    totalPracticeDays: streakInfo.totalPracticeDays,
    lastPracticeDate: streakInfo.lastPracticeDate,
    totalXp: user.totalXp,
    user: safeUser,
  });
});

// 5. Calls history and records
app.post('/api/calls/record', (req, res) => {
  const user = getUserFromToken(req);
  const {
    receiverId,
    receiverName,
    receiverAvatar,
    receiverLevel,
    callType,
    durationSeconds,
    status,
    aiFeedbackId,
    topic,
    targetLevel,
    country,
    notes,
  } = req.body;
  const secs = Math.max(durationSeconds || 0, 5);

  const earnedXp = Math.min(150, Math.floor(secs / 10) * 5 + (callType === 'ai' ? 40 : 50));

  const newCall: DBCall = {
    id: `call_${Date.now()}`,
    callerId: user.id,
    callerName: user.displayName,
    callerAvatar: user.avatarUrl,
    callerLevel: user.englishLevel,
    receiverId: receiverId || 'ai_tutor',
    receiverName: receiverName || 'Peer',
    receiverAvatar: receiverAvatar || '',
    receiverLevel: receiverLevel || 'Intermediate',
    callType: callType || 'human',
    topic: topic || 'Daily Life & Routine',
    targetLevel: targetLevel || 'Any',
    country: country || 'Global',
    notes: notes || '',
    xpEarned: earnedXp,
    startedAt: new Date(Date.now() - secs * 1000).toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: secs,
    status: status || 'completed',
    aiFeedbackId,
  };

  calls.unshift(newCall);

  // Award XP & update streak in database
  const streakInfo = recordActivePractice(user, callType === 'ai' ? 'ai_call' : 'human_call', secs, earnedXp);
  user.totalXp += earnedXp;
  users.set(user.id, user);

  const { passwordHash: _, ...safeUser } = user;
  res.json({
    call: newCall,
    earnedXp,
    currentStreak: streakInfo.currentStreak,
    longestStreak: streakInfo.longestStreak,
    streakActiveToday: streakInfo.streakActiveToday,
    totalPracticeDays: streakInfo.totalPracticeDays,
    lastPracticeDate: streakInfo.lastPracticeDate,
    totalXp: user.totalXp,
    user: safeUser,
  });
});

app.get('/api/calls/history', (req, res) => {
  const user = getUserFromToken(req);
  const userCalls = calls.filter(c => c.callerId === user.id || c.receiverId === user.id);
  res.json({ calls: userCalls.slice(0, 50) });
});

// Helper to check if user has an active Pro subscription (server-authoritative)
async function checkIfUserIsPro(user: DBUser): Promise<boolean> {
  if (!user) return false;
  const isProSubActive = await isUserProActive(user.id);
  if (!isProSubActive) {
    if (user.plan === 'pro') {
      user.plan = 'free';
      users.set(user.id, user);
    }
    return false;
  }
  return true;
}

// 5. AI Call Turn (Gemini Server-side — Gated for Pro Users)
app.post('/api/ai-call/turn', async (req, res) => {
  const user = getUserFromToken(req);
  const { messages, userLevel, topic } = req.body;

  // Server-side Pro Authorization Check
  const proActive = await checkIfUserIsPro(user);
  if (!proActive) {
    return res.status(403).json({
      error: 'PRO_REQUIRED',
      message: 'PeerMate Pro is required to practice with the AI English Teacher. Upgrade for ₹99/month via UPI to unlock unlimited sessions.',
    });
  }

  const gemini = getGeminiClient();

  const systemInstruction = `You are Emma, a warm, encouraging, friendly, and patient AI English Speaking Tutor for PeerMate.
Your student's English proficiency is: ${userLevel || user.englishLevel || 'Intermediate'}.
Current Practice Topic: ${topic || 'General Friendly Conversation'}.

Guidelines:
1. Speak naturally, conversationally, and warmly like a live phone call partner.
2. Keep your responses concise (1 to 3 short sentences maximum) so the user has plenty of speaking time.
3. Ask open-ended questions that prompt the user to practice full English sentences.
4. If the student makes an obvious grammar error, gently model the correct phrasing naturally in your reply without interrupting their momentum harshly.
5. Do NOT use markdown symbols, bullet points, asterisks, or lists, because your output is read out loud via Text-to-Speech.
6. Always sound encouraging, polite, and interested in their thoughts!`;

  if (!gemini) {
    // Fallback dialogue engine if GEMINI_API_KEY is not configured
    const lastUserMsg = messages?.[messages.length - 1]?.parts?.[0]?.text || '';
    const responses = [
      `That's so fascinating! Tell me more about what inspired you with that.`,
      `I completely understand what you mean. How often do you get to do that in your daily routine?`,
      `That sounds wonderful! What was the most challenging part about it for you?`,
      `Great explanation! If you had to describe that experience in three words, what would they be?`,
      `I love your perspective! What are you most looking forward to this week?`,
    ];
    const reply = responses[Math.floor(Math.random() * responses.length)];
    return res.json({ responseText: reply });
  }

  try {
    // Format messages for Gemini Chat
    const contents = (messages || []).map((m: { role: string; parts: Array<{ text: string }> }) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: m.parts || [{ text: '' }],
    }));

    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: `Hi Emma! Let's practice speaking English about ${topic || 'our day'}.` }]
      });
    }

    const response = await gemini.models.generateContent({
      model: 'gemini-3.7-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.8,
      },
    });

    const responseText = response.text || "That's wonderful! Could you tell me more about that?";
    res.json({ responseText });
  } catch (err: unknown) {
    console.error('Gemini generateContent error:', err);
    res.json({
      responseText: `That sounds really interesting! What would you like to explore next about this topic?`,
    });
  }
});

// 6. AI Feedback Generation (Post-call for Pro users)
app.post('/api/ai-call/feedback', async (req, res) => {
  const user = getUserFromToken(req);
  const { transcript, durationSeconds } = req.body;

  // Server-side Pro Authorization Check
  const proActive = await checkIfUserIsPro(user);
  if (!proActive) {
    return res.status(403).json({
      error: 'PRO_REQUIRED',
      message: 'PeerMate Pro is required to receive detailed AI speaking analysis and feedback.',
    });
  }

  const gemini = getGeminiClient();

  if (!gemini || !transcript || transcript.length < 2) {
    // High-quality structured fallback feedback
    const feedback: DBAiFeedback = {
      id: `feedback_${Date.now()}`,
      callId: `call_${Date.now()}`,
      userId: user.id,
      grammarScore: 88,
      vocabularyScore: 84,
      fluencyScore: 92,
      pronunciationScore: 86,
      confidenceScore: 90,
      overallScore: 88,
      generalComment: 'Great speaking flow! You maintained active dialogue and answered questions with natural pacing.',
      mistakes: [
        {
          original: 'I am agree with your point.',
          correction: 'I agree with your point.',
          explanation: '"Agree" is a verb in English, so use "I agree" instead of "I am agree".',
        },
        {
          original: 'I have been living here since 3 years.',
          correction: 'I have been living here for 3 years.',
          explanation: 'Use "for" with periods of time (3 years) and "since" with starting points (e.g. since 2021).',
        }
      ],
      newVocabulary: [
        {
          word: 'Persuasive',
          meaning: 'Good at making someone believe something through reasoning.',
          example: 'She made a very persuasive argument during our discussion.',
        },
        {
          word: 'Spontaneous',
          meaning: 'Done in a natural, unplanned, and enthusiastic way.',
          example: 'Spontaneous conversations help build confidence quickly.',
        }
      ],
      createdAt: new Date().toISOString(),
    };
    aiFeedbacks.set(feedback.id, feedback);
    return res.json({ feedback });
  }

  try {
    const formattedTranscript = transcript
      .map((t: { speaker: string; text: string }) => `${t.speaker}: ${t.text}`)
      .join('\n');

    const prompt = `Analyze this spoken English conversation between the user (Student) and the AI Tutor.
Evaluate the Student's English proficiency and return a detailed JSON evaluation.

Conversation Transcript:
${formattedTranscript}

Call Duration: ${durationSeconds || 60} seconds.

Return ONLY a JSON object with this exact structure:
{
  "grammarScore": number (60-98),
  "vocabularyScore": number (60-98),
  "fluencyScore": number (60-98),
  "pronunciationScore": number (60-98),
  "confidenceScore": number (60-98),
  "overallScore": number (average of scores),
  "generalComment": "2-3 encouraging sentences highlighting the student's speaking strengths and key tips",
  "mistakes": [
    {
      "original": "exact sentence or phrase said by student",
      "correction": "natural native English correction",
      "explanation": "concise grammar explanation"
    }
  ],
  "newVocabulary": [
    {
      "word": "useful English word related to this conversation",
      "meaning": "clear definition",
      "example": "example sentence"
    }
  ]
}`;

    const response = await gemini.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const feedback: DBAiFeedback = {
      id: `feedback_${Date.now()}`,
      callId: `call_${Date.now()}`,
      userId: user.id,
      grammarScore: parsed.grammarScore || 85,
      vocabularyScore: parsed.vocabularyScore || 82,
      fluencyScore: parsed.fluencyScore || 88,
      pronunciationScore: parsed.pronunciationScore || 84,
      confidenceScore: parsed.confidenceScore || 87,
      overallScore: parsed.overallScore || 85,
      generalComment: parsed.generalComment || 'Wonderful effort! Your conversational tempo was great.',
      mistakes: parsed.mistakes || [],
      newVocabulary: parsed.newVocabulary || [],
      createdAt: new Date().toISOString(),
    };

    aiFeedbacks.set(feedback.id, feedback);
    res.json({ feedback });
  } catch (err: unknown) {
    console.error('Gemini feedback error:', err);
    // Fallback structured feedback
    const feedback: DBAiFeedback = {
      id: `feedback_${Date.now()}`,
      callId: `call_${Date.now()}`,
      userId: user.id,
      grammarScore: 85,
      vocabularyScore: 82,
      fluencyScore: 89,
      pronunciationScore: 84,
      confidenceScore: 88,
      overallScore: 85,
      generalComment: 'Great practice session! You communicated your ideas clearly and kept the conversation moving.',
      mistakes: [
        {
          original: 'I am very enjoy this conversation.',
          correction: 'I really enjoyed this conversation.',
          explanation: 'Use "really" with verbs like enjoy, and use past tense "enjoyed".',
        }
      ],
      newVocabulary: [
        {
          word: 'Fluency',
          meaning: 'The ability to speak easily, smoothly, and expressively.',
          example: 'Daily speaking practice leads to lasting fluency.',
        }
      ],
      createdAt: new Date().toISOString(),
    };
    aiFeedbacks.set(feedback.id, feedback);
    res.json({ feedback });
  }
});

// 7. Leagues routes
app.get('/api/leagues/leaderboard', (req, res) => {
  const user = getUserFromToken(req);
  const allMembers = [user, ...leaguePeers];

  // Sort by totalXp descending
  allMembers.sort((a, b) => b.totalXp - a.totalXp);

  const members = allMembers.map((m, index) => ({
    id: m.id,
    username: m.username,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    englishLevel: m.englishLevel,
    points: m.totalXp,
    rank: index + 1,
    isCurrentUser: m.id === user.id,
    change: index === 0 ? 0 : index < 3 ? 1 : 0,
  }));

  const userRankIndex = members.findIndex(m => m.id === user.id);

  res.json({
    leagueName: 'Bronze League',
    timeRemaining: '2 days 14 hours',
    members,
    userRank: userRankIndex + 1,
    userPoints: user.totalXp,
  });
});

// 8. Progress and Streak routes
app.get('/api/progress/stats', (req, res) => {
  const user = getUserFromToken(req);
  const userCalls = calls.filter(c => c.callerId === user.id || c.receiverId === user.id);
  const humanCalls = userCalls.filter(c => c.callType === 'human').length;
  const aiCalls = userCalls.filter(c => c.callType === 'ai').length;

  const totalSpeakingSeconds = userCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
  const speakingMinutes = Math.max(24, Math.round(totalSpeakingSeconds / 60));
  const learnedSet = userLearnedVocab.get(user.id) || new Set<string>();

  const streakData = getEffectiveUserStreak(user);
  const userPractices = userPracticeHistory.get(user.id) || [];
  const practiceDatesSet = new Set(user.practiceDates || []);

  // Build current week calendar (Monday to Sunday)
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Mon...
  const distanceToMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
  const mondayDate = new Date(now.getTime() - distanceToMonday * 24 * 60 * 60 * 1000);
  
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const weeklyPracticeDays = dayNames.map((dayName, idx) => {
    const dayDateObj = new Date(mondayDate.getTime() + idx * 24 * 60 * 60 * 1000);
    const dateStr = dayDateObj.toISOString().split('T')[0];
    const isToday = dateStr === getDateStrDaysAgo(0);
    const hasPracticed = practiceDatesSet.has(dateStr);
    
    // Calculate minutes for that day from logs or fallback defaults
    const dayLogs = userPractices.filter(p => p.date === dateStr);
    let minutes = dayLogs.reduce((acc, l) => acc + Math.round(l.durationSeconds / 60), 0);
    if (minutes === 0 && hasPracticed) {
      minutes = 15;
    }

    return {
      day: dayName,
      dayLabel: `${dayDateObj.getDate()} ${dayDateObj.toLocaleString('en-US', { month: 'short' })}`,
      date: dateStr,
      hasPracticed,
      isToday,
      minutes,
    };
  });

  const weeklyMinutes = {
    Mon: weeklyPracticeDays[0].minutes || (practiceDatesSet.has(weeklyPracticeDays[0].date) ? 15 : 0),
    Tue: weeklyPracticeDays[1].minutes || (practiceDatesSet.has(weeklyPracticeDays[1].date) ? 22 : 0),
    Wed: weeklyPracticeDays[2].minutes || (practiceDatesSet.has(weeklyPracticeDays[2].date) ? 18 : 0),
    Thu: weeklyPracticeDays[3].minutes || (practiceDatesSet.has(weeklyPracticeDays[3].date) ? 30 : 0),
    Fri: weeklyPracticeDays[4].minutes || (practiceDatesSet.has(weeklyPracticeDays[4].date) ? 25 : 0),
    Sat: weeklyPracticeDays[5].minutes || (practiceDatesSet.has(weeklyPracticeDays[5].date) ? 35 : 0),
    Sun: weeklyPracticeDays[6].minutes || (practiceDatesSet.has(weeklyPracticeDays[6].date) ? 20 : 0),
  };

  const todayDateStr = getDateStrDaysAgo(0);
  const todayLogs = userPractices.filter(p => p.date === todayDateStr);
  const todayLoggedMinutes = todayLogs.reduce((acc, l) => acc + Math.round(l.durationSeconds / 60), 0);
  const todayCalls = userCalls.filter(c => c.startedAt && c.startedAt.startsWith(todayDateStr));
  const todayCallMinutes = todayCalls.reduce((acc, c) => acc + Math.round((c.durationSeconds || 0) / 60), 0);
  let todaySpeakingMinutes = Math.max(todayLoggedMinutes, todayCallMinutes);
  if (todaySpeakingMinutes === 0 && (user.lastPracticeDate === todayDateStr || streakData.streakActiveToday)) {
    todaySpeakingMinutes = 14;
  }
  const dailyGoalMinutes = user.dailyGoalMinutes || 20;
  const goalCompletedToday = todaySpeakingMinutes >= dailyGoalMinutes;

  const progress = {
    totalCalls: Math.max(userCalls.length, 6),
    humanCalls: Math.max(humanCalls, 4),
    aiCalls: Math.max(aiCalls, 2),
    speakingMinutes,
    todaySpeakingMinutes,
    dailyGoalMinutes,
    goalCompletedToday,
    vocabularyCount: Math.max(learnedSet.size, 5),
    currentStreak: streakData.currentStreak,
    longestStreak: streakData.longestStreak,
    totalPracticeDays: streakData.totalPracticeDays,
    lastPracticeDate: streakData.lastPracticeDate,
    streakActiveToday: streakData.streakActiveToday,
    nextMilestoneDays: streakData.nextMilestoneDays,
    milestoneName: streakData.milestoneName,
    fluencyScore: 88,
    vocabularyScore: 84,
    grammarScore: 86,
    pronunciationScore: 82,
    weeklyMinutes,
    weeklyPracticeDays,
  };

  res.json({ progress });
});

// Update Daily Speaking Goal Endpoint
app.post('/api/progress/daily-goal', (req, res) => {
  const user = getUserFromToken(req);
  const { dailyGoalMinutes } = req.body;
  const goal = Number(dailyGoalMinutes);
  if (isNaN(goal) || goal < 5 || goal > 180) {
    return res.status(400).json({ error: 'Daily speaking goal must be between 5 and 180 minutes.' });
  }
  user.dailyGoalMinutes = Math.round(goal);
  users.set(user.id, user);

  // Sync to Supabase user metadata if available
  const supabase = getSupabase();
  if (supabase && user.id && !user.id.startsWith('user_guest_') && user.id !== 'user_demo_learner_1') {
    updateSupabaseUserMetadata(user.id, {
      daily_goal_minutes: user.dailyGoalMinutes,
    }).catch(err => {
      console.warn('Failed to sync daily goal to Supabase:', err);
    });
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({
    success: true,
    dailyGoalMinutes: user.dailyGoalMinutes,
    user: safeUser,
  });
});

// Dedicated Streak endpoints
app.get('/api/streak/status', (req, res) => {
  const user = getUserFromToken(req);
  const streakData = getEffectiveUserStreak(user);
  const logs = userPracticeHistory.get(user.id) || [];
  
  res.json({
    ...streakData,
    practiceDates: user.practiceDates || [],
    recentLogs: logs.slice(-10),
  });
});

app.post('/api/streak/practice', (req, res) => {
  const user = getUserFromToken(req);
  const { activityType = 'quick_drill', durationSeconds = 60, xpEarned = 25 } = req.body;
  const secs = Math.max(Number(durationSeconds) || 60, 15);
  const xp = Math.max(Number(xpEarned) || 25, 10);

  const streakInfo = recordActivePractice(user, activityType, secs, xp);
  user.totalXp += xp;
  users.set(user.id, user);

  const { passwordHash: _, ...safeUser } = user;
  res.json({
    success: true,
    message: 'Active practice logged successfully!',
    streakInfo,
    earnedXp: xp,
    user: safeUser,
  });
});

// 9. Manual UPI Payment & Verification Routes (Fixed ₹99/month Pro)
app.get('/api/payments/config', (_req, res) => {
  const config = getPaymentConfig();
  res.json({
    ...config,
    plan: 'pro',
    displayPrice: `₹${config.proPrice}`,
    interval: 'month',
  });
});

// Check if current user is an admin
app.get('/api/admin/check', (req, res) => {
  try {
    const user = getUserFromToken(req);
    const isAdmin = isAuthorizedAdmin(user.email);
    res.json({ isAdmin, email: user.email });
  } catch {
    res.json({ isAdmin: false });
  }
});

// Create an intent-based Payment Session and generate UPI deep link URL
app.post(['/api/payments/create-intent', '/api/payments/intent'], async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const { amount, currency, notes } = req.body || {};

    const result = await createPaymentIntent({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName || user.username,
      amount,
      currency,
      notes,
    });

    res.json(result);
  } catch (err: any) {
    console.error('❌ [CREATE_PAYMENT_INTENT_ERROR]', err);
    res.status(400).json({ error: err.message || 'Failed to create payment intent' });
  }
});

// Polling endpoint to check the live status of a payment session
app.get(['/api/payments/session/:paymentId', '/api/payments/status/:paymentId'], async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const { paymentId } = req.params;

    const result = await getPaymentSessionStatus(paymentId, user.id);
    res.json(result);
  } catch (err: any) {
    console.error('❌ [GET_PAYMENT_SESSION_STATUS_ERROR]', err);
    res.status(400).json({ error: err.message || 'Failed to check payment status' });
  }
});

// Attach UTR reference or screenshot proof to an existing payment session
app.post(['/api/payments/attach-proof', '/api/payments/:paymentId/proof'], async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const paymentId = req.params.paymentId || req.body.paymentId;
    const { utr, paymentDate, screenshotBase64 } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId is required' });
    }

    const result = await attachPaymentProof({
      paymentId,
      userId: user.id,
      utr,
      paymentDate,
      screenshotBase64,
    });

    res.json(result);
  } catch (err: any) {
    console.error('❌ [ATTACH_PAYMENT_PROOF_ERROR]', err);
    res.status(400).json({ error: err.message || 'Failed to attach payment proof' });
  }
});

// Submit manual UPI payment for verification (Pending status)
app.post('/api/payments/submit', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const {
      utr,
      paymentDate,
      payment_date,
      screenshotBase64,
      screenshot_path,
      screenshotPath,
      amount,
      currency,
    } = req.body;

    const screenshot = screenshotBase64 || screenshot_path || screenshotPath;
    const date = paymentDate || payment_date;

    if (!utr || !date || !screenshot) {
      return res.status(400).json({
        error: 'Missing required payment details: UTR, paymentDate, and screenshot are mandatory.',
      });
    }

    // Explicitly validate input amount if provided
    if (amount !== undefined && amount !== null) {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount !== 99) {
        return res.status(400).json({
          error: 'Invalid payment amount. PeerMate Pro subscription requires exactly ₹99.',
        });
      }
    }

    // Explicitly validate input currency if provided
    if (currency !== undefined && currency !== null) {
      if (String(currency).trim().toUpperCase() !== 'INR') {
        return res.status(400).json({
          error: 'Invalid currency. Currency must be INR.',
        });
      }
    }

    const result = await submitUpiPayment({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName || user.username,
      utr,
      paymentDate: date,
      screenshotBase64: screenshot,
      amount: amount !== undefined ? Number(amount) : 99,
      currency: currency !== undefined ? String(currency) : 'INR',
    });

    res.json(result);
  } catch (err: any) {
    console.error('❌ [UPI_PAYMENT_SUBMIT_ERROR]', err);
    res.status(400).json({ error: err.message || 'Payment submission failed' });
  }
});

// Get user payment submission history (with masked UTR for safety)
app.get('/api/payments/history', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const paymentsList = await getUserPayments(user.id);
    res.json({ payments: paymentsList });
  } catch (err: any) {
    console.error('❌ [PAYMENT_HISTORY_ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Get user subscription status with exact current_period_end timestamp validation
app.get('/api/payments/subscription-status', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const subState = await getUserSubscriptionState(user.id);

    // Sync in-memory user plan and planExpiresAt
    const memUser = users.get(user.id);
    if (memUser) {
      memUser.plan = subState.isPro ? 'pro' : 'free';
      memUser.planExpiresAt = subState.currentPeriodEnd || undefined;
      users.set(user.id, memUser);
    }

    res.json(subState);
  } catch (err: any) {
    console.error('❌ [SUBSCRIPTION_STATUS_ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// ADMIN ONLY: Get payments list for verification dashboard
app.get('/api/admin/payments', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!isAuthorizedAdmin(user.email)) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
    }

    const statusFilter = (req.query.status as string) || 'all';
    const list = await getAdminPaymentsList(user.email, statusFilter);
    res.json({ payments: list });
  } catch (err: any) {
    console.error('❌ [ADMIN_GET_PAYMENTS_ERROR]', err);
    res.status(403).json({ error: err.message || 'Failed to fetch admin payments list' });
  }
});

// ADMIN ONLY: Approve or Reject a payment
app.post('/api/admin/verify-payment', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!isAuthorizedAdmin(user.email)) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
    }

    const { paymentId, action, adminNote } = req.body;

    if (!paymentId || !action) {
      return res.status(400).json({ error: 'paymentId and action ("approve" | "reject") are required.' });
    }

    const result = await adminVerifyPayment({
      adminUserId: user.id,
      adminEmail: user.email,
      paymentId,
      action,
      adminNote,
    });

    // Update in-memory user record if approved
    if (action === 'approve' && result.subscription) {
      const targetUser = users.get(result.payment.userId);
      if (targetUser) {
        targetUser.plan = 'pro';
        targetUser.planExpiresAt = result.subscription.currentPeriodEnd;
        targetUser.totalXp += 200;
        users.set(targetUser.id, targetUser);
      }
    }

    res.json(result);
  } catch (err: any) {
    console.error('❌ [ADMIN_VERIFY_ERROR]', err);
    res.status(400).json({ error: err.message || 'Verification action failed' });
  }
});


// Start Express Server with Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PeerMate server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
