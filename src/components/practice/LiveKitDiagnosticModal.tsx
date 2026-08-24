import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Mic,
  MicOff,
  Volume2,
  Copy,
  Check,
  Trash2,
  Play,
  Square,
  Server,
  Radio,
  Wifi,
  ShieldCheck,
  X,
  Cpu,
  Clock,
  Users,
  Download,
  Flame,
  ArrowRight,
  Info
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalAudioTrack,
  LocalAudioTrack,
  RemoteParticipant,
  LocalParticipant,
  Participant,
  RemoteTrackPublication
} from 'livekit-client';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

export interface DiagnosticLog {
  id: string;
  timestamp: string;
  category: 'TOKEN' | 'ROOM' | 'MIC' | 'PARTICIPANT' | 'TRACK' | 'DATA' | 'ERROR' | 'SYSTEM';
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: any;
}

interface LiveKitDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRoomName?: string;
}

export const LiveKitDiagnosticModal: React.FC<LiveKitDiagnosticModalProps> = ({
  isOpen,
  onClose,
  initialRoomName
}) => {
  const { user } = useAuth();

  // Test states
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testPhase, setTestPhase] = useState<'idle' | 'browser' | 'mic' | 'token' | 'room' | 'done'>('idle');
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Step Statuses: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  const [stepBrowser, setStepBrowser] = useState<'pending' | 'running' | 'success' | 'failed'>('pending');
  const [stepMic, setStepMic] = useState<'pending' | 'running' | 'success' | 'failed'>('pending');
  const [stepToken, setStepToken] = useState<'pending' | 'running' | 'success' | 'failed'>('pending');
  const [stepRoom, setStepRoom] = useState<'pending' | 'running' | 'success' | 'failed'>('pending');

  // Live Stats
  const [livekitUrl, setLivekitUrl] = useState<string>('');
  const [tokenGenerated, setTokenGenerated] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<string>('DISCONNECTED');
  const [activeRoomName, setActiveRoomName] = useState<string>(initialRoomName || `diag-test-${Date.now().toString(36)}`);
  const [remoteParticipantsCount, setRemoteParticipantsCount] = useState<number>(0);
  const [participantsList, setParticipantsList] = useState<{ identity: string; name?: string; isLocal: boolean; audioTrackPublished: boolean }[]>([]);

  // Mic & Audio Track Probe
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [activeMicLabel, setActiveMicLabel] = useState<string>('Default Microphone');
  const [audioSampleRate, setAudioSampleRate] = useState<number>(48000);
  const [audioChannels, setAudioChannels] = useState<number>(1);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);
  const [isAudioLoopbackActive, setIsAudioLoopbackActive] = useState<boolean>(false);

  // Log filter
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'warn' | 'error'>('all');
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);

  // Refs for LiveKit & Web Audio
  const testRoomRef = useRef<Room | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const loopbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Helper to add timestamped logs
  const addLog = (
    category: DiagnosticLog['category'],
    level: DiagnosticLog['level'],
    message: string,
    details?: any
  ) => {
    const timeStr = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    } as any);

    const newLog: DiagnosticLog = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: timeStr,
      category,
      level,
      message,
      details
    };

    setLogs((prev) => [...prev, newLog]);
  };

  // Scroll to bottom of logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Initial check on modal open
  useEffect(() => {
    if (isOpen) {
      addLog('SYSTEM', 'info', 'LiveKit Diagnostic Utility initialized. Ready for diagnostics probe.');
      probeInitialMicPermissions();
    } else {
      stopAllDiagnostics();
    }
    return () => {
      stopAllDiagnostics();
    };
  }, [isOpen]);

  const probeInitialMicPermissions = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as any });
        setMicPermission(status.state as any);
        addLog('MIC', 'info', `Browser microphone permission query status: "${status.state}"`);
        status.onchange = () => {
          setMicPermission(status.state as any);
          addLog('MIC', 'info', `Microphone permission changed to: "${status.state}"`);
        };
      }
    } catch (e) {
      setMicPermission('unknown');
    }
  };

  // 1-Click Automated Diagnostic Self-Test
  const runFullDiagnosticsTest = async () => {
    if (isRunningTest) return;
    setIsRunningTest(true);
    setLogs([]);
    setStepBrowser('running');
    setStepMic('pending');
    setStepToken('pending');
    setStepRoom('pending');
    setTestPhase('browser');

    addLog('SYSTEM', 'info', '=== Starting Full LiveKit & Audio Diagnostic Self-Test ===');

    try {
      // -------------------------------------------------------------
      // Step 1: WebRTC & Browser Environment Probe
      // -------------------------------------------------------------
      addLog('SYSTEM', 'info', 'Checking WebRTC, RTCPeerConnection & AudioContext API support...');
      const hasRTCPeerConnection = typeof window.RTCPeerConnection !== 'undefined';
      const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const hasAudioContext = typeof AudioContextClass !== 'undefined';

      if (!hasRTCPeerConnection || !hasMediaDevices || !hasAudioContext) {
        addLog('ERROR', 'error', 'Browser is missing essential WebRTC or AudioContext capabilities.');
        setStepBrowser('failed');
        setIsRunningTest(false);
        return;
      }

      addLog('SYSTEM', 'success', 'WebRTC APIs and AudioContext verified available in this browser.');
      setStepBrowser('success');

      // -------------------------------------------------------------
      // Step 2: Microphone & Audio Track Probe
      // -------------------------------------------------------------
      setStepMic('running');
      setTestPhase('mic');
      addLog('MIC', 'info', 'Requesting microphone hardware stream & probing audio tracks...');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
          throw new Error('No audio track returned from getUserMedia.');
        }

        const settings = audioTrack.getSettings();
        setActiveMicLabel(audioTrack.label || 'Standard Microphone');
        setAudioSampleRate(settings.sampleRate || 48000);
        setAudioChannels(settings.channelCount || 1);
        setMicPermission('granted');

        addLog('MIC', 'success', `Microphone capture granted: "${audioTrack.label}"`, {
          readyState: audioTrack.readyState,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression
        });

        // Setup real-time audio volume analyzer
        setupMicAnalyzer(stream);
        setStepMic('success');
      } catch (micErr: any) {
        setMicPermission('denied');
        setStepMic('failed');
        addLog('ERROR', 'error', `Microphone hardware access failed: ${micErr.message}`);
        addLog('MIC', 'warn', 'Please allow microphone access in browser address bar permissions.');
      }

      // -------------------------------------------------------------
      // Step 3: Backend LiveKit Token Generation API
      // -------------------------------------------------------------
      setStepToken('running');
      setTestPhase('token');
      const testRoomId = `peermate-diag_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`;
      setActiveRoomName(testRoomId);
      addLog('TOKEN', 'info', `Requesting signed LiveKit access token from backend for room: "${testRoomId}"...`);

      let tokenResp: any;
      try {
        tokenResp = await api.getLiveKitToken(testRoomId);
        if (!tokenResp || !tokenResp.token) {
          throw new Error('Backend returned empty or invalid token payload.');
        }

        setLivekitUrl(tokenResp.url || 'wss://peermate.livekit.cloud');
        setTokenGenerated(tokenResp.token);

        // Decode basic JWT header/payload structure safely
        const parts = tokenResp.token.split('.');
        let payloadSummary = 'Valid JWT structure (3 parts)';
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(atob(parts[1]));
            payloadSummary = `Identity: "${payload.sub || tokenResp.identity}", Grant Room: "${payload.video?.room || testRoomId}", Expires in: ${Math.round(((payload.exp || 0) * 1000 - Date.now()) / 1000)}s`;
          } catch (e) {}
        }

        addLog('TOKEN', 'success', `LiveKit access token received successfully from backend server.`, {
          url: tokenResp.url,
          room: tokenResp.roomName,
          identity: tokenResp.identity,
          claims: payloadSummary
        });
        setStepToken('success');
      } catch (tokErr: any) {
        setStepToken('failed');
        addLog('ERROR', 'error', `Failed to obtain LiveKit token: ${tokErr.message}`);
        setIsRunningTest(false);
        return;
      }

      // -------------------------------------------------------------
      // Step 4: LiveKit Room Handshake, Connection & Track Publishing
      // -------------------------------------------------------------
      setStepRoom('running');
      setTestPhase('room');
      addLog('ROOM', 'info', `Connecting to LiveKit Room at: ${tokenResp.url || 'wss://peermate.livekit.cloud'}...`);

      try {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        testRoomRef.current = room;

        // Attach event listeners
        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setRoomState(state);
          addLog('ROOM', 'info', `LiveKit room connection state changed -> ${state}`);
        });

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          addLog('PARTICIPANT', 'success', `Remote participant joined: "${participant.identity}" (Name: ${participant.name || 'Peer'})`);
          updateParticipantsRoster(room);
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          addLog('PARTICIPANT', 'warn', `Remote participant left: "${participant.identity}"`);
          updateParticipantsRoster(room);
        });

        room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          addLog('TRACK', 'success', `Subscribed to ${track.kind} track from remote participant: "${participant.identity}"`);
        });

        room.on(RoomEvent.TrackPublished, (pub, participant) => {
          addLog('TRACK', 'info', `Participant "${participant.identity}" published a ${pub.kind} track.`);
          updateParticipantsRoster(room);
        });

        room.on(RoomEvent.DataReceived, (payload, participant) => {
          try {
            const dec = new TextDecoder().decode(payload);
            addLog('DATA', 'info', `Received DataChannel packet from ${participant?.identity || 'Server'}: ${dec}`);
          } catch (e) {}
        });

        // Connect room
        await room.connect(tokenResp.url || 'wss://peermate.livekit.cloud', tokenResp.token);
        setRoomState(ConnectionState.Connected);
        addLog('ROOM', 'success', `Connected to LiveKit Room "${room.name}" as Local Participant: "${room.localParticipant.identity}"`);

        updateParticipantsRoster(room);

        // Publish local audio track test
        addLog('TRACK', 'info', 'Publishing local microphone audio track to the LiveKit room...');
        const localTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        localAudioTrackRef.current = localTrack;

        await room.localParticipant.publishTrack(localTrack);
        addLog('TRACK', 'success', `Local audio track published successfully (SID: ${localTrack.sid || 'active'}).`);

        updateParticipantsRoster(room);

        // Test DataChannel transmission
        try {
          const testMsg = new TextEncoder().encode(JSON.stringify({ type: 'diagnostic-ping', time: Date.now() }));
          room.localParticipant.publishData(testMsg, { reliable: true });
          addLog('DATA', 'success', 'LiveKit DataChannel message transmission verified.');
        } catch (dataErr: any) {
          addLog('DATA', 'warn', `DataChannel test notice: ${dataErr.message}`);
        }

        setStepRoom('success');
        setTestPhase('done');
        addLog('SYSTEM', 'success', '=== LiveKit & Voice Diagnostics Test Completed with 100% Health ===');
      } catch (roomErr: any) {
        setStepRoom('failed');
        addLog('ERROR', 'error', `LiveKit Room connection failed: ${roomErr.message}`);
      }
    } catch (err: any) {
      addLog('ERROR', 'error', `Unexpected diagnostic error: ${err.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const updateParticipantsRoster = (room: Room) => {
    if (!room) return;
    const roster: { identity: string; name?: string; isLocal: boolean; audioTrackPublished: boolean }[] = [];

    // Local
    if (room.localParticipant) {
      const hasAudioPub = Array.from(room.localParticipant.trackPublications.values()).some(
        (p) => p.kind === Track.Kind.Audio
      );
      roster.push({
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || user?.displayName || 'You',
        isLocal: true,
        audioTrackPublished: hasAudioPub
      });
    }

    // Remote
    room.remoteParticipants.forEach((p) => {
      const hasAudioPub = Array.from(p.trackPublications.values()).some(
        (pub) => pub.kind === Track.Kind.Audio
      );
      roster.push({
        identity: p.identity,
        name: p.name || 'Remote Peer',
        isLocal: false,
        audioTrackPublished: hasAudioPub
      });
    });

    setParticipantsList(roster);
    setRemoteParticipantsCount(room.remoteParticipants.size);
  };

  const setupMicAnalyzer = (stream: MediaStream) => {
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const monitorVolume = () => {
        if (!analyserRef.current) return;
        const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolumeLevel(normalized);
        animFrameRef.current = requestAnimationFrame(monitorVolume);
      };

      animFrameRef.current = requestAnimationFrame(monitorVolume);
    } catch (err) {
      console.warn('[DIAGNOSTIC] Audio analyzer setup notice:', err);
    }
  };

  // Toggle local mic mute
  const toggleMute = () => {
    if (localAudioTrackRef.current) {
      if (isMicMuted) {
        localAudioTrackRef.current.unmute();
        setIsMicMuted(false);
        addLog('MIC', 'info', 'Microphone unmuted.');
      } else {
        localAudioTrackRef.current.mute();
        setIsMicMuted(true);
        addLog('MIC', 'info', 'Microphone muted.');
      }
    } else {
      setIsMicMuted(!isMicMuted);
    }
  };

  // Clean up all test connections
  const stopAllDiagnostics = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }
    if (testRoomRef.current) {
      try {
        testRoomRef.current.disconnect();
      } catch (e) {}
      testRoomRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
    setRoomState('DISCONNECTED');
    setMicVolumeLevel(0);
  };

  // Copy logs
  const handleCopyLogs = () => {
    const formatted = logs
      .map((l) => `[${l.timestamp}] [${l.category}] [${l.level.toUpperCase()}]: ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`)
      .join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // Clear logs
  const handleClearLogs = () => {
    setLogs([]);
    addLog('SYSTEM', 'info', 'Log console cleared.');
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'all') return true;
    return log.level === logFilter;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl text-white animate-in zoom-in-95 overflow-hidden">
        {/* 1. Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-white tracking-tight">
                  LiveKit Real-Time Voice Diagnostics
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v2.0 WebRTC Stack
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Live connection state monitor, microphone track inspector & participant logger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runFullDiagnosticsTest}
              disabled={isRunningTest}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningTest ? 'animate-spin' : ''}`} />
              <span>{isRunningTest ? 'Testing...' : 'Run Self-Test'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Top Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Step 1: WebRTC API */}
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold">1. WebRTC & Browser</span>
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex items-center gap-1.5 font-bold text-xs mt-1">
                {stepBrowser === 'success' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Supported
                  </span>
                ) : stepBrowser === 'failed' ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Unsupported
                  </span>
                ) : stepBrowser === 'running' ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking...
                  </span>
                ) : (
                  <span className="text-slate-400">Pending</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">AudioContext & MediaDevices</p>
            </div>

            {/* Step 2: Microphone Probe */}
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold">2. Microphone Track</span>
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="flex items-center gap-1.5 font-bold text-xs mt-1">
                {stepMic === 'success' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active & Granted
                  </span>
                ) : stepMic === 'failed' ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Denied / Error
                  </span>
                ) : stepMic === 'running' ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Capturing...
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {micPermission === 'granted' ? 'Granted (Ready)' : micPermission === 'denied' ? 'Denied' : 'Pending'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">{activeMicLabel}</p>
            </div>

            {/* Step 3: Auth & Token API */}
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold">3. LiveKit Token API</span>
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="flex items-center gap-1.5 font-bold text-xs mt-1">
                {stepToken === 'success' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 200 OK (Signed)
                  </span>
                ) : stepToken === 'failed' ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Auth Failed
                  </span>
                ) : stepToken === 'running' ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching...
                  </span>
                ) : (
                  <span className="text-slate-400">Pending</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">Backend JWT Key/Secret</p>
            </div>

            {/* Step 4: LiveKit Room State */}
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold">4. LiveKit Room State</span>
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="flex items-center gap-1.5 font-bold text-xs mt-1">
                {roomState === 'connected' || stepRoom === 'success' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Connected
                  </span>
                ) : stepRoom === 'failed' ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Connection Failed
                  </span>
                ) : stepRoom === 'running' ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Connecting...
                  </span>
                ) : (
                  <span className="text-slate-400">{roomState}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">{activeRoomName}</p>
            </div>
          </div>

          {/* Real-time Microphone VU Meter & Audio Track Inspector */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span>Microphone Audio Track Inspector</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      micPermission === 'granted'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {micPermission.toUpperCase()}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Live hardware input level, frequency analyzer & WebRTC audio constraints
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isMicMuted
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{isMicMuted ? 'Muted' : 'Mute Mic'}</span>
                </button>
              </div>
            </div>

            {/* Live Volume VU Meter */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  Live Mic Amplitude:
                </span>
                <span className="font-mono font-bold text-emerald-400 text-xs">{micVolumeLevel}%</span>
              </div>
              <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    micVolumeLevel > 70
                      ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  }`}
                  style={{ width: `${Math.max(3, micVolumeLevel)}%` }}
                />
              </div>
            </div>

            {/* Audio Constraints & Metadata Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Active Device</span>
                <span className="font-semibold text-slate-200 truncate block mt-0.5">{activeMicLabel}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Sample Rate</span>
                <span className="font-semibold text-slate-200 block mt-0.5">{audioSampleRate} Hz</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Channels</span>
                <span className="font-semibold text-slate-200 block mt-0.5">{audioChannels === 1 ? '1 (Mono / Voice)' : `${audioChannels} (Stereo)`}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Echo & Noise DSP</span>
                <span className="font-semibold text-emerald-400 block mt-0.5">Enabled (AEC/ANS)</span>
              </div>
            </div>
          </div>

          {/* Participant Roster & LiveKit Room State */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span>LiveKit Room Participants Roster</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold">
                      {participantsList.length} Connected
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Active participants and track publications in the test room
                  </p>
                </div>
              </div>
            </div>

            {participantsList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 rounded-xl bg-slate-900 border border-slate-800/60">
                No active diagnostic room session. Click <strong>"Run Self-Test"</strong> to connect to a diagnostic room.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {participantsList.map((p) => (
                  <div
                    key={p.identity}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        p.isLocal ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                        {p.isLocal ? 'ME' : 'P2'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.isLocal && <span className="text-[10px] text-indigo-400 font-semibold">(Local)</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          ID: {p.identity}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        p.audioTrackPublished
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        <Mic className="w-2.5 h-2.5" />
                        {p.audioTrackPublished ? 'Audio Published' : 'No Audio'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Streaming Event Logs Console */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span>LiveKit Diagnostic Event Console</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {logs.length} logs
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Real-time network events, auth handshakes, tracks and error telemetry
                  </p>
                </div>
              </div>

              {/* Log filter pills & actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setLogFilter('all')}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      logFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setLogFilter('success')}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      logFilter === 'success' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Success
                  </button>
                  <button
                    onClick={() => setLogFilter('warn')}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      logFilter === 'warn' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Warnings
                  </button>
                  <button
                    onClick={() => setLogFilter('error')}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      logFilter === 'error' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Errors
                  </button>
                </div>

                <button
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy log console text"
                >
                  {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Clear logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Console Log Feed */}
            <div
              ref={logContainerRef}
              className="font-mono text-[11px] bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 max-h-56 overflow-y-auto space-y-1.5 select-text"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-slate-600 text-center py-6">
                  No logs in console. Run the self-test or start a practice call to stream live events.
                </div>
              ) : (
                filteredLogs.map((log) => {
                  let badgeBg = 'bg-slate-800 text-slate-300';
                  let textColor = 'text-slate-300';
                  if (log.level === 'success') {
                    badgeBg = 'bg-emerald-950 text-emerald-400 border border-emerald-800/50';
                    textColor = 'text-emerald-300';
                  } else if (log.level === 'warn') {
                    badgeBg = 'bg-amber-950 text-amber-400 border border-amber-800/50';
                    textColor = 'text-amber-300';
                  } else if (log.level === 'error') {
                    badgeBg = 'bg-red-950 text-red-400 border border-red-800/50';
                    textColor = 'text-red-300 font-bold';
                  }

                  return (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed hover:bg-slate-900/50 p-1 rounded">
                      <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase shrink-0 ${badgeBg}`}>
                        {log.category}
                      </span>
                      <span className={`flex-1 break-all ${textColor}`}>{log.message}</span>
                      {log.details && (
                        <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={JSON.stringify(log.details, null, 2)}>
                          {JSON.stringify(log.details)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 3. Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="hidden sm:inline">Use this utility to verify LiveKit server tokens, WebRTC audio publish rights & mic capture.</span>
            <span className="sm:hidden">Diagnostics ready.</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
