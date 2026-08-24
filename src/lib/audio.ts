// Audio synthesizer for UI sound effects, incoming ringtones, and microphone visualizer

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playSound(type: 'ring' | 'connect' | 'end' | 'success' | 'click' | 'pop' | 'warning') {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === 'warning') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.setValueAtTime(220, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'connect') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'end') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'success') {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.15, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.25);
      });
    } else if (type === 'ring') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0.1, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.9);
      osc2.stop(now + 0.9);
    }
  } catch (err) {
    console.warn('Audio playback not permitted yet:', err);
  }
}

export function createMicAnalyser(stream: MediaStream): {
  analyser: AnalyserNode;
  cleanup: () => void;
  getVolume: () => number;
} {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  const getVolume = () => {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length; // 0 to 255
  };

  const cleanup = () => {
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {}
  };

  return { analyser, cleanup, getVolume };
}
