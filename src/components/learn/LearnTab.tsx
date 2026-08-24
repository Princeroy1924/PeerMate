import React, { useState, useEffect } from 'react';
import { Volume2, Bookmark, CheckCircle, Sparkles, BookMarked, ArrowRight, Lightbulb, RefreshCw } from 'lucide-react';
import { VocabularyItem } from '../../types';
import { api } from '../../lib/api';
import { speakText } from '../../lib/speech';
import { playSound } from '../../lib/audio';
import { useAuth } from '../../context/AuthContext';
import confetti from 'canvas-confetti';

export const LearnTab: React.FC = () => {
  const { awardXp } = useAuth();
  const [vocabItems, setVocabItems] = useState<VocabularyItem[]>([]);
  const [wordOfTheDay, setWordOfTheDay] = useState<VocabularyItem | null>(null);
  const [totalLearned, setTotalLearned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  useEffect(() => {
    loadDailyVocab();
  }, []);

  const loadDailyVocab = async () => {
    try {
      setLoading(true);
      const data = await api.getDailyVocabulary();
      setVocabItems(data.items);
      setWordOfTheDay(data.wordOfTheDay);
      setTotalLearned(data.totalLearned);
    } catch (err) {
      console.warn('Error loading daily vocab:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePronounce = (word: string) => {
    setPlayingWord(word);
    speakText(word, {
      rate: 0.9,
      onEnd: () => setPlayingWord(null),
    });
  };

  const handleAction = async (vocabId: string, action: 'learned' | 'saved' | 'unlearned') => {
    playSound(action === 'learned' ? 'success' : 'click');

    // Optimistic UI update
    setVocabItems(prev =>
      prev.map(item => {
        if (item.id === vocabId) {
          if (action === 'learned') {
            return { ...item, learned: true };
          } else if (action === 'unlearned') {
            return { ...item, learned: false };
          } else if (action === 'saved') {
            return { ...item, saved: !item.saved };
          }
        }
        return item;
      })
    );

    if (action === 'learned') {
      awardXp(15);
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.7 },
      });
    }

    try {
      const res = await api.updateVocabularyAction(vocabId, action);
      setTotalLearned(res.totalLearned);
    } catch (err) {
      console.warn('Failed to update vocab action:', err);
    }
  };

  const learnedCount = vocabItems.filter(v => v.learned).length;
  const progressPercent = Math.round((learnedCount / Math.max(vocabItems.length, 1)) * 100);

  const dailyIdioms = [
    {
      phrase: 'Hit the nail on the head',
      meaning: 'Describe exactly what is causing a situation or problem.',
      example: 'When she said we need more speaking practice, she hit the nail on the head.',
    },
    {
      phrase: 'Break the ice',
      meaning: 'Do or say something to relieve tension or start conversation with someone new.',
      example: 'Asking about hobbies is a friendly way to break the ice on PeerMate.',
    },
    {
      phrase: 'Bite the bullet',
      meaning: 'Face a difficult situation with courage and resolve.',
      example: 'I was nervous about speaking English, but I bit the bullet and made my first call!',
    }
  ];

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-5 sm:p-6 text-white shadow-lg shadow-indigo-100 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-blue-100 text-xs font-semibold uppercase tracking-wider mb-2">
            <BookMarked className="w-4 h-4" />
            <span>Daily English Mastery</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Learn New Words & Phrasing
          </h2>
          <p className="text-blue-100 text-sm mt-1 max-w-md">
            Master 5 essential spoken English words every day to speak with natural confidence and clarity.
          </p>

          {/* Progress Pill */}
          <div className="mt-4 pt-4 border-t border-blue-400/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-blue-100">
                Today's Vocabulary: <span className="font-bold text-white">{learnedCount} / {vocabItems.length} Learned</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 sm:w-32 bg-blue-900/40 rounded-full h-2.5 overflow-hidden p-0.5">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs font-bold text-emerald-300">{progressPercent}%</span>
            </div>
          </div>
        </div>

        {/* Decorative circle */}
        <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* 1. WORD OF THE DAY */}
      {wordOfTheDay && (
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-100 text-amber-800">
                <Sparkles className="w-4 h-4 text-amber-600" />
              </span>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                Word of the Day
              </span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {wordOfTheDay.difficulty}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {wordOfTheDay.word}
                </h3>
                <button
                  id="pronounce-word-of-day"
                  onClick={() => handlePronounce(wordOfTheDay.word)}
                  className={`p-2 rounded-xl transition-colors ${
                    playingWord === wordOfTheDay.word
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                  title="Listen to Pronunciation"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm font-mono text-slate-500 mt-0.5">
                {wordOfTheDay.phonetic} • <span className="italic text-slate-600 font-sans">{wordOfTheDay.partOfSpeech}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Meaning:</span>
              <p className="text-sm font-medium text-slate-800 leading-relaxed mt-0.5">
                {wordOfTheDay.meaning}
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Example in conversation:</span>
              <p className="text-sm italic text-indigo-950 mt-0.5 font-medium">
                "{wordOfTheDay.example}"
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 2. TODAY'S 5 VOCABULARY CARDS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Today's Vocabulary Cards</h3>
            <p className="text-xs text-slate-500">Tap the listen button to hear native pronunciation</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
            {totalLearned} Total Mastered
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {vocabItems.map((item) => {
              const isLearned = !!item.learned;
              const isSaved = !!item.saved;

              return (
                <div
                  key={item.id}
                  id={`vocab-card-${item.id}`}
                  className={`p-4 rounded-2xl border transition-all duration-200 ${
                    isLearned
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-white border-slate-100 shadow-sm hover:border-indigo-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <button
                        id={`pronounce-btn-${item.id}`}
                        onClick={() => handlePronounce(item.word)}
                        className={`p-2 rounded-xl transition-all ${
                          playingWord === item.word
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                        }`}
                        title="Listen Pronunciation"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base text-slate-900">{item.word}</h4>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {item.difficulty}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">{item.phonetic}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Save Button */}
                      <button
                        id={`save-btn-${item.id}`}
                        onClick={() => handleAction(item.id, 'saved')}
                        className={`p-2 rounded-xl border text-xs font-semibold transition-colors ${
                          isSaved
                            ? 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                        }`}
                        title={isSaved ? 'Saved in notebook' : 'Save for later'}
                      >
                        <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-amber-500 text-amber-500' : ''}`} />
                      </button>

                      {/* Learned Button */}
                      <button
                        id={`learned-btn-${item.id}`}
                        onClick={() => handleAction(item.id, isLearned ? 'unlearned' : 'learned')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                          isLearned
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600'
                        }`}
                      >
                        <CheckCircle className={`w-3.5 h-3.5 ${isLearned ? 'text-white' : 'text-slate-400'}`} />
                        <span>{isLearned ? 'Learned' : 'I Know This'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-700 space-y-1">
                    <p><strong className="text-slate-900 font-semibold">Meaning:</strong> {item.meaning}</p>
                    <p className="italic text-slate-500"><strong className="not-italic text-slate-700 font-semibold">Example:</strong> "{item.example}"</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. DAILY SPEAKING IDIOMS */}
      <section className="bg-slate-50 rounded-3xl p-5 border border-slate-200/80 space-y-3">
        <div className="flex items-center gap-2 text-slate-900">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-base">Conversational Idioms of the Day</h3>
        </div>
        <p className="text-xs text-slate-600">
          Use these expressions during your next human or AI voice call to sound more fluent and natural!
        </p>

        <div className="space-y-2.5 pt-1">
          {dailyIdioms.map((idiom, idx) => (
            <div key={idx} className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-indigo-600 flex items-center gap-1.5">
                  <span>💡</span> {idiom.phrase}
                </h4>
                <button
                  onClick={() => speakText(idiom.phrase)}
                  className="text-slate-400 hover:text-indigo-600 p-1"
                  title="Listen"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-700 mt-1 font-medium">{idiom.meaning}</p>
              <p className="text-[11px] text-slate-500 italic mt-0.5">"{idiom.example}"</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
