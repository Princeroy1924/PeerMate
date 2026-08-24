import { UserProfile, VocabularyItem, CallRecord, AiFeedback, UserProgress, LeagueMember, CallSignalMessage, MatchmakingPeer } from '../types';

const API_BASE = '/api';

function getClientId(): string {
  let clientId = localStorage.getItem('peermate_client_id');
  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('peermate_client_id', clientId);
  }
  return clientId;
}

export async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('peermate_token') || '';
  const clientId = getClientId();
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  async register(data: {
    email: string;
    password?: string;
    displayName: string;
    username: string;
    englishLevel: string;
    avatarUrl?: string;
    nativeLanguage?: string;
    dailyGoalMinutes?: number;
    learningGoal?: string;
    interests?: string[];
  }) {
    return fetchWithAuth<{
      user: UserProfile;
      token?: string;
      requiresEmailConfirmation?: boolean;
      emailConfirmed?: boolean;
      notice?: string;
      provider?: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async resendVerification(email: string) {
    return fetchWithAuth<{ success: boolean; message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async login(data: { email: string; password?: string }) {
    return fetchWithAuth<{ user: UserProfile; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMe() {
    return fetchWithAuth<{ user: UserProfile }>('/auth/me');
  },

  async logout() {
    return fetchWithAuth<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }).catch(() => ({ success: true }));
  },

  async updateProfile(updates: Partial<UserProfile>) {
    return fetchWithAuth<{ user: UserProfile }>('/auth/update-profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Vocabulary
  async getDailyVocabulary() {
    return fetchWithAuth<{ items: VocabularyItem[]; wordOfTheDay: VocabularyItem; totalLearned: number }>('/vocabulary/today');
  },

  async updateVocabularyAction(vocabId: string, action: 'learned' | 'saved' | 'unlearned') {
    return fetchWithAuth<{ success: boolean; totalLearned: number }>('/vocabulary/action', {
      method: 'POST',
      body: JSON.stringify({ vocabId, action }),
    });
  },

  // Matchmaking & LiveKit Calls
  async joinMatchmakingQueue(
    englishLevel?: string,
    mediaMode?: 'audio' | 'video',
    forceAiFallback?: boolean,
    targetLevel: string = 'Any',
    preferredTopic: string = 'Any'
  ) {
    return fetchWithAuth<{
      queueId: string;
      status: 'searching' | 'matched' | 'waiting' | 'timeout';
      estimatedWaitSec?: number;
      match?: {
        callId: string;
        isInitiator: boolean;
        mediaMode?: 'audio' | 'video';
        livekitRoom?: string;
        livekitToken?: string;
        livekitUrl?: string;
        matchedTopic?: string;
        peer: MatchmakingPeer;
      };
    }>('/matchmaking/join', {
      method: 'POST',
      body: JSON.stringify({ englishLevel, mediaMode, forceAiFallback, targetLevel, preferredTopic }),
    });
  },

  async pollMatchmaking(queueId: string) {
    return fetchWithAuth<{
      status: 'searching' | 'matched' | 'waiting' | 'timeout';
      elapsedSeconds?: number;
      onlineLearnersCount?: number;
      match?: {
        callId: string;
        isInitiator: boolean;
        mediaMode?: 'audio' | 'video';
        livekitRoom?: string;
        livekitToken?: string;
        livekitUrl?: string;
        peer: MatchmakingPeer;
      };
    }>(`/matchmaking/poll?queueId=${queueId}`);
  },

  async leaveMatchmaking(queueId: string) {
    return fetchWithAuth<{ success: boolean }>('/matchmaking/leave', {
      method: 'POST',
      body: JSON.stringify({ queueId }),
    });
  },

  // LiveKit Token Provisioning
  async getLiveKitToken(roomName?: string) {
    return fetchWithAuth<{
      token: string;
      url: string;
      roomName: string;
      participantName: string;
      identity: string;
    }>(`/livekit/token${roomName ? `?room=${encodeURIComponent(roomName)}` : ''}`);
  },

  // Real-Time Signaling for Human 1-on-1 Calls
  async sendCallSignal(
    callId: string,
    type: 'offer' | 'answer' | 'ice-candidate' | 'mute-state' | 'camera-state' | 'hangup' | 'chat',
    payload: any
  ) {
    return fetchWithAuth<{ success: boolean; signalId: number }>(`/calls/${callId}/signal`, {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    });
  },

  async getCallSignals(callId: string, since: number = 0) {
    return fetchWithAuth<{
      signals: CallSignalMessage[];
      status: 'connecting' | 'connected' | 'ended';
      peerMuted?: boolean;
      peerCameraOff?: boolean;
      lastSignalId: number;
    }>(`/calls/${callId}/signals?since=${since}`);
  },

  async pollCallSignals(callId: string, since: number = 0) {
    return this.getCallSignals(callId, since);
  },

  async endCallSession(callId: string, durationSeconds?: number) {
    return fetchWithAuth<{
      success: boolean;
      earnedXp: number;
      currentStreak?: number;
      totalXp?: number;
      user?: UserProfile;
    }>(`/calls/${callId}/end`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds }),
    });
  },

  // AI Tutor Turn & Feedback
  async sendAiCallTurn(messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>, userLevel: string, topic?: string) {
    return fetchWithAuth<{ responseText: string }>('/ai-call/turn', {
      method: 'POST',
      body: JSON.stringify({ messages, userLevel, topic }),
    });
  },

  async generateAiFeedback(transcript: Array<{ speaker: string; text: string }>, durationSeconds: number) {
    return fetchWithAuth<{ feedback: AiFeedback }>('/ai-call/feedback', {
      method: 'POST',
      body: JSON.stringify({ transcript, durationSeconds }),
    });
  },

  // Calls
  async recordCall(callData: Partial<CallRecord>) {
    return fetchWithAuth<{
      call: CallRecord;
      earnedXp: number;
      currentStreak?: number;
      totalXp?: number;
      user?: UserProfile;
    }>('/calls/record', {
      method: 'POST',
      body: JSON.stringify(callData),
    });
  },

  async getCallHistory() {
    return fetchWithAuth<{ calls: CallRecord[] }>('/calls/history');
  },

  // Leagues
  async getLeagueLeaderboard() {
    return fetchWithAuth<{
      leagueName: string;
      timeRemaining: string;
      members: LeagueMember[];
      userRank: number;
      userPoints: number;
    }>('/leagues/leaderboard');
  },

  // Progress & Streak
  async getUserProgress() {
    return fetchWithAuth<{ progress: UserProgress }>('/progress/stats');
  },

  async updateDailyGoal(dailyGoalMinutes: number) {
    return fetchWithAuth<{ success: boolean; dailyGoalMinutes: number; user: UserProfile }>('/progress/daily-goal', {
      method: 'POST',
      body: JSON.stringify({ dailyGoalMinutes }),
    });
  },

  async getStreakStatus() {
    return fetchWithAuth<{
      currentStreak: number;
      longestStreak: number;
      streakActiveToday: boolean;
      totalPracticeDays: number;
      lastPracticeDate?: string;
      nextMilestoneDays: number;
      milestoneName: string;
      practiceDates: string[];
      recentLogs: Array<{
        id: string;
        activityType: string;
        date: string;
        durationSeconds: number;
        xpEarned: number;
        createdAt: string;
      }>;
    }>('/streak/status');
  },

  async logStreakPractice(data?: {
    activityType?: 'quick_drill' | 'vocabulary' | 'ai_call' | 'human_call';
    durationSeconds?: number;
    xpEarned?: number;
  }) {
    return fetchWithAuth<{
      success: boolean;
      message: string;
      streakInfo: {
        currentStreak: number;
        longestStreak: number;
        isConsecutive: boolean;
        isNewDayPractice: boolean;
        streakActiveToday: boolean;
        totalPracticeDays: number;
        lastPracticeDate: string;
      };
      earnedXp: number;
      user: UserProfile;
    }>('/streak/practice', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  // Payments / Manual UPI & Intent System
  async getPaymentConfig() {
    return fetchWithAuth<{
      upiId: string;
      displayName: string;
      proPrice: number;
      currency: string;
      qrCodePath: string;
      planDurationDays: number;
      plan: string;
      displayPrice: string;
      interval: string;
    }>('/payments/config');
  },

  async createPaymentIntent(data?: { notes?: string }) {
    return fetchWithAuth<{
      success: boolean;
      paymentSession: {
        id: string;
        transactionRef: string;
        amount: number;
        currency: string;
        status: 'pending' | 'approved' | 'rejected';
        intentUri: string;
        upiId: string;
        payeeName: string;
        createdAt: string;
      };
      upiIntentUrl: string;
    }>('/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  async getPaymentSessionStatus(paymentId: string) {
    return fetchWithAuth<{
      paymentId: string;
      status: 'pending' | 'approved' | 'rejected';
      isPro: boolean;
      payment: any;
    }>(`/payments/session/${paymentId}`);
  },

  async attachPaymentProof(data: {
    paymentId: string;
    utr?: string;
    paymentDate?: string;
    screenshotBase64?: string;
  }) {
    return fetchWithAuth<{
      success: boolean;
      payment: any;
      message: string;
    }>('/payments/attach-proof', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async submitUpiPayment(data: {
    utr: string;
    paymentDate: string;
    screenshotBase64: string;
  }) {
    return fetchWithAuth<{
      success: boolean;
      payment: {
        id: string;
        amount: number;
        currency: string;
        status: 'pending' | 'approved' | 'rejected';
        utr: string;
        paymentDate: string;
        createdAt: string;
      };
      message: string;
    }>('/payments/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPaymentHistory() {
    return fetchWithAuth<{
      payments: Array<{
        id: string;
        userId: string;
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
      }>;
    }>('/payments/history');
  },

  async getSubscriptionStatus() {
    return fetchWithAuth<{
      isPro: boolean;
      plan: 'free' | 'pro';
      planExpiresAt?: string;
    }>('/payments/subscription-status');
  },

  // Admin Verification Methods
  async checkAdminStatus() {
    return fetchWithAuth<{
      isAdmin: boolean;
      email?: string;
    }>('/admin/check');
  },

  async getAdminPayments(status: string = 'all') {
    return fetchWithAuth<{
      payments: Array<{
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
      }>;
    }>(`/admin/payments?status=${encodeURIComponent(status)}`);
  },

  async adminVerifyPayment(data: {
    paymentId: string;
    action: 'approve' | 'reject';
    adminNote?: string;
  }) {
    return fetchWithAuth<{
      success: boolean;
      payment: any;
      subscription?: any;
      message: string;
    }>('/admin/verify-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

