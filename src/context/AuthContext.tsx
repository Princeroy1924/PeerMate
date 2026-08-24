import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, EnglishLevel, PlanType } from '../types';
import { api } from '../lib/api';

export interface RegisterPayload {
  email: string;
  password?: string;
  displayName: string;
  username: string;
  englishLevel: EnglishLevel;
  avatarUrl?: string;
  nativeLanguage?: string;
  dailyGoalMinutes?: number;
  learningGoal?: string;
  interests?: string[];
}

export interface RegisterResult {
  requiresEmailConfirmation?: boolean;
  notice?: string;
  user?: UserProfile;
  token?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<RegisterResult>;
  resendVerification: (email: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  upgradeToPro: () => void;
  logout: () => Promise<void>;
  awardXp: (amount: number) => void;
  updateStreakAndXp: (newStreak?: number, earnedXp?: number, updatedUser?: UserProfile) => void;
  refreshUser: () => Promise<void>;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isPricingModalOpen: boolean;
  setIsPricingModalOpen: (open: boolean) => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const token = localStorage.getItem('peermate_token');
        if (token) {
          const data = await api.getMe();
          if (data.user) {
            setUser({ ...data.user, isGuest: false });
            setLoading(false);
            return;
          }
        }
        
        // If no auth token, fetch guest user profile tied to this client instance
        try {
          const guestData = await api.getMe();
          if (guestData.user) {
            setUser({ ...guestData.user, isGuest: true });
            setLoading(false);
            return;
          }
        } catch {
          // fallback below
        }

        // If server is unreachable, generate fallback user
        const initialUser: UserProfile = {
          id: 'user_demo_1',
          email: 'learner@peermate.com',
          username: 'english_explorer',
          displayName: 'Alex Morgan',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          englishLevel: 'Intermediate',
          nativeLanguage: 'Hindi',
          dailyGoalMinutes: 20,
          learningGoal: 'Conversational Fluency',
          interests: ['Daily Life & Routine', 'Travel & Culture', 'Job Interview Prep'],
          plan: 'free',
          currentStreak: 4,
          totalXp: 850,
          createdAt: new Date().toISOString(),
          isGuest: false,
        };
        setUser(initialUser);
      } catch (err) {
        console.warn('Initial auth load:', err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const login = async (email: string, password?: string) => {
    const res = await api.login({ email, password });
    if (res.token) {
      localStorage.setItem('peermate_token', res.token);
    }
    setUser({ ...res.user, isGuest: false });
    setIsAuthModalOpen(false);
  };

  const register = async (data: RegisterPayload): Promise<RegisterResult> => {
    const res = await api.register(data);
    if (res.token) {
      localStorage.setItem('peermate_token', res.token);
    }
    if (!res.requiresEmailConfirmation && res.user) {
      setUser({ ...res.user, isGuest: false });
      setIsAuthModalOpen(false);
    }
    return {
      requiresEmailConfirmation: res.requiresEmailConfirmation,
      notice: res.notice,
      user: res.user,
      token: res.token,
    };
  };

  const resendVerification = async (email: string) => {
    return api.resendVerification(email);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const res = await api.updateProfile(updates);
      setUser(prev => prev ? { ...prev, ...res.user } : res.user);
    } catch (err) {
      setUser(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const upgradeToPro = () => {
    setIsPricingModalOpen(true);
  };

  const awardXp = (amount: number) => {
    if (!user) return;
    setUser(prev => prev ? { ...prev, totalXp: prev.totalXp + amount } : null);
  };

  const updateStreakAndXp = (newStreak?: number, earnedXp?: number, updatedUser?: UserProfile) => {
    if (updatedUser) {
      setUser(prev => prev ? { ...prev, ...updatedUser } : updatedUser);
      return;
    }
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        currentStreak: newStreak !== undefined ? newStreak : prev.currentStreak,
        totalXp: earnedXp !== undefined ? prev.totalXp + earnedXp : prev.totalXp,
      };
    });
  };

  const refreshUser = async () => {
    try {
      const data = await api.getMe();
      if (data.user) {
        setUser(prev => prev ? { ...prev, ...data.user } : data.user);
      }
    } catch (err) {
      console.warn('Failed to refresh user profile:', err);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout error:', err);
    }
    localStorage.removeItem('peermate_token');
    // Prompt login/signup modal for real user account
    setUser(null);
    setIsAuthModalOpen(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        resendVerification,
        updateProfile,
        upgradeToPro,
        logout,
        awardXp,
        updateStreakAndXp,
        refreshUser,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isPricingModalOpen,
        setIsPricingModalOpen,
        isProfileModalOpen,
        setIsProfileModalOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
