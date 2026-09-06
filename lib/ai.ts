/**
 * Dialog Axiata PLC - Field Engineering SOP Assistant
 * Swappable AI Provider Module
 *
 * This module exports the contract specified in the architecture requirements:
 * 1. embed(text): Promise<number[]>
 * 2. generateAnswer(question, contextChunks, language): Promise<string>
 *
 * It is designed so that any LLM/Embedding provider (Gemini, OpenAI, Cohere, or an on-premise Dialog LLM)
 * can be plugged in without modifying any application routes or UI components.
 */

export interface SOPChunk {
  id: string;
  documentTitle: string;
  version: string;
  sectionLabel: string;
  content: string;
  similarity?: number;
}

export type SupportedLanguage = 'en' | 'si' | 'ta';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  si: 'Sinhala (සිංහල)',
  ta: 'Tamil (தமிழ்)',
};

/**
 * EXACT SYSTEM INSTRUCTION MANDATED BY DIALOG AXIATA PLC
 */
export const SYSTEM_PROMPT_TEMPLATE = (languageName: string) => `You are an internal SOP assistant for Dialog Axiata field engineers. Answer ONLY using the provided SOP excerpts below. Do not use outside knowledge and do not guess. If the excerpts do not contain the answer, say so clearly and tell the officer to escalate to their supervisor or the engineering desk — do not attempt a partial answer. Structure every answer with these headings where relevant: Health & Safety, Tools & Materials Required, Procedure, Site Cleanup & Handover. Use bullet points and numbered steps. Respond in ${languageName}. After the answer, list the source SOP title(s) and section(s) used.`;

// ==============================================================================
// 1. EMBEDDING FUNCTION (STUB / SWAPPABLE)
// ==============================================================================

/**
 * Generates a 1536-dimensional vector embedding for a given text.
 *
 * [STUB NOTICE]
 * Replace the body of this function with your preferred provider:
 * - OpenAI: text-embedding-3-small (1536 dims)
 * - Gemini: text-embedding-004 (768 or 1536 padded/projected)
 * - Cohere / HuggingFace / Local Ollama
 */
export async function embed(text: string): Promise<number[]> {
  // Check if GEMINI_API_KEY is available for live embedding
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      // Dynamic import to keep this module decoupled
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });

      const respAny = response as any;
      const values = respAny.embedding?.values || respAny.embeddings?.[0]?.values;
      if (values) {
        const raw = values as number[];
        // Project or pad/slice to 1536 dimensions if needed to match vector(1536)
        if (raw.length === 1536) return raw;
        if (raw.length < 1536) {
          const padded = new Array(1536).fill(0);
          for (let i = 0; i < raw.length; i++) padded[i] = raw[i];
          return padded;
        }
        return raw.slice(0, 1536);
      }
    } catch (err) {
      console.warn('[lib/ai.ts] Gemini embed failed, falling back to deterministic vector stub:', err);
    }
  }

  // --------------------------------------------------------------------------
  // DETERMINISTIC STUB IMPLEMENTATION (Zero-cost, works offline/in preview)
  // Generates a normalized 1536-dimensional pseudo-semantic vector based on
  // token hashing so cosine similarity faithfully ranks relevant keywords.
  // --------------------------------------------------------------------------
  return generateDeterministicEmbedding(text, 1536);
}

// ==============================================================================
// 2. ANSWER GENERATION FUNCTION (STUB / SWAPPABLE)
// ==============================================================================

/**
 * Generates an answer strictly grounded in the provided SOP excerpts.
 *
 * [STUB NOTICE]
 * Wire your external AI provider here. The exact system prompt and context chunks
 * are assembled for you below.
 */
export async function generateAnswer(
  question: string,
  contextChunks: SOPChunk[],
  language: SupportedLanguage = 'en'
): Promise<string> {
  const languageName = LANGUAGE_NAMES[language] || 'English';
  const systemInstruction = SYSTEM_PROMPT_TEMPLATE(languageName);

  // If no chunks matched or relevance is very low:
  if (!contextChunks || contextChunks.length === 0) {
    return getUnansweredMessage(language, "No relevant SOP documents were retrieved for your query.");
  }

  // Format context excerpts
  const formattedExcerpts = contextChunks
    .map((c, i) => `[EXCERPT ${i + 1}] SOP Title: "${c.documentTitle}" (v${c.version}) | Section: "${c.sectionLabel}"\n${c.content}`)
    .join('\n\n---\n\n');

  // Attempt live provider if GEMINI_API_KEY is configured
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt = `${systemInstruction}\n\nSOP EXCERPTS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      if (response.text && response.text.trim()) {
        return response.text.trim();
      }
    } catch (err) {
      console.warn('[lib/ai.ts] Gemini generation failed, falling back to procedural SOP synthesis stub:', err);
    }
  }

  // --------------------------------------------------------------------------
  // HIGH-FIDELITY STUB SYNTHESIS
  // Extracts relevant procedural sections from the provided chunks and constructs
  // the exact structured response required by the Dialog Axiata SOP specification.
  // --------------------------------------------------------------------------
  return synthesizeStubAnswer(question, contextChunks, language);
}

// ==============================================================================
// HELPER FUNCTIONS & DETERMINISTIC STUB IMPLEMENTATION
// ==============================================================================

function generateDeterministicEmbedding(text: string, dimensions: number = 1536): number[] {
  const vec = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length > 1);

  if (words.length === 0) return vec;

  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'what', 'which', 'where', 'when',
    'are', 'was', 'were', 'have', 'has', 'had', 'been', 'does', 'doing', 'into', 'over'
  ]);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (STOP_WORDS.has(word)) continue;

    // Primary hash (FNV-1a)
    let hash = 2166136261;
    for (let c = 0; c < word.length; c++) {
      hash ^= word.charCodeAt(c);
      hash = Math.imul(hash, 16777619);
    }

    const idx = Math.abs(hash) % dimensions;
    const weight = word.length > 4 ? 2.5 : 1.0;
    vec[idx] += weight;

    // Secondary projection for n-gram / subword stability
    const subHash = Math.abs((hash ^ 0x5bd1e995) >>> 0) % dimensions;
    vec[subHash] += weight * 0.5;
  }

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  }

  return vec;
}

export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getUnansweredMessage(lang: SupportedLanguage, reason?: string): string {
  if (lang === 'si') {
    return `මෙම ප්‍රශ්නයට අදාළ පිළිතුර අනුමත Dialog SOP ලේඛනවල සොයාගත නොහැක.\n\nකරුණාකර ඔබේ ක්ෂේත්‍ර අධීක්ෂකවරයා (Field Supervisor) හෝ Dialog ඉංජිනේරු කවුළුව (Engineering Helpdesk) අමතන්න. අනවසර පියවර අනුගමනය නොකරන්න.`;
  }
  if (lang === 'ta') {
    return `இந்தக் கேள்விக்கான விடை அங்கீகரிக்கப்பட்ட Dialog SOP ஆவணங்களில் காணப்படவில்லை.\n\nதயவுசெய்து உங்கள் கள மேற்பார்வையாளர் (Field Supervisor) அல்லது Dialog பொறியியல் பிரிவை (Engineering Helpdesk) தொடர்பு கொள்ளவும். வழிகாட்டுதல் இன்றி தொடர வேண்டாம்.`;
  }
  return `This information is not found in the approved Dialog Axiata SOPs.\n\nPlease escalate this query immediately to your field supervisor or the Dialog Engineering Desk. Do not attempt unverified procedures or proceed without approved guidance.`;
}

function synthesizeStubAnswer(
  question: string,
  contextChunks: SOPChunk[],
  language: SupportedLanguage
): string {
  if (!contextChunks || contextChunks.length === 0) {
    return getUnansweredMessage(language);
  }

  // Extract meaningful query keywords
  const stopWords = new Set(['what', 'when', 'where', 'which', 'whom', 'whose', 'does', 'have', 'been', 'with', 'from', 'this', 'that', 'they', 'your', 'about']);
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Score each chunk based on keyword occurrence and cosine similarity
  const scored = contextChunks.map(chunk => {
    const textLower = (chunk.documentTitle + ' ' + chunk.sectionLabel + ' ' + chunk.content).toLowerCase();
    let kwMatches = 0;
    for (const kw of keywords) {
      if (textLower.includes(kw)) kwMatches++;
    }
    const score = (chunk.similarity || 0) * 2 + kwMatches;
    return { chunk, score, kwMatches };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  // If zero keyword match and similarity is low, report not found in SOPs
  if (top.kwMatches === 0 && (!top.chunk.similarity || top.chunk.similarity < 0.4)) {
    return getUnansweredMessage(language);
  }

  // Keep top relevant chunks (same top document or strong match)
  const targetDocTitle = top.chunk.documentTitle;
  const relevantChunks = scored
    .filter(s => s.chunk.documentTitle === targetDocTitle || s.kwMatches > 0)
    .slice(0, 4)
    .map(s => s.chunk);

  // Group sections from relevant chunks
  let healthSafety: string[] = [];
  let toolsMaterials: string[] = [];
  let procedureSteps: string[] = [];
  let siteCleanup: string[] = [];
  const sourcesUsed = new Set<string>();

  for (const chunk of relevantChunks) {
    sourcesUsed.add(`"${chunk.documentTitle}" (v${chunk.version}) - Section: ${chunk.sectionLabel}`);
    const lines = chunk.content.split('\n').map(l => l.trim()).filter(Boolean);

    const secLabel = chunk.sectionLabel.toLowerCase();
    for (const line of lines) {
      const cleanLine = line.replace(/^[•\-\*]\s*/, '');
      if (secLabel.includes('health') || secLabel.includes('safety')) {
        healthSafety.push(cleanLine);
      } else if (secLabel.includes('tool') || secLabel.includes('material')) {
        toolsMaterials.push(cleanLine);
      } else if (secLabel.includes('cleanup') || secLabel.includes('handover')) {
        siteCleanup.push(cleanLine);
      } else if (secLabel.includes('procedure') || secLabel.includes('process') || secLabel.includes('step')) {
        procedureSteps.push(cleanLine);
      } else {
        procedureSteps.push(cleanLine);
      }
    }
  }

  // Dedup and limit
  const cleanList = (arr: string[], max: number = 4) => Array.from(new Set(arr)).slice(0, max);
  const hs = cleanList(healthSafety);
  const tm = cleanList(toolsMaterials);
  const proc = cleanList(procedureSteps, 6);
  const sc = cleanList(siteCleanup);

  // If no procedure lines were isolated, fallback to the top chunk's text
  if (proc.length === 0 && contextChunks.length > 0) {
    proc.push(contextChunks[0].content.slice(0, 300) + '...');
  }

  // Translate section titles if Sinhala/Tamil
  let headings = {
    hs: '### 🛡️ Health & Safety',
    tm: '### 🧰 Tools & Materials Required',
    proc: '### 📋 Procedure',
    sc: '### 🧹 Site Cleanup & Handover',
    sources: '### 📌 Source SOPs & Sections Used',
  };

  if (language === 'si') {
    headings = {
      hs: '### 🛡️ සෞඛ්‍ය හා ආරක්ෂාව (Health & Safety)',
      tm: '### 🧰 අවශ්‍ය උපකරණ සහ ද්‍රව්‍ය (Tools & Materials Required)',
      proc: '### 📋 ක්‍රියාපටිපාටිය (Procedure)',
      sc: '### 🧹 පරිශ්‍රය පිරිසිදු කිරීම සහ භාරදීම (Site Cleanup & Handover)',
      sources: '### 📌 භාවිතා කරන ලද SOP ලේඛන සහ කොටස්',
    };
  } else if (language === 'ta') {
    headings = {
      hs: '### 🛡️ சுகாதாரம் மற்றும் பாதுகாப்பு (Health & Safety)',
      tm: '### 🧰 தேவையான கருவிகள் மற்றும் பொருட்கள் (Tools & Materials)',
      proc: '### 📋 செயல்முறை (Procedure)',
      sc: '### 🧹 தள தூய்மைப்படுத்தல் மற்றும் ஒப்படைப்பு (Cleanup & Handover)',
      sources: '### 📌 பயன்படுத்தப்பட்ட SOP மூல ஆவணங்கள்',
    };
  }

  let answer = '';

  if (hs.length > 0) {
    answer += `${headings.hs}\n` + hs.map(item => `* ${item}`).join('\n') + '\n\n';
  }

  if (tm.length > 0) {
    answer += `${headings.tm}\n` + tm.map(item => `* ${item}`).join('\n') + '\n\n';
  }

  if (proc.length > 0) {
    answer += `${headings.proc}\n` + proc.map((item, idx) => {
      if (/^step\s*\d+/i.test(item)) return item;
      return `${idx + 1}. ${item}`;
    }).join('\n') + '\n\n';
  }

  if (sc.length > 0) {
    answer += `${headings.sc}\n` + sc.map(item => `* ${item}`).join('\n') + '\n\n';
  }

  answer += `${headings.sources}\n` + Array.from(sourcesUsed).map(s => `* ${s}`).join('\n');

  return answer;
}
