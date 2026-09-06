export type UserRole = 'officer' | 'admin';
export type SupportedLanguage = 'en' | 'si' | 'ta';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  language: SupportedLanguage;
  created_at?: string;
  updated_at?: string;
}

export type DocumentStatus = 'active' | 'archived';

export interface SOPDocument {
  id: string;
  title: string;
  version: string;
  storage_path: string;
  status: DocumentStatus;
  uploaded_by: string;
  uploaded_at: string;
  uploader_name?: string;
  chunk_count?: number;
}

export interface SOPChunk {
  id: string;
  document_id: string;
  content: string;
  embedding?: number[];
  section_label: string;
  document_title?: string;
  document_version?: string;
  similarity?: number;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  message_count?: number;
  last_message?: string;
}

export interface Citation {
  documentTitle: string;
  version: string;
  sectionLabel: string;
  excerpt: string;
  similarity?: number;
}

export type MessageFeedback = 'up' | 'down' | null;

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  feedback: MessageFeedback;
  feedback_notes?: string;
  created_at: string;
}

export type IndexingStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface IndexingJob {
  id: string;
  document_id: string;
  document_title?: string;
  status: IndexingStatus;
  error?: string | null;
  created_at: string;
  extracted_sections_count?: number;
}

export interface AnalyticsSummary {
  totalQueries: number;
  helpfulCount: number;
  flaggedCount: number;
  unansweredCount: number;
  activeDocumentsCount: number;
  mostAskedQuestions: Array<{
    question: string;
    count: number;
    category: string;
    lastAsked: string;
  }>;
  flaggedDownMessages: Array<{
    id: string;
    chatId: string;
    question: string;
    answer: string;
    citations: Citation[];
    officerName: string;
    createdAt: string;
    feedbackNotes?: string;
  }>;
  unansweredQueries: Array<{
    id: string;
    question: string;
    officerName: string;
    createdAt: string;
    language: SupportedLanguage;
    suggestedDomain: string;
  }>;
}

export interface RateLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  resetMinutes: number;
}
