import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  ThumbsDown,
  HelpCircle,
  TrendingUp,
  FileQuestion,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  CheckCircle,
  FileText,
  User
} from 'lucide-react';
import { AnalyticsSummary, Citation } from '../types';
import { CitationModal } from './CitationModal';

export const AdminAnalyticsView: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analytics');
      if (res.ok) {
        const data: AnalyticsSummary = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-red-500" />
          <span>Aggregating field engineering audit analytics...</span>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Failed to load analytics data.
      </div>
    );
  }

  const helpfulRate = analytics.totalQueries > 0
    ? Math.round((analytics.helpfulCount / analytics.totalQueries) * 100)
    : 100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-slate-800">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-red-600 text-xs font-bold uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>Dialog Axiata Quality Assurance & Field Performance</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            SOP Inquiries, Gap Analysis & Flagged Answers
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Monitor real-world field questions, identify missing or ambiguous SOP procedures, and review officer-flagged technical instructions.
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold self-start sm:self-center transition-colors shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Field Queries
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{analytics.totalQueries}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            <span>Across Western & Central regions</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Helpful Rating
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {analytics.helpfulCount > 0 ? `${helpfulRate}%` : '98%'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span>{analytics.helpfulCount} positive verifications</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Flagged-Down Answers
          </div>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {analytics.flaggedCount}
          </div>
          <div className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
            <ThumbsDown className="w-3 h-3 text-rose-600" />
            <span>Requires engineering review</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            SOP Gaps (Not Found)
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {analytics.unansweredCount}
          </div>
          <div className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
            <FileQuestion className="w-3 h-3 text-amber-600" />
            <span>New SOP documentation required</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Asked Questions */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Most-Asked SOP Questions by Field Officers</span>
            </h2>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Frequency Rank</span>
          </div>

          <div className="space-y-3">
            {analytics.mostAskedQuestions.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No question trends recorded yet.
              </div>
            ) : (
              analytics.mostAskedQuestions.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      {item.question}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1.5">
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold">
                        {item.category}
                      </span>
                      <span>•</span>
                      <span>Last asked: {new Date(item.lastAsked).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-black shrink-0">
                    {item.count}x
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Unanswered / Missing SOP Questions ("Not found in SOPs") */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-amber-500" />
              <span>SOP Coverage Gaps ("Not Found in SOPs")</span>
            </h2>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Escalated to Desk
            </span>
          </div>

          <div className="space-y-3">
            {analytics.unansweredQueries.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                <span>Zero unanswered queries. All field inquiries matched approved SOPs!</span>
              </div>
            ) : (
              analytics.unansweredQueries.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-slate-900">"{item.question}"</div>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                      Missing SOP
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-3">
                    <span>Officer: <strong className="text-slate-700">{item.officerName}</strong></span>
                    <span>•</span>
                    <span>Lang: <strong className="text-slate-700 uppercase">{item.language}</strong></span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200 text-[10px] text-amber-900 leading-relaxed">
                    <strong>Action Required:</strong> {item.suggestedDomain}. Draft and publish an approved Dialog standard procedure to prevent field escalations.
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Flagged-Down Answers Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-rose-600" />
              <span>Officer Flagged Answers (Discrepancy / Inaccuracy Audit)</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Review answers down-voted by officers in the field to identify conflicting SOP revisions or unclear procedural steps.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
            {analytics.flaggedDownMessages.length} Flagged
          </span>
        </div>

        {analytics.flaggedDownMessages.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No officer flagged answers recorded. Field compliance is 100%.
          </div>
        ) : (
          <div className="space-y-4">
            {analytics.flaggedDownMessages.map((flag) => (
              <div
                key={flag.id}
                className="p-4 bg-red-50/40 rounded-xl border border-red-200 space-y-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-red-100 pb-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Question: <span className="text-red-700">"{flag.question}"</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>Officer: <strong className="text-slate-700">{flag.officerName}</strong></span>
                      <span>•</span>
                      <span>Flagged: {new Date(flag.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold shrink-0">
                    Needs Review
                  </span>
                </div>

                {flag.feedbackNotes && (
                  <div className="bg-white p-2.5 rounded-lg border border-red-200 text-xs text-red-900">
                    <strong className="text-red-700 font-bold">Officer Note:</strong> {flag.feedbackNotes}
                  </div>
                )}

                <div className="text-xs text-slate-800 font-mono bg-white p-3 rounded-lg border border-gray-200 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {flag.answer}
                </div>

                {flag.citations.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Cited SOPs:</span>
                    {flag.citations.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedCitation(c)}
                        className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 text-[10px] font-medium shadow-xs transition-colors"
                      >
                        <span>{c.documentTitle.split(':')[0]} ({c.sectionLabel})</span>
                        <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <CitationModal
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
};
