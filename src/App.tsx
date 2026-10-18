import React, { useState, useEffect, useRef } from 'react';
import { Plus, BookOpen, BarChart3, Database, MessageSquare, X, RefreshCw, LogOut, Trash2 } from 'lucide-react';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { AdminUploadView } from './components/AdminUploadView';
import { AdminAnalyticsView } from './components/AdminAnalyticsView';
import { SupabaseSchemaModal } from './components/SupabaseSchemaModal';
import { LoginScreen } from './components/LoginScreen';
import { Profile, SupportedLanguage, Chat, SOPDocument } from './types';

const DEFAULT_MASTER_PROFILE: Profile = {
  id: '8eb16907-4c80-4acb-a609-8a9f9c9b23a7',
  role: 'admin',
  full_name: 'Eng. Rizwan (Master Administrator)',
  language: 'en',
  email: 'rizwanbuss@gmail.com',
};

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([DEFAULT_MASTER_PROFILE]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(DEFAULT_MASTER_PROFILE);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [currentView, setCurrentView] = useState<'chat' | 'admin-docs' | 'admin-analytics' | 'supabase-schema'>('chat');
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string>('Field Operations & SOP Inquiries');
  const [docCount, setDocCount] = useState<number>(0);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ remaining: number; total: number }>({
    remaining: 50,
    total: 50,
  });

  const exportPDFHandlerRef = useRef<(() => void) | null>(null);

  const isFetchingChatsRef = useRef<boolean>(false);
  const isCreatingChatRef = useRef<boolean>(false);

  const refreshDocuments = () => {
    fetch('/api/admin/documents')
      .then((res) => res.json())
      .then((docs: SOPDocument[]) => {
        if (Array.isArray(docs)) {
          const activeDocs = docs.filter((d) => d.status === 'active');
          setDocCount(activeDocs.length);
        }
      })
      .catch((err) => {
        console.error('Failed to sync document count:', err);
      });
  };

  // Sync session and initial documents on mount
  useEffect(() => {
    refreshDocuments();
    const savedToken = localStorage.getItem('dialog_sop_token');

    if (savedToken) {
      fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: savedToken }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Session expired');
          return res.json();
        })
        .then((data) => {
          if (data.profile) {
            setCurrentProfile(data.profile);
            setProfiles([data.profile]);
          }
        })
        .catch(() => {
          // Keep active profile
        });
    }
  }, []);

  // Fetch chats and check rate limits whenever current profile changes
  useEffect(() => {
    if (!currentProfile) return;
    fetchChats(currentProfile.id);

    fetch(`/api/rate-limit?userId=${currentProfile.id}`)
      .then((res) => res.json())
      .then((status) => {
        if (status && status.limit !== undefined) {
          setRateLimit({
            remaining: Math.max(0, status.limit - (status.used || 0)),
            total: status.limit,
          });
        }
      })
      .catch(() => {});
  }, [currentProfile?.id]);

  const handleLoginSuccess = (profile: Profile, token: string) => {
    setCurrentProfile(profile);
    setProfiles([profile]);
    setIsAuthenticated(true);
    refreshDocuments();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('dialog_sop_token');
    localStorage.removeItem('dialog_sop_user');
    setCurrentProfile(null);
    setIsAuthenticated(false);
  };

  const fetchChats = async (userId = currentProfile?.id) => {
    if (!userId || isFetchingChatsRef.current) return;
    isFetchingChatsRef.current = true;
    try {
      const res = await fetch(`/api/chats?userId=${userId}`);
      if (res.ok) {
        const data: Chat[] = await res.json();
        const uniqueChats: Chat[] = [];
        const seenIds = new Set<string>();
        if (Array.isArray(data)) {
          for (const c of data) {
            if (c && c.id && !seenIds.has(c.id)) {
              seenIds.add(c.id);
              uniqueChats.push(c);
            }
          }
        }
        setChats(uniqueChats);
        if (uniqueChats.length > 0) {
          setCurrentChatId((prev) => (prev && seenIds.has(prev) ? prev : uniqueChats[0].id));
          setActiveTopic((prev) => {
            const found = uniqueChats.find((c) => c.id === currentChatId);
            return found ? found.title : uniqueChats[0].title;
          });
        } else if (!isCreatingChatRef.current) {
          handleCreateNewChat(userId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch chats in App:', err);
    } finally {
      isFetchingChatsRef.current = false;
    }
  };

  const handleCreateNewChat = async (userId = currentProfile?.id): Promise<string | undefined> => {
    if (!userId || isCreatingChatRef.current) return undefined;
    isCreatingChatRef.current = true;
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: 'New SOP Consultation' }),
      });
      if (res.ok) {
        const newChat: Chat = await res.json();
        setChats((prev) => {
          const filtered = prev.filter((c) => c.id !== newChat.id);
          return [newChat, ...filtered];
        });
        setCurrentChatId(newChat.id);
        setActiveTopic(newChat.title);
        setCurrentView('chat');
        setSidebarMobileOpen(false);
        return newChat.id;
      }
    } catch (err) {
      console.error('Failed to create new chat in App:', err);
    } finally {
      isCreatingChatRef.current = false;
    }
    return undefined;
  };

  const handleDeleteChat = async (chatIdToDelete: string) => {
    try {
      const remainingChats = chats.filter((c) => c.id !== chatIdToDelete);
      setChats(remainingChats);

      if (currentChatId === chatIdToDelete) {
        if (remainingChats.length > 0) {
          setCurrentChatId(remainingChats[0].id);
          setActiveTopic(remainingChats[0].title);
        } else {
          handleCreateNewChat();
        }
      }

      await fetch(`/api/chats/${chatIdToDelete}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    if (!currentProfile) return;
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

  if (isLoadingInitial) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-white flex-col gap-4">
        <div className="w-12 h-12 bg-red-600 rounded flex items-center justify-center font-bold text-white italic text-2xl shadow-lg animate-pulse">
          D
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-bold tracking-wider uppercase text-slate-200">Dialog SOP Assistant</p>
          <p className="text-xs text-slate-400 flex items-center gap-2 justify-center">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
            <span>Verifying database session...</span>
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !currentProfile) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Derive initials for avatar
  const nameParts = currentProfile.full_name.split(' ');
  const initials =
    nameParts.length >= 2
      ? `${nameParts[0].charAt(0)}${nameParts[1].charAt(0)}`.toUpperCase()
      : currentProfile.full_name.substring(0, 2).toUpperCase();

  const roleTitle = 'Master Administrator';

  return (
    <div className="flex h-screen w-full font-sans bg-gray-50 text-slate-800 overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden backdrop-blur-xs"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}

      {/* Left Sidebar */}
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
              <span className="text-[11px] text-slate-400 font-semibold tracking-wider block">
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
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Recent Chats
              </label>
              <button
                onClick={() => handleCreateNewChat()}
                className="text-[12px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
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
                Array.from(new Map(chats.map((c) => [c.id, c])).values())
                  .slice(0, 10)
                  .map((chat, idx) => {
                    const isActive = currentView === 'chat' && currentChatId === chat.id;
                    return (
                      <div
                        key={`chat-item-${chat.id}-${idx}`}
                        onClick={() => {
                          setCurrentChatId(chat.id);
                          setActiveTopic(chat.title);
                          setCurrentView('chat');
                          setSidebarMobileOpen(false);
                        }}
                        className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs transition-colors ${
                          isActive
                            ? 'bg-slate-800 text-white font-semibold border-l-4 border-red-500'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                        title={chat.title}
                      >
                        <span className="truncate flex-1 mr-1.5">{chat.title}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChat(chat.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-500 rounded hover:bg-slate-700/60 transition-all shrink-0"
                          title="Delete consultation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Admin Controls / Navigation */}
          <div className="pt-3 border-t border-slate-800/80">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 px-2">
              System Controls
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
                <span className="bg-slate-700 text-slate-300 text-[11px] px-1.5 py-0.5 rounded font-mono">
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

          <div className="mt-4 flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-amber-600 border border-amber-500 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{currentProfile.full_name}</p>
                <p className="text-[11px] text-amber-400 font-semibold truncate">Master Administrator</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{currentProfile.email || 'rizkan6@gmail.com'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0 ml-1"
              title="Sign out of database"
            >
              <LogOut className="w-4 h-4" />
            </button>
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
          onLogout={handleLogout}
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
            <AdminUploadView
              currentProfile={currentProfile}
              onDocumentsChanged={refreshDocuments}
            />
          )}

          {currentView === 'admin-analytics' && <AdminAnalyticsView />}

          {currentView === 'supabase-schema' && <SupabaseSchemaModal />}
        </main>
      </div>
    </div>
  );
}
