import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { sopStore } from './server/sopStore.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ------------------------------------------------------------------------------
// API Routes
// ------------------------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Dialog SOP Assistant API', timestamp: new Date().toISOString() });
});

// Profiles & Auth
app.get('/api/profiles', (req, res) => {
  const profiles = sopStore.getAllProfiles();
  res.json(profiles);
});

app.post('/api/profiles/language', (req, res) => {
  const { userId, language } = req.body;
  if (!userId || !language) {
    return res.status(400).json({ error: 'Missing userId or language' });
  }
  const updated = sopStore.updateProfileLanguage(userId, language);
  res.json({ profile: updated });
});

// Rate limiting check
app.get('/api/rate-limit', (req, res) => {
  const userId = (req.query.userId as string) || 'usr-officer-01';
  const status = sopStore.checkRateLimit(userId, 50);
  res.json(status);
});

// Chats
app.get('/api/chats', (req, res) => {
  const userId = (req.query.userId as string) || 'usr-officer-01';
  const chats = sopStore.getUserChats(userId);
  res.json(chats);
});

app.post('/api/chats', (req, res) => {
  const { userId, title } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  const chat = sopStore.createChat(userId, title);
  res.json(chat);
});

app.get('/api/chats/:id/messages', (req, res) => {
  const messages = sopStore.getChatMessages(req.params.id);
  res.json(messages);
});

// Message Generation with pgvector cosine similarity and AI synthesis
app.post('/api/chat/message', async (req, res) => {
  try {
    const { userId, chatId, question } = req.body;

    if (!userId || !chatId || !question || !question.trim()) {
      return res.status(400).json({ error: 'Missing userId, chatId, or question' });
    }

    // 1. Enforce per-user hourly rate limiting
    const rateLimit = sopStore.checkRateLimit(userId, 50);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: `Hourly rate limit exceeded (${rateLimit.limit} queries/hour). Please try again in ${rateLimit.resetMinutes} minutes to control engineering costs.`,
        rateLimit,
      });
    }

    // 2. Query SOP chunks via cosine similarity and generate grounded answer
    const result = await sopStore.handleUserQuestion(userId, chatId, question.trim());

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
app.post('/api/chat/feedback', (req, res) => {
  const { messageId, feedback, feedbackNotes } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: 'Missing messageId' });
  }
  const updated = sopStore.updateMessageFeedback(messageId, feedback, feedbackNotes);
  res.json({ message: updated });
});

// Admin Document Management
app.get('/api/admin/documents', (req, res) => {
  const docs = sopStore.getDocuments();
  res.json(docs);
});

app.post('/api/admin/documents/archive', (req, res) => {
  const { documentId } = req.body;
  if (!documentId) {
    return res.status(400).json({ error: 'Missing documentId' });
  }
  const success = sopStore.archiveDocument(documentId);
  res.json({ success });
});

app.post('/api/admin/documents/upload', async (req, res) => {
  try {
    const { adminUserId, title, version, rawText, archiveOldVersionId, base64Pdf } = req.body;

    if (!adminUserId || !title || !version) {
      return res.status(400).json({ error: 'Missing required fields: adminUserId, title, version' });
    }

    let extractedText = rawText || '';

    // If PDF base64 provided, attempt server-side pdf-parse extraction
    if (base64Pdf && !extractedText) {
      try {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const buffer = Buffer.from(base64Pdf.replace(/^data:application\/pdf;base64,/, ''), 'base64');
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text;
      } catch (pdfErr) {
        console.warn('pdf-parse failed or not available for binary buffer, using text fallback:', pdfErr);
      }
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: 'No readable text content found in uploaded SOP document.' });
    }

    const { document, job } = await sopStore.uploadAndIndexSOP(
      adminUserId,
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

app.get('/api/admin/indexing-jobs', (req, res) => {
  const jobs = sopStore.getIndexingJobs();
  res.json(jobs);
});

// Admin Analytics
app.get('/api/admin/analytics', (req, res) => {
  const analytics = sopStore.getAnalytics();
  res.json(analytics);
});

// ------------------------------------------------------------------------------
// Vite Middleware / Static Server
// ------------------------------------------------------------------------------
async function startServer() {
  // Ensure all initial SOP documents and vector embeddings are ready
  await sopStore.ensureInitialized();

  if (process.env.NODE_ENV !== 'production') {
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

startServer();
