export type EnglishLevel = 
  | 'Beginner' 
  | 'Elementary' 
  | 'Intermediate' 
  | 'Upper Intermediate' 
  | 'Advanced';

export type PlanType = 'free' | 'pro';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  englishLevel: EnglishLevel;
  nativeLanguage?: string;
  dailyGoalMinutes?: number;
  learningGoal?: string;
  interests?: string[];
  plan: PlanType;
  planExpiresAt?: string;
  currentStreak: number;
  longestStreak?: number;
  lastPracticeDate?: string;
  totalPracticeDays?: number;
  practiceDates?: string[];
  totalXp: number;
  createdAt: string;
  isGuest?: boolean;
}

export interface VocabularyItem {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  learned?: boolean;
  saved?: boolean;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callerLevel: EnglishLevel;
  receiverId: string;
  receiverName: string;
  receiverAvatar: string;
  receiverLevel: EnglishLevel;
  callType: 'human' | 'ai';
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  status: 'completed' | 'missed' | 'rejected' | 'in_progress';
  aiFeedbackId?: string;
  topic?: string;
  targetLevel?: string;
  country?: string;
  xpEarned?: number;
  notes?: string;
}

export interface AiFeedback {
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
  mistakes: Array<{
    original: string;
    correction: string;
    explanation: string;
  }>;
  newVocabulary: Array<{
    word: string;
    meaning: string;
    example: string;
  }>;
  createdAt: string;
}

export interface LeagueMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  englishLevel: EnglishLevel;
  points: number;
  rank: number;
  isCurrentUser?: boolean;
  change: number; // +1, -1, 0
}

export interface WeeklyPracticeDay {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  dayLabel: string;
  date: string;
  hasPracticed: boolean;
  isToday: boolean;
  minutes: number;
}

export interface UserProgress {
  totalCalls: number;
  humanCalls: number;
  aiCalls: number;
  speakingMinutes: number;
  todaySpeakingMinutes: number;
  dailyGoalMinutes: number;
  goalCompletedToday: boolean;
  vocabularyCount: number;
  currentStreak: number;
  longestStreak: number;
  totalPracticeDays: number;
  lastPracticeDate?: string;
  streakActiveToday: boolean;
  nextMilestoneDays: number;
  milestoneName: string;
  fluencyScore: number;
  vocabularyScore: number;
  grammarScore: number;
  pronunciationScore: number;
  weeklyMinutes: {
    Mon: number;
    Tue: number;
    Wed: number;
    Thu: number;
    Fri: number;
    Sat: number;
    Sun: number;
  };
  weeklyPracticeDays?: WeeklyPracticeDay[];
}

export interface MatchmakingPeer {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  englishLevel: EnglishLevel;
  country: string;
  status: 'searching' | 'matched' | 'in_call';
  callId?: string;
  isInitiator?: boolean;
  nativeLanguage?: string;
  learningGoal?: string;
  mediaMode?: 'audio' | 'video';
  livekitRoom?: string;
  livekitToken?: string;
  livekitUrl?: string;
  targetLevel?: string;
  preferredTopic?: string;
  matchedTopic?: string;
}

export interface LiveKitTokenResponse {
  token: string;
  url: string;
  roomName: string;
  participantName: string;
  identity: string;
}

export interface CallSignalMessage {
  id: number;
  fromUserId: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'mute-state' | 'hangup' | 'chat';
  payload: any;
  timestamp: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  amount: number;
  currency: string;
  utr: string;
  paymentDate: string;
  screenshotPath: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  plan: PlanType;
  status: 'active' | 'expired' | 'cancelled';
  paymentId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSession {
  id: string;
  transactionRef: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected';
  intentUri: string;
  upiId: string;
  payeeName: string;
  createdAt: string;
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: PlanType;
  description: string;
  isSandbox: boolean;
}

