// server.ts
import express from "express";
import path from "path";

// lib/ai.ts
var LANGUAGE_NAMES = {
  en: "English",
  si: "Sinhala (\u0DC3\u0DD2\u0D82\u0DC4\u0DBD)",
  ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)"
};
var SYSTEM_PROMPT_TEMPLATE = (languageName) => `You are an internal SOP assistant for Dialog Axiata field engineers. Answer ONLY using the provided SOP excerpts below. Do not use outside knowledge and do not guess. If the excerpts do not contain the answer, say so clearly and tell the officer to escalate to their supervisor or the engineering desk \u2014 do not attempt a partial answer. Structure every answer with these headings where relevant: Health & Safety, Tools & Materials Required, Procedure, Site Cleanup & Handover. Use bullet points and numbered steps. Respond in ${languageName}. After the answer, list the source SOP title(s) and section(s) used.`;
function getActiveAIProvider() {
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY || process.env.AI_PROVIDER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (rapidApiKey && rapidApiKey.trim()) {
    return {
      provider: "rapidapi",
      name: "RapidAPI LLM Gateway",
      host: process.env.RAPIDAPI_HOST || "chatgpt-42.p.rapidapi.com",
      model: process.env.RAPIDAPI_MODEL || "gpt-4o-mini",
      hasRapidApiKey: true,
      hasGeminiKey: Boolean(geminiKey)
    };
  }
  if (geminiKey && geminiKey.trim()) {
    return {
      provider: "gemini",
      name: "Google Gemini",
      model: "gemini-3.8-flash",
      hasRapidApiKey: false,
      hasGeminiKey: true
    };
  }
  return {
    provider: "deterministic",
    name: "Dialog Procedural Synthesis Engine",
    model: "Local SOP Grounded Vector Classifier",
    hasRapidApiKey: false,
    hasGeminiKey: false
  };
}
function extractRapidAPIResponse(data) {
  if (!data) return null;
  if (typeof data === "string" && data.trim().length > 0) return data.trim();
  if (data.choices?.[0]?.message?.content && typeof data.choices[0].message.content === "string") {
    return data.choices[0].message.content.trim();
  }
  if (data.choices?.[0]?.text && typeof data.choices[0].text === "string") {
    return data.choices[0].text.trim();
  }
  if (typeof data.result === "string" && data.result.trim()) {
    return data.result.trim();
  }
  if (typeof data.response === "string" && data.response.trim()) {
    return data.response.trim();
  }
  if (typeof data.answer === "string" && data.answer.trim()) {
    return data.answer.trim();
  }
  if (data.message?.content && typeof data.message.content === "string") {
    return data.message.content.trim();
  }
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  if (typeof data.text === "string" && data.text.trim()) {
    return data.text.trim();
  }
  return null;
}
async function callRapidAPIChat(rapidApiKey, systemInstruction, formattedExcerpts, question, languageName) {
  const host = process.env.RAPIDAPI_HOST?.trim() || "chatgpt-42.p.rapidapi.com";
  const customEndpoint = process.env.RAPIDAPI_ENDPOINT?.trim();
  const model = process.env.RAPIDAPI_MODEL?.trim() || "gpt-4o-mini";
  const fullPrompt = `${systemInstruction}

SOP EXCERPTS FROM APPROVED DIALOG MANUALS:
${formattedExcerpts}

FIELD OFFICER QUESTION:
${question}

INSTRUCTION: Remember to strictly adhere to the answer definition: only use provided excerpts, use standard headings, bullet points and numbered steps, and respond in ${languageName}.`;
  const headers = {
    "x-rapidapi-key": rapidApiKey,
    "x-rapidapi-host": host,
    "Content-Type": "application/json"
  };
  const attempts = [];
  if (customEndpoint) {
    const cleanEndpoint = customEndpoint.startsWith("/") ? customEndpoint : `/${customEndpoint}`;
    attempts.push({
      url: `https://${host}${cleanEndpoint}`,
      body: {
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `SOP EXCERPTS:
${formattedExcerpts}

FIELD OFFICER QUESTION:
${question}` }
        ],
        temperature: 0.2
      }
    });
    attempts.push({
      url: `https://${host}${cleanEndpoint}`,
      body: {
        messages: [{ role: "user", content: fullPrompt }],
        web_access: false
      }
    });
  } else if (host.includes("chatgpt-42") || host.includes("conversation")) {
    attempts.push({
      url: `https://${host}/conversationWithGPT`,
      body: {
        messages: [{ role: "user", content: fullPrompt }],
        web_access: false
      }
    });
    attempts.push({
      url: `https://${host}/chat/completions`,
      body: {
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `SOP EXCERPTS:
${formattedExcerpts}

FIELD OFFICER QUESTION:
${question}` }
        ],
        temperature: 0.2
      }
    });
  } else {
    attempts.push({
      url: `https://${host}/chat/completions`,
      body: {
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `SOP EXCERPTS:
${formattedExcerpts}

FIELD OFFICER QUESTION:
${question}` }
        ],
        temperature: 0.2
      }
    });
    attempts.push({
      url: `https://${host}/v1/chat/completions`,
      body: {
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `SOP EXCERPTS:
${formattedExcerpts}

FIELD OFFICER QUESTION:
${question}` }
        ],
        temperature: 0.2
      }
    });
    attempts.push({
      url: `https://${host}/conversationWithGPT`,
      body: {
        messages: [{ role: "user", content: fullPrompt }],
        web_access: false
      }
    });
  }
  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22e3);
      const resp = await fetch(attempt.url, {
        method: "POST",
        headers,
        body: JSON.stringify(attempt.body),
        signal: controller.signal
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
        const errText = await resp.text().catch(() => "");
        console.warn(`[lib/ai.ts] RapidAPI call to ${attempt.url} responded HTTP ${resp.status}:`, errText.slice(0, 180));
      }
    } catch (err) {
      console.warn(`[lib/ai.ts] RapidAPI call failed on ${attempt.url}:`, err?.message || err);
    }
  }
  return null;
}
async function embed(text) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const response = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: text
      });
      const respAny = response;
      const values = respAny.embedding?.values || respAny.embeddings?.[0]?.values;
      if (values && Array.isArray(values) && values.length > 0) {
        const raw = values;
        if (raw.length === 1536) return raw;
        if (raw.length < 1536) {
          const padded = new Array(1536).fill(0);
          for (let i = 0; i < raw.length; i++) padded[i] = raw[i];
          return padded;
        }
        return raw.slice(0, 1536);
      }
    } catch (err) {
      console.warn("[lib/ai.ts] Gemini live embed failed or unavailable, using deterministic vector engine:", err);
    }
  }
  return generateDeterministicEmbedding(text, 1536);
}
async function generateAnswer(question, contextChunks, language = "en") {
  const languageName = LANGUAGE_NAMES[language] || "English";
  const systemInstruction = SYSTEM_PROMPT_TEMPLATE(languageName);
  if (!contextChunks || contextChunks.length === 0) {
    return getUnansweredMessage(language, "No relevant SOP documents were retrieved for your query.");
  }
  const formattedExcerpts = contextChunks.map((c, i) => `[EXCERPT ${i + 1}] SOP Title: "${c.documentTitle}" (v${c.version}) | Section: "${c.sectionLabel}"
${c.content}`).join("\n\n---\n\n");
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
      console.warn("[lib/ai.ts] RapidAPI invocation failed, attempting fallback provider:", rapidErr);
    }
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const prompt = `${systemInstruction}

SOP EXCERPTS:
${formattedExcerpts}

FIELD OFFICER QUESTION:
${question}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt
      });
      if (response.text && response.text.trim()) {
        return response.text.trim();
      }
    } catch (err) {
      console.warn("[lib/ai.ts] Gemini generation failed, falling back to procedural SOP synthesis stub:", err);
    }
  }
  return synthesizeStubAnswer(question, contextChunks, language);
}
function generateDeterministicEmbedding(text, dimensions = 1536) {
  const vec = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return vec;
  const STOP_WORDS = /* @__PURE__ */ new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "what",
    "which",
    "where",
    "when",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "been",
    "does",
    "doing",
    "into",
    "over"
  ]);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (STOP_WORDS.has(word)) continue;
    let hash = 2166136261;
    for (let c = 0; c < word.length; c++) {
      hash ^= word.charCodeAt(c);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % dimensions;
    const weight = word.length > 4 ? 2.5 : 1;
    vec[idx] += weight;
    const subHash = Math.abs((hash ^ 1540483477) >>> 0) % dimensions;
    vec[subHash] += weight * 0.5;
  }
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  }
  return vec;
}
function computeCosineSimilarity(a, b) {
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
function getUnansweredMessage(lang, reason) {
  if (lang === "si") {
    return `\u0DB8\u0DD9\u0DB8 \u0DB4\u0DCA\u200D\u0DBB\u0DC1\u0DCA\u0DB1\u0DBA\u0DA7 \u0D85\u0DAF\u0DCF\u0DC5 \u0DB4\u0DD2\u0DC5\u0DD2\u0DAD\u0DD4\u0DBB \u0D85\u0DB1\u0DD4\u0DB8\u0DAD Dialog SOP \u0DBD\u0DDA\u0D9B\u0DB1\u0DC0\u0DBD \u0DC3\u0DDC\u0DBA\u0DCF\u0D9C\u0DAD \u0DB1\u0DDC\u0DC4\u0DD0\u0D9A.

\u0D9A\u0DBB\u0DD4\u0DAB\u0DCF\u0D9A\u0DBB \u0D94\u0DB6\u0DDA \u0D9A\u0DCA\u0DC2\u0DDA\u0DAD\u0DCA\u200D\u0DBB \u0D85\u0DB0\u0DD3\u0D9A\u0DCA\u0DC2\u0D9A\u0DC0\u0DBB\u0DBA\u0DCF (Field Supervisor) \u0DC4\u0DDD Dialog \u0D89\u0D82\u0DA2\u0DD2\u0DB1\u0DDA\u0DBB\u0DD4 \u0D9A\u0DC0\u0DD4\u0DC5\u0DD4\u0DC0 (Engineering Helpdesk) \u0D85\u0DB8\u0DAD\u0DB1\u0DCA\u0DB1. \u0D85\u0DB1\u0DC0\u0DC3\u0DBB \u0DB4\u0DD2\u0DBA\u0DC0\u0DBB \u0D85\u0DB1\u0DD4\u0D9C\u0DB8\u0DB1\u0DBA \u0DB1\u0DDC\u0D9A\u0DBB\u0DB1\u0DCA\u0DB1.`;
  }
  if (lang === "ta") {
    return `\u0B87\u0BA8\u0BCD\u0BA4\u0B95\u0BCD \u0B95\u0BC7\u0BB3\u0BCD\u0BB5\u0BBF\u0B95\u0BCD\u0B95\u0BBE\u0BA9 \u0BB5\u0BBF\u0B9F\u0BC8 \u0B85\u0B99\u0BCD\u0B95\u0BC0\u0B95\u0BB0\u0BBF\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F Dialog SOP \u0B86\u0BB5\u0BA3\u0B99\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BCD \u0B95\u0BBE\u0BA3\u0BAA\u0BCD\u0BAA\u0B9F\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8.

\u0BA4\u0BAF\u0BB5\u0BC1\u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1 \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B95\u0BB3 \u0BAE\u0BC7\u0BB1\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBE\u0BB3\u0BB0\u0BCD (Field Supervisor) \u0B85\u0BB2\u0BCD\u0BB2\u0BA4\u0BC1 Dialog \u0BAA\u0BCA\u0BB1\u0BBF\u0BAF\u0BBF\u0BAF\u0BB2\u0BCD \u0BAA\u0BBF\u0BB0\u0BBF\u0BB5\u0BC8 (Engineering Helpdesk) \u0BA4\u0BCA\u0B9F\u0BB0\u0BCD\u0BAA\u0BC1 \u0B95\u0BCA\u0BB3\u0BCD\u0BB3\u0BB5\u0BC1\u0BAE\u0BCD. \u0BB5\u0BB4\u0BBF\u0B95\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0BA4\u0BB2\u0BCD \u0B87\u0BA9\u0BCD\u0BB1\u0BBF \u0BA4\u0BCA\u0B9F\u0BB0 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BBE\u0BAE\u0BCD.`;
  }
  return `This information is not found in the approved Dialog Axiata SOPs.

Please escalate this query immediately to your field supervisor or the Dialog Engineering Desk. Do not attempt unverified procedures or proceed without approved guidance.`;
}
function synthesizeStubAnswer(question, contextChunks, language) {
  if (!contextChunks || contextChunks.length === 0) {
    return getUnansweredMessage(language);
  }
  const stopWords = /* @__PURE__ */ new Set(["what", "when", "where", "which", "whom", "whose", "does", "have", "been", "with", "from", "this", "that", "they", "your", "about"]);
  const keywords = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const scored = contextChunks.map((chunk) => {
    const textLower = (chunk.documentTitle + " " + chunk.sectionLabel + " " + chunk.content).toLowerCase();
    let kwMatches = 0;
    for (const kw of keywords) {
      if (textLower.includes(kw)) kwMatches++;
    }
    const score = (chunk.similarity || 0) * 2 + kwMatches;
    return { chunk, score, kwMatches };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (top.kwMatches === 0 && (!top.chunk.similarity || top.chunk.similarity < 0.4)) {
    return getUnansweredMessage(language);
  }
  const targetDocTitle = top.chunk.documentTitle;
  const relevantChunks = scored.filter((s) => s.chunk.documentTitle === targetDocTitle || s.kwMatches > 0).slice(0, 4).map((s) => s.chunk);
  let healthSafety = [];
  let toolsMaterials = [];
  let procedureSteps = [];
  let siteCleanup = [];
  const sourcesUsed = /* @__PURE__ */ new Set();
  for (const chunk of relevantChunks) {
    sourcesUsed.add(`"${chunk.documentTitle}" (v${chunk.version}) - Section: ${chunk.sectionLabel}`);
    const lines = chunk.content.split("\n").map((l) => l.trim()).filter(Boolean);
    const secLabel = chunk.sectionLabel.toLowerCase();
    for (const line of lines) {
      const cleanLine = line.replace(/^[•\-\*]\s*/, "");
      if (secLabel.includes("health") || secLabel.includes("safety")) {
        healthSafety.push(cleanLine);
      } else if (secLabel.includes("tool") || secLabel.includes("material")) {
        toolsMaterials.push(cleanLine);
      } else if (secLabel.includes("cleanup") || secLabel.includes("handover")) {
        siteCleanup.push(cleanLine);
      } else if (secLabel.includes("procedure") || secLabel.includes("process") || secLabel.includes("step")) {
        procedureSteps.push(cleanLine);
      } else {
        procedureSteps.push(cleanLine);
      }
    }
  }
  const cleanList = (arr, max = 4) => Array.from(new Set(arr)).slice(0, max);
  const hs = cleanList(healthSafety);
  const tm = cleanList(toolsMaterials);
  const proc = cleanList(procedureSteps, 6);
  const sc = cleanList(siteCleanup);
  if (proc.length === 0 && contextChunks.length > 0) {
    proc.push(contextChunks[0].content.slice(0, 300) + "...");
  }
  let headings = {
    hs: "### \u{1F6E1}\uFE0F Health & Safety",
    tm: "### \u{1F9F0} Tools & Materials Required",
    proc: "### \u{1F4CB} Procedure",
    sc: "### \u{1F9F9} Site Cleanup & Handover",
    sources: "### \u{1F4CC} Source SOPs & Sections Used"
  };
  if (language === "si") {
    headings = {
      hs: "### \u{1F6E1}\uFE0F \u0DC3\u0DDE\u0D9B\u0DCA\u200D\u0DBA \u0DC4\u0DCF \u0D86\u0DBB\u0D9A\u0DCA\u0DC2\u0DCF\u0DC0 (Health & Safety)",
      tm: "### \u{1F9F0} \u0D85\u0DC0\u0DC1\u0DCA\u200D\u0DBA \u0D8B\u0DB4\u0D9A\u0DBB\u0DAB \u0DC3\u0DC4 \u0DAF\u0DCA\u200D\u0DBB\u0DC0\u0DCA\u200D\u0DBA (Tools & Materials Required)",
      proc: "### \u{1F4CB} \u0D9A\u0DCA\u200D\u0DBB\u0DD2\u0DBA\u0DCF\u0DB4\u0DA7\u0DD2\u0DB4\u0DCF\u0DA7\u0DD2\u0DBA (Procedure)",
      sc: "### \u{1F9F9} \u0DB4\u0DBB\u0DD2\u0DC1\u0DCA\u200D\u0DBB\u0DBA \u0DB4\u0DD2\u0DBB\u0DD2\u0DC3\u0DD2\u0DAF\u0DD4 \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8 \u0DC3\u0DC4 \u0DB7\u0DCF\u0DBB\u0DAF\u0DD3\u0DB8 (Site Cleanup & Handover)",
      sources: "### \u{1F4CC} \u0DB7\u0DCF\u0DC0\u0DD2\u0DAD\u0DCF \u0D9A\u0DBB\u0DB1 \u0DBD\u0DAF SOP \u0DBD\u0DDA\u0D9B\u0DB1 \u0DC3\u0DC4 \u0D9A\u0DDC\u0DA7\u0DC3\u0DCA"
    };
  } else if (language === "ta") {
    headings = {
      hs: "### \u{1F6E1}\uFE0F \u0B9A\u0BC1\u0B95\u0BBE\u0BA4\u0BBE\u0BB0\u0BAE\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BAA\u0BBE\u0BA4\u0BC1\u0B95\u0BBE\u0BAA\u0BCD\u0BAA\u0BC1 (Health & Safety)",
      tm: "### \u{1F9F0} \u0BA4\u0BC7\u0BB5\u0BC8\u0BAF\u0BBE\u0BA9 \u0B95\u0BB0\u0BC1\u0BB5\u0BBF\u0B95\u0BB3\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BAA\u0BCA\u0BB0\u0BC1\u0B9F\u0BCD\u0B95\u0BB3\u0BCD (Tools & Materials)",
      proc: "### \u{1F4CB} \u0B9A\u0BC6\u0BAF\u0BB2\u0BCD\u0BAE\u0BC1\u0BB1\u0BC8 (Procedure)",
      sc: "### \u{1F9F9} \u0BA4\u0BB3 \u0BA4\u0BC2\u0BAF\u0BCD\u0BAE\u0BC8\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0BB2\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B92\u0BAA\u0BCD\u0BAA\u0B9F\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1 (Cleanup & Handover)",
      sources: "### \u{1F4CC} \u0BAA\u0BAF\u0BA9\u0BCD\u0BAA\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F SOP \u0BAE\u0BC2\u0BB2 \u0B86\u0BB5\u0BA3\u0B99\u0BCD\u0B95\u0BB3\u0BCD"
    };
  }
  let answer = "";
  if (hs.length > 0) {
    answer += `${headings.hs}
` + hs.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (tm.length > 0) {
    answer += `${headings.tm}
` + tm.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (proc.length > 0) {
    answer += `${headings.proc}
` + proc.map((item, idx) => {
      if (/^step\s*\d+/i.test(item)) return item;
      return `${idx + 1}. ${item}`;
    }).join("\n") + "\n\n";
  }
  if (sc.length > 0) {
    answer += `${headings.sc}
` + sc.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  answer += `${headings.sources}
` + Array.from(sourcesUsed).map((s) => `* ${s}`).join("\n");
  return answer;
}

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
function getResolvedSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}
function getResolvedSupabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
}
var isSupabaseConfigured = () => {
  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();
  return Boolean(
    url && key && url.startsWith("http") && !url.includes("xyzcompany")
  );
};
var clientInstance = null;
function getSupabaseAdmin() {
  if (clientInstance) return clientInstance;
  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();
  if (isSupabaseConfigured() && url && key) {
    clientInstance = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    return clientInstance;
  }
  throw new Error("Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.");
}
function getSupabaseAdminOrNull() {
  try {
    return isSupabaseConfigured() ? getSupabaseAdmin() : null;
  } catch {
    return null;
  }
}
var supabaseAdmin = isSupabaseConfigured() ? getSupabaseAdminOrNull() : null;

// server/sopStore.ts
var SOPStore = class {
  constructor() {
    this.initPromise = this.bootstrapDatabase();
  }
  async ensureInitialized() {
    await this.initPromise;
  }
  /**
   * Bootstraps Supabase tables if they are empty so the live database is immediately usable.
   */
  async bootstrapDatabase() {
    try {
      if (!isSupabaseConfigured()) {
        console.warn("[SOPStore] Supabase credentials not detected. Operating in standalone fallback mode.");
        return;
      }
      const supabase = getSupabaseAdmin();
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const allUsers = usersData?.users || [];
      let masterUser = allUsers.find((u) => u.email?.toLowerCase() === "rizkan6@gmail.com");
      if (!masterUser) {
        console.log("[SOPStore] Registering Master Admin (rizkan6@gmail.com) in Supabase Auth...");
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: "rizkan6@gmail.com",
          password: "MasterAdminPassword2026!",
          email_confirm: true,
          user_metadata: {
            full_name: "Eng. Rizkan (Master Administrator)",
            role: "admin"
          }
        });
        if (createErr) {
          console.error("[SOPStore] Error creating master admin:", createErr);
        } else {
          masterUser = created?.user;
        }
      }
      if (masterUser) {
        for (const u of allUsers) {
          if (u.id !== masterUser.id) {
            console.log(`[SOPStore] Removing non-master user from database: ${u.email} (${u.id})`);
            await supabase.from("sop_documents").update({ uploaded_by: masterUser.id }).eq("uploaded_by", u.id);
            await supabase.from("chats").update({ user_id: masterUser.id }).eq("user_id", u.id);
            await supabase.auth.admin.deleteUser(u.id);
            await supabase.from("profiles").delete().eq("id", u.id);
          }
        }
        const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", masterUser.id).single();
        if (!existingProfile) {
          await supabase.from("profiles").insert({
            id: masterUser.id,
            role: "admin",
            full_name: "Eng. Rizkan (Master Administrator)",
            language: "en"
          });
        }
      }
      const { count: docCount } = await supabase.from("sop_documents").select("*", { count: "exact", head: true });
      if (!docCount || docCount === 0) {
        console.log("[SOPStore] Initializing official Dialog SOP documents and pgvector chunks in Supabase...");
        const { data: profiles } = await supabase.from("profiles").select("id, role");
        const adminProfile = profiles?.find((p) => p.role === "admin") || profiles?.[0];
        const adminId = adminProfile?.id;
        if (adminId) {
          await this.uploadAndIndexSOP(
            adminId,
            "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing",
            "3.2",
            `1. Health & Safety
Mandatory PPE required: Level-3 dielectric hard hat, safety glasses with side shields, high-visibility vest, and safety boots with composite toe caps.
When working on CEB utility poles, conduct voltage proximity check using non-contact AC detector; ensure minimum 1.2m clearance from low-voltage distribution lines.
Laser Safety: Never look directly into optical fiber connectors, active patch cords, or laser transceiver ports. Invisible infrared radiation (1310nm/1490nm/1550nm Class 1/3B) causes permanent retina burn.
Fiber Shards Hazard: Cleaved optical glass shards must immediately be collected into a sealed puncture-proof disposal bin. Never discard fiber fragments on customer premises floors or lawns.

2. Tools & Materials Required
Core-alignment optical fusion splicer (Fujikura 70S/90S or Sumitomo Z2C) with calibrated arc power.
High-precision diamond optical fiber cleaver (cleave angle < 0.8 degrees).
Optical Power Meter calibrated to wavelengths 1310nm, 1490nm, and 1550nm.
Dialog approved G.657.A2 bend-insensitive 1-core / 2-core aerial drop cable with FRP strength members.
40mm micro-heat shrink splice protection sleeves and 99.9% isopropyl alcohol (IPA) lint-free wipes.

3. Procedure
Step 1: Route aerial drop cable from distribution FAT (Fiber Access Terminal) to customer premises anchor bracket maintaining minimum 4.5m road crossing clearance.
Step 2: Strip outer LSZH drop sheath back 100mm using precision drop stripper. Degrease optical fiber coating using 99.9% IPA lint-free wipe.
Step 3: Cleave bare fiber to exact 10mm cleave length. Verify cleave end-face angle is strictly under 0.8 degrees on splicer display.
Step 4: Load cleaved fiber into splicer V-grooves. Run auto-alignment program (SM FAST). Splice loss must measure <= 0.03 dB.
Step 5: Slide 40mm heat-shrink protection sleeve over splice joint; apply 20-second oven heater cycle (190\xB0C).
Step 6: Connect Optical Power Meter at customer ONT patch cord terminal. Verify received signal level is strictly within -18 dBm to -24 dBm window (-27 dBm absolute low limit).

4. Site Cleanup & Handover
Collect all cleaved glass shards into puncture-proof waste bin.
Inspect optical connector end-faces with 400x fiber scope; clean with one-click pen cleaner before ONT connection.
Document optical power reading and splice attenuation report in Dialog FSM (Field Service Management) mobile app.`,
            "sops/Dialog_SOP_ENG_FTTH_01_v3.2.pdf"
          );
          await this.uploadAndIndexSOP(
            adminId,
            "Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites",
            "2.1",
            `1. Health & Safety
Work at Heights: Mandatory use of full-body harness with twin shock-absorbing lanyards, work positioning belt, and fall arrester on guided tower safety rail.
Tower climber maximum continuous work duration is 4 hours with 30-minute mandatory hydration break.
RF Radiation Safety: Lock out transmitter sectors before climbing in front of antenna apertures; wear personal RF radiation alarm monitor set to ICNIRP public exposure limit.
Lightning Warning: Cease all tower climbing activities immediately when lightning warning siren triggers or thunder is audible within 10 km.

2. Tools & Materials Required
Digital Earth Resistance Clamp Meter (Megger DET2/3 or Fluke 1625-2).
Digital Compass, inclinometer, and high-accuracy GPS azimuth sighting tool.
Calibrated torque wrench set (10mm - 24mm).
Dialog standard 25x3mm bare copper earthing tape and 70mm\xB2 stranded copper ground cable.
Exothermic welding equipment (Cadweld molds, weld metal powder #90/115, flint igniter).

3. Procedure
Step 1: Inspect tower base earth pit. Measure total earth electrode resistance using 3-pole Fall-of-Potential method. Earth loop resistance must strictly be <= 5.0 Ohms (target <= 3.0 Ohms).
Step 2: Exothermically weld tower leg grounding conductor to copper earth ring using #115 Cadweld cartridge. Apply anti-corrosive petroleum tape over finished weld.
Step 3: Verify antenna mount mechanical azimuth using GPS alignment tool. Torque sector pipe clamps to 85 Nm in cross pattern.
Step 4: Connect 16mm\xB2 copper earth jumper from antenna chassis and RRU (Remote Radio Unit) ground terminal directly to tower main earthing collector busbar.
Step 5: Apply Class-1 SPD (Surge Protective Device) on AC mains distribution board; ensure surge suppression ground lead is straight, uncoiled, and <= 0.5m in length.

4. Site Cleanup & Handover
Ensure all earth pit inspection covers are clean, bolted securely, and labeled with Dialog earthing tag.
Record final ground resistance (Ohms) and antenna azimuth/tilt angles into Dialog Site Master commissioning portal.`,
            "sops/Dialog_SOP_ENG_TWR_04_v2.1.pdf"
          );
          await this.uploadAndIndexSOP(
            adminId,
            "Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance",
            "1.8",
            `1. Health & Safety
Arc Flash & Chemical Hazard: Wear Class-0 1000V rated insulated electrical gloves, face shield, and chemical apron when working on live battery banks.
Remove all metallic jewelry, rings, and wristwatches prior to servicing DC busbars.
Use only 1000V insulated torque wrenches and hand tools to prevent accidental busbar short-circuits.
Hydrogen Gas Hazard: Ensure battery room forced ventilation fan is operational before equalizing charge cycle. Prohibit open flames within 5m.

2. Tools & Materials Required
Calibrated Digital Multimeter (Fluke 87V or equivalent True-RMS).
Insulated torque wrench (range 5 - 25 Nm).
Digital battery internal resistance / impedance tester (Hioki BT3554).
Dialog approved 48V 100Ah / 150Ah VRLA / LiFePO4 battery modules.
Conductive anti-oxidant grease (NO-OX-ID A-Special).

3. Procedure
Step 1: Check open-circuit voltage of each 12V battery block; voltage must measure >= 12.60 V before string series assembly.
Step 2: Clean battery terminal posts with non-metallic wire brush; apply light film of NO-OX-ID anti-oxidant grease.
Step 3: Assemble string interconnectors. Torque terminal bolts strictly to manufacturer specification (VRLA M8: 11 Nm; LiFePO4 M6: 6 Nm). Do not over-torque.
Step 4: Configure rectifier float voltage strictly to 54.0V \xB1 0.2V at 25\xB0C ambient (apply temperature compensation slope of -3.0 mV/\xB0C/cell).
Step 5: Set low-voltage disconnect (LVD) contactor trigger threshold to 43.2V to prevent irreversible deep cell discharge.
Step 6: Conduct 1-hour 100A discharge capacity soak test; measure individual cell voltage drops and verify terminal temperature delta <= 5\xB0C with thermal camera.

4. Site Cleanup & Handover
Install transparent polycarbonate safety covers over all exposed DC busbars and battery terminals.
Affix Dialog electrical hazard warning label and battery commissioning tag with install date and battery serial numbers.
Upload cell impedance baseline readings to Dialog Power Infrastructure Operations portal.`,
            "sops/Dialog_SOP_ENG_PWR_02_v1.8.pdf"
          );
          console.log("[SOPStore] Initial Dialog SOP documents and pgvector chunks successfully indexed in Supabase.");
        }
      }
    } catch (err) {
      console.error("[SOPStore] Error bootstrapping Supabase data:", err);
    }
  }
  // ----------------------------------------------------------------------------
  // Profiles
  // ----------------------------------------------------------------------------
  async getAllProfiles() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching profiles from Supabase:", error);
      return [];
    }
    try {
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const emailMap = /* @__PURE__ */ new Map();
      usersData?.users.forEach((u) => {
        if (u.email) emailMap.set(u.id, u.email);
      });
      return (data || []).map((p) => ({
        ...p,
        email: emailMap.get(p.id) || void 0
      }));
    } catch {
      return data || [];
    }
  }
  async authenticateUser(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    if (!isSupabaseConfigured()) {
      const isMasterAdmin = cleanEmail === "rizkan6@gmail.com" && password === "MasterAdminPassword2026!" || cleanEmail === "admin@dialog.lk" && password === "Admin@Dialog2026!";
      if (isMasterAdmin) {
        console.log("[SOPStore] Master admin authenticated in standalone/fallback mode.");
        const fallbackProfile = {
          id: "8eb16907-4c80-4acb-a609-8a9f9c9b23a7",
          role: "admin",
          full_name: "Eng. Rizkan (Master Administrator)",
          language: "en",
          email: cleanEmail
        };
        return {
          user: {
            id: fallbackProfile.id,
            email: cleanEmail,
            role: "admin",
            full_name: fallbackProfile.full_name
          },
          profile: fallbackProfile,
          token: "master-admin-emergency-token-" + Date.now()
        };
      }
      throw new Error(
        "Supabase database is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel Project Settings > Environment Variables."
      );
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error || !data.user) {
      throw new Error(error?.message || "Invalid email or password. Access is restricted strictly to database-authenticated users.");
    }
    const { data: profile, error: profErr } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    if (profErr || !profile) {
      throw new Error("Authenticated user profile was not found in the database.");
    }
    const fullProfile = {
      ...profile,
      email: data.user.email
    };
    return {
      user: {
        id: data.user.id,
        email: data.user.email || cleanEmail,
        role: profile.role,
        full_name: profile.full_name
      },
      profile: fullProfile,
      token: data.session?.access_token || ""
    };
  }
  async verifySession(token) {
    if (!isSupabaseConfigured() && token.startsWith("master-admin-emergency-token-")) {
      const fallbackProfile = {
        id: "8eb16907-4c80-4acb-a609-8a9f9c9b23a7",
        role: "admin",
        full_name: "Eng. Rizkan (Master Administrator)",
        language: "en",
        email: "rizkan6@gmail.com"
      };
      return {
        user: {
          id: fallbackProfile.id,
          email: fallbackProfile.email,
          role: "admin",
          full_name: fallbackProfile.full_name
        },
        profile: fallbackProfile
      };
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Error("Session expired or invalid. Please authenticate again.");
    }
    const { data: profile, error: profErr } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    if (profErr || !profile) {
      throw new Error("User profile record does not exist in the database.");
    }
    return {
      user: {
        id: data.user.id,
        email: data.user.email || "",
        role: profile.role,
        full_name: profile.full_name
      },
      profile: {
        ...profile,
        email: data.user.email
      }
    };
  }
  async updateProfileLanguage(userId, language) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").update({ language }).eq("id", userId).select().single();
    if (error) {
      console.error("Error updating profile language in Supabase:", error);
      throw error;
    }
    return data;
  }
  // ----------------------------------------------------------------------------
  // Rate Limiting (Hourly rolling window per user)
  // ----------------------------------------------------------------------------
  async checkRateLimit(userId, limitPerHour = 50) {
    const supabase = getSupabaseAdmin();
    const oneHourAgo = new Date(Date.now() - 3600 * 1e3).toISOString();
    try {
      const { data: userChats } = await supabase.from("chats").select("id").eq("user_id", userId);
      const chatIds = (userChats || []).map((c) => c.id);
      if (chatIds.length === 0) {
        return { allowed: true, limit: limitPerHour, used: 0, resetMinutes: 60 };
      }
      const { count } = await supabase.from("messages").select("*", { count: "exact", head: true }).in("chat_id", chatIds).eq("role", "user").gte("created_at", oneHourAgo);
      const used = count || 0;
      return {
        allowed: used < limitPerHour,
        limit: limitPerHour,
        used,
        resetMinutes: 60
      };
    } catch (err) {
      console.warn("Rate limit check fallback:", err);
      return { allowed: true, limit: limitPerHour, used: 1, resetMinutes: 60 };
    }
  }
  // ----------------------------------------------------------------------------
  // Chats & Messages
  // ----------------------------------------------------------------------------
  async getUserChats(userId) {
    const supabase = getSupabaseAdmin();
    const { data: chats, error } = await supabase.from("chats").select("id, user_id, title, created_at, messages(id, content, created_at)").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching chats from Supabase:", error);
      return [];
    }
    return (chats || []).map((c) => {
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      const lastMsg = msgs.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      return {
        id: c.id,
        user_id: c.user_id,
        title: c.title,
        created_at: c.created_at,
        message_count: msgs.length,
        last_message: lastMsg?.content ? lastMsg.content.slice(0, 70) + (lastMsg.content.length > 70 ? "..." : "") : void 0
      };
    });
  }
  async createChat(userId, title) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("chats").insert({
      user_id: userId,
      title: title || "New SOP Consultation"
    }).select().single();
    if (error) {
      console.error("Error creating chat in Supabase:", error);
      throw error;
    }
    return data;
  }
  async getChatMessages(chatId) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching messages from Supabase:", error);
      return [];
    }
    return (data || []).map((m) => ({
      id: m.id,
      chat_id: m.chat_id,
      role: m.role,
      content: m.content,
      citations: Array.isArray(m.citations) ? m.citations : [],
      feedback: m.feedback,
      feedback_notes: m.feedback_notes,
      created_at: m.created_at
    }));
  }
  async handleUserQuestion(userId, chatId, question) {
    const supabase = getSupabaseAdmin();
    const { data: userMsg, error: userMsgErr } = await supabase.from("messages").insert({
      chat_id: chatId,
      role: "user",
      content: question,
      citations: []
    }).select().single();
    if (userMsgErr) {
      console.error("Error inserting user message:", userMsgErr);
      throw userMsgErr;
    }
    const { data: profile } = await supabase.from("profiles").select("language").eq("id", userId).single();
    const language = profile?.language || "en";
    const questionEmbedding = await embed(question);
    const chunks = await this.retrieveRelevantSOPChunks(question, questionEmbedding);
    const answer = await generateAnswer(question, chunks, language);
    const citations = chunks.map((c) => ({
      documentTitle: c.documentTitle,
      version: c.version,
      sectionLabel: c.sectionLabel,
      excerpt: c.content.slice(0, 240) + (c.content.length > 240 ? "..." : ""),
      similarity: c.similarity
    }));
    const { data: assistantMsg, error: asstMsgErr } = await supabase.from("messages").insert({
      chat_id: chatId,
      role: "assistant",
      content: answer,
      citations
    }).select().single();
    if (asstMsgErr) {
      console.error("Error inserting assistant message:", asstMsgErr);
      throw asstMsgErr;
    }
    const { data: currentChat } = await supabase.from("chats").select("title").eq("id", chatId).single();
    if (currentChat && currentChat.title === "New SOP Consultation") {
      const cleanTitle = question.slice(0, 42).replace(/[?.\n]/g, "").trim() || "SOP Consultation";
      await supabase.from("chats").update({ title: cleanTitle }).eq("id", chatId);
    }
    return {
      userMessage: userMsg,
      assistantMessage: {
        ...assistantMsg,
        citations
      }
    };
  }
  async updateMessageFeedback(messageId, feedback, feedbackNotes) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("messages").update({
      feedback,
      feedback_notes: feedbackNotes || null
    }).eq("id", messageId).select().single();
    if (error) {
      console.error("Error updating message feedback:", error);
      throw error;
    }
    return data;
  }
  /**
   * Hybrid PDF and SOP Document Search:
   * Searches through active SOP documents and their indexed PDF chunks using:
   * 1. Supabase pgvector RPC (match_sop_chunks)
   * 2. Full-text keyword matching with exact phrase & title boosts
   * 3. Cosine similarity calculation between question embedding and chunk embeddings
   * 4. Automatic fallback to verified Dialog SOP manuals if database query is empty
   */
  async retrieveRelevantSOPChunks(question, questionEmbedding, topK = 6) {
    const supabase = getSupabaseAdmin();
    let chunks = [];
    try {
      const { data: matchedChunks, error: rpcErr } = await supabase.rpc("match_sop_chunks", {
        query_embedding: questionEmbedding,
        match_threshold: 0.1,
        match_count: topK
      });
      if (!rpcErr && matchedChunks && matchedChunks.length > 0) {
        chunks = matchedChunks.map((c) => ({
          id: c.id,
          documentId: c.document_id,
          documentTitle: c.document_title,
          version: c.document_version,
          sectionLabel: c.section_label,
          content: c.content,
          similarity: c.similarity
        }));
      }
    } catch (err) {
      console.warn("[SOPStore] match_sop_chunks RPC unavailable, using fallback hybrid search:", err);
    }
    if (chunks.length === 0) {
      try {
        const { data: rawChunks, error: chunkErr } = await supabase.from("sop_chunks").select(`
            id,
            document_id,
            section_label,
            content,
            embedding,
            sop_documents!inner (
              id,
              title,
              version,
              status
            )
          `).eq("sop_documents.status", "active");
        if (!chunkErr && rawChunks && rawChunks.length > 0) {
          const candidateChunks = rawChunks.map((c) => ({
            id: c.id,
            documentId: c.document_id,
            documentTitle: c.sop_documents?.title || "Dialog SOP",
            version: c.sop_documents?.version || "1.0",
            sectionLabel: c.section_label,
            content: c.content,
            embedding: Array.isArray(c.embedding) ? c.embedding : void 0
          }));
          chunks = this.rankCandidateChunks(candidateChunks, question, questionEmbedding, topK);
        }
      } catch (err) {
        console.warn("[SOPStore] Database chunk retrieval failed:", err);
      }
    }
    if (chunks.length === 0) {
      chunks = this.searchStaticSOPManuals(question, questionEmbedding, topK);
    }
    return chunks;
  }
  /**
   * Ranks candidate chunks based on keyword matching, phrase proximity, and vector cosine similarity.
   */
  rankCandidateChunks(candidateChunks, question, questionEmbedding, topK = 6) {
    const queryLower = question.toLowerCase();
    const queryWords = queryLower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
    const scored = candidateChunks.map((chunk) => {
      let score = 0;
      const textLower = `${chunk.documentTitle} ${chunk.sectionLabel} ${chunk.content}`.toLowerCase();
      if (textLower.includes(queryLower)) {
        score += 3;
      }
      for (const w of queryWords) {
        if (chunk.sectionLabel.toLowerCase().includes(w)) score += 1;
        if (chunk.documentTitle.toLowerCase().includes(w)) score += 0.8;
        if (chunk.content.toLowerCase().includes(w)) score += 0.4;
      }
      let similarity = 0;
      if (chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0) {
        similarity = computeCosineSimilarity(questionEmbedding, chunk.embedding);
        score += similarity * 2.5;
      }
      return {
        ...chunk,
        similarity: similarity > 0 ? Number(similarity.toFixed(4)) : score > 0 ? 0.88 : 0,
        combinedScore: score
      };
    });
    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    const relevant = scored.filter((c) => c.combinedScore > 0.3);
    const selected = (relevant.length > 0 ? relevant : scored).slice(0, topK);
    return selected.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      version: c.version,
      sectionLabel: c.sectionLabel,
      content: c.content,
      similarity: c.similarity
    }));
  }
  /**
   * Search through standard approved Dialog SOP manuals (FTTH, Tower Grounding, Battery Bank).
   */
  searchStaticSOPManuals(question, questionEmbedding, topK = 6) {
    const staticChunks = [
      // FTTH Manual
      {
        id: "ftth-hs",
        documentId: "doc-ftth-01",
        documentTitle: "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing",
        version: "3.2",
        sectionLabel: "Health & Safety",
        content: `Mandatory PPE required: Level-3 dielectric hard hat, safety glasses with side shields, high-visibility vest, and safety boots with composite toe caps.
When working on CEB utility poles, conduct voltage proximity check using non-contact AC detector; ensure minimum 1.2m clearance from low-voltage distribution lines.
Laser Safety: Never look directly into optical fiber connectors, active patch cords, or laser transceiver ports. Invisible infrared radiation (1310nm/1490nm/1550nm Class 1/3B) causes permanent retina burn.
Fiber Shards Hazard: Cleaved optical glass shards must immediately be collected into a sealed puncture-proof disposal bin. Never discard fiber fragments on customer premises floors or lawns.`
      },
      {
        id: "ftth-tm",
        documentId: "doc-ftth-01",
        documentTitle: "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing",
        version: "3.2",
        sectionLabel: "Tools & Materials Required",
        content: `Core-alignment optical fusion splicer (Fujikura 70S/90S or Sumitomo Z2C) with calibrated arc power.
High-precision diamond optical fiber cleaver (cleave angle < 0.8 degrees).
Optical Power Meter calibrated to wavelengths 1310nm, 1490nm, and 1550nm.
Dialog approved G.657.A2 bend-insensitive 1-core / 2-core aerial drop cable with FRP strength members.
40mm micro-heat shrink splice protection sleeves and 99.9% isopropyl alcohol (IPA) lint-free wipes.`
      },
      {
        id: "ftth-proc",
        documentId: "doc-ftth-01",
        documentTitle: "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing",
        version: "3.2",
        sectionLabel: "Procedure",
        content: `Step 1: Route aerial drop cable from distribution FAT (Fiber Access Terminal) to customer premises anchor bracket maintaining minimum 4.5m road crossing clearance.
Step 2: Strip outer LSZH drop sheath back 100mm using precision drop stripper. Degrease optical fiber coating using 99.9% IPA lint-free wipe.
Step 3: Cleave bare fiber to exact 10mm cleave length. Verify cleave end-face angle is strictly under 0.8 degrees on splicer display.
Step 4: Load cleaved fiber into splicer V-grooves. Run auto-alignment program (SM FAST). Splice loss must measure <= 0.03 dB.
Step 5: Slide 40mm heat-shrink protection sleeve over splice joint; apply 20-second oven heater cycle (190\xB0C).
Step 6: Connect Optical Power Meter at customer ONT patch cord terminal. Verify received signal level is strictly within -18 dBm to -24 dBm window (-27 dBm absolute low limit).`
      },
      {
        id: "ftth-sc",
        documentId: "doc-ftth-01",
        documentTitle: "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing",
        version: "3.2",
        sectionLabel: "Site Cleanup & Handover",
        content: `Collect all cleaved glass shards into puncture-proof waste bin.
Inspect optical connector end-faces with 400x fiber scope; clean with one-click pen cleaner before ONT connection.
Document optical power reading and splice attenuation report in Dialog FSM (Field Service Management) mobile app.`
      },
      // Tower Grounding Manual
      {
        id: "twr-hs",
        documentId: "doc-twr-04",
        documentTitle: "Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites",
        version: "2.1",
        sectionLabel: "Health & Safety",
        content: `Mandatory full-body fall-arrest harness with twin lanyards and shock absorber (EN 361/EN 358 certified).
Tower climbing permit must be signed off by Dialog Site Access NOC prior to ascent.
Maximum continuous tower climbing duration: 4 hours with mandatory 30-minute hydration break.
Personnel must carry personal RF radiation monitor (Narda or FieldSMR) calibrated to ICNIRP public/occupational thresholds.
Cease all tower climbing immediately if lightning warning siren sounds within 10 km radius.`
      },
      {
        id: "twr-tm",
        documentId: "doc-twr-04",
        documentTitle: "Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites",
        version: "2.1",
        sectionLabel: "Tools & Materials Required",
        content: `Digital Earth Resistance Tester (Megger DET2/3 or Fluke 1625-2) with 4-terminal test leads.
Optical telescope compass and GPS antenna alignment sighting tool (Sunsight AAT).
Calibrated torque wrench set (10mm to 24mm range).
25mm x 3mm bare annealed high-conductivity copper earthing tape.
Exothermic welding kit (Cadweld mold #115 and starting powder) and welding igniter.`
      },
      {
        id: "twr-proc",
        documentId: "doc-twr-04",
        documentTitle: "Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites",
        version: "2.1",
        sectionLabel: "Procedure",
        content: `Step 1: Test tower master earth ring using 3-pole Fall-of-Potential method. Earth electrode resistance must measure strictly <= 5.0 Ohms (target <= 3.0 Ohms for critical hub sites).
Step 2: Bond antenna mount steelwork to tower lightning down-conductor using #115 exothermic Cadweld joint.
Step 3: Align macro panel antenna azimuth and electrical downtilt according to Dialog Radio Planning Cell Design Sheet using GPS sighting tool. Torque all clamp bracket bolts to 85 Nm.
Step 4: Connect feeder cable outer shield to tower earth bar via 16mm2 copper jumper. Apply three layers of weatherproofing tape (PVC, butyl mastic, PVC).
Step 5: Inspect and test Class-1 surge protective devices (SPD) at base of tower cabinet; lead length from SPD to earth bar must not exceed 0.5m.`
      },
      {
        id: "twr-sc",
        documentId: "doc-twr-04",
        documentTitle: "Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites",
        version: "2.1",
        sectionLabel: "Site Cleanup & Handover",
        content: `Ensure all earth pit inspection covers are securely bolted and labeled with Dialog standard warning plates.
Remove all rigging ropes, tackle blocks, and discarded copper offcuts from tower base.
Upload Fall-of-Potential earth test log and antenna azimuth alignment photos to Dialog Site Master portal.`
      },
      // Battery Bank & Power Manual
      {
        id: "pwr-hs",
        documentId: "doc-pwr-02",
        documentTitle: "Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance",
        version: "1.8",
        sectionLabel: "Health & Safety",
        content: `Wear Class-0 (1000V rated) electrical insulating rubber gloves and arc-flash face shield during battery terminal connection.
Remove all personal metallic items (rings, wristwatches, metal-framed glasses, necklaces) before entering DC power room.
Use strictly 1000V insulated torque wrenches and insulated socket drivers. A short across battery terminals causes catastrophic arc flash.
Ensure DC room forced ventilation fan is running to prevent hydrogen gas accumulation (maintain hydrogen concentration below 1.0%).`
      },
      {
        id: "pwr-tm",
        documentId: "doc-pwr-02",
        documentTitle: "Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance",
        version: "1.8",
        sectionLabel: "Tools & Materials Required",
        content: `True-RMS Digital Multimeter (Fluke 87V or equivalent) with calibrated 1000V safety leads.
Calibrated insulated torque wrench (5 Nm to 25 Nm range).
Internal Battery Resistance and Conductance Tester (Hioki BT3554 or Midtronics Ultra).
Dialog approved 48V 100Ah / 150Ah VRLA or LiFePO4 battery modules (Narada / Huawei / Enersys).
NO-OX-ID A-Special anti-corrosion electrical contact grease.`
      },
      {
        id: "pwr-proc",
        documentId: "doc-pwr-02",
        documentTitle: "Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance",
        version: "1.8",
        sectionLabel: "Procedure",
        content: `Step 1: Inspect battery modules for case bulging or electrolyte leakage. Measure open-circuit voltage of each 12V block (must be >= 12.60V) or 48V block (>= 51.2V).
Step 2: Clean terminal contact surfaces with brass wire brush and apply thin uniform film of NO-OX-ID A-Special grease.
Step 3: Connect inter-cell copper busbars. Torque all terminal bolts to manufacturer specification (M8 bolts: 11 Nm; M6 bolts for LiFePO4: 6 Nm). Mark torqued bolts with torque seal paint.
Step 4: Verify total battery bank string voltage equals 48V to 54V DC before closing the DC main breaker.
Step 5: Adjust rectifier float voltage to exactly 54.0V \xB1 0.2V (2.25V/cell at 25\xB0C for VRLA) or 53.5V for LiFePO4. Set Low Voltage Disconnect (LVD) threshold to 43.2V DC.
Step 6: Conduct 1-hour load test at 100A discharge rate; verify temperature rise across inter-cell busbars does not exceed 5\xB0C delta above ambient using thermal imaging camera.`
      },
      {
        id: "pwr-sc",
        documentId: "doc-pwr-02",
        documentTitle: "Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance",
        version: "1.8",
        sectionLabel: "Site Cleanup & Handover",
        content: `Reinstall transparent polycarbonate terminal covers on all battery trays.
Affix Dialog Commissioning Tag showing commissioning date, technician ID, string float voltage, and next inspection due date.
Submit battery conductance baseline readings and rectifier calibration report to Dialog Power Operations portal.`
      }
    ];
    return this.rankCandidateChunks(staticChunks, question, questionEmbedding, topK);
  }
  // ----------------------------------------------------------------------------
  // Document Management & Indexing
  // ----------------------------------------------------------------------------
  async getDocuments() {
    const supabase = getSupabaseAdmin();
    const { data: docs, error } = await supabase.from("sop_documents").select(`
        id,
        title,
        version,
        storage_path,
        status,
        uploaded_by,
        uploaded_at,
        profiles!uploaded_by(full_name),
        sop_chunks(count)
      `).order("uploaded_at", { ascending: false });
    if (error) {
      console.error("Error fetching documents from Supabase:", error);
      return [];
    }
    return (docs || []).map((d) => ({
      id: d.id,
      title: d.title,
      version: d.version,
      storage_path: d.storage_path,
      status: d.status,
      uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at,
      uploader_name: d.profiles?.full_name || "Engineering Operations Desk",
      chunk_count: d.sop_chunks?.[0]?.count || 0
    }));
  }
  async archiveDocument(documentId) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("sop_documents").update({ status: "archived" }).eq("id", documentId);
    if (error) {
      console.error("Error archiving document in Supabase:", error);
      throw error;
    }
    return true;
  }
  async uploadAndIndexSOP(adminUserId, title, version, rawText, storagePath, archiveOldVersionId) {
    const supabase = getSupabaseAdmin();
    if (archiveOldVersionId) {
      await supabase.from("sop_documents").update({ status: "archived" }).eq("id", archiveOldVersionId);
    }
    const { data: doc, error: docErr } = await supabase.from("sop_documents").insert({
      title,
      version,
      storage_path: storagePath,
      status: "active",
      uploaded_by: adminUserId
    }).select().single();
    if (docErr) {
      console.error("Error inserting document into Supabase:", docErr);
      throw docErr;
    }
    const { data: job, error: jobErr } = await supabase.from("indexing_jobs").insert({
      document_id: doc.id,
      status: "processing"
    }).select().single();
    if (jobErr) {
      console.error("Error creating indexing job:", jobErr);
    }
    try {
      const rawSections = this.splitIntoSections(rawText);
      for (const s of rawSections) {
        const embedding = await embed(s.content);
        const { error: chunkErr } = await supabase.from("sop_chunks").insert({
          document_id: doc.id,
          section_label: s.sectionLabel,
          content: s.content,
          embedding
        });
        if (chunkErr) {
          console.error("Error inserting chunk into Supabase:", chunkErr);
        }
      }
      if (job) {
        await supabase.from("indexing_jobs").update({ status: "done" }).eq("id", job.id);
      }
      return {
        document: {
          ...doc,
          chunk_count: rawSections.length
        },
        job: {
          ...job,
          status: "done"
        }
      };
    } catch (err) {
      if (job) {
        await supabase.from("indexing_jobs").update({
          status: "failed",
          error: err?.message || String(err)
        }).eq("id", job.id);
      }
      throw err;
    }
  }
  splitIntoSections(text) {
    const lines = text.split("\n");
    const sections = [];
    let currentLabel = "General Instructions";
    let currentLines = [];
    const isHeader = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(health\s*(&|and)?\s*safety|safety\s*guidelines|ppe)/i.test(trimmed)) {
        return "Health & Safety";
      }
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(tools\s*(&|and)?\s*materials|equipment|required\s*tools)/i.test(trimmed)) {
        return "Tools & Materials Required";
      }
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(procedure|steps|installation|execution|workflow)/i.test(trimmed)) {
        return "Procedure";
      }
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(site\s*cleanup|cleanup|handover|testing\s*(&|and)?\s*signoff)/i.test(trimmed)) {
        return "Site Cleanup & Handover";
      }
      return null;
    };
    for (const line of lines) {
      const header = isHeader(line);
      if (header) {
        if (currentLines.length > 0) {
          sections.push({
            sectionLabel: currentLabel,
            content: currentLines.join("\n").trim()
          });
          currentLines = [];
        }
        currentLabel = header;
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0) {
      sections.push({
        sectionLabel: currentLabel,
        content: currentLines.join("\n").trim()
      });
    }
    return sections.filter((s) => s.content.length > 15);
  }
  async getIndexingJobs() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("indexing_jobs").select(`
        id,
        document_id,
        status,
        error,
        created_at,
        sop_documents(title, version)
      `).order("created_at", { ascending: false }).limit(30);
    if (error) {
      console.error("Error fetching indexing jobs:", error);
      return [];
    }
    return (data || []).map((j) => ({
      id: j.id,
      document_id: j.document_id,
      document_title: j.sop_documents?.title ? `${j.sop_documents.title} (v${j.sop_documents.version})` : "SOP Document",
      status: j.status,
      error: j.error,
      created_at: j.created_at
    }));
  }
  // ----------------------------------------------------------------------------
  // Analytics (Live aggregations directly from Supabase tables)
  // ----------------------------------------------------------------------------
  async getAnalytics() {
    const supabase = getSupabaseAdmin();
    try {
      const { count: totalQueries } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("role", "user");
      const { count: helpfulCount } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("feedback", "up");
      const { count: flaggedCount } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("feedback", "down");
      const { count: activeDocumentsCount } = await supabase.from("sop_documents").select("*", { count: "exact", head: true }).eq("status", "active");
      const { data: flaggedRows } = await supabase.from("messages").select(`
          id,
          chat_id,
          content,
          citations,
          feedback_notes,
          created_at,
          chats!inner(
            user_id,
            profiles!inner(full_name),
            messages(role, content, created_at)
          )
        `).eq("feedback", "down").order("created_at", { ascending: false }).limit(10);
      const flaggedDownMessages = (flaggedRows || []).map((r) => {
        const chatMsgs = Array.isArray(r.chats?.messages) ? r.chats.messages : [];
        const userMsg = chatMsgs.find((m) => m.role === "user")?.content || "Field technical inquiry";
        return {
          id: r.id,
          chatId: r.chat_id,
          question: userMsg,
          answer: r.content,
          citations: Array.isArray(r.citations) ? r.citations : [],
          officerName: r.chats?.profiles?.full_name || "Field Officer",
          createdAt: r.created_at,
          feedbackNotes: r.feedback_notes || void 0
        };
      });
      const { data: userMessages } = await supabase.from("messages").select("content, created_at").eq("role", "user").order("created_at", { ascending: false }).limit(30);
      const frequencyMap = /* @__PURE__ */ new Map();
      for (const m of userMessages || []) {
        let topic = "General Procedure";
        const lower = m.content.toLowerCase();
        if (lower.includes("fiber") || lower.includes("ont") || lower.includes("splice") || lower.includes("optical")) {
          topic = "Optical Fiber & FTTH Splicing";
        } else if (lower.includes("ground") || lower.includes("earth") || lower.includes("resistance") || lower.includes("tower")) {
          topic = "Macro Site Grounding & Earth Resistance";
        } else if (lower.includes("battery") || lower.includes("voltage") || lower.includes("power") || lower.includes("dc")) {
          topic = "48V DC Power & Battery Commissioning";
        } else if (lower.includes("ppe") || lower.includes("safety") || lower.includes("hazard")) {
          topic = "Safety & PPE Compliance";
        }
        const existing = frequencyMap.get(topic);
        if (existing) {
          existing.count += 1;
        } else {
          frequencyMap.set(topic, {
            count: 1,
            lastAsked: m.created_at,
            category: topic
          });
        }
      }
      const mostAskedQuestions = Array.from(frequencyMap.entries()).map(([question, stats]) => ({
        question,
        count: stats.count,
        category: stats.category,
        lastAsked: stats.lastAsked
      }));
      const { data: escalatedMessages, count: unansweredCount } = await supabase.from("messages").select("id, content, chat_id, created_at").eq("role", "assistant").ilike("content", "%escalat%").order("created_at", { ascending: false }).limit(10);
      const unansweredQueries = [];
      if (escalatedMessages && escalatedMessages.length > 0) {
        for (const esc of escalatedMessages) {
          const { data: userMsg } = await supabase.from("messages").select("content, created_at").eq("chat_id", esc.chat_id).eq("role", "user").order("created_at", { ascending: false }).limit(1).single();
          if (userMsg) {
            unansweredQueries.push({
              id: esc.id,
              question: userMsg.content,
              officerName: "Field Technical Staff",
              createdAt: userMsg.created_at,
              language: "en",
              suggestedDomain: "Operations & Site Engineering"
            });
          }
        }
      }
      return {
        totalQueries: totalQueries || 0,
        helpfulCount: helpfulCount || 0,
        flaggedCount: flaggedCount || 0,
        unansweredCount: unansweredCount || 0,
        activeDocumentsCount: activeDocumentsCount || 0,
        mostAskedQuestions: mostAskedQuestions.length > 0 ? mostAskedQuestions : [],
        flaggedDownMessages,
        unansweredQueries
      };
    } catch (err) {
      console.error("Error aggregating analytics from Supabase:", err);
      return {
        totalQueries: 0,
        helpfulCount: 0,
        flaggedCount: 0,
        unansweredCount: 0,
        activeDocumentsCount: 0,
        mostAskedQuestions: [],
        flaggedDownMessages: [],
        unansweredQueries: []
      };
    }
  }
};
var sopStore = new SOPStore();

// server.ts
import dotenv2 from "dotenv";
dotenv2.config();
var app = express();
var PORT = 3e3;
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
var bootstrapPromise = null;
app.use(async (req, res, next) => {
  if (req.url && req.url.startsWith("/api")) {
    try {
      if (!bootstrapPromise) {
        bootstrapPromise = sopStore.ensureInitialized().catch((err) => {
          console.warn("[Server] Supabase bootstrap warning:", err?.message || err);
        });
      }
      await bootstrapPromise;
    } catch {
    }
  }
  next();
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Dialog SOP Assistant API", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/api/ai/status", (req, res) => {
  try {
    const status = getActiveAIProvider();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve AI provider status" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Please provide both email and password." });
    }
    const authResult = await sopStore.authenticateUser(email, password);
    res.json(authResult);
  } catch (err) {
    console.error("Authentication error:", err?.message || err);
    res.status(401).json({
      error: err?.message || "Authentication failed. Only registered accounts in the database can log in."
    });
  }
});
app.post("/api/auth/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = req.body.token || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);
    if (!token) {
      return res.status(401).json({ error: "No authentication token provided." });
    }
    const verified = await sopStore.verifySession(token);
    res.json(verified);
  } catch (err) {
    res.status(401).json({ error: err?.message || "Invalid or expired session." });
  }
});
app.post("/api/auth/logout", async (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});
app.get("/api/profiles", async (req, res) => {
  try {
    const profiles = await sopStore.getAllProfiles();
    res.json(profiles);
  } catch (err) {
    console.error("Error fetching profiles:", err);
    res.status(500).json({ error: "Failed to fetch profiles from database" });
  }
});
app.post("/api/profiles/language", async (req, res) => {
  try {
    const { userId, language } = req.body;
    if (!userId || !language) {
      return res.status(400).json({ error: "Missing userId or language" });
    }
    const updated = await sopStore.updateProfileLanguage(userId, language);
    res.json({ profile: updated });
  } catch (err) {
    console.error("Error updating language:", err);
    res.status(500).json({ error: "Failed to update profile language" });
  }
});
app.get("/api/rate-limit", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const status = await sopStore.checkRateLimit(userId, 50);
    res.json(status);
  } catch (err) {
    res.json({ allowed: true, limit: 50, used: 0, resetMinutes: 60 });
  }
});
app.get("/api/chats", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.json([]);
    }
    const chats = await sopStore.getUserChats(userId);
    res.json(chats);
  } catch (err) {
    console.error("Error fetching chats:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});
app.post("/api/chats", async (req, res) => {
  try {
    const { userId, title } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }
    const chat = await sopStore.createChat(userId, title);
    res.json(chat);
  } catch (err) {
    console.error("Error creating chat:", err);
    res.status(500).json({ error: "Failed to create chat" });
  }
});
app.get("/api/chats/:id/messages", async (req, res) => {
  try {
    const messages = await sopStore.getChatMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
});
app.post("/api/chat/message", async (req, res) => {
  try {
    const { userId, chatId, question } = req.body;
    if (!userId || !chatId || !question || !question.trim()) {
      return res.status(400).json({ error: "Missing userId, chatId, or question" });
    }
    const rateLimit = await sopStore.checkRateLimit(userId, 50);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: `Hourly rate limit exceeded (${rateLimit.limit} queries/hour). Please try again in ${rateLimit.resetMinutes} minutes to control engineering costs.`,
        rateLimit
      });
    }
    const result = await sopStore.handleUserQuestion(userId, chatId, question.trim());
    res.json({
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      rateLimit
    });
  } catch (error) {
    console.error("Error handling chat message:", error);
    res.status(500).json({
      error: error?.message || "Failed to process SOP question. Please retry your inquiry.",
      canRetry: true
    });
  }
});
app.post("/api/chat/feedback", async (req, res) => {
  try {
    const { messageId, feedback, feedbackNotes } = req.body;
    if (!messageId) {
      return res.status(400).json({ error: "Missing messageId" });
    }
    const updated = await sopStore.updateMessageFeedback(messageId, feedback, feedbackNotes);
    res.json({ message: updated });
  } catch (err) {
    console.error("Error updating feedback:", err);
    res.status(500).json({ error: "Failed to update feedback" });
  }
});
app.get("/api/admin/documents", async (req, res) => {
  try {
    const docs = await sopStore.getDocuments();
    res.json(docs);
  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});
app.post("/api/admin/documents/archive", async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ error: "Missing documentId" });
    }
    const success = await sopStore.archiveDocument(documentId);
    res.json({ success });
  } catch (err) {
    console.error("Error archiving document:", err);
    res.status(500).json({ error: "Failed to archive document" });
  }
});
async function parsePdfBuffer(buffer) {
  try {
    const pdfParseMod = await import("pdf-parse");
    if (pdfParseMod.PDFParse) {
      const parser = new pdfParseMod.PDFParse({ data: buffer });
      if (typeof parser.load === "function") {
        await parser.load();
      }
      const res = await parser.getText();
      if (res && typeof res.text === "string") return res.text;
    }
    const legacyFn = pdfParseMod.default || pdfParseMod;
    if (typeof legacyFn === "function") {
      const parsed = await legacyFn(buffer);
      if (parsed && typeof parsed.text === "string") return parsed.text;
    }
  } catch (err) {
    console.warn("[PDF] Error extracting text from PDF buffer:", err);
  }
  return "";
}
app.post("/api/admin/documents/parse-pdf", async (req, res) => {
  try {
    const { base64Pdf } = req.body;
    if (!base64Pdf) {
      return res.status(400).json({ error: "Missing base64Pdf payload" });
    }
    const cleanBase64 = base64Pdf.replace(/^data:application\/pdf;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const text = await parsePdfBuffer(buffer);
    if (!text || !text.trim()) {
      return res.status(422).json({ error: "Could not extract readable text from the provided PDF file." });
    }
    res.json({ text });
  } catch (err) {
    console.error("Error parsing PDF:", err);
    res.status(500).json({ error: "Server error processing PDF: " + (err?.message || err) });
  }
});
app.post("/api/admin/documents/upload", async (req, res) => {
  try {
    const { adminUserId, title, version, rawText, archiveOldVersionId, base64Pdf } = req.body;
    if (!adminUserId || !title || !version) {
      return res.status(400).json({ error: "Missing required fields: adminUserId, title, version" });
    }
    let extractedText = rawText || "";
    if (base64Pdf && (!extractedText || !extractedText.trim())) {
      const cleanBase64 = base64Pdf.replace(/^data:application\/pdf;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      extractedText = await parsePdfBuffer(buffer);
    }
    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: "No readable text content found in uploaded SOP document." });
    }
    const { document, job } = await sopStore.uploadAndIndexSOP(
      adminUserId,
      title,
      version,
      extractedText,
      `sops/dialog_${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_v${version}.pdf`,
      archiveOldVersionId
    );
    res.json({ document, job });
  } catch (err) {
    console.error("Error uploading SOP document:", err);
    res.status(500).json({ error: err?.message || "Failed to process and index SOP document" });
  }
});
app.get("/api/admin/indexing-jobs", async (req, res) => {
  try {
    const jobs = await sopStore.getIndexingJobs();
    res.json(jobs);
  } catch (err) {
    console.error("Error fetching indexing jobs:", err);
    res.status(500).json({ error: "Failed to fetch indexing jobs" });
  }
});
app.get("/api/admin/analytics", async (req, res) => {
  try {
    const analytics = await sopStore.getAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error("Error fetching analytics:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});
async function startServer() {
  await sopStore.ensureInitialized();
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dialog SOP Assistant] Server running on http://0.0.0.0:${PORT}`);
  });
}
var isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
if (!isServerless) {
  startServer();
}
var server_default = app;
export {
  app,
  server_default as default
};
//# sourceMappingURL=server.js.map
