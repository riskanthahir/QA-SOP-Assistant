import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Archive,
  RefreshCw,
  Layers,
  ArrowRight,
  Loader2,
  Trash2,
  RotateCcw,
  Edit3,
  Check,
  ShieldCheck,
  X,
  Eye,
  Search,
  Copy
} from 'lucide-react';
import { SOPDocument, IndexingJob, Profile } from '../types';
import { extractTextFromPdfClient } from '../utils/pdfExtractor';

interface AdminUploadViewProps {
  currentProfile: Profile;
  onDocumentsChanged?: () => void;
}

export const AdminUploadView: React.FC<AdminUploadViewProps> = ({ currentProfile, onDocumentsChanged }) => {
  const [documents, setDocuments] = useState<SOPDocument[]>([]);
  const [indexingJobs, setIndexingJobs] = useState<IndexingJob[]>([]);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0');
  const [rawText, setRawText] = useState('');
  const [archiveOldVersionId, setArchiveOldVersionId] = useState<string>('');
  const [revisingDocTitle, setRevisingDocTitle] = useState<string | null>(null);

  // Upload & Extraction Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Deletion States
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<SOPDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearingSamples, setIsClearingSamples] = useState(false);

  // Section splitting preview & Editor mode
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [previewSections, setPreviewSections] = useState<Array<{ label: string; text: string }>>([]);

  // Full Document Preview Modal
  const [previewModalDoc, setPreviewModalDoc] = useState<{
    doc: SOPDocument;
    content?: string;
    sections?: Array<{ section_label?: string; label?: string; content?: string; text?: string }>;
    loading?: boolean;
  } | null>(null);
  const [previewModalTab, setPreviewModalTab] = useState<'sections' | 'raw'>('sections');
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [copiedText, setCopiedText] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocumentsAndJobs();
  }, []);

  useEffect(() => {
    if (rawText.trim()) {
      parseSectionsPreview(rawText);
    } else {
      setPreviewSections([]);
    }
  }, [rawText]);

  const fetchDocumentsAndJobs = async () => {
    try {
      const [docsRes, jobsRes] = await Promise.all([
        fetch('/api/admin/documents'),
        fetch('/api/admin/indexing-jobs'),
      ]);
      if (docsRes.ok) {
        const docs = await docsRes.json();
        setDocuments(docs);
      }
      if (jobsRes.ok) {
        const jobs = await jobsRes.json();
        setIndexingJobs(jobs);
      }
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    }
  };

  const parseSectionsPreview = (text: string) => {
    const lines = text.split('\n');
    const sections: Array<{ label: string; text: string }> = [];
    const headingRegex = /^(?:(?:section|\d+[\.\)]|[A-Z][\.\)]|\bI{1,3}\b|\bIV\b|\bV\b)\s*[:\.\-]?\s*)?(health\s*&?\s*safety|tools?\s*&?\s*materials?(?:\s*required)?|procedure|process|steps?|site\s*cleanup(?:\s*&?\s*handover)?|commissioning|inspection|safety\s*guidelines|technical\s*specifications|specifications|troubleshooting|testing\s*&?\s*verification)/i;

    let currentLabel = 'General Information';
    let currentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(headingRegex);

      if (match && trimmed.length < 80) {
        if (currentLines.length > 0) {
          sections.push({ label: currentLabel, text: currentLines.join('\n').trim() });
          currentLines = [];
        }
        currentLabel = trimmed;
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      sections.push({ label: currentLabel, text: currentLines.join('\n').trim() });
    }

    setPreviewSections(sections);
  };

  const handlePreviewDoc = async (doc: SOPDocument) => {
    setPreviewModalDoc({ doc, loading: true });
    setPreviewSearchTerm('');
    setCopiedText(false);
    setPreviewModalTab('sections');
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewModalDoc({
          doc,
          content: data.text || '',
          sections: data.sections || [],
          loading: false,
        });
      } else {
        setPreviewModalDoc({
          doc,
          content: 'No detailed text available in database for this document.',
          sections: [],
          loading: false,
        });
      }
    } catch {
      setPreviewModalDoc({
        doc,
        content: 'Failed to communicate with repository backend to load SOP text.',
        sections: [],
        loading: false,
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    if (isPdf) {
      setIsProcessing(true);
      setUploadProgress(5);
      setUploadStage(`Loading "${file.name}"...`);
      setUploadError(null);
      setUploadSuccess(null);

      const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);

      try {
        let extractedText = '';
        let pageCount = 0;

        // 1. Primary: Extract directly in browser (eliminates 413 & payload limits completely)
        try {
          const clientRes = await extractTextFromPdfClient(file, (pct, stage) => {
            setUploadProgress(pct);
            setUploadStage(stage);
          });

          if (clientRes.text && clientRes.text.trim().length > 25) {
            extractedText = clientRes.text;
            pageCount = clientRes.pageCount;
          }
        } catch (clientErr) {
          console.warn('[PDF] Client-side extraction notice:', clientErr);
        }

        // 2. Safe Server fallback only for small files (< 4MB) if client extraction was inconclusive
        if (!extractedText.trim() && file.size < 4 * 1024 * 1024) {
          setUploadProgress(50);
          setUploadStage('Attempting server-side extraction fallback...');
          try {
            const resp = await fetch('/api/admin/documents/parse-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/pdf' },
              body: file,
            });

            // Read response ONCE to prevent "body stream already read"
            const respText = await resp.text();
            if (resp.ok) {
              try {
                const parsed = JSON.parse(respText);
                extractedText = parsed.text || '';
              } catch {
                extractedText = respText;
              }
            } else {
              console.warn(`Server parse-pdf status ${resp.status}`);
            }
          } catch (serverErr) {
            console.warn('[PDF] Server fallback notice:', serverErr);
          }
        }

        if (!extractedText.trim()) {
          throw new Error(
            `Could not extract readable text from "${file.name}" (${fileSizeMb} MB). The PDF may be a scanned image or protected. You can paste the SOP text directly into the content editor below.`
          );
        }

        setUploadProgress(100);
        setUploadStage('Extraction complete! Document is ready to preview & publish.');
        setRawText(extractedText);
        parseSectionsPreview(extractedText);
        setEditorTab('preview');
        setUploadSuccess(
          `Extracted ${extractedText.length.toLocaleString()} characters${pageCount > 0 ? ` from ${pageCount} pages` : ''} of "${file.name}". Click "Live Section Preview" or check the sections below, then Publish to save to database.`
        );
      } catch (pdfErr: any) {
        console.error('PDF extraction error:', pdfErr);
        setUploadError(pdfErr?.message || 'Unable to extract text from PDF. You can paste SOP text directly into the editor below.');
      } finally {
        setTimeout(() => {
          setIsProcessing(false);
          setUploadProgress(0);
          setUploadStage('');
        }, 1200);
      }
      return;
    }

    // Text / Markdown File Handling
    setIsProcessing(true);
    setUploadProgress(40);
    setUploadStage('Reading text file...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setRawText(content);
      parseSectionsPreview(content);
      setEditorTab('preview');
      setUploadProgress(100);
      setUploadStage('File loaded.');
      setUploadSuccess(`Loaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Ready to publish.`);
      setTimeout(() => {
        setIsProcessing(false);
        setUploadProgress(0);
      }, 500);
    };
    reader.readAsText(file);
  };

  const handleSubmitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !version.trim() || !rawText.trim()) {
      setUploadError('Please provide document title, version, and SOP content.');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(15);
    setUploadStage('Preparing SOP sections and clauses for database...');
    setUploadError(null);
    setUploadSuccess(null);

    try {
      setUploadProgress(45);
      setUploadStage('Sending SOP to backend database & vector embedding pipeline...');

      const res = await fetch('/api/admin/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUserId: currentProfile.id,
          title: title.trim(),
          version: version.trim(),
          rawText: rawText.trim(),
          archiveOldVersionId: archiveOldVersionId || undefined,
        }),
      });

      setUploadProgress(85);
      setUploadStage('Validating index and activating repository...');

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload and index SOP document.');
      }

      const data = await res.json();
      setUploadProgress(100);
      setUploadStage('SOP successfully saved and indexed!');
      setUploadSuccess(
        `Successfully saved and indexed "${data.document.title}" (v${data.document.version}) in the live repository. All field engineers can now query this document.`
      );

      // Reset form
      setTitle('');
      setVersion('1.0');
      setRawText('');
      setArchiveOldVersionId('');
      setRevisingDocTitle(null);

      await fetchDocumentsAndJobs();
      onDocumentsChanged?.();
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Error processing SOP document.');
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setUploadProgress(0);
        setUploadStage('');
      }, 1000);
    }
  };

  const handleStartRevision = (doc: SOPDocument) => {
    setTitle(doc.title);
    setArchiveOldVersionId(doc.id);
    setRevisingDocTitle(doc.title);

    // Auto-increment version
    const parts = doc.version.split('.');
    if (parts.length >= 2) {
      const minor = parseInt(parts[1], 10);
      setVersion(`${parts[0]}.${isNaN(minor) ? '1' : minor + 1}`);
    } else {
      setVersion(`${doc.version}.1`);
    }

    // Scroll to form
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelRevision = () => {
    setArchiveOldVersionId('');
    setRevisingDocTitle(null);
    setTitle('');
    setVersion('1.0');
    setRawText('');
  };

  const handleArchiveDoc = async (docId: string) => {
    try {
      const res = await fetch('/api/admin/documents/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });
      if (res.ok) {
        setUploadSuccess('Document archived from active retrieval.');
        fetchDocumentsAndJobs();
        onDocumentsChanged?.();
      }
    } catch (err) {
      console.error('Failed to archive document:', err);
    }
  };

  const handleRestoreDoc = async (docId: string) => {
    try {
      const res = await fetch('/api/admin/documents/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });
      if (res.ok) {
        setUploadSuccess('Document restored to active SOP repository.');
        fetchDocumentsAndJobs();
        onDocumentsChanged?.();
      }
    } catch (err) {
      console.error('Failed to restore document:', err);
    }
  };

  const handleDeleteDoc = async (doc: SOPDocument) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setUploadSuccess(`Successfully deleted "${doc.title}" from backend repository and search index.`);
        setDeleteConfirmDoc(null);
        fetchDocumentsAndJobs();
        onDocumentsChanged?.();
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to delete document');
      }
    } catch (err: any) {
      console.error('Failed to delete document:', err);
      setUploadError(`Failed to delete document: ${err.message || err}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAllSampleSOPs = async () => {
    if (!window.confirm('Are you sure you want to completely remove and clear all default/sample SOPs from the database and web app? This action cannot be undone.')) {
      return;
    }

    setIsClearingSamples(true);
    try {
      const res = await fetch('/api/admin/clear-all-samples', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setUploadSuccess(`Successfully purged ${data.removedCount || 'all'} default/sample SOP records. Only user-uploaded SOPs will exist.`);
        fetchDocumentsAndJobs();
        onDocumentsChanged?.();
      } else {
        throw new Error('Failed to purge sample SOPs');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Error purging sample SOPs');
    } finally {
      setIsClearingSamples(false);
    }
  };

  const activeDocs = documents.filter((d) => d.status === 'active');
  const archivedDocs = documents.filter((d) => d.status === 'archived');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-slate-800">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-red-600 text-xs font-bold uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Dialog Axiata PLC • Engineering Operations</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            SOP PDF Repository & Database Management
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Upload approved Dialog Standard Operating Procedures (PDF or text). Uploaded documents are saved in the database, indexed into vector chunks, and can be updated with revised versions or deleted anytime.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={handleClearAllSampleSOPs}
            disabled={isClearingSamples}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-colors shadow-xs"
            title="Permanently remove all default/sample SOPs"
          >
            {isClearingSamples ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>Clear Default / Sample SOPs</span>
          </button>
          <button
            onClick={fetchDocumentsAndJobs}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {uploadSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{uploadSuccess}</span>
          </div>
          <button onClick={() => setUploadSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload & Indexing Progress Bar */}
      {isProcessing && (
        <div className="bg-white border-2 border-red-500/40 rounded-xl p-5 shadow-md space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
              <span className="text-xs font-bold text-slate-900">{uploadStage || 'Processing SOP document...'}</span>
            </div>
            <span className="text-xs font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
              {uploadProgress}%
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
            <div
              className="bg-linear-to-r from-red-600 via-rose-500 to-amber-500 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(8, uploadProgress)}%` }}
            />
          </div>

          <div className="grid grid-cols-4 text-[10px] font-semibold text-slate-500 pt-1">
            <div className={`flex items-center gap-1 ${uploadProgress >= 25 ? 'text-emerald-600' : 'text-slate-400'}`}>
              <Check className="w-3 h-3" />
              <span>1. Load Document</span>
            </div>
            <div className={`flex items-center gap-1 ${uploadProgress >= 50 ? 'text-emerald-600' : 'text-slate-400'}`}>
              <Check className="w-3 h-3" />
              <span>2. Extract Clauses</span>
            </div>
            <div className={`flex items-center gap-1 ${uploadProgress >= 80 ? 'text-emerald-600' : 'text-slate-400'}`}>
              <Check className="w-3 h-3" />
              <span>3. Vector Indexing</span>
            </div>
            <div className={`flex items-center gap-1 ${uploadProgress >= 100 ? 'text-emerald-600' : 'text-slate-400'}`}>
              <Check className="w-3 h-3" />
              <span>4. Database Store</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Revision Form */}
        <div className="lg:col-span-7 space-y-6" ref={formRef}>
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-red-600" />
                <span>{revisingDocTitle ? 'Upload Revised Version of SOP' : 'Upload & Process New SOP Document'}</span>
              </h2>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                Admin Verified
              </span>
            </div>

            {/* Revision Banner if Active */}
            {revisingDocTitle && (
              <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">Revising: </span>
                    <span>"{revisingDocTitle}"</span>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      The previous version will automatically be archived in the database upon publishing this revised version.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelRevision}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[11px] font-bold"
                >
                  Cancel
                </button>
              </div>
            )}

            <form onSubmit={handleSubmitUpload} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    SOP Document Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Dialog SOP-ENG-MW-05: Microwave Link Alignment"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Version *
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g. 1.0 or 2.1"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                    required
                  />
                </div>
              </div>

              {/* Replace / Archive Previous Version Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Replace / Archive Previous Version in Database</span>
                  <span className="text-[10px] text-slate-400">Archives previous version record</span>
                </label>
                <select
                  value={archiveOldVersionId}
                  onChange={(e) => {
                    setArchiveOldVersionId(e.target.value);
                    const found = activeDocs.find((d) => d.id === e.target.value);
                    if (found) {
                      setRevisingDocTitle(found.title);
                    } else {
                      setRevisingDocTitle(null);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                >
                  <option value="">-- None (New independent SOP document) --</option>
                  {activeDocs.map((d, idx) => (
                    <option key={`opt-${d.id}-${idx}`} value={d.id}>
                      Archive upon publish: {d.title} (v{d.version})
                    </option>
                  ))}
                </select>
              </div>

              {/* File Drag and Drop / Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select SOP PDF Document *
                </label>
                <label
                  className={`flex flex-col items-center justify-center border-2 border-dashed ${
                    isProcessing
                      ? 'border-red-400 bg-red-50/50'
                      : 'border-gray-300 hover:border-red-500 bg-slate-50 hover:bg-slate-100'
                  } rounded-xl p-6 cursor-pointer transition-colors`}
                >
                  <FileText className="w-8 h-8 text-red-500 mb-2" />
                  <span className="text-xs text-slate-800 font-bold">
                    Choose approved SOP PDF (.pdf, .txt, .md)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Client-side extraction runs in-browser to handle large files without network limits
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                    className="hidden"
                  />
                </label>
              </div>

              {/* SOP Document Content: Edit vs Live Section Preview Tabs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setEditorTab('edit')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        editorTab === 'edit'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ✍️ Edit SOP Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab('preview')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                        editorTab === 'preview'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Live Section Preview ({previewSections.length})</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {rawText ? `${rawText.length.toLocaleString()} characters` : 'No text loaded'}
                  </span>
                </div>

                {editorTab === 'edit' ? (
                  <textarea
                    rows={9}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste or review the extracted SOP content here (including Health & Safety, Tools & Materials, Procedures, Quality Checkpoints, and Site Cleanup)..."
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                    required
                  />
                ) : (
                  <div className="border border-gray-200 rounded-xl bg-slate-50 p-4 max-h-80 overflow-y-auto space-y-3">
                    {previewSections.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        No sections detected yet. Upload an approved Dialog SOP PDF above or paste text in the editor.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {previewSections.map((sec, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-900 pb-1.5 border-b border-gray-100 mb-1.5">
                              <span className="flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">
                                  {idx + 1}
                                </span>
                                <span>{sec.label}</span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {sec.text.length} chars
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto bg-slate-50 p-2.5 rounded">
                              {sec.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>SOPs are saved to PostgreSQL database & pgvector store</span>
                </span>
                <button
                  type="submit"
                  disabled={isProcessing || !title.trim() || !rawText.trim()}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>{revisingDocTitle ? 'Publish Revised SOP' : 'Publish & Save to Database'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Live Section Split Preview */}
          {previewSections.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-red-600" />
                  <span>Parsed Sections Preview ({previewSections.length} Chunks Detected)</span>
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">Auto-Indexed</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {previewSections.map((sec, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="font-bold text-[11px] text-slate-800 truncate mb-1">
                      {idx + 1}. {sec.label}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-2">{sec.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Repository Documents & Management */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active SOP Documents */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-600" />
                <span>Active SOP Documents ({activeDocs.length})</span>
              </h2>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                Live in Repository
              </span>
            </div>

            {activeDocs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No SOP Documents Uploaded Yet</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Upload an approved Dialog Axiata SOP PDF on the left. Once published, it will be saved to the database and indexed for AI consultations.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDocs.map((doc, idx) => (
                  <div
                    key={`doc-act-${doc.id}-${idx}`}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-900 leading-snug line-clamp-2">
                          {doc.title}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 flex-wrap">
                          <span className="font-mono font-bold text-red-600">v{doc.version}</span>
                          <span>•</span>
                          <span>{doc.chunk_count || 4} Chunks</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-bold">Active</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewDoc(doc)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors shadow-xs text-[11px] font-bold flex items-center gap-1"
                          title="Preview full SOP document and sections"
                        >
                          <Eye className="w-3 h-3 text-red-600" />
                          <span>Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartRevision(doc)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 transition-colors shadow-xs text-[11px] font-bold flex items-center gap-1"
                          title="Upload a revised version of this SOP"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Revise</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveDoc(doc.id)}
                          className="p-1.5 rounded-lg bg-white hover:bg-amber-50 text-slate-500 hover:text-amber-600 border border-slate-200 transition-colors shadow-xs"
                          title="Archive document"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmDoc(doc)}
                          className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 transition-colors shadow-xs"
                          title="Permanently delete from database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archived SOP Documents Audit History */}
          {archivedDocs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                <Archive className="w-4 h-4 text-slate-400" />
                <span>Archived Previous SOPs ({archivedDocs.length})</span>
              </h2>
              <div className="space-y-2">
                {archivedDocs.map((doc, idx) => (
                  <div
                    key={`doc-arch-${doc.id}-${idx}`}
                    className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 opacity-90 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-700 truncate pr-2">{doc.title}</div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewDoc(doc)}
                          className="px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shadow-xs text-[11px] font-bold flex items-center gap-1"
                          title="Preview archived SOP text and clauses"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>Preview</span>
                        </button>
                        <button
                          onClick={() => handleRestoreDoc(doc.id)}
                          className="p-1 rounded-md bg-white hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-200 transition-colors shadow-xs"
                          title="Restore document to active search"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmDoc(doc)}
                          className="p-1 rounded-md bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 transition-colors shadow-xs"
                          title="Permanently delete SOP from repository"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      v{doc.version} • Archived
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing / Indexing Jobs Log */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Indexing Pipeline Jobs ({indexingJobs.length})</span>
            </h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {indexingJobs.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No indexing tasks recorded yet</div>
              ) : (
                indexingJobs.slice(0, 8).map((job, idx) => (
                  <div key={`job-${job.id}-${idx}`} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900 truncate pr-2">
                        {job.document_title || job.document_id}
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                        {job.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                      <span>Sections: {job.extracted_sections_count ?? 4}</span>
                      <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Delete SOP Document</h3>
                <p className="text-xs text-slate-500">Permanent database & repository removal</p>
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
              <p className="font-bold">Are you sure you want to delete this SOP?</p>
              <p className="font-medium text-slate-800 line-clamp-2">
                "{deleteConfirmDoc.title}" (v{deleteConfirmDoc.version})
              </p>
              <p className="text-[11px] text-red-700 mt-1">
                This will permanently delete this document and all associated text sections and vector chunks from both the database and AI search engine.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmDoc(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDoc(deleteConfirmDoc)}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete SOP Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full SOP Document Preview Modal */}
      {previewModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center font-bold text-white italic text-base shrink-0 shadow-xs">
                  D
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white text-sm truncate">
                      {previewModalDoc.doc.title}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-bold">
                      v{previewModalDoc.doc.version}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {previewModalDoc.doc.status || 'Active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Dialog Axiata Approved Field Engineering SOP Document
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalDoc(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Controls & Search Bar */}
            <div className="px-6 py-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewModalTab('sections')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    previewModalTab === 'sections'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-red-600" />
                    <span>Parsed Sections ({previewModalDoc.sections?.length || previewSections.length || 0})</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalTab('raw')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    previewModalTab === 'raw'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-600" />
                    <span>Full Raw Text ({previewModalDoc.content?.length.toLocaleString() || 0} Chars)</span>
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-sm justify-end">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={previewSearchTerm}
                    onChange={(e) => setPreviewSearchTerm(e.target.value)}
                    placeholder="Search within SOP..."
                    className="w-full pl-8 pr-3 py-1 bg-white border border-gray-300 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:border-red-500"
                  />
                  {previewSearchTerm && (
                    <button
                      onClick={() => setPreviewSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const textToCopy = previewModalDoc.content || '';
                    navigator.clipboard.writeText(textToCopy);
                    setCopiedText(true);
                    setTimeout(() => setCopiedText(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-gray-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy full text to clipboard"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Modal Content Scroll Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50">
              {previewModalDoc.loading ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">Loading document from database...</p>
                </div>
              ) : previewModalTab === 'sections' ? (
                <div>
                  {(() => {
                    const rawSections = (previewModalDoc.sections && previewModalDoc.sections.length > 0)
                      ? previewModalDoc.sections
                      : (previewModalDoc.content ? [
                          { label: 'Full SOP Content', text: previewModalDoc.content }
                        ] : []);

                    const filtered = previewSearchTerm.trim()
                      ? rawSections.filter(s => {
                          const lbl = s.section_label || s.label || '';
                          const txt = s.content || s.text || '';
                          const q = previewSearchTerm.toLowerCase();
                          return lbl.toLowerCase().includes(q) || txt.toLowerCase().includes(q);
                        })
                      : rawSections;

                    if (filtered.length === 0) {
                      return (
                        <div className="py-12 text-center text-slate-400 text-xs">
                          {previewSearchTerm ? `No sections matching "${previewSearchTerm}"` : 'No sections available'}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {filtered.map((sec, idx) => {
                          const label = sec.section_label || sec.label || `Section ${idx + 1}`;
                          const text = sec.content || sec.text || '';
                          return (
                            <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2">
                              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-lg bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                  </span>
                                  <span>{label}</span>
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {text.length.toLocaleString()} characters
                                </span>
                              </div>
                              <div className="text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                                {text}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
                  <div className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto p-2">
                    {previewModalDoc.content || 'No text content available'}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-white border-t border-gray-200 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Verified Dialog Axiata Standard Operating Procedure</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const docToRevise = previewModalDoc.doc;
                    setPreviewModalDoc(null);
                    handleStartRevision(docToRevise);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Revise This SOP</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalDoc(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
