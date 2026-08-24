import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Bot,
  PhoneCall,
  Sparkles,
  Shield,
  Radio,
  ArrowRight,
  Mic,
  CheckCircle2,
  Globe,
  HeartHandshake,
  Activity,
  ChevronDown,
  ChevronUp,
  Info,
  UserCheck,
  SlidersHorizontal,
  Filter,
  RotateCcw,
  GraduationCap,
  MessageSquare,
  Zap,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { playSound } from '../../lib/audio';
import { MatchmakingPeer, AiFeedback } from '../../types';
import { HumanCallModal } from './HumanCallModal';
import { AiCallModal } from './AiCallModal';
import { AiFeedbackModal } from './AiFeedbackModal';
import { LiveKitDiagnosticModal } from './LiveKitDiagnosticModal';
import {
  trackUserPresence,
  subscribeToMatchmakingBroadcast,
} from '../../lib/supabase';

export const PracticeTab: React.FC = () => {
  const { user, setIsAuthModalOpen, setIsPricingModalOpen } = useAuth();

  // Matchmaking states
  const [isSearching, setIsSearching] = useState(false);
  const [matchedPeer, setMatchedPeer] = useState<MatchmakingPeer | null>(null);
  const [searchTimer, setSearchTimer] = useState(0);
  const [onlineLearnersCount, setOnlineLearnersCount] = useState(1);

  // Peer Matchmaking Filter States
  const [peerTargetLevel, setPeerTargetLevel] = useState<string>('Any');
  const [peerPreferredTopic, setPeerPreferredTopic] = useState<string>('Any');
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);

  // Active call states
  const [activeHumanCallPeer, setActiveHumanCallPeer] = useState<MatchmakingPeer | null>(null);
  const [activeAiCall, setActiveAiCall] = useState<{
    topic: string;
    tutorName: string;
    tutorAccent: 'us' | 'uk' | 'in';
  } | null>(null);

  // LiveKit Diagnostic Utility state
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);

  // AI Feedback Modal
  const [feedbackData, setFeedbackData] = useState<{ feedback: AiFeedback; duration: number } | null>(null);

  // AI Call Config
  const [selectedTopic, setSelectedTopic] = useState('Daily Life & Routine');
  const [selectedTutor, setSelectedTutor] = useState<{ name: string; accent: 'us' | 'uk' | 'in'; desc: string }>({
    name: 'Emma',
    accent: 'us',
    desc: 'Friendly & patient American voice',
  });

  // Debug Panel Visibility State (Requirement 23)
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const [micStatus, setMicStatus] = useState<'Granted' | 'Muted' | 'Not Requested' | 'Denied'>('Not Requested');

  const queueIdRef = useRef<string | null>(null);

  // Filter Option Definitions
  const levelFilterOptions = [
    {
      id: 'Any',
      label: 'Any Level',
      badge: 'Fastest Match',
      desc: 'Connect instantly with all active learners',
      icon: '🌟',
    },
    {
      id: 'Beginner',
      label: 'Beginner',
      badge: 'Gentle Pace',
      desc: 'Comfortable, slow & supportive conversations',
      icon: '🌱',
    },
    {
      id: 'Intermediate',
      label: 'Intermediate',
      badge: 'Everyday Fluency',
      desc: 'Balanced conversational flow & vocabulary practice',
      icon: '🚀',
    },
    {
      id: 'Upper Intermediate',
      label: 'Upper Intermediate',
      badge: 'Professional',
      desc: 'Workplace topics, idioms & clear pronunciation',
      icon: '💼',
    },
    {
      id: 'Advanced',
      label: 'Advanced',
      badge: 'Native Fluency',
      desc: 'Fast-paced, complex discussions & nuance',
      icon: '⚡',
    },
  ];

  const peerTopicFilterOptions = [
    { id: 'Any', label: 'Any Topic (Open Chat)', icon: '💬', badge: 'Fastest' },
    { id: 'Daily Life & Routine', label: 'Daily Life & Routine', icon: '☕', badge: 'Casual' },
    { id: 'Job Interview Prep', label: 'Job Interview & Career', icon: '💼', badge: 'Career' },
    { id: 'Travel & Culture', label: 'Travel & World Cultures', icon: '✈️', badge: 'Popular' },
    { id: 'Business & Tech', label: 'Business & Tech Trends', icon: '💡', badge: 'Industry' },
    { id: 'Hobbies & Passions', label: 'Hobbies & Weekend Fun', icon: '🎨', badge: 'Fun' },
    { id: 'Movies & Pop Culture', label: 'Movies, Books & Pop Culture', icon: '🎬', badge: 'Social' },
    { id: 'Debate & Global Trends', label: 'Debate & Global Trends', icon: '🗣️', badge: 'Debate' },
  ];

  const topics = [
    'Daily Life & Routine',
    'Job Interview Prep',
    'Travel & Airport Conversations',
    'Ordering at a Coffee Shop',
    'Hobbies & Weekend Plans',
    'Free English Chit-Chat',
  ];

  const tutors = [
    { name: 'Emma', accent: 'us' as const, desc: 'Friendly American English' },
    { name: 'Oliver', accent: 'uk' as const, desc: 'Polite British English' },
    { name: 'Priya', accent: 'in' as const, desc: 'Clear Neutral English' },
  ];

  // Track user presence: available vs searching vs in_call (Requirement 19)
  useEffect(() => {
    if (!user) return;
    if (activeHumanCallPeer) {
      trackUserPresence(user, 'in_call');
    } else if (isSearching) {
      trackUserPresence(user, 'searching');
    } else {
      trackUserPresence(user, 'available');
    }
  }, [user, isSearching, activeHumanCallPeer]);

  // Subscribe to Realtime Matchmaking Broadcast for current user
  useEffect(() => {
    if (!user) return;
    let unsubscribe = () => {};

    subscribeToMatchmakingBroadcast(user.id, (matchData) => {
      console.log('[MATCHMAKING] Realtime Broadcast match received on client:', matchData);
      if (matchData && matchData.peer) {
        handleMatchFound(matchData);
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Matchmaking polling & Queue Joining (Requirement 1 & 2)
  useEffect(() => {
    let interval: any = null;
    let pollTimeout: any = null;
    let isCancelled = false;

    if (isSearching) {
      interval = setInterval(() => {
        setSearchTimer((prev) => prev + 1);
      }, 1000);

      console.log(
        '[MATCHMAKING] Joining queue for user:',
        user?.id,
        user?.displayName,
        'Target Level:',
        peerTargetLevel,
        'Topic:',
        peerPreferredTopic
      );

      // Start search queue with level & topic filters
      api
        .joinMatchmakingQueue(
          user?.englishLevel || 'Intermediate',
          'audio',
          false,
          peerTargetLevel,
          peerPreferredTopic
        )
        .then((res) => {
          if (isCancelled) return;
          const queueId = res.queueId;
          queueIdRef.current = queueId;

          // If instantly matched with an already waiting peer in queue
          if (res.status === 'matched' && (res as any).match) {
            handleMatchFound((res as any).match);
            return;
          }

          const poll = async () => {
            if (isCancelled || !isSearching) return;
            try {
              const pollRes = await api.pollMatchmaking(queueId);
              if (pollRes.onlineLearnersCount) {
                setOnlineLearnersCount(pollRes.onlineLearnersCount);
              }

              if (pollRes.status === 'matched' && pollRes.match) {
                handleMatchFound(pollRes.match);
              } else {
                pollTimeout = setTimeout(poll, 800);
              }
            } catch (err) {
              console.warn('[MATCHMAKING] Poll notice:', err);
              if (!isCancelled && isSearching) {
                pollTimeout = setTimeout(poll, 1500);
              }
            }
          };

          poll();
        })
        .catch((err) => {
          console.warn('[MATCHMAKING] Join queue notice:', err);
        });
    }

    return () => {
      isCancelled = true;
      if (interval) clearInterval(interval);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [isSearching]);

  function handleMatchFound(match: any) {
    playSound('connect');
    console.log('[MATCHMAKING] Match resolved! Room name:', match.livekitRoom, 'Peer:', match.peer.displayName);

    const peer: MatchmakingPeer = {
      id: match.peer.id,
      displayName: match.peer.displayName,
      username: match.peer.username,
      avatarUrl: match.peer.avatarUrl,
      englishLevel: match.peer.englishLevel as any,
      country: match.peer.country || 'Global',
      status: 'matched',
      callId: match.callId,
      isInitiator: match.isInitiator,
      nativeLanguage: match.peer.nativeLanguage,
      learningGoal: match.peer.learningGoal,
      mediaMode: 'audio',
      livekitRoom: match.livekitRoom,
      livekitToken: match.livekitToken,
      livekitUrl: match.livekitUrl,
      targetLevel: match.peer.targetLevel || peerTargetLevel,
      preferredTopic: match.peer.preferredTopic || peerPreferredTopic,
      matchedTopic: match.matchedTopic || match.peer.matchedTopic || 'Daily Life & Routine',
    };

    setMatchedPeer(peer);
    setIsSearching(false);

    // Launch call after 1.2s match card preview
    setTimeout(() => {
      setActiveHumanCallPeer(peer);
      setMatchedPeer(null);
    }, 1200);
  }

  const handleStartHumanCall = async () => {
    playSound('click');
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    try {
      // Test media permission first (Requirement 15)
      setMicStatus('Not Requested');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('Granted');

      setIsSearching(true);
      setSearchTimer(0);
    } catch (err) {
      setMicStatus('Denied');
      alert(
        'Microphone permission is required to talk with other learners on LiveKit. Please allow microphone access in your browser.'
      );
    }
  };

  const handleCancelSearch = () => {
    playSound('click');
    if (queueIdRef.current) {
      api.leaveMatchmaking(queueIdRef.current).catch(() => {});
      queueIdRef.current = null;
    }
    setIsSearching(false);
    setSearchTimer(0);
  };

  const handleResetFilters = (e: React.MouseEvent) => {
    e.stopPropagation();
    playSound('click');
    setPeerTargetLevel('Any');
    setPeerPreferredTopic('Any');
  };

  const handleStartAiCall = () => {
    playSound('click');
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    // Pro Plan Gating: Require Pro subscription for AI English Teacher
    if (user.plan !== 'pro') {
      setIsPricingModalOpen(true);
      return;
    }

    setActiveAiCall({
      topic: selectedTopic,
      tutorName: selectedTutor.name,
      tutorAccent: selectedTutor.accent,
    });
  };

  const hasActiveFilters = peerTargetLevel !== 'Any' || peerPreferredTopic !== 'Any';

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* REQUIREMENT 23: VISIBLE DEBUG STATUS IN PRACTICE SCREEN */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black tracking-wider uppercase text-slate-300">
                  Live Calling & Matchmaking Diagnostics
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                1-to-1 WebRTC Voice calling pipeline status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDiagnosticModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              title="Open LiveKit Diagnostic Console & Mic Tester"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>LiveKit Diagnostics</span>
            </button>

            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Toggle Debug Info"
            >
              {showDebugPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showDebugPanel && (
          <div className="space-y-3 pt-4 mt-3 border-t border-slate-800/80 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* 1. Auth Status */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Auth Status
                </div>
                <div className="font-bold text-slate-200 mt-1 truncate flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>{user ? `Auth (${user.username})` : 'Not Authenticated'}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  ID: {user?.id || 'none'}
                </div>
              </div>

              {/* 2. Matchmaking Status & Filters */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Matchmaking & Filter
                </div>
                <div className="font-bold text-indigo-400 mt-1 flex items-center gap-1.5">
                  {isSearching ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      <span>Searching ({searchTimer}s)</span>
                    </>
                  ) : activeHumanCallPeer ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Matched & In Call</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span>Idle (Available)</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  Target: {peerTargetLevel} • Topic: {peerPreferredTopic === 'Any' ? 'Open' : peerPreferredTopic.slice(0, 10) + '...'}
                </div>
              </div>

              {/* 3. Matched User ID & Room Name */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Matched Peer & Room
                </div>
                <div className="font-bold text-emerald-400 mt-1 truncate">
                  {activeHumanCallPeer ? activeHumanCallPeer.displayName : matchedPeer ? matchedPeer.displayName : 'None'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  {activeHumanCallPeer?.livekitRoom || 'No active room'}
                </div>
              </div>

              {/* 4. LiveKit Connection & Mic Status */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  LiveKit / Mic Status
                </div>
                <div className="font-bold text-slate-200 mt-1 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${activeHumanCallPeer ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span>{activeHumanCallPeer ? 'Connected (1 Remote)' : 'Standby (0 Remote)'}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Mic: <span className={micStatus === 'Granted' ? 'text-emerald-400 font-bold' : 'text-slate-300'}>{micStatus}</span>
                </div>
              </div>
            </div>

            {/* Quick Diagnostic Launch Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-indigo-200 font-medium">Need to test microphone permissions, token generation, or participant events?</span>
              </div>
              <button
                onClick={() => setIsDiagnosticModalOpen(true)}
                className="px-3 py-1 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>Launch Diagnostics</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 1: PRACTICE WITH HUMANS (HERO CARD POWERED BY LIVEKIT) */}
      <section className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-200/50 relative overflow-hidden space-y-6">
        {/* Background decorative wave */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-700/60 border border-indigo-500/40 text-indigo-200 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LiveKit Real-Time Audio Stack</span>
            </div>
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> 1-on-1 Human Voice Call
            </span>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Practice With Real Humans
            </h2>
            <p className="text-indigo-100 text-sm mt-1 max-w-lg font-medium leading-relaxed">
              Connect 1-on-1 with another authenticated learner in real-time. Select your target proficiency or discussion topic below for tailored matchmaking.
            </p>
          </div>

          {/* Key Trust Perks */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs text-indigo-100 font-medium">
            <div className="flex items-center gap-1.5 bg-indigo-950/40 p-2 rounded-xl border border-indigo-700/40">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>LiveKit Audio Only</span>
            </div>
            <div className="flex items-center gap-1.5 bg-indigo-950/40 p-2 rounded-xl border border-indigo-700/40">
              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Smart Peer Matching</span>
            </div>
            <div className="flex items-center gap-1.5 bg-indigo-950/40 p-2 rounded-xl border border-indigo-700/40 col-span-2 sm:col-span-1">
              <HeartHandshake className="w-4 h-4 text-pink-400 shrink-0" />
              <span>Friendly Community</span>
            </div>
          </div>
        </div>

        {/* MATCHMAKING FILTER PREFERENCES PANEL */}
        <div className="relative z-10 bg-slate-950/70 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-600/30 border border-indigo-400/30 text-indigo-300">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Peer Matchmaking Preferences</span>
                  {hasActiveFilters && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                      Filters Active
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-indigo-200/80">
                  Filter by target proficiency or conversation topic
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1 rounded-xl bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 hover:text-white border border-indigo-600/40 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset to Any Level & Open Topic"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                className="p-1.5 rounded-xl bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 hover:text-white transition-colors cursor-pointer"
                title="Toggle filter controls"
              >
                {isFilterExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Active Filter Badges Summary */}
          <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-900/80 border border-indigo-700/60 text-indigo-200">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400">Target Level:</span>
              <span className="font-bold text-white">{peerTargetLevel === 'Any' ? 'Any Level (Fastest)' : peerTargetLevel}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-900/80 border border-indigo-700/60 text-indigo-200">
              <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Topic:</span>
              <span className="font-bold text-white">{peerPreferredTopic === 'Any' ? 'Any Topic (Open Chat)' : peerPreferredTopic}</span>
            </div>
            <div className="text-[11px] text-emerald-300 font-medium ml-auto flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{peerTargetLevel === 'Any' && peerPreferredTopic === 'Any' ? '⚡ Instant queue matching' : '🎯 Priority compatibility matching'}</span>
            </div>
          </div>

          {/* Collapsible Filter Detail Controls */}
          {isFilterExpanded && (
            <div className="space-y-4 pt-2 border-t border-indigo-900/60 animate-in fade-in duration-150">
              {/* 1. Target English Proficiency Level Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>1. Target Peer English Level</span>
                  </label>
                  <span className="text-[11px] text-indigo-300/80">
                    Your level: <strong className="text-white">{user?.englishLevel || 'Intermediate'}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {levelFilterOptions.map((opt) => {
                    const isSelected = peerTargetLevel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setPeerTargetLevel(opt.id);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-950/60 ring-2 ring-emerald-500/30 text-white'
                            : 'border-indigo-800/60 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-200 hover:border-indigo-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-base">{opt.icon}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        <div className="mt-1.5">
                          <div className="font-bold text-xs leading-tight text-white">{opt.label}</div>
                          <div className="text-[10px] text-indigo-300/80 mt-0.5 font-medium leading-tight line-clamp-1">
                            {opt.badge}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Preferred Conversation Topic Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>2. Preferred Conversation Topic</span>
                  </label>
                  <span className="text-[11px] text-indigo-300/80">
                    Choose what you want to talk about
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {peerTopicFilterOptions.map((topic) => {
                    const isSelected = peerPreferredTopic === topic.id;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setPeerPreferredTopic(topic.id);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-950/60 ring-2 ring-cyan-500/30 text-white font-bold'
                            : 'border-indigo-800/60 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-200 hover:border-indigo-700'
                        }`}
                      >
                        <span className="text-base shrink-0">{topic.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">{topic.label}</div>
                          <div className="text-[10px] text-indigo-300/80 font-normal">{topic.badge}</div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Helpful Matchmaking Note */}
              <p className="text-[11px] text-indigo-300/70 italic">
                💡 Tip: Matchmaking prioritizes peers with your selected level & topic first. If no exact match is waiting, it connects with the nearest available learner to keep your wait time under 10 seconds.
              </p>
            </div>
          )}
        </div>

        {/* CTA Button: Start Human Call */}
        <div className="relative z-10 pt-1">
          <button
            id="start-human-voice-call-btn"
            onClick={handleStartHumanCall}
            className="w-full sm:w-auto py-4 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-98 text-white font-extrabold text-base shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <PhoneCall className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span>
              {hasActiveFilters
                ? `Find ${peerTargetLevel !== 'Any' ? peerTargetLevel : ''} Peer (${peerPreferredTopic !== 'Any' ? peerPreferredTopic : 'Open Chat'})`
                : 'Start Human Call'}
            </span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* SECTION 2: PRACTICE WITH AI TEACHER */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-100 dark:border-slate-800 shadow-sm space-y-5 transition-colors duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-sm">
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Practice With AI Teacher</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Speak freely with your AI English Tutor • Instant Speaking Feedback</p>
            </div>
          </div>
          {user?.plan === 'pro' ? (
            <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>PRO ACTIVE</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsPricingModalOpen(true)}
              className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>PRO ₹99/MO</span>
            </button>
          )}
        </div>

        {/* Tutor Voice Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Choose Tutor Accent</label>
          <div className="grid grid-cols-3 gap-2">
            {tutors.map((tutor) => {
              const isSelected = selectedTutor.name === tutor.name;
              return (
                <button
                  key={tutor.name}
                  type="button"
                  onClick={() => setSelectedTutor(tutor)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{tutor.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{tutor.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Practice Topics */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Select Practice Topic</span>
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-normal">Customized for {user?.englishLevel || 'Intermediate'}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => {
              const isSelected = selectedTopic === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSelectedTopic(topic)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI CTA Button */}
        <button
          id="start-ai-call-btn"
          onClick={handleStartAiCall}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-98 text-white font-extrabold text-base shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 group cursor-pointer"
        >
          <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span>
            {user?.plan === 'pro'
              ? `Start AI Call with ${selectedTutor.name}`
              : `Unlock AI Call with ${selectedTutor.name} (₹99/mo)`}
          </span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </section>

      {/* MATCHMAKING RADAR MODAL */}
      {isSearching && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-5 shadow-2xl text-white animate-in zoom-in-95">
            {/* Animated Concentric Radar Rings */}
            <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-ping" />
              <div className="absolute inset-4 rounded-full border-2 border-indigo-500/50 animate-pulse" />
              <div className="absolute inset-8 rounded-full bg-indigo-600/20" />
              <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white relative z-10 shadow-lg shadow-indigo-500/40">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-extrabold text-white">
                Finding Voice Partner...
              </h3>
              <p className="text-xs text-slate-400">
                Searching for matching learners online
              </p>

              {/* Active Search Criteria Pill */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-2.5 text-xs text-left space-y-1 text-slate-300">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Target Level:</span>
                  <span className="font-bold text-indigo-300">{peerTargetLevel === 'Any' ? 'Any Proficiency' : peerTargetLevel}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Topic:</span>
                  <span className="font-bold text-emerald-300 truncate max-w-[170px]">
                    {peerPreferredTopic === 'Any' ? 'Open Chit-Chat' : peerPreferredTopic}
                  </span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold text-emerald-400 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Supabase Matchmaking Active</span>
              </div>
              <div className="text-sm font-mono text-indigo-400 font-bold mt-1">
                00:{searchTimer.toString().padStart(2, '0')}
              </div>
            </div>

            {/* Cancel Action */}
            <div className="space-y-2 pt-1">
              <button
                id="cancel-search-btn"
                onClick={handleCancelSearch}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MATCHED PREVIEW POPUP */}
      {matchedPeer && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 text-white">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Learner Found! Connecting LiveKit Audio...</span>
            </div>

            <div className="relative w-24 h-24 mx-auto">
              <img
                src={matchedPeer.avatarUrl}
                alt={matchedPeer.displayName}
                className="w-24 h-24 rounded-full object-cover ring-4 ring-indigo-500/50 shadow-xl"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl font-bold text-white">{matchedPeer.displayName}</h4>
              <p className="text-xs text-slate-400 font-medium">
                {matchedPeer.englishLevel} • {matchedPeer.country || 'Global Peer'}
              </p>
              {matchedPeer.matchedTopic && (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[11px] font-semibold mt-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Topic: {matchedPeer.matchedTopic}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE HUMAN CALL MODAL */}
      {activeHumanCallPeer && (
        <HumanCallModal
          peer={activeHumanCallPeer}
          onEndCall={() => {
            console.log('[MATCHMAKING] Ended active human call session on client.');
            setActiveHumanCallPeer(null);
          }}
        />
      )}

      {/* ACTIVE AI CALL MODAL */}
      {activeAiCall && (
        <AiCallModal
          topic={activeAiCall.topic}
          tutorName={activeAiCall.tutorName}
          tutorAccent={activeAiCall.tutorAccent}
          onEndCall={(feedback, durationSecs) => {
            setActiveAiCall(null);
            if (feedback) {
              setFeedbackData({ feedback, duration: durationSecs || 60 });
            }
          }}
        />
      )}

      {/* AI FEEDBACK MODAL */}
      {feedbackData && (
        <AiFeedbackModal
          feedback={feedbackData.feedback}
          durationSeconds={feedbackData.duration}
          onClose={() => setFeedbackData(null)}
        />
      )}

      {/* LIVEKIT DIAGNOSTIC UTILITY MODAL */}
      <LiveKitDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
      />
    </div>
  );
};
