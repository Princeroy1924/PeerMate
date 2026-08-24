import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  Volume2,
  PhoneOff,
  UserCheck,
  ShieldCheck,
  Star,
  MessageSquare,
  Sparkles,
  Send,
  Globe2,
  ChevronDown,
  ChevronUp,
  Award,
  Flame,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Radio,
} from 'lucide-react';
import { MatchmakingPeer, EnglishLevel } from '../../types';
import { LiveKitCallClient } from '../../lib/livekit';
import { playSound } from '../../lib/audio';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import confetti from 'canvas-confetti';
import { RemoteTrack, LocalVideoTrack } from 'livekit-client';

interface HumanCallModalProps {
  peer: MatchmakingPeer;
  onEndCall: () => void;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSelf: boolean;
}

export const HumanCallModal: React.FC<HumanCallModalProps> = ({ peer, onEndCall }) => {
  const { user, updateStreakAndXp, refreshUser } = useAuth();
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(peer.mediaMode === 'video');
  const [isPeerMuted, setIsPeerMuted] = useState(false);
  const [isPeerCameraOff, setIsPeerCameraOff] = useState(peer.mediaMode !== 'video');
  const [mediaMode, setMediaMode] = useState<'audio' | 'video'>(peer.mediaMode || 'audio');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'ended'>('connecting');
  
  // Real-time audio volume levels (0-100)
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);

  // Call End & Rating state
  const [isCallEnded, setIsCallEnded] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [earnedXp, setEarnedXp] = useState(50);
  const [newStreak, setNewStreak] = useState<number>(user?.currentStreak || 1);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // In-call Chat & Topic Prompts
  const [activeTab, setActiveTab] = useState<'call' | 'chat' | 'topics'>('call');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);

  const livekitRef = useRef<LiveKitCallClient | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const basePrompts = [
    {
      topic: 'Daily Life & Routine',
      question: 'What is your regular daily routine, and what do you enjoy doing during your free time?',
    },
    {
      topic: 'Job Interview Prep',
      question: 'How do you introduce yourself professionally in an interview, and what are your greatest strengths?',
    },
    {
      topic: 'Travel & Culture',
      question: 'If you could travel anywhere in the world tomorrow, which destination would you pick and why?',
    },
    {
      topic: 'Business & Tech',
      question: 'What new technology or career trend are you most interested in or currently learning about?',
    },
    {
      topic: 'Hobbies & Passions',
      question: 'What is your favorite weekend activity, hobby, or creative passion that makes you happy?',
    },
    {
      topic: 'Movies & Pop Culture',
      question: 'What was the last movie, television series, or book you watched or read that made an impact on you?',
    },
    {
      topic: 'Debate & Global Trends',
      question: 'What do you think is the biggest advantage and challenge of working remotely in the modern world?',
    },
    {
      topic: 'English Learning Journey',
      question: 'What made you decide to practice English today, and what is your personal speaking goal?',
    },
  ];

  // Prioritize prompts matching peer.matchedTopic
  const conversationPrompts = React.useMemo(() => {
    if (!peer.matchedTopic || peer.matchedTopic === 'Any' || peer.matchedTopic === 'Daily Life & Free Chit-Chat') {
      return basePrompts;
    }
    const matched = basePrompts.filter((p) => p.topic.toLowerCase() === peer.matchedTopic?.toLowerCase());
    const rest = basePrompts.filter((p) => p.topic.toLowerCase() !== peer.matchedTopic?.toLowerCase());
    return [...matched, ...rest];
  }, [peer.matchedTopic]);

  useEffect(() => {
    playSound('connect');
    const client = new LiveKitCallClient();
    livekitRef.current = client;

    const callId = peer.callId || `call_${Date.now()}`;
    const isInitiator = peer.isInitiator !== undefined ? peer.isInitiator : true;

    console.log(`[MATCHMAKING] Launching HumanCallModal for Call ID=${callId}, Room=${peer.livekitRoom}, Token=${peer.livekitToken ? 'present' : 'none'}`);

    // Start LiveKit Realtime Calling Stack
    client
      .startCall({
        callId,
        isInitiator,
        mediaMode: peer.mediaMode || 'audio',
        livekitUrl: peer.livekitUrl,
        livekitToken: peer.livekitToken,
        livekitRoom: peer.livekitRoom,
        onRemoteAudioStream: (stream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play().catch((err) => {
              console.warn('[LIVEKIT] Audio playback notice:', err);
            });
          }
        },
        onRemoteVideoStream: (stream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch((err) => {
              console.warn('[LIVEKIT] Video playback notice:', err);
            });
          }
          setIsPeerCameraOff(false);
        },
        onRemoteVideoUnsubscribed: () => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }
          setIsPeerCameraOff(true);
        },
        onConnectionStateChange: (state) => {
          setConnectionStatus(state);
        },
        onLocalVolume: (vol) => setLocalVolume(vol),
        onRemoteVolume: (vol) => setRemoteVolume(vol),
        onRemoteMuteChange: (muted) => setIsPeerMuted(muted),
        onPeerEndedCall: () => {
          handlePeerHangup();
        },
        onChatMessage: (msg) => {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}_${Math.random()}`,
              sender: msg.sender,
              text: msg.text,
              timestamp: msg.timestamp,
              isSelf: false,
            },
          ]);
          playSound('pop');
          setUnreadCount((c) => (activeTab === 'chat' ? 0 : c + 1));
        },
        onError: (err) => {
          console.warn('[LIVEKIT] Client notice:', err);
        },
      })
      .catch((err) => {
        console.warn('Failed to start LiveKit client:', err);
        setConnectionStatus('ended');
      });

    // Duration timer - increments while in call
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      if (livekitRef.current) {
        livekitRef.current.endCall();
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'chat') {
      setUnreadCount(0);
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, chatMessages]);

  const handleToggleMute = () => {
    if (livekitRef.current) {
      const muted = livekitRef.current.toggleMute();
      setIsMuted(muted);
      playSound('click');
    }
  };

  const handleToggleCamera = async () => {
    if (livekitRef.current) {
      const cameraOn = await livekitRef.current.toggleCamera();
      setIsCameraOn(cameraOn);
      playSound('click');

      if (cameraOn && localVideoRef.current) {
        const stream = livekitRef.current.getFallbackLocalStream();
        if (stream) {
          localVideoRef.current.srcObject = stream;
        }
      }
    }
  };

  const handleSwitchCamera = async () => {
    if (livekitRef.current) {
      await livekitRef.current.switchCamera();
      playSound('click');
      if (localVideoRef.current) {
        const stream = livekitRef.current.getFallbackLocalStream();
        if (stream) {
          localVideoRef.current.srcObject = stream;
        }
      }
    }
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !livekitRef.current) return;

    const senderName = user?.displayName || 'Learner';
    livekitRef.current.sendChatMessage(chatInput.trim(), senderName);

    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_${Math.random()}`,
        sender: senderName,
        text: chatInput.trim(),
        timestamp: Date.now(),
        isSelf: true,
      },
    ]);
    setChatInput('');
  };

  const handlePeerHangup = async () => {
    playSound('end');
    setConnectionStatus('ended');
    setIsCallEnded(true);

    const callSecs = Math.max(duration, 5);
    const xp = Math.min(150, Math.floor(callSecs / 10) * 5 + 40);
    setEarnedXp(xp);

    try {
      if (peer.callId) {
        const res = await api.endCallSession(peer.callId, callSecs);
        if (res.currentStreak !== undefined) {
          setNewStreak(res.currentStreak);
        }
        if (res.user) {
          updateStreakAndXp(res.currentStreak, res.earnedXp, res.user);
        }
      }
    } catch (err) {
      console.warn('Error ending call session:', err);
    }

    try {
      const recordRes = await api.recordCall({
        receiverId: peer.id,
        receiverName: peer.displayName,
        receiverAvatar: peer.avatarUrl,
        receiverLevel: peer.englishLevel as EnglishLevel,
        callType: 'human',
        durationSeconds: callSecs,
        status: 'completed',
        topic: peer.matchedTopic || peer.preferredTopic || 'Daily Life & Routine',
        targetLevel: peer.targetLevel || 'Any',
        country: peer.country || 'Global',
      });
      if (recordRes.currentStreak !== undefined) {
        setNewStreak(recordRes.currentStreak);
      }
      if (recordRes.user) {
        updateStreakAndXp(recordRes.currentStreak, recordRes.earnedXp, recordRes.user);
      }
    } catch (err) {
      console.warn('Failed to record call on server:', err);
    }

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.5 } });
  };

  const handleHangup = async () => {
    playSound('end');
    setConnectionStatus('ended');
    setIsCallEnded(true);

    const callSecs = Math.max(duration, 5);
    const xp = Math.min(150, Math.floor(callSecs / 10) * 5 + 40);
    setEarnedXp(xp);

    if (peer.callId) {
      api
        .endCallSession(peer.callId, callSecs)
        .then((res) => {
          if (res.currentStreak !== undefined) {
            setNewStreak(res.currentStreak);
          }
          if (res.user) {
            updateStreakAndXp(res.currentStreak, res.earnedXp, res.user);
          }
        })
        .catch(console.warn);
    }

    try {
      const recordRes = await api.recordCall({
        receiverId: peer.id,
        receiverName: peer.displayName,
        receiverAvatar: peer.avatarUrl,
        receiverLevel: peer.englishLevel as EnglishLevel,
        callType: 'human',
        durationSeconds: callSecs,
        status: 'completed',
        topic: peer.matchedTopic || peer.preferredTopic || 'Daily Life & Routine',
        targetLevel: peer.targetLevel || 'Any',
        country: peer.country || 'Global',
      });
      if (recordRes.currentStreak !== undefined) {
        setNewStreak(recordRes.currentStreak);
      }
      if (recordRes.user) {
        updateStreakAndXp(recordRes.currentStreak, recordRes.earnedXp, recordRes.user);
      }
    } catch (err) {
      console.warn('Failed to record call on server:', err);
    }

    confetti({ particleCount: 50, spread: 70, origin: { y: 0.55 } });
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Post-Call Completion Summary
  if (isCallEnded) {
    const compliments = ['Great Pronunciation', 'Fluent & Natural', 'Helpful & Friendly', 'Good Vocabulary'];

    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-5 animate-in zoom-in-95 shadow-2xl text-white">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-white">LiveKit Call Completed!</h3>
            <p className="text-xs text-slate-400 mt-1">
              You spoke for <span className="font-bold text-emerald-400">{formatTime(duration)}</span> with {peer.displayName}
            </p>
          </div>

          {/* Streak & XP Dual Badge */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-orange-950/40 border border-orange-500/30 rounded-2xl p-3.5 flex flex-col items-center justify-center">
              <div className="flex items-center gap-1 text-orange-400 text-sm font-bold">
                <Flame className="w-4 h-4 fill-orange-400 text-orange-400 animate-pulse" />
                <span>{newStreak} Days</span>
              </div>
              <span className="text-[11px] text-orange-200/80 mt-0.5 font-medium">Daily Streak Active</span>
            </div>

            <div className="bg-indigo-950/50 border border-indigo-500/30 rounded-2xl p-3.5 flex flex-col items-center justify-center">
              <div className="flex items-center gap-1 text-indigo-300 text-sm font-bold">
                <Award className="w-4 h-4 text-indigo-400" />
                <span>+{earnedXp} XP</span>
              </div>
              <span className="text-[11px] text-indigo-200/80 mt-0.5 font-medium">League Earned</span>
            </div>
          </div>

          {/* Star Rating */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-slate-300">Rate your conversation:</p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => {
                    setRating(star);
                    playSound('pop');
                    confetti({ particleCount: 25, spread: 50, origin: { y: 0.6 } });
                  }}
                  className="p-1 text-amber-400 hover:scale-125 transition-transform"
                >
                  <Star
                    className={`w-7 h-7 ${
                      rating && rating >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-700 hover:text-slate-500'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Compliment Tags */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">Leave a compliment for {peer.displayName}:</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {compliments.map((comp) => (
                <button
                  key={comp}
                  onClick={() => setSelectedTag(selectedTag === comp ? null : comp)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                    selectedTag === comp
                      ? 'bg-indigo-600 border-indigo-500 text-white font-medium shadow-sm'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {comp}
                </button>
              ))}
            </div>
          </div>

          <button
            id="close-human-call-summary-btn"
            onClick={onEndCall}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
          >
            Back to Practice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between p-3 sm:p-6 text-white select-none">
      {/* Hidden audio element for LiveKit remote stream playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Bar Navigation & LiveKit Status */}
      <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto w-full z-20">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-medium backdrop-blur-md">
          <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse shrink-0" />
          <span className="font-semibold text-indigo-300">LiveKit Stack</span>
          <span className="text-slate-600">•</span>
          <span className="text-emerald-400 font-medium">Real-Time HD</span>
        </div>

        {/* Call Navigation Tabs */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-full p-1 text-xs backdrop-blur-md">
          <button
            onClick={() => setActiveTab('call')}
            className={`px-3 py-1 rounded-full transition-all ${
              activeTab === 'call' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isCameraOn || !isPeerCameraOff ? 'Video & Voice' : 'Voice Call'}
          </button>
          <button
            onClick={() => setActiveTab('topics')}
            className={`px-3 py-1 rounded-full flex items-center gap-1 transition-all ${
              activeTab === 'topics' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Topics</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1 rounded-full relative flex items-center gap-1 transition-all ${
              activeTab === 'chat' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
            {unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
          </button>
        </div>

        {/* Live Audio Status Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Live Connected'}</span>
        </div>
      </div>

      {/* Main Screen Body: Tab Views */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full my-2 sm:my-4 overflow-hidden relative">
        {/* CALL VIEW (VOICE & VIDEO) */}
        {activeTab === 'call' && (
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            {/* If video is active (either local or peer has video on) */}
            {(isCameraOn || !isPeerCameraOff) ? (
              <div className="relative w-full h-full max-h-[72vh] rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
                {/* Remote Video Element */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover ${isPeerCameraOff ? 'hidden' : 'block'}`}
                />

                {/* If remote camera is off, show avatar placeholder */}
                {isPeerCameraOff && (
                  <div className="flex flex-col items-center justify-center space-y-4 p-6 text-center">
                    <div className="relative">
                      <div
                        className="absolute inset-0 rounded-full bg-indigo-500/20 pointer-events-none transition-all duration-75"
                        style={{
                          transform: `scale(${1 + Math.min(remoteVolume / 50, 0.4)})`,
                          opacity: remoteVolume > 5 ? 0.8 : 0.2,
                        }}
                      />
                      <img
                        src={peer.avatarUrl}
                        alt={peer.displayName}
                        className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover border-4 border-indigo-500 shadow-2xl ring-4 ring-slate-900"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{peer.displayName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Camera off • Audio connected</p>
                    </div>
                  </div>
                )}

                {/* Top overlay in Video Container: Peer info & Timer */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                  <div className="flex items-center gap-2.5 bg-slate-950/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
                    <span className="font-bold text-sm text-white">{peer.displayName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/80 text-white font-medium">
                      {peer.englishLevel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 font-mono text-sm font-bold text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Local Picture-in-Picture Video Thumbnail */}
                <div className="absolute bottom-4 right-4 z-20 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden bg-slate-950 border-2 border-indigo-500/80 shadow-2xl transition-all">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraOn ? 'block' : 'hidden'}`}
                  />
                  {!isCameraOn && (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-slate-900 text-center">
                      <VideoOff className="w-6 h-6 text-slate-500 mb-1" />
                      <span className="text-[10px] text-slate-400 font-medium">Camera Off</span>
                    </div>
                  )}
                  {isCameraOn && (
                    <button
                      onClick={handleSwitchCamera}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-white/20 shadow-md cursor-pointer"
                      title="Switch Camera (Front/Back)"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="absolute bottom-1.5 left-2 text-[10px] font-bold bg-slate-950/80 px-1.5 py-0.5 rounded text-white/90">
                    You
                  </span>
                </div>
              </div>
            ) : (
              /* PURE VOICE CALL VIEW */
              <div className="flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in zoom-in-95 duration-200 w-full max-w-2xl">
                {/* Dual Audio Visualizer Ring & Peer Avatar */}
                <div className="relative flex items-center justify-center">
                  {/* Partner Audio Glow/Pulsing Rings */}
                  <div
                    className="absolute inset-0 rounded-full bg-indigo-500/20 pointer-events-none transition-all duration-75"
                    style={{
                      transform: `scale(${1 + Math.min(remoteVolume / 50, 0.45)})`,
                      opacity: remoteVolume > 5 ? 0.8 : 0.15,
                    }}
                  />
                  <div
                    className="absolute -inset-4 rounded-full bg-indigo-600/25 blur-xl pointer-events-none transition-all duration-100"
                    style={{
                      transform: `scale(${1 + Math.min(remoteVolume / 40, 0.55)})`,
                    }}
                  />

                  <img
                    src={peer.avatarUrl}
                    alt={peer.displayName}
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-indigo-500 relative z-10 shadow-2xl ring-4 ring-slate-900"
                    referrerPolicy="no-referrer"
                  />

                  {/* Status Badge */}
                  <div className="absolute -bottom-2 z-20 flex items-center gap-1 px-3 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[11px] font-bold shadow-lg">
                    {isPeerMuted ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <MicOff className="w-3 h-3" /> Muted
                      </span>
                    ) : remoteVolume > 10 ? (
                      <span className="text-emerald-400 flex items-center gap-1 animate-pulse">
                        <Volume2 className="w-3 h-3" /> Speaking
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Listening
                      </span>
                    )}
                  </div>
                </div>

                {/* Peer User Name & Level */}
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
                    <span>{peer.displayName}</span>
                  </h2>
                  <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-medium text-slate-400">@{peer.username}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                      {peer.englishLevel}
                    </span>
                    {peer.nativeLanguage && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                          <Globe2 className="w-3 h-3 text-slate-500" /> {peer.nativeLanguage}
                        </span>
                      </>
                    )}
                    {peer.matchedTopic && peer.matchedTopic !== 'Any' && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-400" /> Topic: {peer.matchedTopic}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Live Session Duration */}
                <div className="flex flex-col items-center gap-1">
                  <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-indigo-400">
                    {formatTime(duration)}
                  </div>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                    Live Conversation Time
                  </span>
                </div>

                {/* Dual Live Waveform Audio Meters */}
                <div className="w-full max-w-xs bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 space-y-2">
                  {/* Partner Voice Meter */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Partner:
                    </span>
                    <div className="flex items-center gap-1 h-3 flex-1 max-w-[140px] justify-end">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => {
                        const active = remoteVolume > bar * 11;
                        return (
                          <div
                            key={bar}
                            className={`w-1 rounded-full transition-all duration-75 ${
                              active ? 'bg-indigo-400 h-3' : 'bg-slate-800 h-1'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Your Mic Meter */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5 text-emerald-400" /> You:
                    </span>
                    <div className="flex items-center gap-1 h-3 flex-1 max-w-[140px] justify-end">
                      {isMuted ? (
                        <span className="text-[10px] text-amber-400 font-medium">Muted</span>
                      ) : (
                        [1, 2, 3, 4, 5, 6, 7, 8].map((bar) => {
                          const active = localVolume > bar * 11;
                          return (
                            <div
                              key={bar}
                              className={`w-1 rounded-full transition-all duration-75 ${
                                active ? 'bg-emerald-400 h-3' : 'bg-slate-800 h-1'
                              }`}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Topic Hint Banner */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2.5 max-w-md w-full flex items-center justify-between text-left">
                  <div className="text-xs text-slate-300">
                    <span className="text-indigo-400 font-bold">💡 Conversation Idea: </span>
                    <span>{conversationPrompts[currentPromptIndex].question}</span>
                  </div>
                  <button
                    onClick={() =>
                      setCurrentPromptIndex((prev) => (prev + 1) % conversationPrompts.length)
                    }
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold ml-2 shrink-0 underline cursor-pointer"
                  >
                    Next Idea
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TOPICS SUGGESTIONS TAB */}
        {activeTab === 'topics' && (
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[60vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Conversation Starters & Icebreakers</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono">{formatTime(duration)}</span>
            </div>

            <div className="space-y-3">
              {conversationPrompts.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setCurrentPromptIndex(idx);
                    setActiveTab('call');
                  }}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    currentPromptIndex === idx
                      ? 'bg-indigo-950/60 border-indigo-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                    {p.topic}
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">{p.question}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setActiveTab('call')}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-all"
            >
              Return to Call Screen
            </button>
          </div>
        )}

        {/* IN-CALL CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="w-full max-w-md h-[60vh] bg-slate-900 border border-slate-800 rounded-3xl flex flex-col animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white">In-Call Chat & Vocabulary</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">{formatTime(duration)}</span>
            </div>

            {/* Chat message stream */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-700" />
                  <p>Send words, correct spelling, or chat while talking!</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] text-slate-500 mb-0.5">
                      {msg.isSelf ? 'You' : peer.displayName}
                    </span>
                    <div
                      className={`px-3.5 py-2 rounded-2xl max-w-[80%] leading-relaxed ${
                        msg.isSelf
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendChat} className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a word or message..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 cursor-pointer"
                disabled={!chatInput.trim()}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="max-w-lg mx-auto w-full flex items-center justify-around gap-3 pb-3 z-20">
        {/* Mute Button */}
        <button
          id="toggle-mute-btn"
          onClick={handleToggleMute}
          className={`p-3.5 sm:p-4 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shadow-lg ${
            isMuted
              ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400'
              : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Video Camera Toggle */}
        <button
          id="toggle-camera-btn"
          onClick={handleToggleCamera}
          className={`p-3.5 sm:p-4 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shadow-lg ${
            !isCameraOn
              ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              : 'bg-indigo-600 border border-indigo-500 text-white shadow-indigo-600/30'
          }`}
          title={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {isCameraOn ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* End Call Button */}
        <button
          id="end-human-call-btn"
          onClick={handleHangup}
          className="p-4 sm:p-5 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-xl shadow-red-900/50 transition-all cursor-pointer"
          title="End Call"
        >
          <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>

        {/* Switch Camera Button (Visible when camera is active) */}
        {isCameraOn ? (
          <button
            onClick={handleSwitchCamera}
            className="p-3.5 sm:p-4 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 active:scale-95 cursor-pointer"
            title="Switch Camera (Front/Back)"
          >
            <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        ) : (
          <button
            onClick={() => setActiveTab(activeTab === 'topics' ? 'call' : 'topics')}
            className={`p-3.5 sm:p-4 rounded-full transition-all active:scale-95 cursor-pointer ${
              activeTab === 'topics'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300'
            }`}
            title="Toggle Topic Ideas"
          >
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Chat Drawer Toggle */}
        <button
          onClick={() => setActiveTab(activeTab === 'chat' ? 'call' : 'chat')}
          className={`p-3.5 sm:p-4 rounded-full transition-all active:scale-95 cursor-pointer relative ${
            activeTab === 'chat'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300'
          }`}
          title="Toggle Chat"
        >
          <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400" />
          )}
        </button>
      </div>
    </div>
  );
};
