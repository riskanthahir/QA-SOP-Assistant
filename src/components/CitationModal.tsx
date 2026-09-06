import React from 'react';
import { X, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { Citation } from '../types';

interface CitationModalProps {
  citation: Citation | null;
  onClose: () => void;
}

export const CitationModal: React.FC<CitationModalProps> = ({ citation, onClose }) => {
  if (!citation) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center font-bold text-white italic text-lg shadow-sm">
              D
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Verified SOP Source Citation</h3>
              <p className="text-[11px] text-slate-400">Dialog Axiata Official Field Procedure Record</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-slate-800">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Document Title
            </div>
            <div className="text-sm font-bold text-slate-900">{citation.documentTitle}</div>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
              <span>Version: <strong className="text-slate-900 font-mono">v{citation.version}</strong></span>
              <span className="text-slate-300">•</span>
              <span>Section: <strong className="text-slate-900">{citation.sectionLabel}</strong></span>
              {citation.similarity !== undefined && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-emerald-600 font-bold font-mono">
                    Match: {Math.round(citation.similarity * 100)}%
                  </span>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Exact Chunk Text in Approved SOP:</span>
            </div>
            <div className="bg-slate-900 text-slate-200 p-4 rounded-xl border border-slate-800 text-xs font-mono leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap shadow-inner">
              {citation.excerpt}
            </div>
          </div>

          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-snug flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
            <div>
              <strong>Procedural Integrity Rule:</strong> Answers are retrieved strictly from active Dialog SOP excerpts. No AI hallucinations or unverified steps are permitted.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition-colors shadow-sm"
          >
            Close Excerpt
          </button>
        </div>
      </div>
    </div>
  );
};
