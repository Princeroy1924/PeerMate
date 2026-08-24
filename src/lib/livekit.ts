// PeerMate LiveKit Real-Time 1-to-1 Voice & Video Calling Client
// Powered by LiveKit Client SDK for high-fidelity WebRTC audio/video communications

import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  LocalParticipant,
  Participant,
  ConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
} from 'livekit-client';

export interface LiveKitCallOptions {
  callId: string;
  isInitiator: boolean;
  mediaMode: 'audio' | 'video';
  livekitUrl?: string;
  livekitToken?: string;
  livekitRoom?: string;
  onRemoteAudioStream?: (stream: MediaStream) => void;
  onRemoteVideoStream?: (stream: MediaStream) => void;
  onRemoteVideoUnsubscribed?: () => void;
  onConnectionStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'ended') => void;
  onLocalVolume?: (level: number) => void;
  onRemoteVolume?: (level: number) => void;
  onRemoteMuteChange?: (isMuted: boolean) => void;
  onPeerEndedCall?: () => void;
  onChatMessage?: (msg: { text: string; sender: string; timestamp: number }) => void;
  onError?: (error: Error) => void;
}

export class LiveKitCallClient {
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private localVideoTrack: LocalVideoTrack | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private isMuted: boolean = false;
  private isCameraOn: boolean = false;
  private isDestroyed: boolean = false;
  private facingMode: 'user' | 'environment' = 'user';
  private options: LiveKitCallOptions | null = null;

  // Web Audio Analysers for Voice Waveforms & Volume
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;
  private localAudioSource: MediaStreamAudioSourceNode | null = null;
  private remoteAudioSource: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;

  public async startCall(options: LiveKitCallOptions): Promise<void> {
    this.options = options;
    this.isDestroyed = false;
    this.isMuted = false;
    this.isCameraOn = options.mediaMode === 'video';

    console.log(
      `[MATCHMAKING] Initializing call session: Call ID=${options.callId}, Room=${options.livekitRoom}`
    );

    // Create and configure HTMLAudioElement for remote audio playback
    this.remoteAudioElement = document.createElement('audio');
    this.remoteAudioElement.autoplay = true;
    this.remoteAudioElement.setAttribute('playsinline', 'true');
    this.remoteAudioElement.style.display = 'none';
    document.body.appendChild(this.remoteAudioElement);

    // Initialize Web Audio Context for visualizer and volume meters
    this.setupAudioContext();

    const livekitUrl =
      options.livekitUrl ||
      (window as any).__PEERMATE_CONFIG__?.livekitUrl ||
      'wss://peermate.livekit.cloud';
    const livekitToken = options.livekitToken || '';

    if (!livekitToken) {
      const err = new Error('LiveKit access token was not provided.');
      console.error('[LIVEKIT] Connection aborted:', err.message);
      this.options?.onError?.(err);
      this.options?.onConnectionStateChange?.('ended');
      return;
    }

    await this.connectToLiveKitRoom(livekitUrl, livekitToken);
  }

  private setupAudioContext() {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      this.localAnalyser = this.audioCtx.createAnalyser();
      this.localAnalyser.fftSize = 64;
      this.remoteAnalyser = this.audioCtx.createAnalyser();
      this.remoteAnalyser.fftSize = 64;
      this.startVolumeMonitoring();
    } catch (err) {
      console.warn('[LIVEKIT] Audio analyzer setup notice:', err);
    }
  }

  private async connectToLiveKitRoom(url: string, token: string) {
    try {
      console.log(
        `[LIVEKIT CONNECTING] Connecting to LiveKit room: ${this.options?.livekitRoom || 'unknown'} at ${url}`
      );
      this.options?.onConnectionStateChange?.('connecting');

      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: {
          dtx: true,
        },
      });

      // 1. ParticipantConnected listener
      this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log(
          `[REMOTE PARTICIPANT] Connected: Identity=${participant.identity}, Name=${participant.name || 'Peer'}`
        );
        this.options?.onConnectionStateChange?.('connected');
      });

      // 2. TrackSubscribed listener
      this.room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            console.log(
              `[AUDIO TRACK SUBSCRIBED] Remote audio track received from ${participant.identity}`
            );

            // Attach track to HTMLAudioElement for playback
            if (this.remoteAudioElement) {
              track.attach(this.remoteAudioElement);
              this.remoteAudioElement.play().catch((playErr) => {
                console.warn('[LIVEKIT] Remote audio autoplay notice:', playErr);
              });
            }

            // Ensure browser audio playback context is unlocked
            this.room?.startAudio().catch(() => {});

            // Connect track to Web Audio Analyser for waveforms
            const mediaStreamTrack = track.mediaStreamTrack;
            if (mediaStreamTrack) {
              const stream = new MediaStream([mediaStreamTrack]);
              this.setupRemoteAudioStream(stream);
              this.options?.onRemoteAudioStream?.(stream);
            }
          } else if (track.kind === Track.Kind.Video) {
            console.log(
              `[VIDEO TRACK SUBSCRIBED] Remote video track received from ${participant.identity}`
            );
            const mediaStreamTrack = track.mediaStreamTrack;
            if (mediaStreamTrack) {
              const stream = new MediaStream([mediaStreamTrack]);
              this.options?.onRemoteVideoStream?.(stream);
            }
          }
        }
      );

      // 3. TrackUnsubscribed listener
      this.room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          console.log(
            `[TRACK UNSUBSCRIBED] Track unsubscribed for participant ${participant.identity}`
          );
          if (track.kind === Track.Kind.Audio && this.remoteAudioElement) {
            track.detach(this.remoteAudioElement);
          } else if (track.kind === Track.Kind.Video) {
            this.options?.onRemoteVideoUnsubscribed?.();
          }
        }
      );

      // 4. TrackMuted / TrackUnmuted listeners
      this.room.on(
        RoomEvent.TrackMuted,
        (publication: RemoteTrackPublication, participant: Participant) => {
          if (participant instanceof RemoteParticipant && publication.kind === Track.Kind.Audio) {
            this.options?.onRemoteMuteChange?.(true);
          }
        }
      );

      this.room.on(
        RoomEvent.TrackUnmuted,
        (publication: RemoteTrackPublication, participant: Participant) => {
          if (participant instanceof RemoteParticipant && publication.kind === Track.Kind.Audio) {
            this.options?.onRemoteMuteChange?.(false);
          }
        }
      );

      // 5. ParticipantDisconnected listener
      this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log(`[REMOTE PARTICIPANT] Disconnected: ${participant.identity}`);
        this.options?.onPeerEndedCall?.();
      });

      // 6. ConnectionStateChanged listener
      this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log(`[LIVEKIT] Connection state changed: ${state}`);
        if (state === ConnectionState.Connected) {
          this.options?.onConnectionStateChange?.('connected');
        } else if (state === ConnectionState.Connecting) {
          this.options?.onConnectionStateChange?.('connecting');
        } else if (state === ConnectionState.Reconnecting) {
          this.options?.onConnectionStateChange?.('reconnecting');
        } else if (state === ConnectionState.Disconnected) {
          this.options?.onConnectionStateChange?.('ended');
        }
      });

      // 7. ActiveSpeakersChanged listener
      this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const isRemoteSpeaking = speakers.some((s) => s instanceof RemoteParticipant);
        if (isRemoteSpeaking) {
          this.options?.onRemoteVolume?.(80);
        }
      });

      // 8. DataReceived listener (for in-call text chat & mute indicators)
      this.room.on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, participant?: RemoteParticipant) => {
          try {
            const decoder = new TextDecoder();
            const jsonStr = decoder.decode(payload);
            const data = JSON.parse(jsonStr);

            if (data.type === 'chat') {
              this.options?.onChatMessage?.({
                text: data.text,
                sender: data.sender || participant?.name || 'Partner',
                timestamp: data.timestamp || Date.now(),
              });
            } else if (data.type === 'mute-state') {
              this.options?.onRemoteMuteChange?.(!!data.isMuted);
            }
          } catch (err) {
            console.warn('[LIVEKIT] Error parsing data message:', err);
          }
        }
      );

      // 9. Disconnected listener
      this.room.on(RoomEvent.Disconnected, () => {
        console.log(`[CALL ENDED] LiveKit room disconnected.`);
        this.options?.onConnectionStateChange?.('ended');
      });

      // Connect to LiveKit Room
      await this.room.connect(url, token);
      console.log(
        `[LIVEKIT CONNECTED] Connected to room: ${this.room.name}, local participant: ${this.room.localParticipant.identity}`
      );

      // Try unlocking audio playback
      await this.room.startAudio().catch(() => {});

      // Automatically create and publish local microphone
      try {
        this.localAudioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });

        await this.room.localParticipant.publishTrack(this.localAudioTrack);
        console.log(`[AUDIO TRACK PUBLISHED] Published local microphone track.`);

        // Route local audio to visualizer analyser
        if (this.audioCtx && this.localAnalyser && this.localAudioTrack.mediaStreamTrack) {
          try {
            const localStream = new MediaStream([this.localAudioTrack.mediaStreamTrack]);
            this.localAudioSource = this.audioCtx.createMediaStreamSource(localStream);
            this.localAudioSource.connect(this.localAnalyser);
          } catch (e) {
            console.warn('[LIVEKIT] Local audio analyser notice:', e);
          }
        }
      } catch (micErr: any) {
        console.warn('[LIVEKIT] Could not publish local mic:', micErr);
        // Continue call even if local mic failed, but notify error
        this.options?.onError?.(
          new Error(
            'Microphone access was denied or unavailable. You may listen, but speaking requires mic permissions.'
          )
        );
      }

      // Check if remote participants are already in the room with published tracks
      this.checkExistingParticipants();

      // If mediaMode was set to video initially, publish camera
      if (this.options?.mediaMode === 'video') {
        await this.enableCamera();
      }

      this.options?.onConnectionStateChange?.('connected');
    } catch (err: any) {
      console.error('[LIVEKIT ERROR] Failed connecting to LiveKit room:', err);
      this.options?.onError?.(err);
      this.options?.onConnectionStateChange?.('ended');
    }
  }

  private checkExistingParticipants() {
    if (!this.room) return;

    this.room.remoteParticipants.forEach((participant) => {
      console.log(`[EXISTING PARTICIPANT] Found in room: ${participant.identity}`);
      participant.trackPublications.forEach((pub) => {
        if (pub.isSubscribed && pub.track) {
          if (pub.track.kind === Track.Kind.Audio) {
            if (this.remoteAudioElement) {
              pub.track.attach(this.remoteAudioElement);
              this.remoteAudioElement.play().catch(() => {});
            }
            if (pub.track.mediaStreamTrack) {
              const stream = new MediaStream([pub.track.mediaStreamTrack]);
              this.setupRemoteAudioStream(stream);
              this.options?.onRemoteAudioStream?.(stream);
            }
          } else if (pub.track.kind === Track.Kind.Video) {
            if (pub.track.mediaStreamTrack) {
              const stream = new MediaStream([pub.track.mediaStreamTrack]);
              this.options?.onRemoteVideoStream?.(stream);
            }
          }
        }
      });
    });
  }

  private setupRemoteAudioStream(stream: MediaStream) {
    if (this.audioCtx && this.remoteAnalyser) {
      try {
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
        if (this.remoteAudioSource) {
          this.remoteAudioSource.disconnect();
        }
        this.remoteAudioSource = this.audioCtx.createMediaStreamSource(stream);
        this.remoteAudioSource.connect(this.remoteAnalyser);
      } catch (e) {
        console.warn('[LIVEKIT] Analyser routing notice:', e);
      }
    }
  }

  // Volume Monitoring Loop for visual waveform amplitude
  private startVolumeMonitoring() {
    const checkVolume = () => {
      if (this.isDestroyed) return;

      // Local Volume
      if (this.localAnalyser && !this.isMuted) {
        const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        this.options?.onLocalVolume?.(normalized);
      } else {
        this.options?.onLocalVolume?.(0);
      }

      // Remote Volume
      if (this.remoteAnalyser) {
        const dataArray = new Uint8Array(this.remoteAnalyser.frequencyBinCount);
        this.remoteAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        this.options?.onRemoteVolume?.(normalized);
      }

      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    this.animFrameId = requestAnimationFrame(checkVolume);
  }

  // Toggle Microphone Mute
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.localAudioTrack) {
      if (this.isMuted) {
        this.localAudioTrack.mute();
      } else {
        this.localAudioTrack.unmute();
      }
    }
    if (this.room) {
      this.sendData({ type: 'mute-state', isMuted: this.isMuted });
    }
    return this.isMuted;
  }

  // Camera Toggle
  public async toggleCamera(): Promise<boolean> {
    if (this.isCameraOn) {
      await this.disableCamera();
      return false;
    } else {
      const success = await this.enableCamera();
      return success;
    }
  }

  private async enableCamera(): Promise<boolean> {
    try {
      if (this.localVideoTrack) {
        this.localVideoTrack.stop();
        this.localVideoTrack = null;
      }

      this.localVideoTrack = await createLocalVideoTrack({
        facingMode: this.facingMode,
        resolution: {
          width: 640,
          height: 480,
          frameRate: 24,
        },
      });

      if (this.room) {
        await this.room.localParticipant.publishTrack(this.localVideoTrack);
      }
      this.isCameraOn = true;
      return true;
    } catch (err) {
      console.warn('[LIVEKIT] Enable camera error:', err);
      this.isCameraOn = false;
      return false;
    }
  }

  private async disableCamera() {
    if (this.localVideoTrack) {
      if (this.room) {
        try {
          await this.room.localParticipant.unpublishTrack(this.localVideoTrack);
        } catch (e) {}
      }
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }
    this.isCameraOn = false;
  }

  public async switchCamera(): Promise<void> {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.isCameraOn) {
      await this.enableCamera();
    }
  }

  public getFallbackLocalStream(): MediaStream | null {
    if (this.localVideoTrack && this.localVideoTrack.mediaStreamTrack) {
      return new MediaStream([this.localVideoTrack.mediaStreamTrack]);
    }
    if (this.localAudioTrack && this.localAudioTrack.mediaStreamTrack) {
      return new MediaStream([this.localAudioTrack.mediaStreamTrack]);
    }
    return null;
  }

  // Send In-Call Chat / State over LiveKit Data Channel
  public sendData(data: any): boolean {
    if (!this.room || this.room.state !== ConnectionState.Connected) return false;
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(data));
      this.room.localParticipant.publishData(payload, { reliable: true });
      return true;
    } catch (err) {
      console.warn('[LIVEKIT] Error sending data message:', err);
      return false;
    }
  }

  public sendChatMessage(text: string, senderName: string) {
    return this.sendData({
      type: 'chat',
      text,
      sender: senderName,
      timestamp: Date.now(),
    });
  }

  // End Call and Full Cleanup
  public endCall() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    console.log(`[CALL ENDED] Ending LiveKit call session and cleaning up.`);

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }

    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }

    if (this.room) {
      try {
        this.room.disconnect();
      } catch (e) {
        console.warn('[LIVEKIT] Room disconnect notice:', e);
      }
      this.room = null;
    }

    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
        if (this.remoteAudioElement.parentNode) {
          this.remoteAudioElement.parentNode.removeChild(this.remoteAudioElement);
        }
      } catch (e) {}
      this.remoteAudioElement = null;
    }

    if (this.localAudioSource) {
      try {
        this.localAudioSource.disconnect();
      } catch (e) {}
      this.localAudioSource = null;
    }

    if (this.remoteAudioSource) {
      try {
        this.remoteAudioSource.disconnect();
      } catch (e) {}
      this.remoteAudioSource = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
    }
  }
}
