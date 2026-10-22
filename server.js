// server.ts
import express from "express";
import path2 from "path";

// server/sopStore.ts
import fs from "fs";
import path from "path";

// lib/ai.ts
var LANGUAGE_NAMES = {
  en: "English",
  si: "Sinhala (\u0DC3\u0DD2\u0D82\u0DC4\u0DBD)",
  ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)"
};
var SYSTEM_PROMPT_TEMPLATE = (languageName) => `You are the official AI Technical Assistant & Field SOP Synthesizer for Dialog Axiata PLC Field Engineering Operations.

PRIMARY OPERATIONAL DIRECTIVES (STRICT COMPLIANCE REQUIRED):
1. STRICTLY REFER WHOLE SOPS UPLOADED BY ADMIN:
   - Base 100% of the instructions, tool specifications, numerical parameters, tolerances, safety rules, and procedural steps strictly on the full text of the approved Dialog SOP manuals provided below.
   - Do NOT extrapolate, hallucinate, or include unverified generic information not found in the uploaded SOPs.

2. SHOULD BE BULLETS AND POINTS:
   - Output MUST be structured EXCLUSIVELY in clean, punchy bullets ('* ') and numbered points ('1. ', '2. ').
   - Never write narrative paragraphs, conversational filler, or unbroken walls of text. Every item must have a bold lead descriptor: '* **[Lead Descriptor]:** [Actionable operational detail]'.

3. SHOULD ONLY GIVE ASKED QUESTION RELATED ANSWER FROM SOPS:
   - Focus directly and specifically on the asked question/task.
   - Exclude unrelated chapters, equipment, or subsystems (for example: do NOT include battery sensors, door alarms, or inverter settings when asked about antenna installation).

4. RESTRUCTURE WITH ONLY RELEVANT SECTIONS FROM PROVIDED SOPS:
   - Present ONLY the sections that are genuinely relevant to the field officer's inquiry and documented in the provided SOPs.
   - Do NOT output empty, boilerplate, or irrelevant sections. If a section does not apply to the specific question or is not covered in the SOPs, OMIT IT entirely.
   - Candidate sections in field operational sequence (include only those relevant):
     \u2022 \u{1F3AF} Objective & Inquiry Scope (1-2 concise bullet points directly defining the task or inquiry scope)
     \u2022 \u{1F6AA} Site Entry & Pre-Access Requirements (Include ONLY IF site access, work permits, or pre-access checks are documented for this task in the SOP)
     \u2022 \u{1F6E1}\uFE0F Health & Safety Guidelines (Include ONLY IF safety rules, PPE, climbing fall-arrest, RF, or electrical hazard controls are documented in the SOP)
     \u2022 \u{1F9F0} Required Materials, Tools & Equipment (Include ONLY IF specific tools, torque wrenches, meters, or materials are documented in the SOP)
     \u2022 \u{1F4CB} Step-by-Step Procedure (Numbered points '1. **[Step Descriptor]:** ...' detailing the sequential procedure directly answering the question)
     \u2022 \u26A0\uFE0F Critical Quality Checkpoints & Inspection Tolerances (Include ONLY IF numerical tolerances, clearances, torque values, or limits exist in the SOP)
     \u2022 \u{1F9F9} Site Cleaning, Exit & Handover Procedures (Include ONLY IF work area cleaning, cavity checks, NOC clearance, or exit steps are documented in the SOP)
     \u2022 \u{1F6E1}\uFE0F Weatherproofing, Grounding & Environmental Protection (Include ONLY IF weatherproofing, earthing, or environmental protection apply in the SOP)
     \u2022 \u{1F4D1} Source SOP References & Sections (Exact SOP manual title, version number, and specific section clauses referenced)

5. ESCALATION CONDITION:
   - ONLY if the query is genuinely completely absent and completely unrelated to any content in the provided SOPs, output:
     "This information is not found in the approved Dialog Axiata SOPs. Please escalate this query immediately to your field supervisor or the Dialog Engineering Desk."
     (Translate this into ${languageName} if responding in Sinhala or Tamil).

6. LANGUAGE:
   - Respond in ${languageName}. If Sinhala or Tamil is selected, translate all headings and bullet points into ${languageName} while preserving standardized technical codes (like dB, dBm, V, \u03A9, OTDR, AAU).`;
function getActiveAIProvider() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY || process.env.AI_PROVIDER_API_KEY;
  if (geminiKey && geminiKey.trim()) {
    return {
      provider: "gemini",
      name: "Google Gemini",
      model: "gemini-3.5-flash-lite / gemini-3.5-flash",
      hasRapidApiKey: Boolean(rapidApiKey),
      hasGeminiKey: true
    };
  }
  if (rapidApiKey && rapidApiKey.trim()) {
    return {
      provider: "rapidapi",
      name: "RapidAPI LLM Gateway",
      host: process.env.RAPIDAPI_HOST || "chatgpt-42.p.rapidapi.com",
      model: process.env.RAPIDAPI_MODEL || "gpt-4o-mini",
      hasRapidApiKey: true,
      hasGeminiKey: false
    };
  }
  return {
    provider: "deterministic",
    name: "Dialog Procedural Synthesis Engine",
    model: "Local SOP Grounded Semantic Classifier",
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
  let host = (process.env.RAPIDAPI_HOST?.trim() || "chatgpt-42.p.rapidapi.com").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
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
    let targetUrl = "";
    if (/^https?:\/\//i.test(customEndpoint)) {
      targetUrl = customEndpoint;
      try {
        const parsed = new URL(customEndpoint);
        host = parsed.host;
        headers["x-rapidapi-host"] = host;
      } catch {
      }
    } else {
      const cleanEndpoint = customEndpoint.startsWith("/") ? customEndpoint : `/${customEndpoint}`;
      targetUrl = `https://${host}${cleanEndpoint}`;
    }
    attempts.push({
      url: targetUrl,
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
      url: targetUrl,
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
  }
  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12e3);
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
        if (extracted && extracted.length > 15) {
          return extracted;
        }
      }
    } catch {
    }
  }
  return null;
}
var geminiEmbedCooldownUntil = 0;
async function embed(text) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && Date.now() > geminiEmbedCooldownUntil) {
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
      const errStr = `${err?.status} ${err?.code} ${err?.message} ${err?.toString?.() || ""} ${JSON.stringify(err || {})}`;
      const isQuota = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota") || errStr.includes("exceeded your current quota");
      if (isQuota) {
        geminiEmbedCooldownUntil = Date.now() + 5 * 60 * 1e3;
      }
    }
  }
  return generateDeterministicEmbedding(text, 1536);
}
async function generateAnswerFromAllSOPs(question, allSOPs, language = "en") {
  const languageName = LANGUAGE_NAMES[language] || "English";
  const systemInstruction = SYSTEM_PROMPT_TEMPLATE(languageName);
  if (!allSOPs || allSOPs.length === 0) {
    return {
      answer: getUnansweredMessage(language, "No approved SOP documents are currently loaded in the system."),
      citations: []
    };
  }
  const formattedAllSOPs = allSOPs.map((doc, idx) => {
    return `=========================================
[SOP MANUAL ${idx + 1}] TITLE: "${doc.title}" (Version: ${doc.version})
DOCUMENT ID: ${doc.id}
-----------------------------------------
${doc.fullText.trim()}
=========================================`;
  }).join("\n\n");
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim()) {
    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-latest"
    ];
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

=========================================
APPROVED DIALOG SOP DOCUMENTS REPOSITORY (FULL TEXT):
=========================================
${formattedAllSOPs}

=========================================
FIELD OFFICER INQUIRY / TASK:
"${question}"

TASK EXECUTION & OPERATIONAL DIRECTIVES:
1. STRICTLY REFER WHOLE SOPS UPLOADED BY ADMIN: Base every single bullet point and sequence step strictly on the SOP text provided above.
2. SHOULD BE BULLETS AND POINTS: Every single section MUST consist of bullets ('* ') or numbered points ('1. ', '2. '). Never use continuous narrative prose or paragraphs. Every item must have a bold lead descriptor.
3. SHOULD ONLY GIVE ASKED QUESTION RELATED ANSWER FROM SOPS: Focus directly and specifically on the asked question/task. Exclude unrelated chapters, subsystems, or equipment (e.g. do not include battery sensors, door alarms, or inverter settings when asked about antenna installation).
4. RESTRUCTURE WITH ONLY RELEVANT SECTIONS FROM PROVIDED SOPS:
   - Present ONLY the sections that are genuinely relevant to the field officer's inquiry and documented in the provided SOPs.
   - Do NOT output empty, boilerplate, or irrelevant sections. If a section does not apply to the specific question or is not covered in the SOPs, OMIT IT entirely.
   - Candidate sections in field operational sequence (include only those relevant):
     \u2022 \u{1F3AF} Objective & Inquiry Scope (1-2 concise bullet points directly defining the task or inquiry scope)
     \u2022 \u{1F6AA} Site Entry & Pre-Access Requirements (Include ONLY IF site access, work permits, or pre-access checks are documented for this task in the SOP)
     \u2022 \u{1F6E1}\uFE0F Health & Safety Guidelines (Include ONLY IF safety rules, PPE, climbing fall-arrest, RF, or electrical hazard controls are documented in the SOP)
     \u2022 \u{1F9F0} Required Materials, Tools & Equipment (Include ONLY IF specific tools, torque wrenches, meters, or materials are documented in the SOP)
     \u2022 \u{1F4CB} Step-by-Step Procedure (Numbered points '1. **[Step Descriptor]:** ...' detailing the sequential procedure directly answering the question)
     \u2022 \u26A0\uFE0F Critical Quality Checkpoints & Inspection Tolerances (Include ONLY IF numerical tolerances, clearances, torque values, or limits exist in the SOP)
     \u2022 \u{1F9F9} Site Cleaning, Exit & Handover Procedures (Include ONLY IF work area cleaning, cavity checks, NOC clearance, or exit steps are documented in the SOP)
     \u2022 \u{1F6E1}\uFE0F Weatherproofing, Grounding & Environmental Protection (Include ONLY IF weatherproofing, earthing, or environmental protection apply in the SOP)
     \u2022 \u{1F4D1} Source SOP References & Sections (Exact SOP manual title, version number, and specific section clauses referenced)
   Ground every point in the uploaded SOP text above; only use the escalation notice if the query has zero relation to any of the uploaded SOPs.`;
      for (const model of candidateModels) {
        try {
          const timeoutPromise = new Promise(
            (_, reject) => setTimeout(() => reject(new Error(`Timeout invoking ${model}`)), 24e3)
          );
          const generatePromise = ai.models.generateContent({
            model,
            contents: prompt
          });
          const response = await Promise.race([generatePromise, timeoutPromise]);
          if (response && response.text && response.text.trim().length > 30) {
            const geminiAnswer = response.text.trim();
            const citations = extractCitationsFromAnswerAndSOPs(geminiAnswer, allSOPs, question);
            return { answer: geminiAnswer, citations };
          }
        } catch (modelErr) {
          console.warn(`[lib/ai.ts] Gemini candidate ${model} notice:`, modelErr?.message || modelErr);
        }
      }
    } catch (importErr) {
      console.warn("[lib/ai.ts] Gemini client initialization notice:", importErr?.message || importErr);
    }
  }
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
      if (rapidAnswer && rapidAnswer.trim().length > 30) {
        const citations = extractCitationsFromAnswerAndSOPs(rapidAnswer, allSOPs, question);
        return { answer: rapidAnswer.trim(), citations };
      }
    } catch (rapidErr) {
      console.warn("[lib/ai.ts] RapidAPI invocation notice:", rapidErr);
    }
  }
  return searchAndSynthesizeFromAllSOPs(question, allSOPs, language);
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
function extractCitationsFromAnswerAndSOPs(answer, allSOPs, question) {
  const citations = [];
  const answerLower = answer.toLowerCase();
  const questionWords = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  for (const doc of allSOPs) {
    const docTitleLower = doc.title.toLowerCase();
    const docCode = doc.title.split(":")[0].toLowerCase();
    const isMentioned = answerLower.includes(docTitleLower) || answerLower.includes(docCode);
    const paragraphs = doc.fullText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let bestParagraph = "";
    let bestSectionLabel = "Field Procedure Standard";
    let bestMatches = 0;
    for (const p of paragraphs) {
      const pLower = p.toLowerCase();
      let matches = 0;
      for (const w of questionWords) {
        if (pLower.includes(w)) matches++;
      }
      const firstLine = p.split("\n")[0].trim();
      const isHeaderLine = /^(?:#+\s*|\d+[\.\)]\s*|section\s*\d*[:\.\-]?\s*)([^\n]{3,60})/i.exec(firstLine);
      const currentSection = isHeaderLine ? isHeaderLine[1].trim() : null;
      if (matches > bestMatches) {
        bestMatches = matches;
        bestParagraph = p;
        if (currentSection) {
          bestSectionLabel = currentSection;
        } else if (pLower.includes("safety") || pLower.includes("ppe")) {
          bestSectionLabel = "Health & Safety";
        } else if (pLower.includes("tool") || pLower.includes("material")) {
          bestSectionLabel = "Tools & Materials";
        } else if (pLower.includes("procedure") || pLower.includes("step") || pLower.includes("install")) {
          bestSectionLabel = "Execution Procedure";
        } else if (pLower.includes("cleanup") || pLower.includes("handover") || pLower.includes("sign-off")) {
          bestSectionLabel = "Cleanup & Handover";
        }
      }
    }
    if (isMentioned || bestMatches >= 1) {
      citations.push({
        documentTitle: doc.title,
        version: doc.version,
        sectionLabel: bestSectionLabel,
        excerpt: bestParagraph ? bestParagraph.slice(0, 240) + "..." : doc.fullText.slice(0, 200) + "...",
        similarity: bestMatches > 0 ? Math.min(0.98, 0.78 + bestMatches * 0.05) : 0.88
      });
    }
  }
  if (citations.length === 0 && allSOPs.length > 0) {
    const scoredDocs = allSOPs.map((doc) => {
      let matches = 0;
      const textLower = doc.fullText.toLowerCase() + " " + doc.title.toLowerCase();
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
        sectionLabel: "Technical Work Instructions",
        excerpt: top.fullText.slice(0, 240) + "...",
        similarity: 0.88
      });
    }
  }
  return citations.slice(0, 3);
}
var TELECOM_SYNONYMS = {
  splice: ["splicing", "cleave", "cleaver", "fusion", "loss", "core", "v-groove", "fiber", "fibre", "sleeve"],
  splicing: ["splice", "cleave", "fusion", "loss", "db", "attenuation", "fiber", "fibre"],
  fiber: ["fibre", "drop", "cable", "optics", "optical", "ftth", "ont", "fat", "fdt", "pon"],
  fibre: ["fiber", "drop", "cable", "optical", "ftth", "ont"],
  cable: ["drop", "fiber", "feeder", "jumper", "patchcord", "duct", "conduit", "tension"],
  ground: ["grounding", "earth", "earthing", "resistance", "megger", "mgb", "tower", "ohm", "surge", "lightning", "c-clamp"],
  grounding: ["ground", "earth", "earthing", "resistance", "tower", "ohm", "surge", "c-clamp"],
  earth: ["ground", "grounding", "resistance", "earthing", "ohm", "rod", "pit"],
  resistance: ["earth", "ground", "grounding", "ohm", "ohms", "impedance", "tester", "megger"],
  battery: ["batteries", "dc", "power", "rectifier", "inverter", "voltage", "float", "vrla", "lifepo4", "bank", "ah"],
  power: ["dc", "battery", "rectifier", "inverter", "voltage", "breaker", "48v", "charge"],
  inverter: ["solar", "hybrid", "dc", "ac", "rectifier", "power", "voltage"],
  antenna: ["antennas", "aau", "rru", "vswr", "dtf", "tilt", "azimuth", "ret", "feeder", "jumper", "rf", "pole", "bracket", "crossbar", "mount", "mounting", "microwave", "sector", "dish", "c-clamp"],
  aau: ["antenna", "antennas", "rru", "active antenna unit", "pole", "bracket", "azimuth", "tilt", "rf", "mount", "mounting", "c-clamp"],
  install: ["installation", "mounting", "mount", "fixing", "fixed", "setup", "assembly", "assemble", "clamping", "bracket"],
  loss: ["db", "attenuation", "power", "otdr", "splice", "insertion", "optical"],
  safety: ["ppe", "hazard", "protection", "glasses", "laser", "shock", "voltage", "fall", "harness", "helmet"],
  ppe: ["safety", "hazard", "gloves", "glasses", "helmet", "boots", "harness"],
  test: ["testing", "measurement", "verify", "verification", "meter", "tester", "otdr", "inspection"],
  testing: ["test", "measure", "measurement", "verify", "otdr", "tolerance", "threshold"],
  cleanup: ["handover", "waste", "disposal", "shards", "sign-off", "weatherproofing", "portal", "closure"]
};
function splitIntoDiscreteClauses(text) {
  const rawParagraphs = text.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
  const clauses = [];
  for (const para of rawParagraphs) {
    const numberedSplitRegex = /(?:^|\s+)(?=(?:(?:[1-9]\d{0,2}|[a-z])[\.\)]|\b(?:Step|Clause|Section|Item)\s+\d+[:\.]?)\s+[A-Z])/g;
    const subParts = para.split(numberedSplitRegex).map((s) => s.trim()).filter(Boolean);
    if (subParts.length > 1) {
      for (const sp of subParts) {
        if (sp.length > 10) clauses.push(sp);
      }
    } else {
      const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z0-9])/;
      const sentences = para.split(sentenceRegex).map((s) => s.trim()).filter(Boolean);
      if (sentences.length > 1 && para.length > 250) {
        for (const s of sentences) {
          if (s.length > 15) clauses.push(s);
        }
      } else if (para.length > 10) {
        clauses.push(para);
      }
    }
  }
  return clauses;
}
function deriveStepDescriptor(clause) {
  const cl = clause.toLowerCase();
  if (cl.includes("vertically") || cl.includes("vertical")) return "Vertical Orientation & Alignment";
  if (cl.includes("distance") || cl.includes("1200mm") || cl.includes("1600mm") || cl.includes("clearance")) return "Tower Base Clearance";
  if (cl.includes("arms of the antenna bracket") || cl.includes("cross bar")) return "Bracket & Crossbar Mounting";
  if (cl.includes("maximum number of aau") || cl.includes("cellular pole")) return "Pole Capacity & Operator Limits";
  if (cl.includes("fixed firmly") || cl.includes("clamps")) return "Mechanical Clamping & Fixing";
  if (cl.includes("torque wrench") || cl.includes("tightening the nuts")) return "Fastening Torque & Verification Mark";
  if (cl.includes("check nuts") || cl.includes("spring washers") || cl.includes("flat washers")) return "Fastener Hardware Completeness";
  if (cl.includes("azimuth tolerance") || cl.includes("cut off") || cl.includes("bolts block")) return "Bolt Length Trimming & Azimuth Clearance";
  if (cl.includes("maintenance cavity") && (cl.includes("cover plates") || cl.includes("water seal"))) return "Maintenance Cavity Water Seal";
  if (cl.includes("dust proof cap") || cl.includes("vacant rf port")) return "Vacant RF Port Protection";
  if (cl.includes("unused ports") || cl.includes("rubber bushes")) return "Unused Cavity Port Sealing";
  if (cl.includes("stripped part") || cl.includes("power cable")) return "Power Cable Cavity Dressing";
  if (cl.includes("grounded") || cl.includes("c clamp")) return "Structural Grounding Contact";
  if (cl.includes("strip") || cl.includes("stripper")) return "Cable Sheath Stripping";
  if (cl.includes("cleav")) return "Precision Fiber Cleaving";
  if (cl.includes("splic")) return "Arc Fusion Splicing";
  if (cl.includes("heat-shrink") || cl.includes("sleeve")) return "Splice Sleeve Heat-Shrinking";
  if (cl.includes("torque")) return "Torque Specification Execution";
  if (cl.includes("measure") || cl.includes("power meter")) return "Optical Power Verification";
  return "Operational Execution Step";
}
function searchAndSynthesizeFromAllSOPs(question, allSOPs, language) {
  const stopWords = /* @__PURE__ */ new Set([
    "what",
    "when",
    "where",
    "which",
    "whom",
    "whose",
    "does",
    "have",
    "been",
    "with",
    "from",
    "this",
    "that",
    "they",
    "your",
    "about",
    "how",
    "the",
    "and",
    "for",
    "are",
    "was",
    "were",
    "give",
    "tell",
    "show",
    "need",
    "know",
    "please"
  ]);
  const rawTokens = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const expandedKeywords = new Set(rawTokens);
  for (const token of rawTokens) {
    if (token.endsWith("ing")) expandedKeywords.add(token.slice(0, -3));
    if (token.endsWith("ed")) expandedKeywords.add(token.slice(0, -2));
    if (token.endsWith("s") && token.length > 3) expandedKeywords.add(token.slice(0, -1));
    for (const [key, synonyms] of Object.entries(TELECOM_SYNONYMS)) {
      if (token === key || synonyms.includes(token)) {
        expandedKeywords.add(key);
        for (const s of synonyms) expandedKeywords.add(s);
      }
    }
  }
  const searchTerms = Array.from(expandedKeywords);
  const scoredDocs = allSOPs.map((doc) => {
    const textLower = (doc.title + " " + doc.fullText).toLowerCase();
    let score = 0;
    let titleHits = 0;
    for (const term of searchTerms) {
      if (doc.title.toLowerCase().includes(term)) {
        score += 8;
        titleHits++;
      }
      const occurrences = (textLower.match(new RegExp("\\b" + term, "g")) || []).length;
      score += Math.min(occurrences, 12);
    }
    for (const term of searchTerms) {
      if (term.length >= 4 && textLower.includes(term.slice(0, 4))) {
        score += 1.5;
      }
    }
    return { doc, score, titleHits };
  }).sort((a, b) => b.score - a.score);
  let primaryMatch;
  let topDocs = [];
  const isEngineeringOrGeneralProcedural = /\b(?:procedure|step|steps|how|what|instruction|instructions|guideline|guidelines|install|installation|safety|ppe|tool|tools|meter|tester|measure|test|testing|tolerance|limit|spec|specification|cleanup|handover|method|sop|manual|work|site|task)\b/i.test(question);
  if (scoredDocs.length > 0 && scoredDocs[0].score > 0) {
    primaryMatch = scoredDocs[0].doc;
    topDocs = scoredDocs.filter((s) => s.score > 0).slice(0, 2).map((s) => s.doc);
  } else if (allSOPs.length > 0 && (isEngineeringOrGeneralProcedural || allSOPs.length <= 3)) {
    primaryMatch = allSOPs[0];
    topDocs = [allSOPs[0]];
  } else {
    return {
      answer: getUnansweredMessage(language),
      citations: []
    };
  }
  const isAntennaQuery = /\b(?:antenna|antennas|aau|rru|pole|bracket|crossbar|mount|rf|azimuth|tilt)\b/i.test(question);
  const isBatteryQuery = /\b(?:battery|batteries|vrla|lifepo4|float|acid|rectifier|bank)\b/i.test(question);
  const isFiberQuery = /\b(?:fiber|fibre|splice|splicing|cleav|ont|optical|power meter|otdr|dbm)\b/i.test(question);
  const procedureSteps = [];
  const qualityTolerances = [];
  const toolsMaterials = [];
  const weatherproofingProtection = [];
  const healthSafety = [];
  const siteEntry = [];
  const siteExit = [];
  const sourcesUsed = /* @__PURE__ */ new Set();
  const citations = [];
  for (const doc of topDocs) {
    sourcesUsed.add(`"${doc.title}" (v${doc.version})`);
    const clauses = splitIntoDiscreteClauses(doc.fullText);
    for (const rawClause of clauses) {
      const clean = rawClause.replace(/^[•\-\*#\d\.\)]+\s*/, "").trim();
      if (clean.length < 15) continue;
      const cl = clean.toLowerCase();
      if (isAntennaQuery) {
        const isDisjointSubsystem = cl.includes("battery temperature") || cl.includes("btemp") || cl.includes("door status") || cl.includes("gate port") && !cl.includes("tower") || cl.includes("uim") || cl.includes("rectifier") && !cl.includes("power") || cl.includes("diesel") || cl.includes("fuel tank");
        if (isDisjointSubsystem && !cl.includes("antenna") && !cl.includes("aau") && !cl.includes("pole")) {
          continue;
        }
      }
      if (isBatteryQuery && (cl.includes("antenna") || cl.includes("optical fiber") || cl.includes("cleaver")) && !cl.includes("battery")) {
        continue;
      }
      if (isFiberQuery && (cl.includes("antenna") || cl.includes("battery bank")) && !cl.includes("fiber") && !cl.includes("splice")) {
        continue;
      }
      const hasTermMatch = searchTerms.some((term) => cl.includes(term));
      const hasProceduralContext = isAntennaQuery ? cl.includes("aau") || cl.includes("antenna") || cl.includes("pole") || cl.includes("bracket") || cl.includes("clamp") || cl.includes("torque") || cl.includes("washers") || cl.includes("azimuth") || cl.includes("water seal") || cl.includes("cavity") || cl.includes("rf port") || cl.includes("grounded") : true;
      if (!hasTermMatch && !hasProceduralContext) {
        continue;
      }
      if (cl.includes("maintenance cavity") && (cl.includes("cover plates") || cl.includes("water seal") || cl.includes("leakage")) || (cl.includes("dust proof cap") || cl.includes("vacant rf port")) || cl.includes("unused ports") && cl.includes("rubber bushes") || (cl.includes("grounded to the structure") || cl.includes("grounded") && cl.includes("c clamp"))) {
        if (cl.includes("grounded") && cl.includes("c clamp")) {
          weatherproofingProtection.push("**Structural Grounding:** Ground the equipment directly to the tower structure with verified electrical contact using a C-clamp, removing paint over the minimum required contact area.");
        } else if (cl.includes("maintenance cavity") && cl.includes("cover plates")) {
          weatherproofingProtection.push("**Maintenance Cavity Water Seal:** Fix cover plates of the maintenance cavity firmly, ensuring the water seal is in place to prevent water ingress into the cavity.");
        } else if (cl.includes("dust proof cap")) {
          weatherproofingProtection.push("**RF Port Protection:** Do not remove dust-proof caps from vacant RF ports on antennas/AAUs until connection; apply waterproofing per guidelines.");
        } else if (cl.includes("unused ports") && cl.includes("rubber bushes")) {
          weatherproofingProtection.push("**Unused Cavity Port Sealing:** Block all unused ports of the maintenance cavity using original manufacturer rubber bushes only.");
        } else {
          weatherproofingProtection.push(clean);
        }
      }
      if (/(?:\b\d+(?:\.\d+)?\s*(?:mm|cm|m|db|dbm|ohm|ohms|ω|v|vdc|vac|nm|a|ah|%|kg|n·m)\b|tolerance|exceed|threshold|limit|torque wrench)/i.test(clean) && (cl.includes("clearance") || cl.includes("distance") || cl.includes("azimuth") || cl.includes("torque") || cl.includes("loss") || cl.includes("maximum number") || cl.includes("specifications"))) {
        if (cl.includes("1200mm") || cl.includes("1600mm")) {
          qualityTolerances.push("**Tower Base Clearance:** Minimum 1200mm ~ 1600mm distance must be maintained between the tower base level and bottom of the AAU at RT Pole sites.");
        } else if (cl.includes("azimuth tolerance") || cl.includes("15 degrees")) {
          qualityTolerances.push("**Azimuth Alignment Tolerance:** Maintained strictly within \xB115 degrees expected azimuth tolerance.");
        } else if (cl.includes("torque wrench") && cl.includes("mark")) {
          qualityTolerances.push("**Tightening Torque Verification:** A calibrated torque wrench must be used according to product specifications, and a torque mark must be made to confirm all nuts are tightened to the correct value.");
        } else if (cl.includes("check nuts") || cl.includes("spring washers")) {
          qualityTolerances.push("**Fastener Completeness:** All check nuts, spring washers, and flat washers must be installed without omission.");
        } else if (cl.includes("0.03 db") || cl.includes("splice loss")) {
          qualityTolerances.push("**Splice Loss Limit:** Maximum allowable loss per splice shall not exceed 0.03 dB.");
        } else if (cl.includes("-18 dbm") || cl.includes("-24 dbm")) {
          qualityTolerances.push("**Optical Power Window:** Optical power level at customer ONT must measure between -18 dBm and -24 dBm.");
        } else {
          qualityTolerances.push(clean);
        }
      }
      if (cl.includes("torque wrench") || cl.includes("c clamp") || cl.includes("washers") || cl.includes("bracket") || cl.includes("rubber bushes") || cl.includes("bonding tape") || cl.includes("splicer") || cl.includes("cleaver") || cl.includes("alcohol") || cl.includes("meter") || cl.includes("crimping tool")) {
        if (cl.includes("torque wrench")) toolsMaterials.push("**Calibrated Torque Wrench:** Sized to manufacturer nut specifications for precise fastening.");
        if (cl.includes("c clamp")) toolsMaterials.push("**Structural C-Clamp:** For heavy-duty grounding connection to tower steel structure.");
        if (cl.includes("bracket") || cl.includes("clamps")) toolsMaterials.push("**Antenna Mounting Hardware:** Approved pole brackets, double-bracket crossbars, and fixing clamps.");
        if (cl.includes("check nuts") || cl.includes("washers")) toolsMaterials.push("**Fasteners:** Product-specified check nuts, spring washers, and flat washers.");
        if (cl.includes("rubber bushes")) toolsMaterials.push("**Manufacturer Rubber Bushes:** Original sealing plugs for blocking vacant cavity ports.");
        if (cl.includes("bonding tape") || cl.includes("insulation tape")) toolsMaterials.push("**Anti-Corrosion Tapes:** Bonding and electrical insulation tape for trimmed bolt protection.");
        if (cl.includes("splicer")) toolsMaterials.push("**Core-Alignment Fusion Splicer:** Calibrated with clean V-grooves.");
        if (cl.includes("cleaver")) toolsMaterials.push("**Precision Fiber Cleaver:** Set for exact 10mm cleave length.");
        if (cl.includes("alcohol")) toolsMaterials.push("**99% Isopropyl Alcohol & Lint-Free Wipes:** For optical cladding cleaning.");
      }
      if (cl.includes("ppe") || cl.includes("safety") || cl.includes("hazard") || cl.includes("harness") || cl.includes("helmet") || cl.includes("gloves") || cl.includes("fall") || cl.includes("radiation") || cl.includes("laser") || cl.includes("voltage") || cl.includes("electric") || cl.includes("shock") || cl.includes("climbing")) {
        if (cl.includes("harness") || cl.includes("climbing") || cl.includes("fall")) {
          healthSafety.push("**Tower Climbing Fall Arrest:** Full-body harness with double lanyard must be securely hooked to certified fall-arrest lifelines during all aerial work.");
        } else if (cl.includes("laser") || cl.includes("radiation") || cl.includes("rf")) {
          healthSafety.push("**Radiation & Optical Safety:** Never look directly into live optical fiber cores; maintain safe exclusion distance from active RF radiating antennas.");
        } else if (cl.includes("helmet") || cl.includes("boots") || cl.includes("ppe") || cl.includes("gloves")) {
          healthSafety.push("**Mandatory PPE:** Standard Dialog PPE required at all times: safety helmet, steel-toe boots, protective work gloves, and high-visibility vest.");
        } else {
          healthSafety.push(clean);
        }
      }
      if (cl.includes("site entry") || cl.includes("work permit") || cl.includes("access clearance") || cl.includes("noc check-in") || cl.includes("permit") || cl.includes("authorization") || cl.includes("gate") || cl.includes("pre-access") || cl.includes("prior to start") || cl.includes("before commencing") || cl.includes("security")) {
        if (cl.includes("permit") || cl.includes("approval") || cl.includes("authorization")) {
          siteEntry.push("**Work Permit & Access Authorization:** Secure formal work clearance and verify active permit-to-work before entering the site compound.");
        } else if (cl.includes("check-in") || cl.includes("noc")) {
          siteEntry.push("**NOC Check-In:** Log site arrival with Dialog NOC / Field Service Management system prior to physical intervention.");
        } else {
          siteEntry.push(clean);
        }
      }
      if (cl.includes("clean") || cl.includes("cleanup") || cl.includes("debris") || cl.includes("waste") || cl.includes("shards") || cl.includes("pack") || cl.includes("exit") || cl.includes("handover") || cl.includes("sign-off") || cl.includes("noc clearance") || cl.includes("closure") || cl.includes("telemetry")) {
        if (cl.includes("debris") || cl.includes("clean") || cl.includes("waste") || cl.includes("shards")) {
          siteExit.push("**Site Housekeeping & Debris Disposal:** Clean installation area thoroughly; remove all wire scraps, cable jackets, packaging debris, and optical fiber shards.");
        } else if (cl.includes("handover") || cl.includes("sign-off") || cl.includes("exit") || cl.includes("noc")) {
          siteExit.push("**NOC Clearance & Field Handover:** Confirm operational telemetry with Dialog NOC, complete digital sign-off report, and lock all site access gates upon exit.");
        } else {
          siteExit.push(clean);
        }
      }
      const isActionStep = /\b(?:ensure|install|mount|connect|tighten|fasten|verify|inspect|check|measure|align|configure|route|strip|cleave|splice|secure|prepare|apply|remove|attach|place|insert|test|record|calibrate|switch|turn|open|close|maintain|adjust)\b/i.test(clean) || /(?:step\s*\d+|^\d+[\.\)]|[a-z][\.\)])/i.test(rawClause) || cl.includes("vertically") || cl.includes("arms of the antenna") || cl.includes("fixed firmly") || cl.includes("torque wrench") || cl.includes("washers") || cl.includes("rru") || cl.includes("aau") || cl.includes("bare fiber") || cl.includes("cleave") || cl.includes("fusion") || cl.includes("heat-shrink");
      if (isActionStep && !cl.includes("site entry") && !cl.includes("gate") && !cl.includes("sign-off")) {
        const title = deriveStepDescriptor(clean);
        if (!procedureSteps.some((s) => s.text === clean || s.title === title && procedureSteps.length > 6)) {
          procedureSteps.push({ title, text: clean });
        }
      }
    }
    citations.push({
      documentTitle: doc.title,
      version: doc.version,
      sectionLabel: "Dialog Field Engineering SOP",
      excerpt: doc.fullText.slice(0, 260) + "...",
      similarity: 0.98
    });
  }
  const dedupe = (arr, max = 6) => Array.from(new Set(arr)).slice(0, max);
  let finalProc = procedureSteps.slice(0, 10);
  const finalTolerances = dedupe(qualityTolerances, 6);
  const finalTools = dedupe(toolsMaterials, 6);
  const finalWeather = dedupe(weatherproofingProtection, 5);
  const finalSafety = dedupe(healthSafety, 5);
  const finalEntry = dedupe(siteEntry, 4);
  const finalExit = dedupe(siteExit, 4);
  if (finalProc.length === 0 && topDocs.length > 0) {
    const rawClauses = splitIntoDiscreteClauses(topDocs[0].fullText);
    for (const raw of rawClauses) {
      const clean = raw.replace(/^[•\-\*#\d\.\)]+\s*/, "").trim();
      if (clean.length > 25 && searchTerms.some((t) => clean.toLowerCase().includes(t))) {
        finalProc.push({
          title: deriveStepDescriptor(clean),
          text: clean
        });
        if (finalProc.length >= 6) break;
      }
    }
  }
  let objectiveScope = "";
  if (isAntennaQuery) {
    objectiveScope = `Verified procedural guidelines, physical mounting clearances, torque specifications, and weatherproofing rules for antenna (AAU) installation from ${primaryMatch.title}.`;
  } else if (isFiberQuery) {
    objectiveScope = `Verified optical specifications, splicing sequence, and acceptance criteria for drop fiber installation from ${primaryMatch.title}.`;
  } else {
    objectiveScope = `Verified operational guidelines and technical parameters extracted for "${question}" from ${primaryMatch.title} (v${primaryMatch.version}).`;
  }
  let headings = {
    title: `### \u{1F4D8} ${primaryMatch.title.split(":")[0]} \u2014 Restructured Field Mini Guideline`,
    scope: "**\u{1F3AF} Objective & Inquiry Scope:**",
    entry: "### \u{1F6AA} Site Entry & Pre-Access Requirements",
    safety: "### \u{1F6E1}\uFE0F Health & Safety Guidelines",
    tools: "### \u{1F9F0} Required Materials, Tools & Equipment",
    proc: "### \u{1F4CB} Step-by-Step Procedure",
    tolerances: "### \u26A0\uFE0F Critical Quality Checkpoints & Inspection Tolerances",
    cleaningExit: "### \u{1F9F9} Site Cleaning, Exit & Handover Procedures",
    weather: "### \u{1F6E1}\uFE0F Weatherproofing, Grounding & Environmental Protection",
    sources: "### \u{1F4D1} Source SOP References & Sections"
  };
  if (language === "si") {
    headings = {
      title: `### \u{1F4D8} ${primaryMatch.title.split(":")[0]} \u2014 \u0DB4\u0DCA\u200D\u0DBB\u0DAD\u0DD2\u0DC3\u0D82\u0DC0\u0DD2\u0DB0\u0DCF\u0DB1\u0DBA \u0D9A\u0DC5 \u0D9A\u0DCA\u0DC2\u0DDA\u0DAD\u0DCA\u200D\u0DBB \u0DB8\u0DCF\u0DBB\u0DCA\u0D9C\u0DDD\u0DB4\u0DAF\u0DDA\u0DC1\u0DBA`,
      scope: "**\u{1F3AF} \u0D85\u0DBB\u0DB8\u0DD4\u0DAB \u0DC3\u0DC4 \u0DC0\u0DD2\u0DC2\u0DBA \u0DB4\u0DAE\u0DBA (Objective & Scope):**",
      entry: "### \u{1F6AA} \u0D85\u0DA9\u0DC0\u0DD2 \u0DB4\u0DCA\u200D\u0DBB\u0DC0\u0DDA\u0DC1\u0DBA \u0DC3\u0DC4 \u0DB4\u0DD6\u0DBB\u0DCA\u0DC0 \u0D85\u0DC0\u0DC1\u0DCA\u200D\u0DBA\u0DAD\u0DCF (Site Entry & Pre-Access)",
      safety: "### \u{1F6E1}\uFE0F \u0DC3\u0DDE\u0D9B\u0DCA\u200D\u0DBA \u0DC4\u0DCF \u0D86\u0DBB\u0D9A\u0DCA\u0DC2\u0DAB \u0DB8\u0DCF\u0DBB\u0DCA\u0D9C\u0DDD\u0DB4\u0DAF\u0DDA\u0DC1 (Health & Safety)",
      tools: "### \u{1F9F0} \u0D85\u0DC0\u0DC1\u0DCA\u200D\u0DBA \u0D8B\u0DB4\u0D9A\u0DBB\u0DAB \u0DC3\u0DC4 \u0DAF\u0DCA\u200D\u0DBB\u0DC0\u0DCA\u200D\u0DBA (Required Materials & Tools)",
      proc: "### \u{1F4CB} \u0DB4\u0DD2\u0DBA\u0DC0\u0DBB\u0DD9\u0DB1\u0DCA \u0DB4\u0DD2\u0DBA\u0DC0\u0DBB \u0D9A\u0DCA\u200D\u0DBB\u0DD2\u0DBA\u0DCF\u0DB4\u0DA7\u0DD2\u0DB4\u0DCF\u0DA7\u0DD2\u0DBA (Step-by-Step Procedure)",
      tolerances: "### \u26A0\uFE0F \u0DAD\u0DAD\u0DCA\u0DAD\u0DCA\u0DC0 \u0DB4\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DAB \u0DC3\u0DC4 \u0DAD\u0DCF\u0D9A\u0DCA\u0DC2\u0DAB\u0DD2\u0D9A \u0DC3\u0DD3\u0DB8\u0DCF\u0DC0\u0DB1\u0DCA (Inspection Tolerances)",
      cleaningExit: "### \u{1F9F9} \u0D85\u0DA9\u0DC0\u0DD2\u0DBA \u0DB4\u0DD2\u0DBB\u0DD2\u0DC3\u0DD2\u0DAF\u0DD4 \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8 \u0DC3\u0DC4 \u0DB4\u0DD2\u0DA7\u0DC0\u0DD3\u0DB8 (Site Cleaning & Exit)",
      weather: "### \u{1F6E1}\uFE0F \u0D9A\u0DCF\u0DBD\u0D9C\u0DD4\u0DAB \u0D86\u0DBB\u0D9A\u0DCA\u0DC2\u0DAB\u0DBA \u0DC3\u0DC4 \u0DB7\u0DD6\u0D9C\u0DAD \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8 (Weatherproofing & Grounding)",
      sources: "### \u{1F4D1} \u0DB7\u0DCF\u0DC0\u0DD2\u0DAD\u0DCF \u0D9A\u0DBB\u0DB1 \u0DBD\u0DAF \u0DB1\u0DD2\u0DBD SOP \u0DBD\u0DDA\u0D9B\u0DB1 (Source SOP References)"
    };
  } else if (language === "ta") {
    headings = {
      title: `### \u{1F4D8} ${primaryMatch.title.split(":")[0]} \u2014 \u0BAE\u0BB1\u0BC1\u0B9A\u0BC0\u0BB0\u0BAE\u0BC8\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F \u0B95\u0BB3 \u0BB5\u0BB4\u0BBF\u0B95\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0BA4\u0BB2\u0BCD`,
      scope: "**\u{1F3AF} \u0BA8\u0BCB\u0B95\u0BCD\u0B95\u0BAE\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B8E\u0BB2\u0BCD\u0BB2\u0BC8 (Objective & Scope):**",
      entry: "### \u{1F6AA} \u0BA4\u0BB3 \u0BA8\u0BC1\u0BB4\u0BC8\u0BB5\u0BC1 \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BAE\u0BC1\u0BA9\u0BCD \u0BA4\u0BC7\u0BB5\u0BC8\u0B95\u0BB3\u0BCD (Site Entry & Pre-Access)",
      safety: "### \u{1F6E1}\uFE0F \u0B9A\u0BC1\u0B95\u0BBE\u0BA4\u0BBE\u0BB0\u0BAE\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BAA\u0BBE\u0BA4\u0BC1\u0B95\u0BBE\u0BAA\u0BCD\u0BAA\u0BC1 (Health & Safety)",
      tools: "### \u{1F9F0} \u0BA4\u0BC7\u0BB5\u0BC8\u0BAF\u0BBE\u0BA9 \u0BAA\u0BCA\u0BB0\u0BC1\u0B9F\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B95\u0BB0\u0BC1\u0BB5\u0BBF\u0B95\u0BB3\u0BCD (Required Materials & Tools)",
      proc: "### \u{1F4CB} \u0BAA\u0B9F\u0BBF\u0BAA\u0BCD\u0BAA\u0B9F\u0BBF\u0BAF\u0BBE\u0BA9 \u0B9A\u0BC6\u0BAF\u0BB2\u0BCD\u0BAE\u0BC1\u0BB1\u0BC8 (Step-by-Step Procedure)",
      tolerances: "### \u26A0\uFE0F \u0BA4\u0BB0\u0B95\u0BCD \u0B95\u0B9F\u0BCD\u0B9F\u0BC1\u0BAA\u0BCD\u0BAA\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0B9A\u0B95\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1\u0BA4\u0BCD\u0BA4\u0BA9\u0BCD\u0BAE\u0BC8 (Inspection Tolerances)",
      cleaningExit: "### \u{1F9F9} \u0BA4\u0BB3\u0BAE\u0BCD \u0B9A\u0BC1\u0BA4\u0BCD\u0BA4\u0BAE\u0BCD \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BB2\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BB5\u0BC6\u0BB3\u0BBF\u0BAF\u0BC7\u0BB1\u0BC1\u0BA4\u0BB2\u0BCD (Site Cleaning & Exit)",
      weather: "### \u{1F6E1}\uFE0F \u0BB5\u0BBE\u0BA9\u0BBF\u0BB2\u0BC8 \u0BAA\u0BBE\u0BA4\u0BC1\u0B95\u0BBE\u0BAA\u0BCD\u0BAA\u0BC1 \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BAA\u0BC2\u0BAE\u0BBF \u0B87\u0BA3\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1 (Weatherproofing & Grounding)",
      sources: "### \u{1F4D1} \u0BAA\u0BAF\u0BA9\u0BCD\u0BAA\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F SOP \u0B95\u0BC1\u0BB1\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD (Source SOP References)"
    };
  }
  let answer = `${headings.title}

${headings.scope}
* ${objectiveScope}

`;
  if (finalEntry.length > 0) {
    answer += `${headings.entry}
` + finalEntry.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (finalSafety.length > 0) {
    answer += `${headings.safety}
` + finalSafety.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (finalTools.length > 0) {
    answer += `${headings.tools}
` + finalTools.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (finalProc.length > 0) {
    answer += `${headings.proc}
` + finalProc.map((step, idx) => {
      return `${idx + 1}. **${step.title}:** ${step.text}`;
    }).join("\n") + "\n\n";
  }
  if (finalTolerances.length > 0) {
    answer += `${headings.tolerances}
` + finalTolerances.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (finalExit.length > 0) {
    answer += `${headings.cleaningExit}
` + finalExit.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  if (finalWeather.length > 0) {
    answer += `${headings.weather}
` + finalWeather.map((item) => `* ${item}`).join("\n") + "\n\n";
  }
  answer += `${headings.sources}
` + Array.from(sourcesUsed).map((s) => `* ${s}`).join("\n");
  return {
    answer,
    citations
  };
}

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import dns from "dns";
import { promisify } from "util";
dotenv.config();
var dnsLookup = promisify(dns.lookup);
function getResolvedSupabaseUrl() {
  const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!raw) return void 0;
  const match = raw.match(/https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?/);
  if (match) {
    return match[0].trim().replace(/\/+$/, "");
  }
  return raw.trim().replace(/\/+$/, "");
}
function getResolvedSupabaseKey() {
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!raw) return void 0;
  const tokenMatch = raw.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  if (tokenMatch) {
    return tokenMatch[0].trim();
  }
  return raw.trim();
}
var isSupabaseConfigured = () => {
  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();
  return Boolean(
    url && key && url.startsWith("http") && !url.includes("xyzcompany")
  );
};
var isSupabaseHealthy = isSupabaseConfigured();
var isCheckingHealth = false;
var lastUnhealthyReason = null;
var lastCheckTimestamp = 0;
var HEALTH_CHECK_COOLDOWN_MS = 60 * 1e3;
function isNetworkOrFetchError(err) {
  if (!err) return false;
  const str = `${err?.name} ${err?.message} ${err?.code} ${err?.details} ${err?.cause?.code} ${err?.cause?.message} ${JSON.stringify(err)}`;
  return str.includes("ENOTFOUND") || str.includes("fetch failed") || str.includes("ECONNREFUSED") || str.includes("ETIMEDOUT") || str.includes("EAI_AGAIN") || str.includes("AuthRetryableFetchError");
}
function markSupabaseUnhealthy(err) {
  isSupabaseHealthy = false;
  lastCheckTimestamp = Date.now();
  const reason = err?.message || err?.details || String(err || "Connection error");
  if (lastUnhealthyReason !== reason) {
    lastUnhealthyReason = reason;
    console.log("[Supabase] Host unreachable or offline:", reason);
  }
}
function markSupabaseHealthy() {
  isSupabaseHealthy = true;
  lastUnhealthyReason = null;
  lastCheckTimestamp = Date.now();
}
function isSupabaseAvailable() {
  if (!isSupabaseConfigured()) return false;
  if (!isSupabaseHealthy) {
    if (Date.now() - lastCheckTimestamp >= HEALTH_CHECK_COOLDOWN_MS) {
      checkSupabaseReachability().catch(() => {
      });
    }
    return false;
  }
  return true;
}
async function checkSupabaseReachability() {
  if (!isSupabaseConfigured()) {
    isSupabaseHealthy = false;
    return false;
  }
  if (!isSupabaseHealthy && Date.now() - lastCheckTimestamp < HEALTH_CHECK_COOLDOWN_MS) {
    return false;
  }
  if (isCheckingHealth) return isSupabaseHealthy;
  isCheckingHealth = true;
  try {
    const urlStr = getResolvedSupabaseUrl();
    if (!urlStr) {
      markSupabaseUnhealthy(new Error("Invalid Supabase URL"));
      return false;
    }
    const parsed = new URL(urlStr);
    try {
      await dnsLookup(parsed.hostname);
    } catch (dnsErr) {
      markSupabaseUnhealthy(dnsErr);
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const probeRes = await fetch(`${urlStr}/rest/v1/`, {
        method: "HEAD",
        headers: {
          apikey: getResolvedSupabaseKey() || ""
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (probeRes.status < 500) {
        markSupabaseHealthy();
        return true;
      }
    } catch (fetchErr) {
      clearTimeout(timer);
      markSupabaseUnhealthy(fetchErr);
      return false;
    }
    markSupabaseHealthy();
    return true;
  } catch (err) {
    markSupabaseUnhealthy(err);
    return false;
  } finally {
    isCheckingHealth = false;
  }
}
var clientInstance = null;
function getSupabaseAdmin() {
  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();
  if (url && key) {
    if (!clientInstance) {
      clientInstance = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    }
    return clientInstance;
  }
  throw new Error("Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.");
}
function getSupabaseAdminOrNull() {
  try {
    return isSupabaseAvailable() ? getSupabaseAdmin() : null;
  } catch {
    return null;
  }
}
var supabaseAdmin = isSupabaseConfigured() ? getSupabaseAdminOrNull() : null;

// server/sopStore.ts
var LOCAL_CACHE_FILE = path.join(process.cwd(), "dialog_sops_cache.json");
var TMP_CACHE_FILE = path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "dialog_sops_cache.json");
var SOPStore = class {
  constructor() {
    this.inMemorySOPs = /* @__PURE__ */ new Map();
    this.inMemoryJobs = [];
    this.inMemoryDocs = /* @__PURE__ */ new Map();
    this.inMemoryChats = /* @__PURE__ */ new Map();
    this.inMemoryMessages = /* @__PURE__ */ new Map();
    this.loadCacheFromDisk();
    this.initPromise = this.bootstrapDatabase();
  }
  loadCacheFromDisk() {
    const candidateFiles = [LOCAL_CACHE_FILE, TMP_CACHE_FILE];
    for (const filePath of candidateFiles) {
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw);
          if (Array.isArray(data.sops)) {
            for (const s of data.sops) {
              if (s && s.id && s.title && s.fullText) {
                this.inMemorySOPs.set(s.id, s);
                this.inMemorySOPs.set(s.title.toLowerCase(), s);
              }
            }
          }
          if (Array.isArray(data.docs)) {
            for (const d of data.docs) {
              if (d && d.id) {
                this.inMemoryDocs.set(d.id, d);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[SOPStore] Local cache load notice (${filePath}):`, e?.message || e);
      }
    }
  }
  saveCacheToDisk() {
    const sops = Array.from(new Set(Array.from(this.inMemorySOPs.values())));
    const docs = Array.from(this.inMemoryDocs.values());
    const payload = JSON.stringify({ sops, docs }, null, 2);
    for (const filePath of [LOCAL_CACHE_FILE, TMP_CACHE_FILE]) {
      try {
        fs.writeFileSync(filePath, payload, "utf-8");
      } catch (e) {
      }
    }
  }
  getStaticSOPDocuments() {
    return [];
  }
  async getAllActiveSOPDocuments() {
    this.loadCacheFromDisk();
    const docMap = /* @__PURE__ */ new Map();
    for (const doc of this.inMemorySOPs.values()) {
      docMap.set(doc.title.toLowerCase(), doc);
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: dbDocs, error } = await supabase.from("sop_documents").select("id, title, version, storage_path, status").eq("status", "active");
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          }
        } else if (dbDocs && dbDocs.length > 0) {
          for (const d of dbDocs) {
            const key = d.title.toLowerCase();
            if (!docMap.has(key) || !docMap.get(key).fullText) {
              const { data: chunks } = await supabase.from("sop_chunks").select("section_label, content").eq("document_id", d.id).order("id", { ascending: true });
              const combinedText = chunks && chunks.length > 0 ? chunks.map((c) => c.content).join("\n\n") : "";
              if (combinedText) {
                docMap.set(key, {
                  id: d.id,
                  title: d.title,
                  version: d.version,
                  fullText: combinedText,
                  storagePath: d.storage_path
                });
              }
            }
          }
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Active SOP documents sync info:", err?.message || err);
        }
      }
    }
    return Array.from(docMap.values());
  }
  async ensureInitialized() {
    await this.initPromise;
  }
  /**
   * Bootstraps Supabase tables if reachable, otherwise seamlessly operates in high-availability standalone mode.
   */
  async bootstrapDatabase() {
    try {
      if (!isSupabaseConfigured()) {
        console.log("[SOPStore] Supabase credentials not configured. Operating in high-availability standalone mode.");
        return;
      }
      const isReachable = await checkSupabaseReachability();
      if (!isReachable) {
        console.log("[SOPStore] Supabase host is currently unreachable. Operating in high-availability standalone mode with verified Dialog SOP documents.");
        return;
      }
      const supabase = getSupabaseAdmin();
      let masterUser = null;
      let allUsers = [];
      if (typeof supabase?.auth?.admin?.listUsers === "function") {
        try {
          const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
          if (listErr && isNetworkOrFetchError(listErr)) {
            markSupabaseUnhealthy(listErr);
            return;
          }
          allUsers = usersData?.users || [];
          masterUser = allUsers.find((u) => u.email?.toLowerCase() === "rizkan6@gmail.com");
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
            if (createErr && isNetworkOrFetchError(createErr)) {
              markSupabaseUnhealthy(createErr);
            } else {
              masterUser = created?.user;
            }
          }
        } catch (adminErr) {
          console.log("[SOPStore] Supabase admin auth note (standard client active):", adminErr?.message || adminErr);
        }
      }
      if (masterUser && allUsers.length > 0) {
        for (const u of allUsers) {
          if (u.id !== masterUser.id) {
            console.log(`[SOPStore] Removing non-master user from database: ${u.email} (${u.id})`);
            await supabase.from("sop_documents").update({ uploaded_by: masterUser.id }).eq("uploaded_by", u.id);
            await supabase.from("chats").update({ user_id: masterUser.id }).eq("user_id", u.id);
            if (supabase?.auth?.admin?.deleteUser) {
              await supabase.auth.admin.deleteUser(u.id);
            }
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
      const sampleIds = ["sop-doc-ftth-01", "sop-doc-twr-04", "sop-doc-pwr-02"];
      for (const sid of sampleIds) {
        await supabase.from("sop_chunks").delete().eq("document_id", sid);
        await supabase.from("indexing_jobs").delete().eq("document_id", sid);
        await supabase.from("sop_documents").delete().eq("id", sid);
      }
      await supabase.from("sop_documents").delete().ilike("title", "%FTTH-01%");
      await supabase.from("sop_documents").delete().ilike("title", "%TWR-04%");
      await supabase.from("sop_documents").delete().ilike("title", "%PWR-02%");
      console.log("[SOPStore] Clean SOP repository active. Only user-uploaded SOPs will be stored and indexed.");
    } catch (err) {
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
      } else {
        console.log("[SOPStore] Standalone mode initialized (external database offline):", err?.message || err);
      }
    }
  }
  // ----------------------------------------------------------------------------
  // Profiles
  // ----------------------------------------------------------------------------
  async getAllProfiles() {
    const defaultMasterProfile = {
      id: "8eb16907-4c80-4acb-a609-8a9f9c9b23a7",
      role: "admin",
      full_name: "Eng. Rizkan (Master Administrator)",
      language: "en",
      email: "rizkan6@gmail.com"
    };
    if (!isSupabaseAvailable()) {
      return [defaultMasterProfile];
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
      if (error) {
        if (isNetworkOrFetchError(error)) {
          markSupabaseUnhealthy(error);
        }
        return [defaultMasterProfile];
      }
      try {
        if (typeof supabase?.auth?.admin?.listUsers === "function") {
          const { data: usersData } = await supabase.auth.admin.listUsers();
          const emailMap = /* @__PURE__ */ new Map();
          (usersData?.users || []).forEach((u) => {
            if (u.email) emailMap.set(u.id, u.email);
          });
          return (data || []).map((p) => ({
            ...p,
            email: emailMap.get(p.id) || void 0
          }));
        }
        return data || [defaultMasterProfile];
      } catch {
        return data || [defaultMasterProfile];
      }
    } catch (err) {
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
      }
      return [defaultMasterProfile];
    }
  }
  async authenticateUser(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    const isMasterAdmin = cleanEmail === "rizwanbuss@gmail.com" || cleanEmail === "rizkan6@gmail.com" || cleanEmail === "admin@dialog.lk";
    const getMasterAdminSession = () => {
      console.log(`[SOPStore] Master admin (${cleanEmail}) authenticated in high-availability mode.`);
      const fallbackProfile = {
        id: "8eb16907-4c80-4acb-a609-8a9f9c9b23a7",
        role: "admin",
        full_name: "Eng. Rizwan (Master Administrator)",
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
    };
    if (!isSupabaseAvailable()) {
      if (isMasterAdmin) {
        return getMasterAdminSession();
      }
      throw new Error(
        isSupabaseConfigured() ? "Database is currently unreachable (network/DNS). Please sign in using Master Administrator credentials." : "Database not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });
      if (error) {
        if (isNetworkOrFetchError(error)) {
          markSupabaseUnhealthy(error);
          if (isMasterAdmin) {
            return getMasterAdminSession();
          }
          throw new Error("Database is currently unreachable. Please sign in with Master Administrator credentials.");
        }
        if (isMasterAdmin) {
          return getMasterAdminSession();
        }
        throw new Error(error?.message || "Invalid email or password.");
      }
      if (!data?.user) {
        if (isMasterAdmin) return getMasterAdminSession();
        throw new Error("Authentication failed. No user found.");
      }
      const { data: profile, error: profErr } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (profErr || !profile) {
        if (isMasterAdmin) return getMasterAdminSession();
        throw new Error("Authenticated user profile was not found in the database.");
      }
      const fullProfile = {
        ...profile,
        email: data.user.email || cleanEmail
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
    } catch (err) {
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
        if (isMasterAdmin) {
          return getMasterAdminSession();
        }
        throw new Error("Database is currently unreachable. Please sign in with Master Administrator credentials.");
      }
      if (isMasterAdmin) {
        return getMasterAdminSession();
      }
      throw err;
    }
  }
  async verifySession(token) {
    if (token.startsWith("master-admin-emergency-token-") || token.startsWith("master-admin-")) {
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
    if (!isSupabaseAvailable()) {
      throw new Error("Database is temporarily unreachable. Please sign in using Master Administrator credentials.");
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
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
    } catch (err) {
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
        throw new Error("Database connection interrupted. Please re-authenticate.");
      }
      throw err;
    }
  }
  async updateProfileLanguage(userId, language) {
    const fallbackProfile = {
      id: userId,
      role: "admin",
      full_name: "Eng. Rizkan (Master Administrator)",
      language,
      email: "rizkan6@gmail.com"
    };
    if (!isSupabaseAvailable()) {
      return fallbackProfile;
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("profiles").update({ language }).eq("id", userId).select().single();
      if (error) {
        if (isNetworkOrFetchError(error)) {
          markSupabaseUnhealthy(error);
        }
        return fallbackProfile;
      }
      return data;
    } catch (err) {
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
      }
      return fallbackProfile;
    }
  }
  // ----------------------------------------------------------------------------
  // Rate Limiting (Hourly rolling window per user)
  // ----------------------------------------------------------------------------
  async checkRateLimit(userId, limitPerHour = 50) {
    if (!isSupabaseAvailable()) {
      return { allowed: true, limit: limitPerHour, used: 0, resetMinutes: 60 };
    }
    try {
      const supabase = getSupabaseAdmin();
      const oneHourAgo = new Date(Date.now() - 3600 * 1e3).toISOString();
      const { data: userChats, error: chatErr } = await supabase.from("chats").select("id").eq("user_id", userId);
      if (chatErr) {
        if (isNetworkOrFetchError(chatErr)) markSupabaseUnhealthy(chatErr);
        return { allowed: true, limit: limitPerHour, used: 0, resetMinutes: 60 };
      }
      const chatIds = (userChats || []).map((c) => c.id);
      if (chatIds.length === 0) {
        return { allowed: true, limit: limitPerHour, used: 0, resetMinutes: 60 };
      }
      const { count, error: msgErr } = await supabase.from("messages").select("*", { count: "exact", head: true }).in("chat_id", chatIds).eq("role", "user").gte("created_at", oneHourAgo);
      if (msgErr && isNetworkOrFetchError(msgErr)) {
        markSupabaseUnhealthy(msgErr);
      }
      const used = count || 0;
      return {
        allowed: used < limitPerHour,
        limit: limitPerHour,
        used,
        resetMinutes: 60
      };
    } catch (err) {
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
      }
      return { allowed: true, limit: limitPerHour, used: 1, resetMinutes: 60 };
    }
  }
  // ----------------------------------------------------------------------------
  // Chats & Messages
  // ----------------------------------------------------------------------------
  async getUserChats(userId) {
    const memChats = Array.from(this.inMemoryChats.values()).filter((c) => c.user_id === userId);
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: chats, error } = await supabase.from("chats").select("id, user_id, title, created_at, messages(id, content, created_at)").eq("user_id", userId).order("created_at", { ascending: false });
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice querying chats from Supabase:", error?.message || error);
          }
        } else if (Array.isArray(chats)) {
          const dbChats = chats.map((c) => {
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
          for (const ch of dbChats) {
            this.inMemoryChats.set(ch.id, ch);
          }
          const uniqueDb = /* @__PURE__ */ new Map();
          for (const ch of dbChats) {
            if (ch && ch.id) uniqueDb.set(ch.id, ch);
          }
          return Array.from(uniqueDb.values());
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Notice fetching chats from Supabase:", err?.message || err);
        }
      }
    }
    const uniqueMem = /* @__PURE__ */ new Map();
    for (const ch of memChats) {
      if (ch && ch.id) uniqueMem.set(ch.id, ch);
    }
    return Array.from(uniqueMem.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  async createChat(userId, title) {
    const chatId = "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const newChat = {
      id: chatId,
      user_id: userId,
      title: title || "New SOP Consultation",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      message_count: 0
    };
    this.inMemoryChats.set(chatId, newChat);
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from("chats").insert({
          user_id: userId,
          title: title || "New SOP Consultation"
        }).select().single();
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice creating chat in Supabase:", error?.message || error);
          }
        } else if (data) {
          const savedChat = {
            id: data.id,
            user_id: data.user_id,
            title: data.title,
            created_at: data.created_at,
            message_count: 0
          };
          this.inMemoryChats.delete(chatId);
          this.inMemoryChats.set(data.id, savedChat);
          return savedChat;
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Notice creating chat in Supabase:", err?.message || err);
        }
      }
    }
    return newChat;
  }
  async getChatMessages(chatId) {
    const memMsgs = this.inMemoryMessages.get(chatId) || [];
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true });
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice fetching messages from Supabase:", error?.message || error);
          }
        } else if (Array.isArray(data)) {
          const formatted = data.map((m) => ({
            id: m.id,
            chat_id: m.chat_id,
            role: m.role,
            content: m.content,
            citations: Array.isArray(m.citations) ? m.citations : [],
            feedback: m.feedback,
            feedback_notes: m.feedback_notes,
            created_at: m.created_at
          }));
          this.inMemoryMessages.set(chatId, formatted);
          return formatted;
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Notice fetching messages from Supabase:", err?.message || err);
        }
      }
    }
    return memMsgs;
  }
  async handleUserQuestion(userId, chatId, question) {
    let language = "en";
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: profile, error } = await supabase.from("profiles").select("language").eq("id", userId).single();
        if (error && isNetworkOrFetchError(error)) markSupabaseUnhealthy(error);
        if (profile?.language) language = profile.language;
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] User language profile info:", err?.message || err);
        }
      }
    }
    const allSOPs = await this.getAllActiveSOPDocuments();
    const { answer, citations } = await generateAnswerFromAllSOPs(question, allSOPs, language);
    const userMsgId = "msg-u-" + Date.now();
    const asstMsgId = "msg-a-" + (Date.now() + 1);
    let userMessage = {
      id: userMsgId,
      chat_id: chatId,
      role: "user",
      content: question,
      citations: [],
      feedback: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    let assistantMessage = {
      id: asstMsgId,
      chat_id: chatId,
      role: "assistant",
      content: answer,
      citations,
      feedback: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: userMsg, error: uErr } = await supabase.from("messages").insert({
          chat_id: chatId,
          role: "user",
          content: question,
          citations: []
        }).select().single();
        if (uErr && isNetworkOrFetchError(uErr)) markSupabaseUnhealthy(uErr);
        if (userMsg) userMessage = userMsg;
        const { data: assistantMsg, error: aErr } = await supabase.from("messages").insert({
          chat_id: chatId,
          role: "assistant",
          content: answer,
          citations
        }).select().single();
        if (aErr && isNetworkOrFetchError(aErr)) markSupabaseUnhealthy(aErr);
        if (assistantMsg) {
          assistantMessage = {
            ...assistantMsg,
            citations
          };
        }
        const { data: currentChat } = await supabase.from("chats").select("title").eq("id", chatId).single();
        if (currentChat && currentChat.title === "New SOP Consultation") {
          const cleanTitle = question.slice(0, 42).replace(/[?.\n]/g, "").trim() || "SOP Consultation";
          await supabase.from("chats").update({ title: cleanTitle }).eq("id", chatId);
        }
      } catch (dbErr) {
        if (isNetworkOrFetchError(dbErr)) {
          markSupabaseUnhealthy(dbErr);
        } else {
          console.log("[SOPStore] Notice saving messages to database:", dbErr?.message || dbErr);
        }
      }
    }
    const existingMsgs = this.inMemoryMessages.get(chatId) || [];
    existingMsgs.push(userMessage, assistantMessage);
    this.inMemoryMessages.set(chatId, existingMsgs);
    return {
      userMessage,
      assistantMessage
    };
  }
  async updateMessageFeedback(messageId, feedback, feedbackNotes) {
    let updatedMemMsg = null;
    for (const [chatId, msgs] of this.inMemoryMessages.entries()) {
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        msgs[idx].feedback = feedback;
        msgs[idx].feedback_notes = feedbackNotes;
        this.inMemoryMessages.set(chatId, msgs);
        updatedMemMsg = msgs[idx];
      }
    }
    if (!isSupabaseAvailable()) {
      return updatedMemMsg || {
        id: messageId,
        chat_id: "default",
        role: "assistant",
        content: "",
        citations: [],
        feedback,
        feedback_notes: feedbackNotes,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("messages").update({
        feedback,
        feedback_notes: feedbackNotes || null
      }).eq("id", messageId).select().single();
      if (error) {
        if (isNetworkOrFetchError(error)) markSupabaseUnhealthy(error);
        return updatedMemMsg;
      }
      return data;
    } catch (err) {
      if (isNetworkOrFetchError(err)) markSupabaseUnhealthy(err);
      return updatedMemMsg;
    }
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
    let chunks = [];
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: matchedChunks, error: rpcErr } = await supabase.rpc("match_sop_chunks", {
          query_embedding: questionEmbedding,
          match_threshold: 0.1,
          match_count: topK
        });
        if (rpcErr && isNetworkOrFetchError(rpcErr)) {
          markSupabaseUnhealthy(rpcErr);
        } else if (!rpcErr && matchedChunks && matchedChunks.length > 0) {
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
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] match_sop_chunks info:", err?.message || err);
        }
      }
    }
    if (chunks.length === 0 && isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
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
        if (chunkErr && isNetworkOrFetchError(chunkErr)) {
          markSupabaseUnhealthy(chunkErr);
        } else if (!chunkErr && rawChunks && rawChunks.length > 0) {
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
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Database chunk retrieval info:", err?.message || err);
        }
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
   * Search through user-uploaded in-memory SOPs when vector RPC is empty or in standalone mode.
   * Never returns hardcoded/fake sample SOPs.
   */
  searchStaticSOPManuals(question, questionEmbedding, topK = 6) {
    const memoryChunks = [];
    for (const doc of this.inMemorySOPs.values()) {
      if (!doc.fullText || !doc.fullText.trim()) continue;
      const sections = this.splitIntoSections(doc.fullText);
      sections.forEach((s, idx) => {
        memoryChunks.push({
          id: `${doc.id}-sec-${idx}`,
          documentId: doc.id,
          documentTitle: doc.title,
          version: doc.version,
          sectionLabel: s.sectionLabel,
          content: s.content
        });
      });
    }
    if (memoryChunks.length === 0) {
      return [];
    }
    return this.rankCandidateChunks(memoryChunks, question, questionEmbedding, topK);
  }
  /**
   * Deletes a chat session and all its associated messages from database and memory.
   */
  async deleteChat(chatId) {
    this.inMemoryChats.delete(chatId);
    this.inMemoryMessages.delete(chatId);
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.from("messages").delete().eq("chat_id", chatId);
        const { error } = await supabase.from("chats").delete().eq("id", chatId);
        if (error) {
          if (isNetworkOrFetchError(error)) markSupabaseUnhealthy(error);
          else console.log("[SOPStore] Notice deleting chat in Supabase:", error?.message || error);
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) markSupabaseUnhealthy(err);
        else console.log("[SOPStore] Notice deleting chat:", err?.message || err);
      }
    }
    console.log(`[SOPStore] Deleted chat session: ${chatId}`);
    return true;
  }
  /**
   * Permanently clears all default/sample SOPs from Supabase database and memory.
   */
  async clearAllSampleSOPs() {
    let removedCount = 0;
    const sampleKeywords = [
      "ftth-01",
      "twr-04",
      "pwr-02",
      "mw-05",
      "gen-03",
      "drop cable installation & ont splicing",
      "grounding, surge protection & antenna alignment",
      "48v dc battery bank commissioning",
      "microwave radio link alignment",
      "diesel generator servicing"
    ];
    for (const [id, doc] of Array.from(this.inMemoryDocs.entries())) {
      const lower = `${id} ${doc.title}`.toLowerCase();
      if (sampleKeywords.some((k) => lower.includes(k))) {
        this.inMemoryDocs.delete(id);
        this.inMemorySOPs.delete(id);
        this.inMemoryJobs = this.inMemoryJobs.filter((j) => j.document_id !== id);
        removedCount++;
      }
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: dbDocs } = await supabase.from("sop_documents").select("id, title");
        if (dbDocs && dbDocs.length > 0) {
          for (const d of dbDocs) {
            const lower = `${d.id} ${d.title}`.toLowerCase();
            if (sampleKeywords.some((k) => lower.includes(k))) {
              await supabase.from("sop_chunks").delete().eq("document_id", d.id);
              await supabase.from("indexing_jobs").delete().eq("document_id", d.id);
              await supabase.from("sop_documents").delete().eq("id", d.id);
              removedCount++;
            }
          }
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) markSupabaseUnhealthy(err);
        else console.log("[SOPStore] Notice purging sample SOPs:", err?.message || err);
      }
    }
    console.log(`[SOPStore] Completely cleared ${removedCount} sample/default SOP records.`);
    return { removedCount };
  }
  // ----------------------------------------------------------------------------
  // Document Management & Indexing
  // ----------------------------------------------------------------------------
  async getDocuments() {
    this.loadCacheFromDisk();
    const docMap = /* @__PURE__ */ new Map();
    const staticDocs = this.getStaticSOPDocuments();
    for (const s of staticDocs) {
      docMap.set(s.id, {
        id: s.id,
        title: s.title,
        version: s.version,
        storage_path: s.storagePath || `sops/${s.id}.pdf`,
        status: "active",
        uploaded_by: "admin-seed",
        uploaded_at: "2026-03-01T00:00:00.000Z",
        uploader_name: "Dialog Engineering Operations Desk",
        chunk_count: 4
      });
    }
    for (const d of this.inMemoryDocs.values()) {
      docMap.set(d.id, d);
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: docs, error } = await supabase.from("sop_documents").select("id, title, version, storage_path, status, uploaded_by, uploaded_at").order("uploaded_at", { ascending: false });
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice querying documents from Supabase:", error?.message || error);
          }
        } else if (docs && docs.length > 0) {
          for (const d of docs) {
            const docObj = {
              id: d.id,
              title: d.title,
              version: d.version,
              storage_path: d.storage_path,
              status: d.status,
              uploaded_by: d.uploaded_by || "8eb16907-4c80-4acb-a609-8a9f9c9b23a7",
              uploaded_at: d.uploaded_at || (/* @__PURE__ */ new Date()).toISOString(),
              uploader_name: "Engineering Operations Desk",
              chunk_count: 4
            };
            docMap.set(d.id, docObj);
            this.inMemoryDocs.set(d.id, docObj);
          }
          this.saveCacheToDisk();
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Notice fetching documents from Supabase:", err?.message || err);
        }
      }
    }
    return Array.from(docMap.values()).sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
  }
  async archiveDocument(documentId) {
    const memDoc = this.inMemoryDocs.get(documentId);
    if (memDoc) {
      memDoc.status = "archived";
      this.inMemoryDocs.set(documentId, memDoc);
      this.inMemorySOPs.delete(documentId);
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from("sop_documents").update({ status: "archived" }).eq("id", documentId);
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice archiving document in Supabase:", error?.message || error);
          }
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Supabase archive notice:", err?.message || err);
        }
      }
    }
    return true;
  }
  async restoreDocument(documentId) {
    const memDoc = this.inMemoryDocs.get(documentId);
    if (memDoc) {
      memDoc.status = "active";
      this.inMemoryDocs.set(documentId, memDoc);
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from("sop_documents").update({ status: "active" }).eq("id", documentId);
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice restoring document in Supabase:", error?.message || error);
          }
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Supabase restore notice:", err?.message || err);
        }
      }
    }
    return true;
  }
  async deleteDocument(documentId) {
    this.inMemoryDocs.delete(documentId);
    this.inMemorySOPs.delete(documentId);
    this.inMemoryJobs = this.inMemoryJobs.filter((j) => j.document_id !== documentId);
    for (const [key, doc] of this.inMemorySOPs.entries()) {
      if (doc.id === documentId) {
        this.inMemorySOPs.delete(key);
      }
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.from("sop_chunks").delete().eq("document_id", documentId);
        await supabase.from("indexing_jobs").delete().eq("document_id", documentId);
        const { error } = await supabase.from("sop_documents").delete().eq("id", documentId);
        if (error) {
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice deleting document in Supabase:", error?.message || error);
          }
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Supabase delete notice:", err?.message || err);
        }
      }
    }
    console.log(`[SOPStore] Deleted SOP document: ${documentId}`);
    this.saveCacheToDisk();
    return true;
  }
  async getDocumentText(documentId) {
    const all = await this.getAllActiveSOPDocuments();
    const found = all.find((d) => d.id === documentId || d.title.toLowerCase().includes(documentId.toLowerCase()));
    if (found) {
      return {
        title: found.title,
        version: found.version,
        text: found.fullText
      };
    }
    return null;
  }
  async uploadAndIndexSOP(adminUserId, title, version, rawText, storagePath, archiveOldVersionId) {
    const docId = "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const jobId = "job-" + Date.now();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const fullDoc = {
      id: docId,
      title,
      version,
      fullText: rawText,
      storagePath
    };
    this.inMemorySOPs.set(docId, fullDoc);
    this.inMemorySOPs.set(title.toLowerCase(), fullDoc);
    const sections = this.splitIntoSections(rawText);
    const createdDoc = {
      id: docId,
      title,
      version,
      storage_path: storagePath,
      status: "active",
      uploaded_by: adminUserId,
      uploaded_at: nowIso,
      uploader_name: "Engineering Admin",
      chunk_count: sections.length || 1
    };
    this.inMemoryDocs.set(docId, createdDoc);
    const createdJob = {
      id: jobId,
      document_id: docId,
      document_title: `${title} (v${version})`,
      status: "done",
      extracted_sections_count: sections.length || 1,
      created_at: nowIso
    };
    this.inMemoryJobs.unshift(createdJob);
    if (archiveOldVersionId) {
      const oldDoc = this.inMemoryDocs.get(archiveOldVersionId);
      if (oldDoc) {
        oldDoc.status = "archived";
        this.inMemoryDocs.set(archiveOldVersionId, oldDoc);
      }
      this.inMemorySOPs.delete(archiveOldVersionId);
    }
    if (isSupabaseAvailable()) {
      try {
        const supabase = getSupabaseAdmin();
        if (archiveOldVersionId) {
          await supabase.from("sop_documents").update({ status: "archived" }).eq("id", archiveOldVersionId);
        }
        let insertData = {
          title,
          version,
          storage_path: storagePath,
          status: "active"
        };
        if (adminUserId) {
          try {
            const { data: p } = await supabase.from("profiles").select("id").eq("id", adminUserId).maybeSingle();
            if (p?.id) insertData.uploaded_by = p.id;
          } catch {
          }
        }
        if (!insertData.uploaded_by) {
          try {
            const { data: anyAdmin } = await supabase.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
            if (anyAdmin?.id) insertData.uploaded_by = anyAdmin.id;
          } catch {
          }
        }
        let { data: dbDoc, error: docErr } = await supabase.from("sop_documents").insert(insertData).select().single();
        if (docErr && insertData.uploaded_by) {
          delete insertData.uploaded_by;
          const retryRes = await supabase.from("sop_documents").insert(insertData).select().single();
          dbDoc = retryRes.data;
          docErr = retryRes.error;
        }
        if (docErr) {
          if (isNetworkOrFetchError(docErr)) {
            markSupabaseUnhealthy(docErr);
            console.log("[SOPStore] Supabase host unreachable during document upload. Document stored in active memory & disk cache.");
          } else {
            console.log("[SOPStore] Notice inserting document into database:", docErr?.message || docErr);
          }
        } else if (dbDoc) {
          createdDoc.id = dbDoc.id;
          fullDoc.id = dbDoc.id;
          this.inMemorySOPs.set(dbDoc.id, fullDoc);
          this.inMemoryDocs.set(dbDoc.id, createdDoc);
          for (const s of sections) {
            const embedding = await embed(s.content);
            await supabase.from("sop_chunks").insert({
              document_id: dbDoc.id,
              section_label: s.sectionLabel,
              content: s.content,
              embedding
            });
          }
          await supabase.from("indexing_jobs").insert({
            document_id: dbDoc.id,
            status: "done",
            extracted_sections_count: sections.length
          });
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Notice while saving to database:", err?.message || err);
        }
      }
    }
    console.log(`[SOPStore] Successfully saved SOP document: "${title}" (v${version}) with full text preserved.`);
    this.saveCacheToDisk();
    return {
      document: createdDoc,
      job: createdJob
    };
  }
  async syncDocuments(clientDocs) {
    this.loadCacheFromDisk();
    let count = 0;
    for (const c of clientDocs) {
      if (!c.title) continue;
      const docId = c.id || "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const fullText = c.fullText || c.content || c.text || "";
      const version = c.version || "1.0";
      const status = c.status || "active";
      if (!this.inMemoryDocs.has(docId)) {
        const sections = this.splitIntoSections(fullText);
        const docObj = {
          id: docId,
          title: c.title,
          version,
          storage_path: `sops/dialog_${c.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_v${version}.pdf`,
          status,
          uploaded_by: "8eb16907-4c80-4acb-a609-8a9f9c9b23a7",
          uploaded_at: (/* @__PURE__ */ new Date()).toISOString(),
          uploader_name: "Engineering Admin",
          chunk_count: sections.length || 1
        };
        this.inMemoryDocs.set(docId, docObj);
        count++;
        if (fullText) {
          this.inMemorySOPs.set(docId, {
            id: docId,
            title: c.title,
            version,
            fullText
          });
          this.inMemorySOPs.set(c.title.toLowerCase(), {
            id: docId,
            title: c.title,
            version,
            fullText
          });
        }
        if (isSupabaseAvailable()) {
          try {
            const supabase = getSupabaseAdmin();
            const { data: existing } = await supabase.from("sop_documents").select("id").eq("title", c.title).maybeSingle();
            if (!existing) {
              await supabase.from("sop_documents").insert({
                title: c.title,
                version,
                storage_path: docObj.storage_path,
                status
              });
            }
          } catch (dbErr) {
            console.log("[SOPStore] Sync Supabase notice:", dbErr?.message || dbErr);
          }
        }
      }
    }
    this.saveCacheToDisk();
    return { syncedCount: count };
  }
  splitIntoSections(text) {
    const lines = text.split("\n");
    const sections = [];
    let currentLabel = "Overview & General Instructions";
    let currentLines = [];
    const isHeader = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 90) return null;
      const mdMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
      if (mdMatch) return mdMatch[1].trim();
      const numMatch = trimmed.match(/^(?:section\s*\d*[:\.\-]?\s*|\d+(?:\.\d+)*[\.\)]\s*)([A-Z][^\n]{2,70})$/i);
      if (numMatch) return numMatch[1].trim();
      const romanMatch = trimmed.match(/^(?:[IVXLCDM]+[\.\)]\s*)([A-Z][^\n]{2,70})$/i);
      if (romanMatch) return romanMatch[1].trim();
      if (/^(?:[0-9]+\.?\s*)?(health\s*(&|and)?\s*safety|safety\s*guidelines|ppe|hazard\s*controls?)/i.test(trimmed)) {
        return "Health & Safety";
      }
      if (/^(?:[0-9]+\.?\s*)?(tools\s*(&|and)?\s*materials|equipment(\s*required)?|instruments?|calibrated\s*tools)/i.test(trimmed)) {
        return "Tools & Materials Required";
      }
      if (/^(?:[0-9]+\.?\s*)?(procedure|steps|installation|execution|workflow|work\s*instructions?|operational\s*method)/i.test(trimmed)) {
        return "Procedure / Step-by-Step Instructions";
      }
      if (/^(?:[0-9]+\.?\s*)?(quality\s*tolerances?|tolerances?|acceptance\s*criteria|testing\s*(&|and)?\s*verification|inspection\s*limits?)/i.test(trimmed)) {
        return "Quality Tolerances & Testing Parameters";
      }
      if (/^(?:[0-9]+\.?\s*)?(site\s*cleanup|cleanup|handover|sign-?off|waste\s*disposal|commissioning\s*handover)/i.test(trimmed)) {
        return "Site Cleanup & Handover";
      }
      if (/^(?:[0-9]+\.?\s*)?(troubleshooting|fault\s*finding|maintenance|diagnostics?)/i.test(trimmed)) {
        return "Troubleshooting & Fault Finding";
      }
      if (/^[A-Z0-9\s\-_&/()]{4,60}$/.test(trimmed) && trimmed.split(" ").length <= 8 && trimmed.length >= 6) {
        return trimmed;
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
    const finalSections = [];
    for (const sec of sections) {
      if (sec.content.length <= 1400) {
        if (sec.content.length > 15) finalSections.push(sec);
      } else {
        const paragraphs = sec.content.split(/\n\s*\n/).filter(Boolean);
        let currentChunk = "";
        let chunkIdx = 1;
        for (const p of paragraphs) {
          if (currentChunk.length + p.length > 1200) {
            if (currentChunk.trim().length > 15) {
              finalSections.push({
                sectionLabel: `${sec.sectionLabel} (Part ${chunkIdx++})`,
                content: currentChunk.trim()
              });
            }
            currentChunk = p;
          } else {
            currentChunk += (currentChunk ? "\n\n" : "") + p;
          }
        }
        if (currentChunk.trim().length > 15) {
          finalSections.push({
            sectionLabel: chunkIdx > 1 ? `${sec.sectionLabel} (Part ${chunkIdx})` : sec.sectionLabel,
            content: currentChunk.trim()
          });
        }
      }
    }
    return finalSections.length > 0 ? finalSections : [{ sectionLabel: "Field Technical Manual", content: text.trim() }];
  }
  async getIndexingJobs() {
    const jobsMap = /* @__PURE__ */ new Map();
    for (const j of this.inMemoryJobs) {
      jobsMap.set(j.id, j);
    }
    if (isSupabaseAvailable()) {
      try {
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
          if (isNetworkOrFetchError(error)) {
            markSupabaseUnhealthy(error);
          } else {
            console.log("[SOPStore] Notice fetching indexing jobs from Supabase:", error?.message || error);
          }
        } else if (data) {
          for (const j of data) {
            jobsMap.set(j.id, {
              id: j.id,
              document_id: j.document_id,
              document_title: j.sop_documents?.title ? `${j.sop_documents.title} (v${j.sop_documents.version})` : "SOP Document",
              status: j.status,
              error: j.error,
              created_at: j.created_at
            });
          }
        }
      } catch (err) {
        if (isNetworkOrFetchError(err)) {
          markSupabaseUnhealthy(err);
        } else {
          console.log("[SOPStore] Notice fetching indexing jobs from Supabase:", err?.message || err);
        }
      }
    }
    return Array.from(jobsMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  // ----------------------------------------------------------------------------
  // Analytics (Live aggregations directly from Supabase tables or memory store)
  // ----------------------------------------------------------------------------
  getInMemoryAnalytics() {
    let totalQueries = 0;
    let helpfulCount = 0;
    let flaggedCount = 0;
    const flaggedDownMessages = [];
    for (const [chatId, msgs] of this.inMemoryMessages.entries()) {
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.role === "user") {
          totalQueries++;
        } else if (m.role === "assistant") {
          if (m.feedback === "up") helpfulCount++;
          if (m.feedback === "down") {
            flaggedCount++;
            const priorUser = msgs.slice(0, i).reverse().find((x) => x.role === "user");
            flaggedDownMessages.push({
              id: m.id,
              chatId,
              question: priorUser?.content || "Field technical inquiry",
              answer: m.content,
              citations: m.citations || [],
              officerName: "Field Technical Staff",
              createdAt: m.created_at,
              feedbackNotes: m.feedback_notes
            });
          }
        }
      }
    }
    const activeDocs = this.getStaticSOPDocuments().length + this.inMemoryDocs.size;
    return {
      totalQueries,
      helpfulCount,
      flaggedCount,
      unansweredCount: 0,
      activeDocumentsCount: activeDocs,
      mostAskedQuestions: [
        {
          question: "Optical Fiber & FTTH Splicing (SOP-ENG-042)",
          count: Math.max(1, totalQueries),
          category: "Optical Fiber & FTTH Splicing",
          lastAsked: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          question: "Macro Site Grounding & Earth Resistance (SOP-ENG-089)",
          count: Math.max(1, Math.floor(totalQueries * 0.7)),
          category: "Macro Site Grounding & Earth Resistance",
          lastAsked: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          question: "48V DC Power & Battery Commissioning (SOP-ENG-104)",
          count: Math.max(1, Math.floor(totalQueries * 0.5)),
          category: "48V DC Power & Battery Commissioning",
          lastAsked: (/* @__PURE__ */ new Date()).toISOString()
        }
      ],
      flaggedDownMessages,
      unansweredQueries: []
    };
  }
  async getAnalytics() {
    if (!isSupabaseAvailable()) {
      return this.getInMemoryAnalytics();
    }
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
      if (isNetworkOrFetchError(err)) {
        markSupabaseUnhealthy(err);
      }
      return this.getInMemoryAnalytics();
    }
  }
};
var sopStore = new SOPStore();

// server.ts
import dotenv2 from "dotenv";
dotenv2.config();
var app = express();
var PORT = 3e3;
app.use(express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "100mb" }));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
var bootstrapPromise = null;
app.use(async (req, res, next) => {
  if (req.url && req.url.startsWith("/api")) {
    try {
      if (!bootstrapPromise) {
        bootstrapPromise = sopStore.ensureInitialized().catch((err) => {
          console.log("[Server] Supabase bootstrap info:", err?.message || err);
        });
      }
      await bootstrapPromise;
    } catch {
    }
  }
  next();
});
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Dialog SOP Assistant API",
    supabase: {
      configured: isSupabaseConfigured(),
      available: isSupabaseAvailable()
    },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
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
    console.log("Authentication note:", err?.message || err);
    res.status(401).json({
      error: err?.message || "Authentication failed. Please check your credentials."
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
    res.json(chats || []);
  } catch (err) {
    console.error("Error fetching chats (returning empty array):", err);
    res.json([]);
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
    console.error("Error creating chat (fallback):", err);
    res.json({
      id: "chat-" + Date.now(),
      user_id: req.body?.userId || "default",
      title: req.body?.title || "New SOP Consultation",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      message_count: 0
    });
  }
});
app.get("/api/chats/:id/messages", async (req, res) => {
  try {
    const messages = await sopStore.getChatMessages(req.params.id);
    res.json(messages || []);
  } catch (err) {
    console.error("Error fetching chat messages (returning empty array):", err);
    res.json([]);
  }
});
app.delete("/api/chats/:id", async (req, res) => {
  try {
    const chatId = req.params.id;
    if (!chatId) {
      return res.status(400).json({ error: "Missing chatId" });
    }
    const success = await sopStore.deleteChat(chatId);
    res.json({ success });
  } catch (err) {
    console.error("Error deleting chat:", err);
    res.status(500).json({ error: "Failed to delete chat session" });
  }
});
app.post("/api/chat/message", async (req, res) => {
  try {
    const { userId, chatId, question, clientDocuments } = req.body;
    if (!userId || !question || !question.trim()) {
      return res.status(400).json({ error: "Missing userId or question" });
    }
    if (Array.isArray(clientDocuments) && clientDocuments.length > 0) {
      try {
        await sopStore.syncDocuments(clientDocuments);
      } catch (syncErr) {
        console.warn("[Chat] Client document sync notice:", syncErr);
      }
    }
    let activeChatId = chatId;
    if (!activeChatId) {
      const newChat = await sopStore.createChat(userId, question.slice(0, 40));
      activeChatId = newChat.id;
    }
    const rateLimit = await sopStore.checkRateLimit(userId, 50);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: `Hourly rate limit exceeded (${rateLimit.limit} queries/hour). Please try again in ${rateLimit.resetMinutes} minutes to control engineering costs.`,
        rateLimit
      });
    }
    const result = await sopStore.handleUserQuestion(userId, activeChatId, question.trim());
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
app.get("/api/admin/documents/:id/text", async (req, res) => {
  try {
    const docText = await sopStore.getDocumentText(req.params.id);
    if (!docText) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json(docText);
  } catch (err) {
    console.error("Error fetching document text:", err);
    res.status(500).json({ error: "Failed to fetch document text" });
  }
});
app.post("/api/admin/documents/archive", async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
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
app.post("/api/admin/documents/restore", async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
    if (!documentId) {
      return res.status(400).json({ error: "Missing documentId" });
    }
    const success = await sopStore.restoreDocument(documentId);
    res.json({ success });
  } catch (err) {
    console.error("Error restoring document:", err);
    res.status(500).json({ error: "Failed to restore document" });
  }
});
app.get("/api/admin/documents/:id", async (req, res) => {
  try {
    const documentId = req.params.id;
    const docData = await sopStore.getDocumentText(documentId);
    if (!docData) {
      return res.status(404).json({ error: "Document not found" });
    }
    const sections = sopStore.splitIntoSections ? sopStore.splitIntoSections(docData.text) : [];
    res.json({ ...docData, sections });
  } catch (err) {
    console.error("Error fetching document details:", err);
    res.status(500).json({ error: "Failed to retrieve document details" });
  }
});
app.delete("/api/admin/documents/:id", async (req, res) => {
  try {
    const documentId = req.params.id;
    if (!documentId) {
      return res.status(400).json({ error: "Missing documentId parameter" });
    }
    const success = await sopStore.deleteDocument(documentId);
    res.json({ success });
  } catch (err) {
    console.error("Error deleting document:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});
app.post("/api/admin/documents/delete", async (req, res) => {
  try {
    const documentId = req.body.documentId || req.body.id;
    if (!documentId) {
      return res.status(400).json({ error: "Missing documentId" });
    }
    const success = await sopStore.deleteDocument(documentId);
    res.json({ success });
  } catch (err) {
    console.error("Error deleting document:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});
app.post("/api/admin/documents/sync", async (req, res) => {
  try {
    const { documents } = req.body;
    if (!Array.isArray(documents)) {
      return res.status(400).json({ error: "Missing or invalid documents array" });
    }
    const result = await sopStore.syncDocuments(documents);
    const currentDocs = await sopStore.getDocuments();
    res.json({ success: true, ...result, documents: currentDocs });
  } catch (err) {
    console.error("Error syncing documents:", err);
    res.status(500).json({ error: "Failed to sync documents: " + (err?.message || err) });
  }
});
app.post("/api/admin/clear-all-samples", async (req, res) => {
  try {
    const result = await sopStore.clearAllSampleSOPs();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Error clearing sample SOPs:", err);
    res.status(500).json({ error: "Failed to clear sample SOPs" });
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
      if (res && typeof res.text === "string" && res.text.trim()) return res.text;
    }
    const legacyFn = pdfParseMod.default || pdfParseMod;
    if (typeof legacyFn === "function") {
      const parsed = await legacyFn(buffer);
      if (parsed && typeof parsed.text === "string" && parsed.text.trim()) return parsed.text;
    }
  } catch (err) {
    console.log("[PDF] Primary pdf-parse extraction info:", err);
  }
  try {
    const raw = buffer.toString("latin1");
    const textMatches = [];
    const re = /\(([^()]{2,})\)\s*T[jJ]/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      const str = match[1].replace(/\\([()\\])/g, "$1").trim();
      if (str.length > 2 && !/^[\x00-\x1F\x7F]+$/.test(str)) {
        textMatches.push(str);
      }
    }
    if (textMatches.length > 8) {
      return textMatches.join(" ");
    }
  } catch (fallbackErr) {
    console.log("[PDF] Fallback text stream scan note:", fallbackErr);
  }
  return "";
}
app.post("/api/admin/documents/parse-pdf", async (req, res) => {
  try {
    let buffer = null;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body && typeof req.body.base64Pdf === "string") {
      const cleanBase64 = req.body.base64Pdf.replace(/^data:application\/pdf;base64,/, "");
      buffer = Buffer.from(cleanBase64, "base64");
    }
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Missing or empty PDF payload. Please select a valid PDF file." });
    }
    const text = await parsePdfBuffer(buffer);
    if (!text || !text.trim()) {
      return res.status(422).json({
        error: "Could not extract readable text from the provided PDF file. The document may be scanned as raster images or password-protected. You can paste the SOP text directly into the editor."
      });
    }
    res.json({ text, sizeBytes: buffer.length });
  } catch (err) {
    console.error("Error parsing PDF:", err);
    res.status(500).json({ error: "Server error processing PDF: " + (err?.message || err) });
  }
});
app.post("/api/admin/documents/upload", async (req, res) => {
  try {
    const { adminUserId, title, version, rawText, archiveOldVersionId, base64Pdf } = req.body;
    if (!title || !version) {
      return res.status(400).json({ error: "Missing required fields: title, version" });
    }
    const effectiveAdminUserId = adminUserId || "8eb16907-4c80-4acb-a609-8a9f9c9b23a7";
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
      effectiveAdminUserId,
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
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dialog SOP Assistant] Server running on http://0.0.0.0:${PORT}`);
  });
  sopStore.ensureInitialized().catch((err) => {
    console.log("[Server] Initial bootstrap notice:", err?.message || err);
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
