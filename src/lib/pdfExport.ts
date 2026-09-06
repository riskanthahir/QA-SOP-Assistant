import jsPDF from 'jspdf';
import { Chat, Message, Profile } from '../types';

export function exportChatToPDF(chat: Chat, messages: Message[], profile: Profile) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  // Header Banner
  doc.setFillColor(227, 6, 19); // Dialog Axiata Red
  doc.rect(margin, cursorY, contentWidth, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('DIALOG AXIATA PLC - FIELD ENGINEERING SERVICES', margin + 6, cursorY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Standard Operating Procedure (SOP) Official Consultation Log', margin + 6, cursorY + 14);

  cursorY += 24;

  // Metadata Box
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(220, 224, 230);
  doc.rect(margin, cursorY, contentWidth, 24, 'FD');

  doc.setTextColor(40, 44, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Consultation: ${chat.title}`, margin + 5, cursorY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 85, 95);
  doc.text(`Field Officer: ${profile.full_name} (${profile.role.toUpperCase()})`, margin + 5, cursorY + 12);
  doc.text(`Language: ${profile.language.toUpperCase()}  |  Exported: ${new Date().toLocaleString()}`, margin + 5, cursorY + 18);

  cursorY += 32;

  // Iterate messages
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isUser = msg.role === 'user';

    // Page overflow check
    if (cursorY > pageHeight - 35) {
      addPageFooter(doc, pageHeight, margin, contentWidth);
      doc.addPage();
      cursorY = margin;
    }

    if (isUser) {
      // User Question Card
      doc.setFillColor(238, 242, 246);
      doc.setDrawColor(200, 208, 218);
      
      const questionLines = doc.splitTextToSize(`Officer Query: ${msg.content}`, contentWidth - 8);
      const boxHeight = Math.max(12, questionLines.length * 4.5 + 6);
      
      doc.rect(margin, cursorY, contentWidth, boxHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(20, 30, 45);
      doc.text(questionLines, margin + 4, cursorY + 6);

      cursorY += boxHeight + 6;
    } else {
      // Assistant Answer Card
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(227, 6, 19); // Dialog red border accent
      doc.setLineWidth(0.6);
      
      // Clean up markdown hashes for clean PDF text
      const cleanContent = msg.content
        .replace(/### 🛡️ /g, '[HEALTH & SAFETY]\n')
        .replace(/### 🧰 /g, '[TOOLS & MATERIALS REQUIRED]\n')
        .replace(/### 📋 /g, '[PROCEDURE]\n')
        .replace(/### 🧹 /g, '[SITE CLEANUP & HANDOVER]\n')
        .replace(/### 📌 /g, '[SOURCE SOPS & SECTIONS USED]\n')
        .replace(/###\s*/g, '')
        .replace(/\*\*/g, '');

      const answerLines = doc.splitTextToSize(cleanContent, contentWidth - 10);
      
      // Calculate citation space
      let citationsHeight = 0;
      if (msg.citations && msg.citations.length > 0) {
        citationsHeight = 10 + msg.citations.length * 5;
      }

      const totalHeight = answerLines.length * 4.2 + 10 + citationsHeight;

      // Handle multi-line page breaks if text is very long
      let lineIndex = 0;
      while (lineIndex < answerLines.length) {
        if (cursorY > pageHeight - 40) {
          addPageFooter(doc, pageHeight, margin, contentWidth);
          doc.addPage();
          cursorY = margin;
        }

        const linesAvailable = Math.floor((pageHeight - cursorY - 30) / 4.2);
        const chunkLines = answerLines.slice(lineIndex, lineIndex + linesAvailable);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 35, 45);
        doc.text(chunkLines, margin + 4, cursorY + 5);

        cursorY += chunkLines.length * 4.2 + 4;
        lineIndex += linesAvailable;
      }

      // Add citations
      if (msg.citations && msg.citations.length > 0) {
        if (cursorY > pageHeight - 35) {
          addPageFooter(doc, pageHeight, margin, contentWidth);
          doc.addPage();
          cursorY = margin;
        }

        doc.setFillColor(250, 250, 252);
        doc.setDrawColor(225, 230, 238);
        doc.rect(margin, cursorY, contentWidth, 6 + msg.citations.length * 4.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(180, 20, 30);
        doc.text('VERIFIED CITATIONS (FROM ACTIVE SOPS):', margin + 4, cursorY + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(70, 75, 85);
        msg.citations.forEach((c, cIdx) => {
          doc.text(`• ${c.documentTitle} (v${c.version}) — Section: ${c.sectionLabel}`, margin + 4, cursorY + 9 + cIdx * 4.5);
        });

        cursorY += 10 + msg.citations.length * 4.5 + 4;
      }

      cursorY += 6;
    }
  }

  // Final page footer
  addPageFooter(doc, pageHeight, margin, contentWidth);

  // Trigger download
  const filename = `Dialog_SOP_${chat.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${Date.now()}.pdf`;
  doc.save(filename);
}

function addPageFooter(doc: jsPDF, pageHeight: number, margin: number, contentWidth: number) {
  const footerY = pageHeight - 14;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(252, 165, 165);
  doc.rect(margin, footerY - 4, contentWidth, 12, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 28, 28);
  doc.text('SAFETY DISCLAIMER: Confirm all safety-critical steps, clearance distances & tower tie-off with supervisor before work.', margin + 3, footerY + 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 125, 135);
  doc.text('Confidential - Dialog Axiata PLC Internal Field Operations Use Only', margin + 3, footerY + 5.5);
}
