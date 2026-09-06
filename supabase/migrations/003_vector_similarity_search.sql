-- ==============================================================================
-- Dialog Axiata PLC - Field Engineering SOP Assistant
-- Supabase Postgres Migration 003: Vector Search Function (RPC)
-- ==============================================================================

-- Stored Procedure to perform vector cosine similarity search across active SOP chunks
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
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
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.match_sop_chunks(VECTOR(1536), FLOAT, INT) TO authenticated;
