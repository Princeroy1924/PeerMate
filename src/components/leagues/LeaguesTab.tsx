import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Sparkles, Clock, Flame, ChevronUp, ChevronDown, Minus, Info } from 'lucide-react';
import { LeagueMember } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export const LeaguesTab: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [leagueName, setLeagueName] = useState('Bronze League');
  const [timeRemaining, setTimeRemaining] = useState('2 days 14 hours');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [user?.totalXp]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const res = await api.getLeagueLeaderboard();
      setMembers(res.members);
      setLeagueName(res.leagueName);
      setTimeRemaining(res.timeRemaining);
    } catch (err) {
      console.warn('Error loading leagues:', err);
    } finally {
      setLoading(false);
    }
  };

  const leaguesList = [
    { name: 'Bronze League', color: 'from-amber-700 to-amber-900', current: true },
    { name: 'Silver League', color: 'from-slate-400 to-slate-600', current: false },
    { name: 'Gold League', color: 'from-amber-400 to-yellow-600', current: false },
    { name: 'Diamond League', color: 'from-cyan-400 to-blue-600', current: false },
  ];

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-200">
      {/* League Header Card */}
      <div className="bg-gradient-to-br from-amber-900 via-amber-800 to-amber-950 rounded-3xl p-6 text-white shadow-xl shadow-amber-900/20 relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-800/80 border border-amber-600/40 text-amber-200 text-xs font-bold">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Weekly English League</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-200 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>{timeRemaining}</span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{leagueName}</h2>
            <p className="text-amber-200 text-xs sm:text-sm mt-1 max-w-md font-medium">
              Top 5 learners at the end of the week will be promoted to the <strong className="text-white">Silver League</strong>!
            </p>
          </div>

          {/* League Tier Pills */}
          <div className="flex items-center gap-1.5 pt-2 overflow-x-auto pb-1">
            {leaguesList.map((l) => (
              <span
                key={l.name}
                className={`px-3 py-1 rounded-full text-xs font-extrabold whitespace-nowrap transition-all ${
                  l.current
                    ? 'bg-amber-400 text-amber-950 ring-2 ring-white shadow-sm'
                    : 'bg-amber-950/60 text-amber-400/80 border border-amber-800'
                }`}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>

        {/* Decorative Trophy watermark */}
        <Trophy className="absolute -right-6 -bottom-6 w-44 h-44 text-white/5 pointer-events-none" />
      </div>

      {/* HOW TO EARN XP CARD */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>Earn League XP:</span>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto text-[11px] font-medium">
          <span className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">🗣️ Human Call: <strong className="text-indigo-600">+50 XP</strong></span>
          <span className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">🤖 AI Tutor: <strong className="text-indigo-600">+60 XP</strong></span>
          <span className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">📖 Learn Word: <strong className="text-indigo-600">+15 XP</strong></span>
        </div>
      </div>

      {/* LEADERBOARD LIST */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="font-bold text-base text-slate-900">Leaderboard Rankings</h3>
          <span className="text-xs text-slate-500 font-medium">Updated live</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member, index) => {
              const isTop3 = index < 3;
              const isPromotion = index < 5;
              const isCurrentUser = member.isCurrentUser || member.id === user?.id;

              return (
                <div
                  key={member.id}
                  id={`league-member-${member.id}`}
                  className={`p-3 sm:p-4 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                    isCurrentUser
                      ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div className="w-7 text-center font-black">
                      {index === 0 ? (
                        <span className="text-lg">🥇</span>
                      ) : index === 1 ? (
                        <span className="text-lg">🥈</span>
                      ) : index === 2 ? (
                        <span className="text-lg">🥉</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">#{index + 1}</span>
                      )}
                    </div>

                    {/* Avatar & Name */}
                    <div className="flex items-center gap-2.5">
                      <img
                        src={member.avatarUrl}
                        alt={member.displayName}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-sm text-slate-900">
                            {member.displayName}
                          </h4>
                          {isCurrentUser && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-indigo-600 text-white">
                              YOU
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">
                          @{member.username} • {member.englishLevel}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Points & Rank Change */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-extrabold text-sm text-slate-900">
                        {member.points} <span className="text-[10px] text-indigo-600 font-bold">XP</span>
                      </div>
                      {isPromotion ? (
                        <span className="text-[10px] font-bold text-emerald-600">Promotion Zone</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Safe</span>
                      )}
                    </div>

                    <div className="w-5 text-center">
                      {member.change > 0 ? (
                        <ChevronUp className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : member.change < 0 ? (
                        <ChevronDown className="w-4 h-4 text-red-500 mx-auto" />
                      ) : (
                        <Minus className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
