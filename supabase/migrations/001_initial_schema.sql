-- ==============================================================================
-- Dialog Axiata PLC - Field Engineering SOP Assistant
-- Supabase Postgres Migration 001: Initial Schema & pgvector Configuration
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('officer', 'admin')),
    full_name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'si', 'ta')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. SOP Documents table
CREATE TABLE IF NOT EXISTS public.sop_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. SOP Chunks table with 1536-dimensional vector embedding (cosine similarity)
CREATE TABLE IF NOT EXISTS public.sop_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    section_label TEXT NOT NULL
);

-- Index on SOP Chunks using IVFFLAT with vector_cosine_ops
-- (lists parameter can be tuned; 100 is ideal for medium-scale document bases)
CREATE INDEX IF NOT EXISTS idx_sop_chunks_embedding 
ON public.sop_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Foreign key lookup index
CREATE INDEX IF NOT EXISTS idx_sop_chunks_document_id ON public.sop_chunks(document_id);

-- 5. Chats table
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New SOP Consultation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON public.chats(created_at DESC);

-- 6. Messages table with structured citations and feedback
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    feedback TEXT CHECK (feedback IN ('up', 'down', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_feedback ON public.messages(feedback) WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at ASC);

-- 7. Indexing Jobs table for async PDF processing
CREATE TABLE IF NOT EXISTS public.indexing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_indexing_jobs_document_id ON public.indexing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON public.indexing_jobs(status);
