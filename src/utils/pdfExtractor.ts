import * as pdfjsLib from 'pdfjs-dist';

// Configure worker using CDN or local worker if available
if (typeof window !== 'undefined') {
  // Use official CDN worker matching installed version to avoid Vite bundling complications
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/**
 * Client-side PDF text extractor that runs directly in the user's browser.
 * This completely avoids sending large PDF files across the network and
 * prevents Vercel 4.5MB payload limit (HTTP 413) errors.
 */
export async function extractTextFromPdfClient(file: File): Promise<{ text: string; pageCount: number }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
          .join(' ');

        if (pageText.trim()) {
          pageTexts.push(pageText.trim());
        }
      } catch (pageErr) {
        console.warn(`[PDFClient] Error extracting page ${pageNum}:`, pageErr);
      }
    }

    const fullText = pageTexts.join('\n\n');
    if (fullText.trim().length > 20) {
      return { text: fullText, pageCount };
    }
  } catch (err) {
    console.warn('[PDFClient] PDF.js extraction error, falling back to binary scan:', err);
  }

  // Fallback: binary scan for raw text tokens if PDF.js fails
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let latin1 = '';
    const chunkSize = 65536;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      latin1 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    const matches: string[] = [];
    const re = /\(([^()]{2,})\)\s*T[jJ]/g;
    let match;
    while ((match = re.exec(latin1)) !== null) {
      const str = match[1].replace(/\\([()\\])/g, '$1').trim();
      if (str.length > 2 && !/^[\x00-\x1F\x7F]+$/.test(str)) {
        matches.push(str);
      }
    }
    if (matches.length > 8) {
      return { text: matches.join(' '), pageCount: 1 };
    }
  } catch (fallbackErr) {
    console.warn('[PDFClient] Binary fallback error:', fallbackErr);
  }

  return { text: '', pageCount: 0 };
}
