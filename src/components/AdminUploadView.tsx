import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Archive,
  Eye,
  RefreshCw,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { SOPDocument, IndexingJob, Profile } from '../types';

interface AdminUploadViewProps {
  currentProfile: Profile;
  onDocumentsChanged?: () => void;
}

const SAMPLE_TEMPLATES = [
  {
    title: 'Dialog SOP-ENG-MW-05: High-Capacity Microwave Radio Link Alignment & ODU Installation',
    version: '1.0',
    content: `1. Health & Safety
Work at height guidelines: Use double-lanyard climbing harness with ascender and rope grab.
RF Radiation Safety: Inhibit microwave transmitter power at the Indoor Unit (IDU) before handling or mounting the Outdoor Unit (ODU) and parabolic feed horn.
Weather Hazard: Never climb towers when wind speed exceeds 35 km/h or during local lightning warnings.

2. Tools & Materials Required
Microwave alignment kit with digital volt-ohmmeter (DVM) to monitor Receiver Signal Level (RSL) test port.
Torque wrench with 13mm and 17mm insulated sockets (30-45 Nm rating).
Dialog approved high-gain parabolic antenna (0.6m or 1.2m diameter) and direct-mount ODU.
RG-6 / CNT-400 coaxial IF cable or shielded Cat6A outdoor FTP with waterproof RJ45 grommets.
Cold-shrink grounding kits and 25x3mm copper earth bonding bar.

3. Procedure
Step 1: Mount antenna bracket onto 114mm tower mast pipe. Torque bracket U-bolts alternately to 40 Nm to prevent tilt misalignment.
Step 2: Connect ODU to antenna feed collar with Dialog approved silicone O-ring gasket. Ensure polarization pin is locked for Vertical or Horizontal polarization according to RF frequency license.
Step 3: Connect DVM test leads to ODU AGC (Automatic Gain Control) voltage port.
Step 4: Perform coarse pan azimuth sweep across 360 degrees until initial AGC signal voltage registers (> 1.0 VDC).
Step 5: Perform fine azimuth and elevation micrometer adjustments to achieve target design RSL ± 1.5 dBm. Lock all fine adjustment nuts.
Step 6: Ground ODU chassis and IF cable shielding to tower main earth collector busbar using 16mm² copper ground conductor.

4. Site Cleanup & Handover
Collect all cable cut-offs, cable ties, and packaging materials.
Re-check waterproof integrity of ODU boot seal.
Verify bit error rate (BER) is 10^-9 or better with zero frame drops over a 15-minute soak test. Submit alignment certificate to Dialog Transmission Engineering Desk.`,
  },
  {
    title: 'Dialog SOP-ENG-GEN-03: Standby Diesel Generator Servicing & Automatic Transfer Switch (ATS) Testing',
    version: '2.0',
    content: `1. Health & Safety
Lockout / Tagout (LOTO): Place genset controller in "MANUAL OFF" and disconnect 12V/24V starter battery negative terminal before servicing mechanical drive belts or fuel lines.
Hot Surfaces: Allow exhaust manifold and turbocharger to cool for at least 30 minutes before changing oil or filters.
Spill Containment: Place oil drip tray under sump drain plug to prevent environmental fuel contamination.

2. Tools & Materials Required
Filter strap wrench set and drain pan (15L capacity).
Dialog approved 15W-40 CI-4 heavy-duty diesel engine oil and OEM fuel/water separator filters.
Digital multimeter (CAT III 1000V) and infrared thermal imaging gun.
Class-B foam fire extinguisher and hydrocarbon spill cleanup kit.

3. Procedure
Step 1: Drain engine oil through sump drain valve into containment pan. Replace primary and secondary fuel filters.
Step 2: Refill engine with fresh 15W-40 oil to dipstick upper notch mark. Prime fuel system using hand pump to purge air bubbles.
Step 3: Reconnect starter battery terminals. Torque terminal bolts to 10 Nm and coat with petroleum jelly.
Step 4: Test automatic start cycle: Simulate utility CEB mains failure by opening main circuit breaker.
Step 5: Verify generator starts, achieves rated 1500 RPM / 50 Hz within 8 seconds, and ATS transfers telecom site load smoothly.
Step 6: Run under site load for 30 minutes. Measure phase-to-phase voltages (400V ± 2%) and oil pressure (> 3.5 bar).

4. Site Cleanup & Handover
Transfer used engine oil into labeled regional recycling drums. Clean any minor oil drips from shelter floor with absorbent pads.
Update physical maintenance log sheet attached to genset canopy with engine run hours, date, and technician EPF ID.
Restore ATS to "AUTO" mode and confirm Dialog NOC telemetry receives "Genset Ready" status.`,
  },
];

export const AdminUploadView: React.FC<AdminUploadViewProps> = ({ currentProfile, onDocumentsChanged }) => {
  const [documents, setDocuments] = useState<SOPDocument[]>([]);
  const [indexingJobs, setIndexingJobs] = useState<IndexingJob[]>([]);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0');
  const [rawText, setRawText] = useState('');
  const [archiveOldVersionId, setArchiveOldVersionId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Section splitting preview
  const [previewSections, setPreviewSections] = useState<Array<{ label: string; text: string }>>([]);

  useEffect(() => {
    fetchDocumentsAndJobs();
  }, []);

  useEffect(() => {
    // Dynamic preview of section splitting as text is entered
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use filename as default title if not already set
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    if (isPdf) {
      setIsParsingPdf(true);
      setUploadError(null);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          const resp = await fetch('/api/admin/documents/parse-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Pdf: base64 }),
          });
          const resData = await resp.json();
          if (!resp.ok) {
            throw new Error(resData.error || 'Failed to extract text from PDF file');
          }
          setRawText(resData.text);
          parseSectionsPreview(resData.text);
        } catch (pdfErr: any) {
          console.error('PDF extraction failed:', pdfErr);
          setUploadError(`PDF parse error: ${pdfErr?.message || 'Unable to extract text from PDF'}. You can paste SOP text directly into the editor below.`);
        } finally {
          setIsParsingPdf(false);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setRawText(content);
    };
    reader.readAsText(file);
  };

  const handleApplyTemplate = (tpl: typeof SAMPLE_TEMPLATES[0]) => {
    setTitle(tpl.title);
    setVersion(tpl.version);
    setRawText(tpl.content);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleSubmitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !version.trim() || !rawText.trim()) {
      setUploadError('Please provide document title, version, and SOP content.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload and index SOP document.');
      }

      const data = await res.json();
      setUploadSuccess(`Successfully saved and indexed "${data.document.title}" (v${data.document.version}) in backend repository. All SOP texts are now active for full-text AI search and structured synthesis.`);
      setTitle('');
      setVersion('1.0');
      setRawText('');
      setArchiveOldVersionId('');
      fetchDocumentsAndJobs();
      onDocumentsChanged?.();
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Error processing SOP document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleArchiveDoc = async (docId: string) => {
    try {
      const res = await fetch('/api/admin/documents/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });
      if (res.ok) {
        fetchDocumentsAndJobs();
        onDocumentsChanged?.();
      }
    } catch (err) {
      console.error('Failed to archive document:', err);
    }
  };

  const activeDocs = documents.filter((d) => d.status === 'active');
  const archivedDocs = documents.filter((d) => d.status === 'archived');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-slate-800">
      {/* View Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-red-600 text-xs font-bold uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Dialog Axiata Field Operations Knowledge Base</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            SOP PDF Repository & Cross-Document Search Engine
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Upload PDF SOPs to the backend repository. Documents are securely saved and preserved. Field technician queries search the text across all available SOPs and reconstruct structured Dialog answers.
          </p>
        </div>
        <button
          onClick={fetchDocumentsAndJobs}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold self-start sm:self-center transition-colors shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Database</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload Form & Previews */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-red-600" />
                <span>Upload & Index New SOP Document</span>
              </h2>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                Admin Privileges Active
              </span>
            </div>

            {/* Standard Engineering SOP Templates */}
            <div className="mb-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Standard Dialog SOP Ingestion Templates:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_TEMPLATES.map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-red-400 text-left transition-colors shadow-xs"
                  >
                    <div className="font-bold text-[11px] text-slate-900 truncate max-w-[240px]">
                      {tpl.title.split(':')[0]}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[240px]">{tpl.title.split(':')[1]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
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
                    placeholder="e.g. Dialog SOP-ENG-FTTH-02: Microduct Air-Blowing & Cabling"
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
                    placeholder="e.g. 1.0"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                    required
                  />
                </div>
              </div>

              {/* Version Replacement / Archiving selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Replace / Archive Previous Version (Optional)</span>
                  <span className="text-[10px] text-slate-400">Excludes old document from retrieval</span>
                </label>
                <select
                  value={archiveOldVersionId}
                  onChange={(e) => setArchiveOldVersionId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                >
                  <option value="">-- None (Do not archive an existing document) --</option>
                  {activeDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      Archive: {d.title} (Current v{d.version})
                    </option>
                  ))}
                </select>
              </div>

              {/* File Drag and Drop / Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Upload PDF / Text File
                </label>
                <label className={`flex flex-col items-center justify-center border-2 border-dashed ${isParsingPdf ? 'border-red-400 bg-red-50/50' : 'border-gray-300 hover:border-red-500 bg-slate-50 hover:bg-slate-100'} rounded-xl p-5 cursor-pointer transition-colors`}>
                  {isParsingPdf ? (
                    <>
                      <Loader2 className="w-7 h-7 text-red-600 animate-spin mb-1" />
                      <span className="text-xs text-red-700 font-bold">
                        Extracting & analyzing PDF sections...
                      </span>
                      <span className="text-[10px] text-red-500 mt-0.5">
                        Parsing binary PDF streams via server parser
                      </span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-7 h-7 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-800 font-bold">
                        Click to select SOP file (.pdf, .txt, .md)
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        Native PDF text extraction & automatic section chunking
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileUpload}
                    disabled={isParsingPdf || isUploading}
                    className="hidden"
                  />
                </label>
              </div>

              {/* SOP Raw Text Content */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>SOP Document Content (Plaintext / Extracted PDF) *</span>
                  <span className="text-[10px] text-slate-400">
                    {rawText.length} characters • {rawText.split('\n').length} lines
                  </span>
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste SOP text here with section headers (Health & Safety, Tools & Materials, Procedure, Site Cleanup)..."
                  rows={8}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-xs"
                  required
                />
              </div>

              {/* Status alerts */}
              {uploadSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>{uploadSuccess}</div>
                </div>
              )}

              {uploadError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>{uploadError}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !title.trim() || !rawText.trim()}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Extracting Sections & Generating Vector Chunks...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Publish SOP & Index into pgvector</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Section Splitting Parser Live Preview */}
          {previewSections.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>Section-Aligned Chunking Preview ({previewSections.length} detected chunks)</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  Matches SOP Headings
                </span>
              </div>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {previewSections.map((sec, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-900 mb-1">
                      <span>Chunk {idx + 1}: {sec.label}</span>
                      <span className="text-[10px] text-slate-500 font-mono">vector(1536)</span>
                    </div>
                    <div className="text-[11px] text-slate-600 line-clamp-3 font-mono leading-relaxed">
                      {sec.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Active Library & Indexing Jobs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Recent Indexing Jobs */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Background Indexing Jobs</span>
            </h2>

            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {indexingJobs.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No indexing jobs recorded
                </div>
              ) : (
                indexingJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 truncate max-w-[200px]">
                        {job.document_title || job.document_id}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          job.status === 'done'
                            ? 'bg-emerald-100 text-emerald-800'
                            : job.status === 'processing'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                      <span>Sections: {job.extracted_sections_count ?? 'N/A'}</span>
                      <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                    </div>
                    {job.error && (
                      <div className="mt-1 text-[10px] text-red-700 bg-red-50 p-1.5 rounded border border-red-200">
                        Error: {job.error}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active SOP Documents */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <FileText className="w-4 h-4 text-red-600" />
              <span>Active SOP Documents ({activeDocs.length})</span>
            </h2>

            <div className="space-y-3">
              {activeDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-xs text-slate-900 leading-snug">
                        {doc.title}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                        <span className="font-mono font-bold text-red-600">v{doc.version}</span>
                        <span>•</span>
                        <span>{doc.chunk_count || 4} Section Chunks</span>
                        <span>•</span>
                        <span>Status: <strong className="text-emerald-600 font-bold uppercase">Active</strong></span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleArchiveDoc(doc.id)}
                      className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 transition-colors shrink-0 shadow-xs"
                      title="Archive document (exclude from future retrieval)"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Archived SOP Documents Audit History */}
          {archivedDocs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                <Archive className="w-4 h-4 text-slate-400" />
                <span>Archived SOPs (Audit Trail)</span>
              </h2>
              <div className="space-y-2">
                {archivedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 opacity-80 text-xs"
                  >
                    <div className="font-semibold text-slate-700 truncate">{doc.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      v{doc.version} • Archived from vector search
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
