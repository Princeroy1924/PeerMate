import React, { useState, useMemo } from 'react';
import {
  Clock,
  User,
  Bot,
  Search,
  CheckCircle2,
  Calendar,
  Sparkles,
  Award,
  BookOpen,
  Filter,
  X,
  Radio,
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Globe,
  Compass,
  Briefcase,
  Coffee,
  Cpu,
  Heart,
  Film,
  Flame,
  Info
} from 'lucide-react';
import { CallRecord, AiFeedback } from '../../types';

interface SessionHistoryViewProps {
  calls: CallRecord[];
  onStartPractice?: () => void;
}

export const SessionHistoryView: React.FC<SessionHistoryViewProps> = ({ calls, onStartPractice }) => {
  const [selectedType, setSelectedType] = useState<'all' | 'human' | 'ai'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'duration_desc' | 'duration_asc'>('newest');
  const [selectedSession, setSelectedSession] = useState<CallRecord | null>(null);

  const topicOptions = [
    { label: 'All Topics', value: 'all' },
    { label: 'Daily Life & Routine', value: 'Daily Life & Routine', icon: Coffee },
    { label: 'Travel & Culture', value: 'Travel & Culture', icon: Compass },
    { label: 'Job Interview Prep', value: 'Job Interview Prep', icon: Briefcase },
    { label: 'Business & Tech', value: 'Business & Tech', icon: Cpu },
    { label: 'Hobbies & Passions', value: 'Hobbies & Passions', icon: Heart },
    { label: 'Movies & Pop Culture', value: 'Movies & Pop Culture', icon: Film },
    { label: 'Debate & Global Trends', value: 'Debate & Global Trends', icon: Globe },
  ];

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    if (mins === 0) return `${remaining}s`;
    if (remaining === 0) return `${mins} min`;
    return `${mins}m ${remaining}s`;
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) {
        const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
        return `${diffMins}m ago`;
      }
      if (diffHours < 24) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (Today)';
      }
      if (diffDays === 1) {
        return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (diffDays < 7) {
        return `${diffDays} days ago`;
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const getTopicIcon = (topicName?: string) => {
    const t = (topicName || '').toLowerCase();
    if (t.includes('travel') || t.includes('culture')) return Compass;
    if (t.includes('job') || t.includes('interview') || t.includes('career')) return Briefcase;
    if (t.includes('business') || t.includes('tech')) return Cpu;
    if (t.includes('hobb') || t.includes('passion')) return Heart;
    if (t.includes('movie') || t.includes('film') || t.includes('pop')) return Film;
    if (t.includes('debate') || t.includes('global')) return Globe;
    return Coffee;
  };

  // Metrics specifically for Peer Calls
  const peerCalls = useMemo(() => calls.filter((c) => c.callType === 'human'), [calls]);
  const peerMinutes = useMemo(
    () => Math.round(peerCalls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) / 60),
    [peerCalls]
  );
  const avgPeerSecs = useMemo(
    () => (peerCalls.length > 0 ? Math.round(peerCalls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) / peerCalls.length) : 0),
    [peerCalls]
  );

  // Most practiced topic
  const topTopic = useMemo(() => {
    if (peerCalls.length === 0) return 'Daily Life & Routine';
    const counts: Record<string, number> = {};
    peerCalls.forEach((c) => {
      const topic = c.topic || 'Daily Life & Routine';
      counts[topic] = (counts[topic] || 0) + 1;
    });
    let best = 'Daily Life & Routine';
    let max = 0;
    Object.entries(counts).forEach(([t, count]) => {
      if (count > max) {
        max = count;
        best = t;
      }
    });
    return best;
  }, [peerCalls]);

  // Filtered & Sorted Calls
  const filteredCalls = useMemo(() => {
    return calls
      .filter((call) => {
        // Type filter
        if (selectedType === 'human' && call.callType !== 'human') return false;
        if (selectedType === 'ai' && call.callType !== 'ai') return false;

        // Topic filter
        if (selectedTopic !== 'all') {
          const callTopic = call.topic || 'Daily Life & Routine';
          if (callTopic !== selectedTopic) return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const nameMatch = call.receiverName.toLowerCase().includes(q) || call.callerName?.toLowerCase().includes(q);
          const topicMatch = (call.topic || '').toLowerCase().includes(q);
          const levelMatch = (call.receiverLevel || '').toLowerCase().includes(q);
          const notesMatch = (call.notes || '').toLowerCase().includes(q);
          if (!nameMatch && !topicMatch && !levelMatch && !notesMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
        }
        if (sortBy === 'duration_desc') {
          return (b.durationSeconds || 0) - (a.durationSeconds || 0);
        }
        if (sortBy === 'duration_asc') {
          return (a.durationSeconds || 0) - (b.durationSeconds || 0);
        }
        return 0;
      });
  }, [calls, selectedType, selectedTopic, searchQuery, sortBy]);

  return (
    <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-5 transition-colors">
      {/* 1. Header & Summary Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Session History
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
              {calls.length} Total Sessions
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Review past peer conversations, speaking duration, and topics practiced over time.
          </p>
        </div>

        {onStartPractice && (
          <button
            onClick={onStartPractice}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer self-start sm:self-auto"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Practice Now</span>
          </button>
        )}
      </div>

      {/* 2. Peer Practice Insights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Peer Calls</span>
            <User className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            {peerCalls.length}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">1-on-1 human calls</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Peer Time</span>
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
            {peerMinutes}m
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Total spoken</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Avg Duration</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            {formatDuration(avgPeerSecs)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Per conversation</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold">Top Topic</span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate mt-1">
            {topTopic}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Most discussed</span>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="space-y-3 pt-1">
        {/* Type Filter Pills & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl shrink-0 overflow-x-auto">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedType === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All Calls ({calls.length})
            </button>
            <button
              onClick={() => setSelectedType('human')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedType === 'human'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Peer Calls ({peerCalls.length})</span>
            </button>
            <button
              onClick={() => setSelectedType('ai')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedType === 'ai'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI Sessions ({calls.filter((c) => c.callType === 'ai').length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search peer, topic, or level..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="duration_desc">Longest Duration</option>
              <option value="duration_asc">Shortest Duration</option>
            </select>
          </div>
        </div>

        {/* Topic Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-1 shrink-0 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Topic:
          </span>
          {topicOptions.map((topic) => {
            const isSelected = selectedTopic === topic.value;
            const Icon = topic.icon;
            return (
              <button
                key={topic.value}
                onClick={() => setSelectedTopic(topic.value)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                <span>{topic.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Session History List */}
      <div className="space-y-3 pt-1">
        {filteredCalls.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 space-y-2">
            <MessageSquare className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
              No sessions match your filter
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || selectedTopic !== 'all' || selectedType !== 'all'
                ? 'Try clearing the search query or selecting "All Topics" to see past sessions.'
                : 'Complete your first peer or AI conversation to build your speaking practice history!'}
            </p>
            {(searchQuery || selectedTopic !== 'all' || selectedType !== 'all') && (
              <button
                onClick={() => {
                  setSelectedType('all');
                  setSelectedTopic('all');
                  setSearchQuery('');
                }}
                className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filteredCalls.map((call) => {
              const isAi = call.callType === 'ai';
              const TopicIcon = getTopicIcon(call.topic);
              const topicName = call.topic || (isAi ? 'General Friendly Conversation' : 'Daily Life & Routine');

              return (
                <div
                  key={call.id}
                  onClick={() => setSelectedSession(call)}
                  className="group p-4 rounded-2xl bg-slate-50/70 hover:bg-slate-100/80 dark:bg-slate-800/50 dark:hover:bg-slate-800/90 border border-slate-100 dark:border-slate-800/80 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                >
                  {/* Left: Avatar & Peer / Tutor Details */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      {isAi ? (
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-xs">
                          <Bot className="w-6 h-6" />
                        </div>
                      ) : call.receiverAvatar ? (
                        <img
                          src={call.receiverAvatar}
                          alt={call.receiverName}
                          className="w-11 h-11 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-2xs"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                          {call.receiverName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      
                      <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-white dark:bg-slate-900 shadow-xs">
                        {isAi ? (
                          <Sparkles className="w-3 h-3 text-indigo-500 fill-indigo-500" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        )}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                          {call.receiverName}
                        </h4>
                        
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isAi
                              ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {isAi ? 'AI Voice Practice' : 'Peer 1-on-1'}
                        </span>

                        {call.country && call.country !== 'AI Studio' && (
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                            <Globe className="w-2.5 h-2.5" />
                            {call.country}
                          </span>
                        )}
                      </div>

                      {/* Topic Pill & Target Level */}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/80 px-2 py-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60">
                          <TopicIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="truncate max-w-[190px] sm:max-w-xs">{topicName}</span>
                        </span>

                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          {call.receiverLevel || 'Intermediate'}
                        </span>
                      </div>

                      {/* Brief note if exists */}
                      {call.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 italic">
                          "{call.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Duration, Timestamp, XP & Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
                    <div className="text-left sm:text-right">
                      <div className="flex items-center sm:justify-end gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                        <Clock className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{formatDuration(call.durationSeconds)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {formatDate(call.startedAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-1 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                        +{call.xpEarned || Math.min(120, Math.floor(call.durationSeconds / 10) * 5 + 40)} XP
                      </span>

                      <div className="p-1 rounded-xl bg-white dark:bg-slate-900 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shadow-2xs transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Detailed Session Breakdown Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2.5 rounded-2xl ${
                    selectedSession.callType === 'ai'
                      ? 'bg-purple-50 dark:bg-purple-950 text-purple-600'
                      : 'bg-blue-50 dark:bg-blue-950 text-blue-600'
                  }`}
                >
                  {selectedSession.callType === 'ai' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                    Session Details & Progress
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(selectedSession.startedAt)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedSession(null)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Partner Info & Topic */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedSession.receiverAvatar ? (
                    <img
                      src={selectedSession.receiverAvatar}
                      alt={selectedSession.receiverName}
                      className="w-10 h-10 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                      {selectedSession.receiverName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {selectedSession.receiverName}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedSession.callType === 'ai' ? 'AI Voice Coach' : `Peer • ${selectedSession.country || 'Global'}`}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  {selectedSession.receiverLevel || 'Intermediate'}
                </span>
              </div>

              {/* Topic */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                  <Compass className="w-4 h-4 text-indigo-500" />
                  <span>Topic:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedSession.topic || (selectedSession.callType === 'ai' ? 'General Friendly Conversation' : 'Daily Life & Routine')}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDuration(selectedSession.durationSeconds)}</span>
                </div>
              </div>
            </div>

            {/* Session Highlights / Notes */}
            {selectedSession.notes ? (
              <div className="space-y-1.5">
                <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                  Key Discussion Points
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-400 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 leading-relaxed">
                  {selectedSession.notes}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Practice Takeaways
                </h5>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p>• Conversed actively for {formatDuration(selectedSession.durationSeconds)} without interruption.</p>
                  <p>• Strengthened vocabulary related to {selectedSession.topic || 'Daily Life & Routine'}.</p>
                  <p>• Maintained consecutive daily streak and earned +{selectedSession.xpEarned || 50} XP.</p>
                </div>
              </div>
            )}

            {/* Footer Stats & Close */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 px-3 py-1.5 rounded-xl">
                <Award className="w-4 h-4" />
                <span>Earned +{selectedSession.xpEarned || 50} XP</span>
              </div>

              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
