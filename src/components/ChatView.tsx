import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Plus,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Shield,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Chat, Message, Profile, Citation } from '../types';
import { exportChatToPDF } from '../lib/pdfExport';
import { CitationModal } from './CitationModal';

interface ChatViewProps {
  currentProfile: Profile;
  onRateLimitUpdate?: (remaining: number, total: number) => void;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateNewChat: () => Promise<string | undefined>;
  onActiveTopicChange?: (title: string) => void;
  registerExportHandler?: (exportFn: () => void) => void;
}

const QUICK_FIELD_PROMPTS = [
  {
    title: 'Macro Site Grounding',
    query: 'What is the maximum allowed earth resistance for macro cell sites and what conductor is used to bond antenna mounts?',
  },
  {
    title: 'FTTH Power Limit',
    query: 'What is the acceptable optical power level at the ONT and what are the required PPE items for drop splicing?',
  },
  {
    title: 'Pole Climbing Safety',
    query: 'What safety precautions and clearance distances are required when working near CEB utility poles?',
  },
  {
    title: '48V Battery Float',
    query: 'What is the recommended float voltage for 48V battery bank strings and what torque is specified for cell terminals?',
  },
];

export const ChatView: React.FC<ChatViewProps> = ({
  currentProfile,
  onRateLimitUpdate,
  chats,
  currentChatId,
  onSelectChat,
  onCreateNewChat,
  onActiveTopicChange,
  registerExportHandler,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [feedbackNotesPromptId, setFeedbackNotesPromptId] = useState<string | null>(null);
  const [feedbackNoteText, setFeedbackNoteText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load chat messages when active chat ID changes
  useEffect(() => {
    if (currentChatId) {
      loadChatMessages(currentChatId);
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  const loadChatMessages = async (chatId: string) => {
    setErrorMessage(null);
    setLastFailedQuestion(null);
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`);
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data);

        // Update active topic if chat has title
        const active = chats.find((c) => c.id === chatId);
        if (active && onActiveTopicChange) {
          onActiveTopicChange(active.title);
        }
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    }
  };

  // Register PDF export handler with parent topbar
  useEffect(() => {
    if (registerExportHandler) {
      registerExportHandler(() => {
        const activeChat = chats.find((c) => c.id === currentChatId);
        if (activeChat && messages.length > 0) {
          exportChatToPDF(activeChat, messages, currentProfile);
        }
      });
    }
  }, [registerExportHandler, currentChatId, chats, messages, currentProfile]);

  const handleSendMessage = async (customQuery?: string) => {
    const questionText = customQuery || inputQuestion;
    if (!questionText.trim() || isLoading) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      activeChatId = (await onCreateNewChat()) || null;
    }
    if (!activeChatId) return;

    setInputQuestion('');
    setErrorMessage(null);
    setLastFailedQuestion(null);

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      chat_id: activeChatId,
      role: 'user',
      content: questionText,
      citations: [],
      feedback: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentProfile.id,
          chatId: activeChatId,
          question: questionText,
          language: currentProfile.language,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${res.status}`);
      }

      const data: {
        userMessage: Message;
        assistantMessage: Message;
        rateLimit?: { allowed: boolean; used: number; limit: number };
      } = await res.json();

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
        return [...filtered, data.userMessage, data.assistantMessage];
      });

      if (data.rateLimit && onRateLimitUpdate) {
        onRateLimitUpdate(
          Math.max(0, data.rateLimit.limit - data.rateLimit.used),
          data.rateLimit.limit
        );
      }
    } catch (err: any) {
      console.error('Failed to query SOP:', err);
      setErrorMessage(
        err.message || 'Unable to retrieve standard operating procedure from embeddings.'
      );
      setLastFailedQuestion(questionText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: string, feedback: 'up' | 'down') => {
    if (feedback === 'down') {
      setFeedbackNotesPromptId(messageId);
      setFeedbackNoteText('');
    } else {
      await submitFeedback(messageId, 'up');
    }
  };

  const submitFeedback = async (messageId: string, feedback: 'up' | 'down', notes?: string) => {
    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          feedback,
          feedbackNotes: notes || '',
        }),
      });

      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, feedback, feedback_notes: notes } : m))
        );
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setFeedbackNotesPromptId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 text-slate-800 relative overflow-hidden">
      {/* Scrollable Conversation Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {/* Empty state: Prompt Selector */}
          {messages.length === 0 && !isLoading && (
            <div className="my-8 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 mx-auto flex items-center justify-center text-red-600 mb-3 shadow-xs">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Dialog Field Engineering SOP Assistant
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                Ask specific installation, earthing, or safety protocol questions. Answers are retrieved
                <strong> strictly from official Dialog SOPs</strong> with full section citations.
              </p>

              {/* Quick Field Prompt Chips */}
              <div className="mt-8 text-left max-w-2xl mx-auto">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">
                  Quick Field Scenarios
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {QUICK_FIELD_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt.query)}
                      className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-gray-200 hover:border-red-300 text-left transition-all shadow-xs group"
                    >
                      <div className="text-xs font-bold text-slate-800 group-hover:text-red-600 flex items-center justify-between">
                        <span>{prompt.title}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600" />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-snug">
                        {prompt.query}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Render Messages */}
          <div className="flex flex-col gap-5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';

              if (isUser) {
                return (
                  <div key={msg.id} className="flex gap-4 items-start justify-end">
                    <div className="bg-red-600 text-white p-4 rounded-2xl rounded-tr-none text-sm shadow-sm max-w-[85%] sm:max-w-[80%] leading-relaxed font-normal">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Assistant SOP Response Bubble
              return (
                <div key={msg.id} className="flex gap-3 sm:gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-600 font-bold text-[10px] shadow-xs">
                    AI
                  </div>
                  <div className="bg-white border border-gray-200 p-6 rounded-2xl rounded-tl-none text-sm shadow-sm flex-1 overflow-hidden">
                    <h3 className="font-bold text-red-600 mb-4 flex items-center gap-2 text-sm tracking-tight">
                      <CheckCircle2 className="w-4 h-4 text-red-600 shrink-0" />
                      Standard Operating Procedure: Dialog Verified Response
                    </h3>

                    <div className="space-y-4 text-slate-700">
                      <ReactMarkdown
                        components={{
                          h3: ({ children }) => (
                            <div className="font-bold text-xs uppercase tracking-wide text-slate-400 mb-1.5 mt-3 flex items-center gap-1.5">
                              {children}
                            </div>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc pl-5 space-y-1.5 text-slate-700 my-1">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-5 space-y-1.5 text-slate-700 my-1">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-slate-700 leading-relaxed text-sm">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-slate-900">{children}</strong>
                          ),
                          p: ({ children }) => (
                            <p className="mb-2 leading-relaxed text-slate-700 text-sm">{children}</p>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {/* Sources & Citations Footer */}
                    <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                      {msg.citations && msg.citations.length > 0 ? (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-600">Sources:</span>
                          {msg.citations.map((c, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedCitation(c)}
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-medium transition-colors flex items-center gap-1"
                              title="Inspect exact SOP excerpt"
                            >
                              <span className="truncate max-w-[190px]">
                                {c.documentTitle.split(':')[0]} ({c.sectionLabel})
                              </span>
                              <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">
                          Dialog Field Engineering Verified Retrieval
                        </div>
                      )}

                      {/* Feedback Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleFeedback(msg.id, 'up')}
                          className={`p-1.5 rounded transition-colors ${
                            msg.feedback === 'up'
                              ? 'bg-emerald-50 text-emerald-600 font-bold'
                              : 'text-slate-400 hover:bg-gray-100 hover:text-slate-600'
                          }`}
                          title="Verified procedural accuracy"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, 'down')}
                          className={`p-1.5 rounded transition-colors ${
                            msg.feedback === 'down'
                              ? 'bg-rose-50 text-rose-600 font-bold'
                              : 'text-slate-400 hover:bg-gray-100 hover:text-slate-600'
                          }`}
                          title="Flag discrepancy for engineering desk"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Feedback Notes Form for Flagged Answers */}
                    {feedbackNotesPromptId === msg.id && (
                      <div className="mt-3 p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs">
                        <div className="font-bold text-rose-800 mb-1">
                          Flag for Dialog Engineering Desk Review:
                        </div>
                        <input
                          type="text"
                          placeholder="e.g., Step contradicts field standard for site X..."
                          value={feedbackNoteText}
                          onChange={(e) => setFeedbackNoteText(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-500 mb-2 shadow-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setFeedbackNotesPromptId(null)}
                            className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => submitFeedback(msg.id, 'down', feedbackNoteText)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                          >
                            Submit to QA Audit
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Safety Warning Protocol */}
                    <div className="mt-4 p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Safety Warning:</strong> Field officers must verify safety-critical
                        procedures, high-voltage clearances, and tower climbing gear with their
                        supervisor or Dialog Engineering Desk before proceeding.
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-3 sm:gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-600 font-bold text-[10px] shadow-xs">
                AI
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-5 text-xs text-slate-600 flex items-center gap-3 shadow-sm">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </div>
                <div>
                  <div className="font-bold text-slate-900">
                    Searching active SOP embeddings...
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Retrieving cosine matches & synthesizing procedural steps
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message with Retry */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-red-900">Procedure Retrieval Failed</div>
                  <div className="text-[11px] text-red-700 mt-0.5">{errorMessage}</div>
                </div>
              </div>
              {lastFailedQuestion && (
                <button
                  onClick={() => handleSendMessage(lastFailedQuestion)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shrink-0 transition-colors shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Inquiry</span>
                </button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-6 sm:p-8 bg-white border-t border-gray-200 shrink-0">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative"
          >
            <textarea
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Ask about installation steps, safety protocols, or tools in ${currentProfile.language.toUpperCase()}...`}
              disabled={isLoading}
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm pr-16 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none shadow-sm bg-white text-slate-800 placeholder:text-slate-400"
              id="sop-question-input"
            />
            <button
              type="submit"
              disabled={!inputQuestion.trim() || isLoading}
              className="absolute right-2.5 bottom-2.5 bg-red-600 text-white p-2.5 rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-40"
              id="send-question-button"
              aria-label="Send Inquiry"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-widest leading-relaxed">
            Disclaimer: This AI uses internal SOP data only. Always verify safety-critical steps with a supervisor.
          </p>
        </div>
      </div>

      {/* Citation Inspector Modal */}
      <CitationModal
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
};
