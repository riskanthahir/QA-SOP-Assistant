import * as pdfjsLib from 'pdfjs-dist';
// Vite special ?url import embeds the worker asset directly from node_modules
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerInitialized = false;

function initPdfWorker() {
  if (workerInitialized || typeof window === 'undefined') return;
  try {
    if (pdfWorkerUrl) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      workerInitialized = true;
    }
  } catch (err) {
    console.warn('[PDFExtractor] Could not bind local worker URL, fallback to inline engine:', err);
  }
}

/**
 * Extracts text from a PDF file directly inside the browser.
 * This completely avoids sending large binary PDF files across the network,
 * eliminating HTTP 413 (Payload Too Large) and proxy/serverless body limits.
 */
export async function extractTextFromPdfClient(
  file: File,
  onProgress?: (progressPercent: number, stageText: string) => void
): Promise<{ text: string; pageCount: number }> {
  initPdfWorker();

  const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
  onProgress?.(10, `Reading "${file.name}" (${fileSizeMb} MB)...`);

  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // Strategy 1: PDF.js with bundled worker
  try {
    onProgress?.(25, 'Parsing document structure with PDF engine...');
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      stopAtErrors: false,
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const pageProgress = 25 + Math.round((pageNum / Math.max(pageCount, 1)) * 55);
      onProgress?.(pageProgress, `Extracting page ${pageNum} of ${pageCount}...`);

      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (pageText) {
          pageTexts.push(pageText);
        }
      } catch (pageErr) {
        console.warn(`[PDFClient] Notice on page ${pageNum}:`, pageErr);
      }
    }

    const fullText = pageTexts.join('\n\n');
    if (fullText.trim().length > 30) {
      onProgress?.(95, 'Formatting and indexing technical sections...');
      return { text: fullText, pageCount };
    }
  } catch (err: any) {
    console.warn('[PDFClient] Primary worker extraction notice, attempting fallback engine:', err?.message || err);
  }

  // Strategy 2: PDF.js with disabled/inline worker (works in restricted iframes and restrictive CSPs)
  try {
    onProgress?.(50, 'Running direct engine fallback...');
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      isEvalSupported: false,
      useWorkerFetch: false,
      disableWorker: true,
      stopAtErrors: false,
    } as any);

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .trim();

        if (pageText) pageTexts.push(pageText);
      } catch {
        // Continue
      }
    }

    const fullText = pageTexts.join('\n\n');
    if (fullText.trim().length > 30) {
      return { text: fullText, pageCount };
    }
  } catch (err2) {
    console.warn('[PDFClient] Strategy 2 notice:', err2);
  }

  // Strategy 3: Fast binary text token scanner (for uncompressed or partially compressed streams)
  onProgress?.(75, 'Scanning text token streams...');
  try {
    let latin1 = '';
    const chunkSize = 65536;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      latin1 += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSize)));
    }

    const matches: string[] = [];

    // Match (string) Tj or (string) TJ
    const reTj = /\(([^()]{2,})\)\s*T[jJ]/g;
    let match;
    while ((match = reTj.exec(latin1)) !== null) {
      const str = match[1].replace(/\\([()\\])/g, '$1').trim();
      if (str.length > 2 && !/^[\x00-\x1F\x7F]+$/.test(str)) {
        matches.push(str);
      }
    }

    // Match [ (str1) -12 (str2) ] TJ arrays
    const reArrayTj = /\[\s*((?:\([^)]*\)|-?\d+[\.\d]*\s*)+)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = reArrayTj.exec(latin1)) !== null) {
      const inner = arrMatch[1];
      const strParts = inner.match(/\(([^)]+)\)/g);
      if (strParts) {
        const joined = strParts.map(s => s.slice(1, -1).replace(/\\([()\\])/g, '$1')).join('');
        if (joined.length > 2) matches.push(joined);
      }
    }

    if (matches.length > 5) {
      const text = matches.join(' ').replace(/\s+/g, ' ');
      return { text, pageCount: 1 };
    }
  } catch (scannerErr) {
    console.warn('[PDFClient] Binary scan notice:', scannerErr);
  }

  return { text: '', pageCount: 0 };
}
