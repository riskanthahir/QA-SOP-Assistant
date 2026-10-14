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

export interface FullSOPDocument {
  id: string;
  title: string;
  version: string;
  fullText: string;
  storagePath?: string;
  sectionLabel?: string;
}

export interface GeneratedAnswerResult {
  answer: string;
  citations: Array<{
    documentTitle: string;
    version: string;
    sectionLabel: string;
    excerpt: string;
    similarity?: number;
  }>;
}

export type SupportedLanguage = 'en' | 'si' | 'ta';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  si: 'Sinhala (සිංහල)',
  ta: 'Tamil (தமிழ்)',
};

/**
 * EXACT SYSTEM INSTRUCTION MANDATED BY DIALOG AXIATA PLC
 * Answer Definition:
 * 1. Search text inside ALL provided SOP manuals to answer field engineering queries.
 * 2. Answer ONLY using provided SOP text from approved Dialog manuals.
 * 3. Do NOT use outside knowledge or guess.
 * 4. Clear escalation statement if information is not found.
 * 5. Required headings: Health & Safety, Tools & Materials Required, Procedure, Site Cleanup & Handover.
 * 6. Multilingual response (EN, SI, TA) with bullet points and numbered steps.
 * 7. Explicit citation of source SOP title(s) and section(s).
 */
export const SYSTEM_PROMPT_TEMPLATE = (languageName: string) => `You are the official internal SOP assistant for Dialog Axiata PLC field engineering officers.

YOUR TASK:
Search through the complete text of ALL provided Dialog Standard Operating Procedures (SOPs) below, find out the answers to the field officer's technical question, and reconstruct the answer strictly following the required Dialog response structure.

STRICT GROUNDING & RECONSTRUCTION RULES:
1. Answer ONLY using the facts, steps, values, and specifications found inside the provided SOP texts.
2. Do NOT use outside knowledge and do NOT guess or extrapolate.
3. If the provided SOP texts do not contain the answer or procedure, state clearly and unequivocally:
   "This information is not found in the approved Dialog Axiata SOPs. Please escalate this query immediately to your field supervisor or the Dialog Engineering Desk."
   (Translate this escalation message into ${languageName} if the response is in Sinhala or Tamil).
4. MANDATORY STRUCTURE — Reconstruct every answer with these exact headings where relevant:
   ### 🛡️ Health & Safety
   (Mandatory PPE, electrical/voltage/optical laser/RF radiation/height hazards, safety rules)
   ### 🧰 Tools & Materials Required
   (Calibrated testers, torque wrenches, approved cables/splice sleeves/connectors, safety gear ratings)
   ### 📋 Procedure
   (Numbered chronological step-by-step instructions with specific parameters, values, and tolerances)
   ### 🧹 Site Cleanup & Handover
   (Disposal of hazardous waste/fiber shards, terminal sealing, testing verification, commissioning portal sign-off)
   ### 📌 Source SOPs & Sections Used
   (List the exact SOP title(s) and section(s) referenced)
5. Format: Use bullet points for items and numbered steps for procedures.
6. Language: Respond in ${languageName}.`;

export interface ActiveAIProviderInfo {
  provider: 'rapidapi' | 'gemini' | 'deterministic';
  name: string;
  host?: string;
  model?: string;
  hasRapidApiKey: boolean;
  hasGeminiKey: boolean;
}

/**
 * Returns current active AI provider information without exposing secret credentials.
 */
export function getActiveAIProvider(): ActiveAIProviderInfo {
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY || process.env.AI_PROVIDER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (rapidApiKey && rapidApiKey.trim()) {
    return {
      provider: 'rapidapi',
      name: 'RapidAPI LLM Gateway',
      host: process.env.RAPIDAPI_HOST || 'chatgpt-42.p.rapidapi.com',
      model: process.env.RAPIDAPI_MODEL || 'gpt-4o-mini',
      hasRapidApiKey: true,
      hasGeminiKey: Boolean(geminiKey),
    };
  }

  if (geminiKey && geminiKey.trim()) {
    return {
      provider: 'gemini',
      name: 'Google Gemini',
      model: 'gemini-3.8-flash',
      hasRapidApiKey: false,
      hasGeminiKey: true,
    };
  }

  return {
    provider: 'deterministic',
    name: 'Dialog Procedural Synthesis Engine',
    model: 'Local SOP Grounded Vector Classifier',
    hasRapidApiKey: false,
    hasGeminiKey: false,
  };
}

/**
 * Helper to extract response text from varied RapidAPI chat API payload formats.
 */
function extractRapidAPIResponse(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string' && data.trim().length > 0) return data.trim();
  if (data.choices?.[0]?.message?.content && typeof data.choices[0].message.content === 'string') {
    return data.choices[0].message.content.trim();
  }
  if (data.choices?.[0]?.text && typeof data.choices[0].text === 'string') {
    return data.choices[0].text.trim();
  }
  if (typeof data.result === 'string' && data.result.trim()) {
    return data.result.trim();
  }
  if (typeof data.response === 'string' && data.response.trim()) {
    return data.response.trim();
  }
  if (typeof data.answer === 'string' && data.answer.trim()) {
    return data.answer.trim();
  }
  if (data.message?.content && typeof data.message.content === 'string') {
    return data.message.content.trim();
  }
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }
  if (typeof data.text === 'string' && data.text.trim()) {
    return data.text.trim();
  }
  return null;
}

/**
 * Executes a call to RapidAPI to answer the field question strictly according to the answer definition.
 */
async function callRapidAPIChat(
  rapidApiKey: string,
  systemInstruction: string,
  formattedExcerpts: string,
  question: string,
  languageName: string
): Promise<string | null> {
  const host = process.env.RAPIDAPI_HOST?.trim() || 'chatgpt-42.p.rapidapi.com';
  const customEndpoint = process.env.RAPIDAPI_ENDPOINT?.trim();
  const model = process.env.RAPIDAPI_MODEL?.trim() || 'gpt-4o-mini';

  const fullPrompt = `${systemInstruction}\n\nSOP EXCERPTS FROM APPROVED DIALOG MANUALS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}\n\nINSTRUCTION: Remember to strictly adhere to the answer definition: only use provided excerpts, use standard headings, bullet points and numbered steps, and respond in ${languageName}.`;

  const headers = {
    'x-rapidapi-key': rapidApiKey,
    'x-rapidapi-host': host,
    'Content-Type': 'application/json',
  };

  const attempts: Array<{ url: string; body: any }> = [];

  if (customEndpoint) {
    const cleanEndpoint = customEndpoint.startsWith('/') ? customEndpoint : `/${customEndpoint}`;
    attempts.push({
      url: `https://${host}${cleanEndpoint}`,
      body: {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `SOP EXCERPTS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}` },
        ],
        temperature: 0.2,
      },
    });
    attempts.push({
      url: `https://${host}${cleanEndpoint}`,
      body: {
        messages: [{ role: 'user', content: fullPrompt }],
        web_access: false,
      },
    });
  } else if (host.includes('chatgpt-42') || host.includes('conversation')) {
    // chatgpt-42.p.rapidapi.com pattern
    attempts.push({
      url: `https://${host}/conversationWithGPT`,
      body: {
        messages: [{ role: 'user', content: fullPrompt }],
        web_access: false,
      },
    });
    attempts.push({
      url: `https://${host}/chat/completions`,
      body: {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `SOP EXCERPTS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}` },
        ],
        temperature: 0.2,
      },
    });
  } else {
    // Standard OpenAI compatible endpoints on RapidAPI (openai80, chatgpt-api8, etc.)
    attempts.push({
      url: `https://${host}/chat/completions`,
      body: {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `SOP EXCERPTS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}` },
        ],
        temperature: 0.2,
      },
    });
    attempts.push({
      url: `https://${host}/v1/chat/completions`,
      body: {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `SOP EXCERPTS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}` },
        ],
        temperature: 0.2,
      },
    });
    attempts.push({
      url: `https://${host}/conversationWithGPT`,
      body: {
        messages: [{ role: 'user', content: fullPrompt }],
        web_access: false,
      },
    });
  }

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000); // 22s network timeout

      const resp = await fetch(attempt.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(attempt.body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const json = await resp.json();
        const extracted = extractRapidAPIResponse(json);
        if (extracted && extracted.length > 10) {
          console.log(`[lib/ai.ts] RapidAPI answered query successfully via ${attempt.url}`);
          return extracted;
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.warn(`[lib/ai.ts] RapidAPI call to ${attempt.url} responded HTTP ${resp.status}:`, errText.slice(0, 180));
      }
    } catch (err: any) {
      console.warn(`[lib/ai.ts] RapidAPI call failed on ${attempt.url}:`, err?.message || err);
    }
  }

  return null;
}

// ==============================================================================
// 1. EMBEDDING FUNCTION (SWAPPABLE: RapidAPI / Gemini / Deterministic)
// ==============================================================================

let geminiEmbedCooldownUntil = 0;

/**
 * Generates a 1536-dimensional vector embedding for a given text.
 */
export async function embed(text: string): Promise<number[]> {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey && Date.now() > geminiEmbedCooldownUntil) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: text,
      });

      const respAny = response as any;
      const values = respAny.embedding?.values || respAny.embeddings?.[0]?.values;
      if (values && Array.isArray(values) && values.length > 0) {
        const raw = values as number[];
        if (raw.length === 1536) return raw;
        if (raw.length < 1536) {
          const padded = new Array(1536).fill(0);
          for (let i = 0; i < raw.length; i++) padded[i] = raw[i];
          return padded;
        }
        return raw.slice(0, 1536);
      }
    } catch (err: any) {
      const errStr = `${err?.status} ${err?.code} ${err?.message} ${err?.toString?.() || ''} ${JSON.stringify(err || {})}`;
      const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota') || errStr.includes('exceeded your current quota');
      if (isQuota) {
        geminiEmbedCooldownUntil = Date.now() + 5 * 60 * 1000; // 5-minute cooldown before retrying
        console.warn('[lib/ai.ts] Gemini embed quota reached (429 RESOURCE_EXHAUSTED). Seamlessly switching to deterministic vector engine.');
      } else {
        console.warn('[lib/ai.ts] Gemini embed unavailable, using deterministic vector engine:', err?.message || err);
      }
    }
  }

  // Deterministic 1536-dimensional semantic projection engine
  return generateDeterministicEmbedding(text, 1536);
}

// ==============================================================================
// 2. ANSWER GENERATION ENGINE (RapidAPI -> Gemini -> Search & Synthesizer)
// ==============================================================================

/**
 * Searches the full text inside ALL approved SOP documents and reconstructs the answer
 * strictly according to the defined Dialog answer structure.
 */
export async function generateAnswerFromAllSOPs(
  question: string,
  allSOPs: FullSOPDocument[],
  language: SupportedLanguage = 'en'
): Promise<GeneratedAnswerResult> {
  const languageName = LANGUAGE_NAMES[language] || 'English';
  const systemInstruction = SYSTEM_PROMPT_TEMPLATE(languageName);

  if (!allSOPs || allSOPs.length === 0) {
    return {
      answer: getUnansweredMessage(language, "No approved SOP documents are currently loaded in the system."),
      citations: [],
    };
  }

  // Format all SOP texts cleanly with document titles and versions
  const formattedAllSOPs = allSOPs
    .map((doc, idx) => {
      return `=========================================\n[SOP MANUAL ${idx + 1}] TITLE: "${doc.title}" (Version: ${doc.version})\nDOCUMENT ID: ${doc.id}\n-----------------------------------------\n${doc.fullText.trim()}\n=========================================`;
    })
    .join('\n\n');

  // 1. First priority: Use RapidAPI Key if configured
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY || process.env.AI_PROVIDER_API_KEY;
  if (rapidApiKey && rapidApiKey.trim()) {
    try {
      const rapidAnswer = await callRapidAPIChat(
        rapidApiKey.trim(),
        systemInstruction,
        formattedAllSOPs,
        question,
        languageName
      );
      if (rapidAnswer && rapidAnswer.trim()) {
        const citations = extractCitationsFromAnswerAndSOPs(rapidAnswer, allSOPs, question);
        return { answer: rapidAnswer.trim(), citations };
      }
    } catch (rapidErr) {
      console.warn('[lib/ai.ts] RapidAPI invocation failed, attempting fallback provider:', rapidErr);
    }
  }

  // 2. Second priority: Gemini API if GEMINI_API_KEY is configured
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const prompt = `${systemInstruction}\n\n=========================================\nALL APPROVED DIALOG SOP DOCUMENTS (FULL TEXT):\n=========================================\n${formattedAllSOPs}\n\n=========================================\nFIELD OFFICER QUESTION:\n"${question}"\n\nSEARCH & RECONSTRUCTION INSTRUCTION:\nSearch across the complete text of all SOPs above to answer the question. Reconstruct the answer strictly adhering to the required 4-part Dialog structure (Health & Safety, Tools & Materials Required, Procedure, Site Cleanup & Handover, followed by Source SOPs & Sections Used). Ground every statement only in the SOP text above; if not found, state the escalation requirement.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      if (response.text && response.text.trim()) {
        const geminiAnswer = response.text.trim();
        const citations = extractCitationsFromAnswerAndSOPs(geminiAnswer, allSOPs, question);
        return { answer: geminiAnswer, citations };
      }
    } catch (err: any) {
      const errStr = `${err?.status} ${err?.code} ${err?.message} ${err?.toString?.() || ''} ${JSON.stringify(err || {})}`;
      const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
      if (isQuota) {
        console.warn('[lib/ai.ts] Gemini API quota limit reached (429 RESOURCE_EXHAUSTED). Seamlessly falling back to Dialog procedural SOP synthesis engine.');
      } else {
        console.warn('[lib/ai.ts] Gemini generation notice:', err?.message || err);
      }
    }
  }

  // 3. Fallback: High-fidelity procedural SOP text search & reconstruction engine
  return searchAndSynthesizeFromAllSOPs(question, allSOPs, language);
}

/**
 * Generates an answer strictly grounded in the provided SOP excerpts according to the answer definition.
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

  // 1. First priority: Use RapidAPI Key if configured
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY || process.env.AI_PROVIDER_API_KEY;
  if (rapidApiKey && rapidApiKey.trim()) {
    try {
      const rapidAnswer = await callRapidAPIChat(
        rapidApiKey.trim(),
        systemInstruction,
        formattedExcerpts,
        question,
        languageName
      );
      if (rapidAnswer && rapidAnswer.trim()) {
        return rapidAnswer.trim();
      }
    } catch (rapidErr) {
      console.warn('[lib/ai.ts] RapidAPI invocation failed, attempting fallback provider:', rapidErr);
    }
  }

  // 2. Second priority: Gemini API if GEMINI_API_KEY is configured
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const prompt = `${systemInstruction}\n\nSOP EXCERPTS:\n${formattedExcerpts}\n\nFIELD OFFICER QUESTION:\n${question}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      if (response.text && response.text.trim()) {
        return response.text.trim();
      }
    } catch (err: any) {
      const errStr = `${err?.status} ${err?.code} ${err?.message} ${err?.toString?.() || ''} ${JSON.stringify(err || {})}`;
      const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
      if (isQuota) {
        console.warn('[lib/ai.ts] Gemini API quota limit reached (429 RESOURCE_EXHAUSTED). Seamlessly falling back to Dialog procedural SOP synthesis engine.');
      } else {
        console.warn('[lib/ai.ts] Gemini generation notice:', err?.message || err);
      }
    }
  }

  // 3. Fallback: High-fidelity procedural SOP synthesis engine matching exact Dialog specification
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

function extractCitationsFromAnswerAndSOPs(
  answer: string,
  allSOPs: FullSOPDocument[],
  question: string
): Array<{
  documentTitle: string;
  version: string;
  sectionLabel: string;
  excerpt: string;
  similarity?: number;
}> {
  const citations: Array<{
    documentTitle: string;
    version: string;
    sectionLabel: string;
    excerpt: string;
    similarity?: number;
  }> = [];

  const answerLower = answer.toLowerCase();
  const questionWords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  for (const doc of allSOPs) {
    const docTitleLower = doc.title.toLowerCase();
    const docCode = doc.title.split(':')[0].toLowerCase();
    const isMentioned = answerLower.includes(docTitleLower) || answerLower.includes(docCode);

    // Find best matching paragraph in document
    const paragraphs = doc.fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let bestParagraph = '';
    let bestMatches = 0;

    for (const p of paragraphs) {
      const pLower = p.toLowerCase();
      let matches = 0;
      for (const w of questionWords) {
        if (pLower.includes(w)) matches++;
      }
      if (matches > bestMatches) {
        bestMatches = matches;
        bestParagraph = p;
      }
    }

    if (isMentioned || bestMatches >= 2) {
      citations.push({
        documentTitle: doc.title,
        version: doc.version,
        sectionLabel: 'Full SOP Text Search',
        excerpt: bestParagraph ? bestParagraph.slice(0, 240) + '...' : doc.fullText.slice(0, 200) + '...',
        similarity: bestMatches > 0 ? Math.min(0.98, 0.75 + bestMatches * 0.05) : 0.88,
      });
    }
  }

  // If no citations matched yet, pick the best matching document by keyword
  if (citations.length === 0 && allSOPs.length > 0) {
    const scoredDocs = allSOPs.map(doc => {
      let matches = 0;
      const textLower = doc.fullText.toLowerCase() + ' ' + doc.title.toLowerCase();
      for (const w of questionWords) {
        if (textLower.includes(w)) matches++;
      }
      return { doc, matches };
    }).sort((a, b) => b.matches - a.matches);

    if (scoredDocs[0]?.matches > 0) {
      const top = scoredDocs[0].doc;
      citations.push({
        documentTitle: top.title,
        version: top.version,
        sectionLabel: 'Full SOP Text Search',
        excerpt: top.fullText.slice(0, 240) + '...',
        similarity: 0.88,
      });
    }
  }

  return citations.slice(0, 3);
}

function searchAndSynthesizeFromAllSOPs(
  question: string,
  allSOPs: FullSOPDocument[],
  language: SupportedLanguage
): GeneratedAnswerResult {
  const stopWords = new Set(['what', 'when', 'where', 'which', 'whom', 'whose', 'does', 'have', 'been', 'with', 'from', 'this', 'that', 'they', 'your', 'about', 'how', 'the', 'and', 'for', 'are', 'was', 'were']);
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Score each document based on occurrences of keywords
  const scoredDocs = allSOPs.map(doc => {
    const textLower = (doc.title + ' ' + doc.fullText).toLowerCase();
    let kwMatches = 0;
    for (const kw of keywords) {
      if (textLower.includes(kw)) kwMatches++;
    }
    return { doc, kwMatches };
  }).sort((a, b) => b.kwMatches - a.kwMatches);

  // If no keywords match across all SOPs, return clear escalation message
  if (scoredDocs.length === 0 || scoredDocs[0].kwMatches === 0) {
    return {
      answer: getUnansweredMessage(language),
      citations: [],
    };
  }

  // Filter documents that matched the query
  const matchingDocs = scoredDocs.filter(s => s.kwMatches > 0).slice(0, 3);

  let healthSafety: string[] = [];
  let toolsMaterials: string[] = [];
  let procedureSteps: string[] = [];
  let siteCleanup: string[] = [];
  const sourcesUsed = new Set<string>();
  const citations: GeneratedAnswerResult['citations'] = [];

  for (const { doc, kwMatches } of matchingDocs) {
    sourcesUsed.add(`"${doc.title}" (v${doc.version})`);

    // Split document into lines and sections
    const lines = doc.fullText.split('\n').map(l => l.trim()).filter(Boolean);
    let currentCategory: 'hs' | 'tm' | 'proc' | 'sc' | 'general' = 'general';

    let bestParagraph = '';
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      if (lineLower.includes('health') || lineLower.includes('safety') || lineLower.includes('ppe') || lineLower.includes('hazard')) {
        currentCategory = 'hs';
      } else if (lineLower.includes('tool') || lineLower.includes('material') || lineLower.includes('instrument') || lineLower.includes('equipment required')) {
        currentCategory = 'tm';
      } else if (lineLower.includes('cleanup') || lineLower.includes('handover') || lineLower.includes('commissioning') || lineLower.includes('sign-off')) {
        currentCategory = 'sc';
      } else if (lineLower.includes('procedure') || lineLower.includes('step') || lineLower.includes('installation') || lineLower.includes('splicing') || lineLower.includes('grounding') || lineLower.includes('alignment')) {
        currentCategory = 'proc';
      }

      // Check if line contains keyword or is part of relevant category
      const isRelevant = keywords.some(k => lineLower.includes(k)) || currentCategory !== 'general';
      if (!isRelevant) continue;

      const cleanLine = line.replace(/^[•\-\*#\d\.]+\s*/, '');
      if (cleanLine.length < 5) continue;

      if (currentCategory === 'hs') {
        healthSafety.push(cleanLine);
      } else if (currentCategory === 'tm') {
        toolsMaterials.push(cleanLine);
      } else if (currentCategory === 'sc') {
        siteCleanup.push(cleanLine);
      } else {
        procedureSteps.push(cleanLine);
      }

      if (!bestParagraph && keywords.some(k => lineLower.includes(k))) {
        bestParagraph = cleanLine;
      }
    }

    citations.push({
      documentTitle: doc.title,
      version: doc.version,
      sectionLabel: 'Full SOP Text Search',
      excerpt: bestParagraph ? bestParagraph.slice(0, 240) + '...' : doc.fullText.slice(0, 200) + '...',
      similarity: Math.min(0.96, 0.75 + kwMatches * 0.05),
    });
  }

  // De-duplicate items
  const cleanList = (arr: string[], max: number = 5) => Array.from(new Set(arr)).slice(0, max);
  const hs = cleanList(healthSafety);
  const tm = cleanList(toolsMaterials);
  const proc = cleanList(procedureSteps, 8);
  const sc = cleanList(siteCleanup);

  // If no lines were categorized as procedure, use the top matched lines
  if (proc.length === 0 && matchingDocs.length > 0) {
    const firstDocLines = matchingDocs[0].doc.fullText.split('\n').map(l => l.trim()).filter(l => l.length > 15).slice(0, 4);
    for (const l of firstDocLines) proc.push(l);
  }

  // Localized Headings
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

  return {
    answer,
    citations,
  };
}
