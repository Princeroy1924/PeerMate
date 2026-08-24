import React from 'react';
import { Award, CheckCircle, Volume2, ArrowRight, Sparkles, BookOpen, Crown } from 'lucide-react';
import { AiFeedback } from '../../types';
import { speakText } from '../../lib/speech';
import { playSound } from '../../lib/audio';
import { useAuth } from '../../context/AuthContext';

interface AiFeedbackModalProps {
  feedback: AiFeedback;
  durationSeconds: number;
  onClose: () => void;
}

export const AiFeedbackModal: React.FC<AiFeedbackModalProps> = ({ feedback, durationSeconds, onClose }) => {
  const { user, setIsPricingModalOpen } = useAuth();
  const isPro = user?.plan === 'pro';

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}m ${remaining}s`;
  };

  const handlePronounceWord = (word: string) => {
    playSound('click');
    speakText(word, { rate: 0.9 });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full my-auto space-y-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-bold">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900 leading-tight">AI Speaking Evaluation</h3>
              <p className="text-xs text-slate-500">Practice Session: {formatDuration(durationSeconds)}</p>
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
            Score: {feedback.overallScore}/100
          </div>
        </div>

        {/* Overall Score Circle & Comment */}
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50/50 p-4 sm:p-5 rounded-2xl border border-indigo-100 space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-md border-4 border-indigo-500 shrink-0">
              <span className="text-xl font-black text-indigo-600">{feedback.overallScore}</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">Overall Performance</h4>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed font-medium">
                {feedback.generalComment}
              </p>
            </div>
          </div>

          {/* Sub-skill Bars */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-200/50">
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-0.5">
                <span>Grammar</span>
                <span>{feedback.grammarScore}%</span>
              </div>
              <div className="w-full bg-white rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${feedback.grammarScore}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-0.5">
                <span>Fluency</span>
                <span>{feedback.fluencyScore}%</span>
              </div>
              <div className="w-full bg-white rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${feedback.fluencyScore}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-0.5">
                <span>Vocabulary</span>
                <span>{feedback.vocabularyScore}%</span>
              </div>
              <div className="w-full bg-white rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${feedback.vocabularyScore}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-0.5">
                <span>Pronunciation</span>
                <span>{feedback.pronunciationScore}%</span>
              </div>
              <div className="w-full bg-white rounded-full h-2 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${feedback.pronunciationScore}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* 1. MISTAKES & BETTER WAYS */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-800">
            <span>🎯</span>
            <span>Mistakes & Natural Corrections</span>
          </div>

          <div className="space-y-2.5">
            {feedback.mistakes.map((m, idx) => (
              <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">You said</span>
                  <p className="text-slate-700 line-through font-medium">{m.original}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">Better way</span>
                  <p className="text-emerald-900 font-bold">{m.correction}</p>
                </div>
                <p className="text-[11px] text-slate-500 italic pt-0.5 font-sans">
                  💡 {m.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 2. NEW VOCABULARY LEARNED */}
        {feedback.newVocabulary && feedback.newVocabulary.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-800">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Vocabulary Introduced in Call</span>
            </div>

            <div className="space-y-2">
              {feedback.newVocabulary.map((v, i) => (
                <div key={i} className="p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-xs text-indigo-900">{v.word}</h5>
                      <span className="text-[11px] text-slate-600 font-medium">• {v.meaning}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 italic mt-0.5">"{v.example}"</p>
                  </div>
                  <button
                    onClick={() => handlePronounceWord(v.word)}
                    className="p-1.5 rounded-xl bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors shrink-0 shadow-xs"
                    title="Pronounce"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Non-pro Promo banner if applicable */}
        {!isPro && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Upgrade to Pro (₹99) for unlimited detailed AI speech reports!</span>
            </div>
            <button
              onClick={() => {
                onClose();
                setIsPricingModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-xl bg-amber-600 text-white font-bold text-[11px] shrink-0"
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Bottom CTA */}
        <button
          id="close-feedback-btn"
          onClick={() => {
            playSound('click');
            onClose();
          }}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
        >
          <span>Done & Save Progress</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
