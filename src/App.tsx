import React, { useState, useEffect, useRef } from 'react';
import { Plus, BookOpen, BarChart3, Database, MessageSquare, X } from 'lucide-react';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { AdminUploadView } from './components/AdminUploadView';
import { AdminAnalyticsView } from './components/AdminAnalyticsView';
import { SupabaseSchemaModal } from './components/SupabaseSchemaModal';
import { Profile, SupportedLanguage, Chat, SOPDocument } from './types';

const INITIAL_PROFILES: Profile[] = [
  {
    id: 'usr-officer-01',
    role: 'officer',
    full_name: 'Anura Obeysekera',
    language: 'en',
  },
  {
    id: 'usr-officer-02',
    role: 'officer',
    full_name: 'Nimali Senanayake',
    language: 'si',
  },
  {
    id: 'usr-admin-01',
    role: 'admin',
    full_name: 'Eng. Rohan Jayasuriya',
    language: 'en',
  },
];

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_PROFILES);
  const [currentProfile, setCurrentProfile] = useState<Profile>(INITIAL_PROFILES[0]);
  const [currentView, setCurrentView] = useState<'chat' | 'admin-docs' | 'admin-analytics' | 'supabase-schema'>('chat');
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string>('Earthing Installation SOP');
  const [docCount, setDocCount] = useState<number>(3);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ remaining: number; total: number }>({
    remaining: 48,
    total: 50,
  });

  const exportPDFHandlerRef = useRef<(() => void) | null>(null);

  // Fetch profiles and active docs from server
  useEffect(() => {
    fetch('/api/profiles')
      .then((res) => res.json())
      .then((data: Profile[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setProfiles(data);
          const active = data.find((p) => p.id === currentProfile.id) || data[0];
          setCurrentProfile(active);
        }
      })
      .catch((err) => {
        console.warn('Using local initial profiles:', err);
      });

    // Fetch documents count
    fetch('/api/admin/documents')
      .then((res) => res.json())
      .then((docs: SOPDocument[]) => {
        if (Array.isArray(docs)) {
          const activeDocs = docs.filter((d) => d.status === 'active');
          setDocCount(activeDocs.length || 3);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch chats whenever current profile changes
  useEffect(() => {
    fetchChats();

    // Check rate limit for current profile
    fetch(`/api/rate-limit?userId=${currentProfile.id}`)
      .then((res) => res.json())
      .then((status) => {
        if (status && status.limit) {
          setRateLimit({
            remaining: Math.max(0, status.limit - status.used),
            total: status.limit,
          });
        }
      })
      .catch(() => {});
  }, [currentProfile.id]);

  const fetchChats = async () => {
    try {
      const res = await fetch(`/api/chats?userId=${currentProfile.id}`);
      if (res.ok) {
        const data: Chat[] = await res.json();
        setChats(data);
        if (data.length > 0) {
          setCurrentChatId(data[0].id);
          setActiveTopic(data[0].title);
        } else {
          handleCreateNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to fetch chats in App:', err);
    }
  };

  const handleCreateNewChat = async (): Promise<string | undefined> => {
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentProfile.id, title: 'New SOP Consultation' }),
      });
      if (res.ok) {
        const newChat: Chat = await res.json();
        setChats((prev) => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        setActiveTopic(newChat.title);
        setCurrentView('chat');
        setSidebarMobileOpen(false);
        return newChat.id;
      }
    } catch (err) {
      console.error('Failed to create new chat in App:', err);
    }
    return undefined;
  };

  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    const updated = { ...currentProfile, language: newLanguage };
    setCurrentProfile(updated);
    setProfiles((prev) => prev.map((p) => (p.id === currentProfile.id ? updated : p)));

    try {
      await fetch('/api/profiles/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentProfile.id, language: newLanguage }),
      });
    } catch (err) {
      console.error('Failed to update language on server:', err);
    }
  };

  const handleProfileChange = (profile: Profile) => {
    setCurrentProfile(profile);
    if (profile.role === 'officer' && (currentView === 'admin-docs' || currentView === 'admin-analytics')) {
      setCurrentView('chat');
    }
  };

  const handleRateLimitUpdate = (remaining: number, total: number) => {
    setRateLimit({ remaining, total });
  };

  // Derive initials for avatar
  const nameParts = currentProfile.full_name.split(' ');
  const initials =
    nameParts.length >= 2
      ? `${nameParts[0].charAt(0)}${nameParts[1].charAt(0)}`.toUpperCase()
      : currentProfile.full_name.substring(0, 2).toUpperCase();

  const roleTitle =
    currentProfile.role === 'admin'
      ? 'QA Admin / Operations'
      : 'Senior Field Engineer';

  return (
    <div className="flex h-screen w-full font-sans bg-gray-50 text-slate-800 overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden backdrop-blur-xs"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}

      {/* Left Sidebar (Professional Polish Layout) */}
      <aside
        className={`w-72 bg-slate-900 flex flex-col border-r border-slate-800 text-slate-300 shrink-0 fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200 ease-in-out ${
          sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Logo & App Title */}
        <div className="p-6 bg-slate-950 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center font-bold text-white italic text-xl shadow-sm">
              D
            </div>
            <div>
              <span className="font-bold text-white tracking-tight uppercase text-sm block">
                SOP Assistant
              </span>
              <span className="text-[10px] text-slate-400 font-semibold tracking-wider block">
                DIALOG AXIATA PLC
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarMobileOpen(false)}
            className="md:hidden p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation & Chats */}
        <div className="p-4 flex-1 space-y-5 overflow-y-auto">
          {/* Recent Chats */}
          <div>
            <div className="flex items-center justify-between px-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Recent Chats
              </label>
              <button
                onClick={handleCreateNewChat}
                className="text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                title="Start new SOP inquiry"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>

            <div className="mt-2 space-y-1 text-sm">
              {chats.length === 0 ? (
                <div className="px-2 py-3 text-xs text-slate-500 italic">
                  No consultations yet
                </div>
              ) : (
                chats.slice(0, 8).map((chat) => {
                  const isActive = currentView === 'chat' && currentChatId === chat.id;
                  return (
                    <div
                      key={chat.id}
                      onClick={() => {
                        setCurrentChatId(chat.id);
                        setActiveTopic(chat.title);
                        setCurrentView('chat');
                        setSidebarMobileOpen(false);
                      }}
                      className={`p-2 rounded cursor-pointer text-xs truncate transition-colors ${
                        isActive
                          ? 'bg-slate-800 text-white font-semibold border-l-4 border-red-500'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                      title={chat.title}
                    >
                      {chat.title}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Admin Controls / Navigation */}
          <div className="pt-3 border-t border-slate-800/80">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-2">
              Admin Controls
            </label>
            <div className="mt-2 space-y-1 text-sm">
              {/* Field Assistant Link */}
              <div
                onClick={() => {
                  setCurrentView('chat');
                  setSidebarMobileOpen(false);
                }}
                className={`p-2 rounded flex items-center justify-between cursor-pointer text-xs transition-colors ${
                  currentView === 'chat'
                    ? 'bg-slate-800 text-white font-semibold border-l-4 border-red-500'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span>Field Assistant</span>
                </div>
              </div>

              {/* SOP Documents */}
              <div
                onClick={() => {
                  setCurrentView('admin-docs');
                  setSidebarMobileOpen(false);
                }}
                className={`p-2 rounded flex items-center justify-between cursor-pointer text-xs transition-colors ${
                  currentView === 'admin-docs'
                    ? 'bg-slate-800 text-white font-semibold border-l-4 border-red-500'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span>SOP Documents</span>
                </div>
                <span className="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                  {docCount}
                </span>
              </div>

              {/* System Analytics */}
              <div
                onClick={() => {
                  setCurrentView('admin-analytics');
                  setSidebarMobileOpen(false);
                }}
                className={`p-2 rounded flex items-center justify-between cursor-pointer text-xs transition-colors ${
                  currentView === 'admin-analytics'
                    ? 'bg-slate-800 text-red-400 font-bold border-l-4 border-red-500'
                    : 'text-red-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-red-400" />
                  <span>System Analytics</span>
                </div>
              </div>

              {/* Database Architecture */}
              <div
                onClick={() => {
                  setCurrentView('supabase-schema');
                  setSidebarMobileOpen(false);
                }}
                className={`p-2 rounded flex items-center justify-between cursor-pointer text-xs transition-colors ${
                  currentView === 'supabase-schema'
                    ? 'bg-slate-800 text-white font-semibold border-l-4 border-red-500'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-slate-400" />
                  <span>Database Architecture</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Footer: Language Segmented Control & User Info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <div className="flex gap-2 p-1.5 bg-slate-950 rounded-lg text-xs font-semibold border border-slate-800">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`flex-1 text-center rounded py-1 px-2 cursor-pointer transition-colors ${
                currentProfile.language === 'en'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageChange('si')}
              className={`flex-1 text-center rounded py-1 px-2 cursor-pointer transition-colors ${
                currentProfile.language === 'si'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              SI
            </button>
            <button
              onClick={() => handleLanguageChange('ta')}
              className={`flex-1 text-center rounded py-1 px-2 cursor-pointer transition-colors ${
                currentProfile.language === 'ta'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              TA
            </button>
          </div>

          <div
            onClick={() => {
              const nextIdx =
                (profiles.findIndex((p) => p.id === currentProfile.id) + 1) % profiles.length;
              handleProfileChange(profiles[nextIdx]);
            }}
            className="mt-4 flex items-center gap-3 px-2 py-1 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
            title="Click to toggle user role"
          >
            <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="flex-1 truncate">
              <p className="text-xs font-bold text-white truncate">{currentProfile.full_name}</p>
              <p className="text-[10px] text-slate-400 truncate">{roleTitle}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Right Panel */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden bg-gray-50">
        <Header
          currentProfile={currentProfile}
          onProfileChange={handleProfileChange}
          availableProfiles={profiles}
          currentView={currentView}
          onViewChange={setCurrentView}
          onLanguageChange={handleLanguageChange}
          rateLimitRemaining={rateLimit.remaining}
          rateLimitTotal={rateLimit.total}
          activeTopic={activeTopic}
          onExportPDF={() => {
            if (exportPDFHandlerRef.current) {
              exportPDFHandlerRef.current();
            }
          }}
          canExportPDF={currentView === 'chat' && chats.length > 0}
          onToggleSidebar={() => setSidebarMobileOpen(!sidebarMobileOpen)}
        />

        <main className="flex-1 overflow-auto bg-gray-50 relative">
          {currentView === 'chat' && (
            <ChatView
              currentProfile={currentProfile}
              onRateLimitUpdate={handleRateLimitUpdate}
              chats={chats}
              currentChatId={currentChatId}
              onSelectChat={(id) => {
                setCurrentChatId(id);
                const found = chats.find((c) => c.id === id);
                if (found) setActiveTopic(found.title);
              }}
              onCreateNewChat={handleCreateNewChat}
              onActiveTopicChange={(title) => setActiveTopic(title)}
              registerExportHandler={(fn) => {
                exportPDFHandlerRef.current = fn;
              }}
            />
          )}

          {currentView === 'admin-docs' && (
            <AdminUploadView currentProfile={currentProfile} />
          )}

          {currentView === 'admin-analytics' && <AdminAnalyticsView />}

          {currentView === 'supabase-schema' && <SupabaseSchemaModal />}
        </main>
      </div>
    </div>
  );
}
