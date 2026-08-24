// Speech Recognition (STT) and Speech Synthesis (TTS) utilities

// Type declarations for browser SpeechRecognition
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResultItem[];
  [index: number]: {
    0: SpeechRecognitionResultItem;
    isFinal: boolean;
  };
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export class VoiceRecognizer {
  private recognition: SpeechRecognitionInstance | null = null;
  private isListening = false;
  private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    const RecognitionClass = getSpeechRecognition();
    if (RecognitionClass) {
      try {
        this.recognition = new RecognitionClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              finalTranscript += res[0].transcript;
            } else {
              interimTranscript += res[0].transcript;
            }
          }

          if (finalTranscript && this.onResultCallback) {
            this.onResultCallback(finalTranscript.trim(), true);
          } else if (interimTranscript && this.onResultCallback) {
            this.onResultCallback(interimTranscript.trim(), false);
          }
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.warn('Speech recognition error:', event.error);
          if (this.onErrorCallback) {
            this.onErrorCallback(event.error);
          }
        };

        this.recognition.onend = () => {
          this.isListening = false;
          if (this.onEndCallback) {
            this.onEndCallback();
          }
        };
      } catch (err) {
        console.warn('SpeechRecognition initialization error:', err);
      }
    }
  }

  public isSupported(): boolean {
    return !!this.recognition;
  }

  public start(
    onResult: (text: string, isFinal: boolean) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ) {
    if (!this.recognition) {
      onError?.('Speech recognition is not supported in this browser.');
      return;
    }
    this.onResultCallback = onResult;
    this.onErrorCallback = onError || null;
    this.onEndCallback = onEnd || null;

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (err) {
      console.warn('Could not start speech recognition:', err);
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
    }
  }

  public abort() {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.isListening = false;
    }
  }
}

// Text to Speech
export function speakText(
  text: string, 
  options?: {
    voiceAccent?: 'us' | 'uk' | 'in';
    rate?: number;
    pitch?: number;
    onStart?: () => void;
    onEnd?: () => void;
  }
): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onEnd?.();
    return () => {};
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options?.rate || 1.0;
  utterance.pitch = options?.pitch || 1.0;

  const voices = window.speechSynthesis.getVoices();
  let selectedVoice = voices.find(v => {
    if (options?.voiceAccent === 'uk') return v.lang.includes('en-GB') || v.name.includes('UK');
    if (options?.voiceAccent === 'in') return v.lang.includes('en-IN') || v.name.includes('India');
    return v.lang.includes('en-US') || v.name.includes('US') || v.lang.startsWith('en');
  });

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => options?.onStart?.();
  utterance.onend = () => options?.onEnd?.();
  utterance.onerror = () => options?.onEnd?.();

  window.speechSynthesis.speak(utterance);

  return () => {
    window.speechSynthesis.cancel();
  };
}
