-- ==============================================================================
-- Dialog Axiata PLC - Field Engineering SOP Assistant
-- Supabase Postgres Migration 002: Row-Level Security (RLS) Policies
-- ==============================================================================

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexing_jobs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the requesting user is an admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 1. Profiles Policies
-- ------------------------------------------------------------------------------
-- Unauthenticated users have NO access
-- Users can read their own profile; admins can read all profiles
CREATE POLICY "Allow authenticated users to read their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- Users can update their own profile (e.g. language preference)
CREATE POLICY "Allow authenticated users to update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 2. SOP Documents Policies
-- ------------------------------------------------------------------------------
-- Authenticated users (officers and admins) can read active SOP documents
CREATE POLICY "Allow authenticated users to read active sop_documents"
ON public.sop_documents FOR SELECT
TO authenticated
USING (status = 'active' OR public.is_admin(auth.uid()));

-- Only admins can insert sop_documents
CREATE POLICY "Allow admins to insert sop_documents"
ON public.sop_documents FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update sop_documents (e.g. mark status = 'archived')
CREATE POLICY "Allow admins to update sop_documents"
ON public.sop_documents FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can delete sop_documents
CREATE POLICY "Allow admins to delete sop_documents"
ON public.sop_documents FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 3. SOP Chunks Policies
-- ------------------------------------------------------------------------------
-- Authenticated users can read chunks of active documents
CREATE POLICY "Allow authenticated users to read sop_chunks of active docs"
ON public.sop_chunks FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sop_documents d
    WHERE d.id = sop_chunks.document_id AND (d.status = 'active' OR public.is_admin(auth.uid()))
  )
);

-- Only admins can insert sop_chunks
CREATE POLICY "Allow admins to insert sop_chunks"
ON public.sop_chunks FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update sop_chunks
CREATE POLICY "Allow admins to update sop_chunks"
ON public.sop_chunks FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can delete sop_chunks
CREATE POLICY "Allow admins to delete sop_chunks"
ON public.sop_chunks FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 4. Chats Policies
-- ------------------------------------------------------------------------------
-- Officers & admins can only read their own chats
CREATE POLICY "Allow users to read their own chats"
ON public.chats FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Users can create chats for themselves
CREATE POLICY "Allow users to create their own chats"
ON public.chats FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own chats
CREATE POLICY "Allow users to update their own chats"
ON public.chats FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own chats
CREATE POLICY "Allow users to delete their own chats"
ON public.chats FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 5. Messages Policies
-- ------------------------------------------------------------------------------
-- Users can only read messages belonging to their own chats
CREATE POLICY "Allow users to read messages in their own chats"
ON public.messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = messages.chat_id AND (c.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);

-- Users can insert messages in their own chats
CREATE POLICY "Allow users to insert messages in their own chats"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = messages.chat_id AND c.user_id = auth.uid()
  )
);

-- Users can update feedback on messages in their own chats
CREATE POLICY "Allow users to update message feedback in their chats"
ON public.messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = messages.chat_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = messages.chat_id AND c.user_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- 6. Indexing Jobs Policies
-- ------------------------------------------------------------------------------
-- Only admins can read/write indexing jobs
CREATE POLICY "Allow admins full access to indexing_jobs"
ON public.indexing_jobs FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
