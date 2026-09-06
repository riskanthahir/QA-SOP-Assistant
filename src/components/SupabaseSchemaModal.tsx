import React, { useState } from 'react';
import { Database, Copy, Check, Terminal, ExternalLink, ShieldCheck, Cpu } from 'lucide-react';

const SQL_MIGRATION_1 = `-- 1. Enable vector extension & create profiles, documents, chunks, chats, messages
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('officer', 'admin')),
    full_name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'si', 'ta')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sop_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sop_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    section_label TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sop_chunks_embedding 
ON public.sop_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New SOP Consultation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    feedback TEXT CHECK (feedback IN ('up', 'down', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.indexing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);`;

const SQL_MIGRATION_2 = `-- Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexing_jobs ENABLE ROW LEVEL SECURITY;

-- Officers can only read/write their own chats & messages
CREATE POLICY "Allow users to read their own chats" ON public.chats FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Allow users to read messages in their own chats" ON public.messages FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM public.chats c WHERE c.id = messages.chat_id AND (c.user_id = auth.uid() OR public.is_admin(auth.uid())))
);

-- Only admins can insert/update sop_documents and sop_chunks
CREATE POLICY "Allow admins to insert sop_documents" ON public.sop_documents FOR INSERT
TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Allow admins to update sop_documents" ON public.sop_documents FOR UPDATE
TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Authenticated users can read active SOP documents and chunks
CREATE POLICY "Allow authenticated users to read active sop_documents" ON public.sop_documents FOR SELECT
TO authenticated USING (status = 'active' OR public.is_admin(auth.uid()));`;

const SQL_MIGRATION_3 = `-- Cosine Similarity Match RPC Function
CREATE OR REPLACE FUNCTION public.match_sop_chunks(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.2,
    match_count INT DEFAULT 6
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    document_title TEXT,
    document_version TEXT,
    section_label TEXT,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.document_id,
        d.title AS document_title,
        d.version AS document_version,
        c.section_label,
        c.content,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM public.sop_chunks c
    JOIN public.sop_documents d ON d.id = c.document_id
    WHERE d.status = 'active'
      AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;`;

const LIB_AI_INTERFACE = `// lib/ai.ts - Swappable AI Provider Interface
export interface SOPChunk {
  id: string;
  documentTitle: string;
  version: string;
  sectionLabel: string;
  content: string;
  similarity?: number;
}

export type SupportedLanguage = 'en' | 'si' | 'ta';

// Contract:
export async function embed(text: string): Promise<number[]>;
export async function generateAnswer(
  question: string,
  contextChunks: SOPChunk[],
  language: SupportedLanguage
): Promise<string>;`;

export const SupabaseSchemaModal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schema' | 'rls' | 'search' | 'ai'>('schema');
  const [copied, setCopied] = useState(false);

  const getActiveCode = () => {
    switch (activeTab) {
      case 'schema':
        return SQL_MIGRATION_1;
      case 'rls':
        return SQL_MIGRATION_2;
      case 'search':
        return SQL_MIGRATION_3;
      case 'ai':
        return LIB_AI_INTERFACE;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-slate-800">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-red-600 text-xs font-bold uppercase tracking-wider">
              <Database className="w-4 h-4" />
              <span>Production Infrastructure & Architecture</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Supabase Postgres DDL, RLS & Swappable AI Interface
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Copy production migration scripts directly into the Supabase SQL editor or run them via the Supabase CLI.
            </p>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold self-start sm:self-center transition-colors shadow-xs"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Active File'}</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-5 border-b border-gray-100 pb-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'schema'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            001_initial_schema.sql (pgvector & DDL)
          </button>
          <button
            onClick={() => setActiveTab('rls')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'rls'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            002_rls_policies.sql (Row-Level Security)
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'search'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            003_vector_similarity_search.sql (RPC)
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'ai'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            lib/ai.ts (Swappable Module)
          </button>
        </div>

        {/* Code Viewer */}
        <div className="mt-4 relative">
          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[480px] leading-relaxed shadow-xs">
            <code>{getActiveCode()}</code>
          </pre>
        </div>
      </div>

      {/* Deployment & CI/CD Checklist */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-amber-500" />
          <span>Vercel + Supabase + GitHub CI/CD Production Deployment Steps</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="font-bold text-slate-900 mb-1">1. Supabase Postgres & Storage</div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Create a Supabase project, execute the 3 migration files in the SQL Editor, and create a private storage bucket named <code className="text-red-600 font-bold">sops</code>.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="font-bold text-slate-900 mb-1">2. Vercel Environment Secrets</div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Add <code className="text-red-600 font-bold">SUPABASE_URL</code>, <code className="text-red-600 font-bold">SUPABASE_SERVICE_ROLE_KEY</code>, and <code className="text-red-600 font-bold">GEMINI_API_KEY</code> to your Vercel project settings.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="font-bold text-slate-900 mb-1">3. GitHub CI/CD Pipeline</div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Every push to <code className="text-red-600 font-bold">main</code> triggers automatic linting, test validation, and zero-downtime deployment on Vercel edge networks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
