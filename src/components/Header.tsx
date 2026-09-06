import React, { useState } from 'react';
import { Menu, Radio, Download, ChevronDown, Check, ShieldCheck, User, LogOut, Mail, Database } from 'lucide-react';
import { Profile, SupportedLanguage } from '../types';

interface HeaderProps {
  currentProfile: Profile;
  onProfileChange?: (profile: Profile) => void;
  availableProfiles?: Profile[];
  currentView: 'chat' | 'admin-docs' | 'admin-analytics' | 'supabase-schema';
  onViewChange: (view: 'chat' | 'admin-docs' | 'admin-analytics' | 'supabase-schema') => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
  rateLimitRemaining?: number;
  rateLimitTotal?: number;
  activeTopic?: string;
  onExportPDF?: () => void;
  canExportPDF?: boolean;
  onToggleSidebar?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProfile,
  onProfileChange,
  availableProfiles = [],
  currentView,
  onViewChange,
  onLanguageChange,
  rateLimitRemaining = 48,
  rateLimitTotal = 50,
  activeTopic,
  onExportPDF,
  canExportPDF = true,
  onToggleSidebar,
  onLogout,
}) => {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // Derive breadcrumb title based on view and active topic
  let sectionName = 'Operations';
  let topicName = activeTopic || 'Field Operations & SOP Inquiries';

  if (currentView === 'admin-docs') {
    sectionName = 'Admin Controls';
    topicName = 'SOP Documents & Section Ingestion';
  } else if (currentView === 'admin-analytics') {
    sectionName = 'Admin Controls';
    topicName = 'System Analytics & Gap Analysis';
  } else if (currentView === 'supabase-schema') {
    sectionName = 'Infrastructure';
    topicName = 'Supabase Schema & Vector Migrations';
  } else if (currentView === 'chat') {
    sectionName = 'Operations';
    topicName = activeTopic || 'SOP Consultation';
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 shadow-xs shrink-0 z-20">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Toggle navigation drawer"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 text-xs truncate">
          <span className="font-medium text-slate-500 shrink-0">{sectionName}</span>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-900 truncate">{topicName}</span>
        </div>
      </div>

      {/* Right: Synced Badge, Quota, Export PDF, and Profile Switcher */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Database Synced status badge */}
        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="tracking-wide">DATABASE SYNCED</span>
        </div>

        {/* Hourly Rate Limit Quota */}
        <div
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600"
          title="Hourly API call quota to control engineering costs"
        >
          <Radio className="w-3.5 h-3.5 text-amber-500" />
          <span>Quota:</span>
          <span className="font-bold text-slate-900">{rateLimitRemaining}</span>
          <span className="text-slate-400">/{rateLimitTotal}</span>
        </div>

        {/* Export PDF Button */}
        {currentView === 'chat' && onExportPDF && (
          <button
            onClick={onExportPDF}
            disabled={!canExportPDF}
            className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-slate-200 flex items-center gap-1.5 shadow-xs"
            title="Export this SOP consultation to an official PDF"
          >
            <Download className="w-3.5 h-3.5 text-red-600" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        )}

        {/* Master Admin Profile & Sign Out Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 py-1 px-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-left transition-colors cursor-pointer"
            id="top-profile-menu-button"
            title="Authenticated Database Account"
          >
            <div className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white bg-amber-600 shadow-xs">
              {currentProfile.full_name.charAt(0)}
            </div>
            <span className="hidden xl:inline text-xs font-semibold text-slate-700 max-w-[120px] truncate">
              {currentProfile.full_name.split(' ')[0]}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 border-b border-gray-100 mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Database Account
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                    Active
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 truncate mt-1">
                  {currentProfile.full_name}
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span>{currentProfile.email || 'rizkan6@gmail.com'}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded w-fit">
                  <ShieldCheck className="w-3 h-3 text-amber-600" />
                  <span>Master Administrator</span>
                </div>
              </div>

              {availableProfiles.length > 1 && onProfileChange && (
                <div className="space-y-0.5 px-1 py-1 border-b border-gray-100">
                  {availableProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onProfileChange(p);
                        setProfileDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        p.id === currentProfile.id
                          ? 'bg-red-50 text-red-700 font-bold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="truncate font-semibold">{p.full_name}</div>
                        <div className="text-[10px] text-slate-500 capitalize">
                          {p.role === 'admin' ? 'Master Admin' : 'Field Engineering'}
                        </div>
                      </div>
                      {p.id === currentProfile.id && <Check className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {onLogout && (
                <div className="px-1 pt-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-600" />
                    <span>Sign Out of Database</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
