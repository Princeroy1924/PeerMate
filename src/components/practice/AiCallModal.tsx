import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Sparkles, MessageSquare, Volume2, Send, Bot, RefreshCw } from 'lucide-react';
import { VoiceRecognizer, speakText } from '../../lib/speech';
import { playSound } from '../../lib/audio';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { AiFeedback } from '../../types';

interface AiCallModalProps {
  topic: string;
  tutorName: string;
  tutorAccent: 'us' | 'uk' | 'in';
  onEndCall: (feedback?: AiFeedback, durationSecs?: number) => void;
}

export const AiCallModal: React.FC<AiCallModalProps> = ({
  topic,
  tutorName,
  tutorAccent,
  onEndCall,
}) => {
  const { user, awardXp, updateStreakAndXp } = useAuth();
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [aiState, setAiState] = useState<'speaking' | 'listening' | 'thinking'>('speaking');
  const [currentAiText, setCurrentAiText] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ speaker: string; text: string }>>([]);
  const [isEnding, setIsEnding] = useState(false);

  const recognizerRef = useRef<VoiceRecognizer | null>(null);
  const cancelTtsRef = useRef<(() => void) | null>(null);
  const historyRef = useRef<Array<{ speaker: string; text: string }>>([]);

  useEffect(() => {
    historyRef.current = conversationHistory;
  }, [conversationHistory]);

  // Initial greeting
  useEffect(() => {
    playSound('connect');

    const initialGreeting = `Hello ${user?.displayName || 'there'}! I'm ${tutorName}, your AI English tutor today. We are going to practice talking about "${topic}". How are you doing today?`;

    setCurrentAiText(initialGreeting);
    setConversationHistory([{ speaker: tutorName, text: initialGreeting }]);

    // Speak initial greeting
    setAiState('speaking');
    const cancelTts = speakText(initialGreeting, {
      voiceAccent: tutorAccent,
      rate: 0.95,
      onEnd: () => {
        setAiState('listening');
        startListening();
      },
    });
    cancelTtsRef.current = cancelTts;

    // Timer
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
      if (cancelTtsRef.current) cancelTtsRef.current();
      if (recognizerRef.current) recognizerRef.current.stop();
    };
  }, []);

  const startListening = () => {
    if (isMuted) return;

    if (!recognizerRef.current) {
      recognizerRef.current = new VoiceRecognizer();
    }

    if (recognizerRef.current.isSupported()) {
      recognizerRef.current.start(
        (text, isFinal) => {
          setUserTranscript(text);
          if (isFinal && text.trim().length > 3) {
            handleUserUtterance(text.trim());
          }
        },
        (err) => {
          console.warn('Speech recognizer error:', err);
          setShowManualInput(true);
        }
      );
    } else {
      setShowManualInput(true);
    }
  };

  const stopListening = () => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
    }
  };

  const handleUserUtterance = async (spokenText: string) => {
    if (!spokenText.trim() || isEnding) return;

    stopListening();
    setUserTranscript('');
    setAiState('thinking');

    const updatedHistory = [...historyRef.current, { speaker: 'User', text: spokenText }];
    setConversationHistory(updatedHistory);
    historyRef.current = updatedHistory;

    try {
      // Format messages for server-side Gemini
      const messages = updatedHistory.map((msg) => ({
        role: (msg.speaker === 'User' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: msg.text }],
      }));

      const res = await api.sendAiCallTurn(messages, user?.englishLevel || 'Intermediate', topic);
      const aiReply = res.responseText || "That's very interesting! Can you tell me more about that?";

      const newHistory = [...updatedHistory, { speaker: tutorName, text: aiReply }];
      setConversationHistory(newHistory);
      historyRef.current = newHistory;
      setCurrentAiText(aiReply);

      // Playback AI voice
      setAiState('speaking');
      const cancelTts = speakText(aiReply, {
        voiceAccent: tutorAccent,
        rate: 0.95,
        onEnd: () => {
          setAiState('listening');
          startListening();
        },
      });
      cancelTtsRef.current = cancelTts;
    } catch (err) {
      console.warn('Error during AI turn:', err);
      const fallbackReply = "That's great! What else would you like to share about this?";
      setCurrentAiText(fallbackReply);
      setAiState('listening');
      startListening();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      const text = manualInput.trim();
      setManualInput('');
      handleUserUtterance(text);
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      startListening();
    } else {
      setIsMuted(true);
      stopListening();
    }
  };

  const handleEndCall = async () => {
    setIsEnding(true);
    playSound('end');
    if (cancelTtsRef.current) cancelTtsRef.current();
    if (recognizerRef.current) recognizerRef.current.stop();

    const callSecs = Math.max(duration, 15);
    awardXp(60);

    try {
      // Generate post-call feedback via Gemini
      const res = await api.generateAiFeedback(historyRef.current, callSecs);
      
      // Record call and receive updated streak metadata
      const callRes = await api.recordCall({
        receiverId: `ai_${tutorName.toLowerCase()}`,
        receiverName: `${tutorName} (AI Tutor)`,
        receiverAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
        receiverLevel: 'Advanced',
        callType: 'ai',
        topic: topic || 'General Friendly Conversation',
        country: 'AI Studio',
        durationSeconds: callSecs,
        status: 'completed',
        aiFeedbackId: res.feedback?.id,
      });

      if (callRes && callRes.user) {
        updateStreakAndXp(callRes.currentStreak, callRes.earnedXp, callRes.user);
      }

      onEndCall(res.feedback, callSecs);
    } catch (err) {
      console.warn('Error generating AI feedback:', err);
      onEndCall(undefined, callSecs);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between p-5 sm:p-8 text-white overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-indigo-300">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Practice Topic: {topic}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 text-xs font-mono font-bold">
            {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Center AI Avatar & Animated States */}
      <div className="flex flex-col items-center justify-center my-auto space-y-6 text-center max-w-md mx-auto w-full">
        {/* Animated Tutor Avatar */}
        <div className="relative">
          {aiState === 'speaking' && (
            <div className="absolute -inset-4 rounded-full bg-indigo-500/30 animate-pulse blur-md" />
          )}
          {aiState === 'listening' && (
            <div className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-ping" />
          )}

          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 p-1 relative z-10 shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80"
              alt={tutorName}
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          <span
            className={`absolute bottom-1 right-1 z-20 px-2.5 py-0.5 rounded-full text-[11px] font-bold ring-4 ring-slate-950 flex items-center gap-1 ${
              aiState === 'speaking'
                ? 'bg-indigo-500 text-white animate-pulse'
                : aiState === 'listening'
                ? 'bg-emerald-500 text-white'
                : 'bg-amber-500 text-white'
            }`}
          >
            {aiState === 'speaking' ? 'AI Speaking' : aiState === 'listening' ? 'Listening...' : 'Thinking...'}
          </span>
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{tutorName}</h2>
          <p className="text-xs text-slate-400 mt-0.5">AI English Speaking Coach • {tutorAccent.toUpperCase()} Accent</p>
        </div>

        {/* Live Speaking Caption Bubble */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 text-left shadow-lg space-y-2 max-h-40 overflow-y-auto">
          <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
            <Bot className="w-3.5 h-3.5" />
            <span>AI Tutor:</span>
          </div>
          <p className="text-sm font-medium text-slate-100 leading-relaxed">
            {currentAiText}
          </p>

          {/* User Live Transcript */}
          {userTranscript && (
            <div className="pt-2 border-t border-slate-800 text-emerald-400 text-xs font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>You: "{userTranscript}"</span>
            </div>
          )}
        </div>

        {/* Fallback Text Input if voice recognition unsupported or typing preferred */}
        {showManualInput && (
          <form onSubmit={handleManualSubmit} className="w-full flex items-center gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type your response in English..."
              className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-2xl px-4 py-2.5 text-xs focus:outline-hidden focus:border-indigo-500"
            />
            <button
              type="submit"
              className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="max-w-xs mx-auto w-full flex items-center justify-around gap-4 pb-3">
        {/* Toggle Mute / Mic */}
        <button
          id="ai-mute-toggle-btn"
          onClick={handleToggleMute}
          className={`p-4 rounded-full transition-all duration-200 active:scale-95 ${
            isMuted ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400' : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* End Call Button */}
        <button
          id="end-ai-call-btn"
          onClick={handleEndCall}
          disabled={isEnding}
          className="p-5 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-xl shadow-red-900/40 transition-all flex items-center justify-center"
          title="End AI Call"
        >
          {isEnding ? <RefreshCw className="w-7 h-7 animate-spin" /> : <PhoneOff className="w-7 h-7" />}
        </button>

        {/* Toggle Keyboard Typing */}
        <button
          id="toggle-keyboard-btn"
          onClick={() => setShowManualInput(!showManualInput)}
          className={`p-4 rounded-full transition-all duration-200 active:scale-95 ${
            showManualInput ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
          title="Toggle Text Input"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
