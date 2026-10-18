import express from 'express';
import path from 'path';
import { sopStore } from './server/sopStore.js';
import { getActiveAIProvider } from './lib/ai.js';
import { isSupabaseConfigured, isSupabaseAvailable } from './server/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Lazy bootstrap for serverless functions
let bootstrapPromise: Promise<void> | null = null;
app.use(async (req, res, next) => {
  if (req.url && req.url.startsWith('/api')) {
    try {
      if (!bootstrapPromise) {
        bootstrapPromise = sopStore.ensureInitialized().catch((err) => {
          console.log('[Server] Supabase bootstrap info:', err?.message || err);
        });
      }
      await bootstrapPromise;
    } catch {
      // Continue even if initial bootstrap had non-fatal warning
    }
  }
  next();
});

// ------------------------------------------------------------------------------
// API Routes (Directly synced to Supabase PostgreSQL & pgvector)
// ------------------------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Dialog SOP Assistant API',
    supabase: {
      configured: isSupabaseConfigured(),
      available: isSupabaseAvailable(),
    },
    timestamp: new Date().toISOString(),
  });
});

// AI Provider Status (reports active engine: RapidAPI / Gemini / Deterministic)
app.get('/api/ai/status', (req, res) => {
  try {
    const status = getActiveAIProvider();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve AI provider status' });
  }
});

// Authentication (Direct Database Auth with Supabase + High-Availability Fallback)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password.' });
    }
    const authResult = await sopStore.authenticateUser(email, password);
    res.json(authResult);
  } catch (err: any) {
    console.log('Authentication note:', err?.message || err);
    res.status(401).json({
      error: err?.message || 'Authentication failed. Please check your credentials.'
    });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = req.body.token || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided.' });
    }
    const verified = await sopStore.verifySession(token);
    res.json(verified);
  } catch (err: any) {
    res.status(401).json({ error: err?.message || 'Invalid or expired session.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Profiles & Language
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await sopStore.getAllProfiles();
    res.json(profiles);
  } catch (err: any) {
    console.error('Error fetching profiles:', err);
    res.status(500).json({ error: 'Failed to fetch profiles from database' });
  }
});

app.post('/api/profiles/language', async (req, res) => {
  try {
    const { userId, language } = req.body;
    if (!userId || !language) {
      return res.status(400).json({ error: 'Missing userId or language' });
    }
    const updated = await sopStore.updateProfileLanguage(userId, language);
    res.json({ profile: updated });
  } catch (err: any) {
    console.error('Error updating language:', err);
    res.status(500).json({ error: 'Failed to update profile language' });
  }
});

// Rate limiting check
app.get('/api/rate-limit', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const status = await sopStore.checkRateLimit(userId, 50);
    res.json(status);
  } catch (err: any) {
    res.json({ allowed: true, limit: 50, used: 0, resetMinutes: 60 });
  }
});

// Chats
app.get('/api/chats', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.json([]);
    }
    const chats = await sopStore.getUserChats(userId);
    res.json(chats || []);
  } catch (err: any) {
    console.error('Error fetching chats (returning empty array):', err);
    res.json([]);
  }
});

app.post('/api/chats', async (req, res) => {
  try {
    const { userId, title } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    const chat = await sopStore.createChat(userId, title);
    res.json(chat);
  } catch (err: any) {
    console.error('Error creating chat (fallback):', err);
    res.json({
      id: 'chat-' + Date.now(),
      user_id: req.body?.userId || 'default',
      title: req.body?.title || 'New SOP Consultation',
      created_at: new Date().toISOString(),
      message_count: 0,
    });
  }
});

app.get('/api/chats/:id/messages', async (req, res) => {
  try {
    const messages = await sopStore.getChatMessages(req.params.id);
    res.json(messages || []);
  } catch (err: any) {
    console.error('Error fetching chat messages (returning empty array):', err);
    res.json([]);
  }
});

// Delete Chat session
app.delete('/api/chats/:id', async (req, res) => {
  try {
    const chatId = req.params.id;
    if (!chatId) {
      return res.status(400).json({ error: 'Missing chatId' });
    }
    const success = await sopStore.deleteChat(chatId);
    res.json({ success });
  } catch (err: any) {
    console.error('Error deleting chat:', err);
    res.status(500).json({ error: 'Failed to delete chat session' });
  }
});

// Message Generation with live pgvector similarity & grounded Gemini synthesis
app.post('/api/chat/message', async (req, res) => {
  try {
    const { userId, chatId, question } = req.body;

    if (!userId || !question || !question.trim()) {
      return res.status(400).json({ error: 'Missing userId or question' });
    }

    let activeChatId = chatId;
    if (!activeChatId) {
      const newChat = await sopStore.createChat(userId, question.slice(0, 40));
      activeChatId = newChat.id;
    }

    // 1. Enforce per-user hourly rate limiting
    const rateLimit = await sopStore.checkRateLimit(userId, 50);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: `Hourly rate limit exceeded (${rateLimit.limit} queries/hour). Please try again in ${rateLimit.resetMinutes} minutes to control engineering costs.`,
        rateLimit,
      });
    }

    // 2. Query SOP chunks via cosine similarity and generate grounded answer
    const result = await sopStore.handleUserQuestion(userId, activeChatId, question.trim());

    res.json({
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      rateLimit,
    });
  } catch (error: any) {
    console.error('Error handling chat message:', error);
    res.status(500).json({
      error: error?.message || 'Failed to process SOP question. Please retry your inquiry.',
      canRetry: true,
    });
  }
});

// Message Feedback
app.post('/api/chat/feedback', async (req, res) => {
  try {
    const { messageId, feedback, feedbackNotes } = req.body;
    if (!messageId) {
      return res.status(400).json({ error: 'Missing messageId' });
    }
    const updated = await sopStore.updateMessageFeedback(messageId, feedback, feedbackNotes);
    res.json({ message: updated });
  } catch (err: any) {
    console.error('Error updating feedback:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// Admin Document Management
app.get('/api/admin/documents', async (req, res) => {
  try {
    const docs = await sopStore.getDocuments();
    res.json(docs);
  } catch (err: any) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.get('/api/admin/documents/:id/text', async (req, res) => {
  try {
    const docText = await sopStore.getDocumentText(req.params.id);
    if (!docText) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(docText);
  } catch (err: any) {
    console.error('Error fetching document text:', err);
    res.status(500).json({ error: 'Failed to fetch document text' });
  }
});

app.post('/api/admin/documents/archive', async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId' });
    }
    const success = await sopStore.archiveDocument(documentId);
    res.json({ success });
  } catch (err: any) {
    console.error('Error archiving document:', err);
    res.status(500).json({ error: 'Failed to archive document' });
  }
});

app.post('/api/admin/documents/restore', async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId' });
    }
    const success = await sopStore.restoreDocument(documentId);
    res.json({ success });
  } catch (err: any) {
    console.error('Error restoring document:', err);
    res.status(500).json({ error: 'Failed to restore document' });
  }
});

app.delete('/api/admin/documents/:id', async (req, res) => {
  try {
    const documentId = req.params.id;
    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId parameter' });
    }
    const success = await sopStore.deleteDocument(documentId);
    res.json({ success });
  } catch (err: any) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

app.post('/api/admin/documents/delete', async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId' });
    }
    const success = await sopStore.deleteDocument(documentId);
    res.json({ success });
  } catch (err: any) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Purge any default/sample SOPs completely from database and memory
app.post('/api/admin/clear-all-samples', async (req, res) => {
  try {
    const result = await sopStore.clearAllSampleSOPs();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Error clearing sample SOPs:', err);
    res.status(500).json({ error: 'Failed to clear sample SOPs' });
  }
});

/**
 * Robust server-side PDF text extractor supporting both pdf-parse v1 and v2 class instances
 */
async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  // 1. Try pdf-parse v2 and v1
  try {
    const pdfParseMod: any = await import('pdf-parse');
    if (pdfParseMod.PDFParse) {
      const parser: any = new pdfParseMod.PDFParse({ data: buffer });
      if (typeof parser.load === 'function') {
        await parser.load();
      }
      const res = await parser.getText();
      if (res && typeof res.text === 'string' && res.text.trim()) return res.text;
    }
    const legacyFn = pdfParseMod.default || pdfParseMod;
    if (typeof legacyFn === 'function') {
      const parsed = await legacyFn(buffer);
      if (parsed && typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text;
    }
  } catch (err) {
    console.log('[PDF] Primary pdf-parse extraction info:', err);
  }

  // 2. Fallback: text stream pattern scan for uncompressed PDF text blocks
  try {
    const raw = buffer.toString('latin1');
    const textMatches: string[] = [];
    const re = /\(([^()]{2,})\)\s*T[jJ]/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      const str = match[1].replace(/\\([()\\])/g, '$1').trim();
      if (str.length > 2 && !/^[\x00-\x1F\x7F]+$/.test(str)) {
        textMatches.push(str);
      }
    }
    if (textMatches.length > 8) {
      return textMatches.join(' ');
    }
  } catch (fallbackErr) {
    console.log('[PDF] Fallback text stream scan note:', fallbackErr);
  }

  return '';
}

// PDF Pre-extraction endpoint for admin upload live preview (supports both raw binary & base64)
app.post('/api/admin/documents/parse-pdf', async (req, res) => {
  try {
    let buffer: Buffer | null = null;

    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body && typeof req.body.base64Pdf === 'string') {
      const cleanBase64 = req.body.base64Pdf.replace(/^data:application\/pdf;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Missing or empty PDF payload. Please select a valid PDF file.' });
    }

    const text = await parsePdfBuffer(buffer);

    if (!text || !text.trim()) {
      return res.status(422).json({
        error: 'Could not extract readable text from the provided PDF file. The document may be scanned as raster images or password-protected. You can paste the SOP text directly into the editor.',
      });
    }

    res.json({ text, sizeBytes: buffer.length });
  } catch (err: any) {
    console.error('Error parsing PDF:', err);
    res.status(500).json({ error: 'Server error processing PDF: ' + (err?.message || err) });
  }
});

app.post('/api/admin/documents/upload', async (req, res) => {
  try {
    const { adminUserId, title, version, rawText, archiveOldVersionId, base64Pdf } = req.body;

    if (!title || !version) {
      return res.status(400).json({ error: 'Missing required fields: title, version' });
    }

    const effectiveAdminUserId = adminUserId || '8eb16907-4c80-4acb-a609-8a9f9c9b23a7';

    let extractedText = rawText || '';

    // If PDF base64 provided, extract text via robust server-side parser
    if (base64Pdf && (!extractedText || !extractedText.trim())) {
      const cleanBase64 = base64Pdf.replace(/^data:application\/pdf;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      extractedText = await parsePdfBuffer(buffer);
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: 'No readable text content found in uploaded SOP document.' });
    }

    const { document, job } = await sopStore.uploadAndIndexSOP(
      effectiveAdminUserId,
      title,
      version,
      extractedText,
      `sops/dialog_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v${version}.pdf`,
      archiveOldVersionId
    );

    res.json({ document, job });
  } catch (err: any) {
    console.error('Error uploading SOP document:', err);
    res.status(500).json({ error: err?.message || 'Failed to process and index SOP document' });
  }
});

app.get('/api/admin/indexing-jobs', async (req, res) => {
  try {
    const jobs = await sopStore.getIndexingJobs();
    res.json(jobs);
  } catch (err: any) {
    console.error('Error fetching indexing jobs:', err);
    res.status(500).json({ error: 'Failed to fetch indexing jobs' });
  }
});

// Admin Analytics
app.get('/api/admin/analytics', async (req, res) => {
  try {
    const analytics = await sopStore.getAnalytics();
    res.json(analytics);
  } catch (err: any) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ------------------------------------------------------------------------------
// Vite Middleware / Static Server
// ------------------------------------------------------------------------------
async function startServer() {
  // Ensure all initial SOP documents and vector embeddings are ready in Supabase
  await sopStore.ensureInitialized();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Dialog SOP Assistant] Server running on http://0.0.0.0:${PORT}`);
  });
}

// Launch the HTTP listener when running in development or Cloud Run container
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
if (!isServerless) {
  startServer();
}

export { app };
export default app;

