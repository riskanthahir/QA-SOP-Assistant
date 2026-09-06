import { embed, computeCosineSimilarity, generateAnswer, SOPChunk as AISOPChunk, SupportedLanguage } from '../lib/ai.js';
import { SOPDocument, SOPChunk, Chat, Message, IndexingJob, Profile, RateLimitStatus, AnalyticsSummary } from '../src/types.js';

// In-memory data store with realistic initial Dialog Axiata PLC field SOPs
export class SOPStore {
  private profiles: Map<string, Profile> = new Map();
  private documents: Map<string, SOPDocument> = new Map();
  private chunks: Map<string, SOPChunk> = new Map();
  private chats: Map<string, Chat> = new Map();
  private messages: Map<string, Message> = new Map();
  private indexingJobs: Map<string, IndexingJob> = new Map();
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.seedInitialData();
  }

  public async ensureInitialized() {
    await this.initPromise;
  }

  // Pre-seed field officers, engineering admins, and official Dialog Axiata SOPs
  private async seedInitialData() {
    // 1. Profiles
    const officer1: Profile = {
      id: 'usr-officer-01',
      role: 'officer',
      full_name: 'Kasun Bandara (Field Officer - Western North)',
      language: 'en',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    };
    const officer2: Profile = {
      id: 'usr-officer-02',
      role: 'officer',
      full_name: 'Nimali Senanayake (Field Engineer - Central Region)',
      language: 'si',
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    };
    const admin1: Profile = {
      id: 'usr-admin-01',
      role: 'admin',
      full_name: 'Eng. Rohan Jayasuriya (Head of Field Operations & Quality)',
      language: 'en',
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    };

    this.profiles.set(officer1.id, officer1);
    this.profiles.set(officer2.id, officer2);
    this.profiles.set(admin1.id, admin1);

    // 2. Official Dialog Axiata SOP Documents
    const doc1: SOPDocument = {
      id: 'doc-ftth-01',
      title: 'Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing',
      version: '3.2',
      storage_path: 'sops/Dialog_SOP_ENG_FTTH_01_v3.2.pdf',
      status: 'active',
      uploaded_by: admin1.id,
      uploader_name: admin1.full_name,
      uploaded_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    };

    const doc2: SOPDocument = {
      id: 'doc-twr-04',
      title: 'Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites',
      version: '2.1',
      storage_path: 'sops/Dialog_SOP_ENG_TWR_04_v2.1.pdf',
      status: 'active',
      uploaded_by: admin1.id,
      uploader_name: admin1.full_name,
      uploaded_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    };

    const doc3: SOPDocument = {
      id: 'doc-pwr-02',
      title: 'Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance',
      version: '1.8',
      storage_path: 'sops/Dialog_SOP_ENG_PWR_02_v1.8.pdf',
      status: 'active',
      uploaded_by: admin1.id,
      uploader_name: admin1.full_name,
      uploaded_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    };

    const docOld: SOPDocument = {
      id: 'doc-ftth-old',
      title: 'Dialog SOP-ENG-FTTH-01: Fiber Drop Cable Installation & Splicing (Legacy Fast-Connector Edition)',
      version: '2.0',
      storage_path: 'sops/Dialog_SOP_ENG_FTTH_01_v2.0_archived.pdf',
      status: 'archived',
      uploaded_by: admin1.id,
      uploader_name: admin1.full_name,
      uploaded_at: new Date(Date.now() - 120 * 86400000).toISOString(),
    };

    this.documents.set(doc1.id, doc1);
    this.documents.set(doc2.id, doc2);
    this.documents.set(doc3.id, doc3);
    this.documents.set(docOld.id, docOld);

    // 3. Section Chunks for Doc 1 (FTTH)
    const ftthChunks = [
      {
        id: 'chk-ftth-hs',
        document_id: doc1.id,
        section_label: 'Health & Safety',
        content: `Mandatory PPE required: Level-3 dielectric hard hat, safety glasses with side shields, high-visibility vest, and safety boots with composite toe caps.
When working on CEB utility poles, conduct voltage proximity check using non-contact AC detector; ensure minimum 1.2m clearance from low-voltage distribution lines.
Laser Safety: Never look directly into optical fiber connectors, active patch cords, or laser transceiver ports. Invisible infrared radiation (1310nm/1490nm/1550nm Class 1/3B) causes permanent retina burn.
Fiber Shards Hazard: Cleaved optical glass shards must immediately be collected into a sealed puncture-proof disposal bin. Never discard fiber fragments on customer premises floors or lawns.`,
      },
      {
        id: 'chk-ftth-tm',
        document_id: doc1.id,
        section_label: 'Tools & Materials Required',
        content: `Core-alignment optical fusion splicer (Fujikura 70S/90S or Sumitomo Z2C) with calibrated arc power.
High-precision diamond optical fiber cleaver (cleave angle < 0.8 degrees).
Optical Power Meter calibrated to wavelengths 1310nm, 1490nm, and 1550nm.
Dialog approved G.657.A2 bend-insensitive 1-core / 2-core aerial drop cable with FRP strength members.
Drop cable stripper, Miller dual-hole buffer stripper, and Kevlar shears.
Lint-free optical cleaning wipes and 99.8% Electronic Grade Isopropyl Alcohol (IPA).
Heat-shrink splice protection sleeves (45mm / 60mm) and Dialog ONT SC/APC pre-terminated pigtails.`,
      },
      {
        id: 'chk-ftth-proc',
        document_id: doc1.id,
        section_label: 'Procedure',
        content: `Step 1: Anchor aerial drop cable at pole DP (Distribution Point) using tension clamp; maintain minimum 4.5m road crossing clearance and 30mm minimum bending radius.
Step 2: Strip 45mm outer LSZH jacket from drop cable using designated buffer stripper without scoring inner tight buffer.
Step 3: Strip 250um coating down to bare 125um cladding for a length of 30mm. Clean bare fiber with IPA wipe using a single unidirectional stroke.
Step 4: Place clean fiber into precision cleaver; cleave fiber precisely to 10mm cleave length.
Step 5: Insert cleaved drop fiber and ONT pigtail into fusion splicer V-grooves; execute auto-splice. Splice loss must measure 0.03 dB or lower (reject if > 0.05 dB).
Step 6: Center splice sleeve over heating element and shrink for 20 seconds. Store protected sleeve safely inside ONT fiber management tray.
Step 7: Connect SC/APC connector to Optical Power Meter. Verify optical input power is within Dialog spec: -18.0 dBm to -24.0 dBm. If loss exceeds -25.0 dBm, re-clean or re-splice immediately.`,
      },
      {
        id: 'chk-ftth-sc',
        document_id: doc1.id,
        section_label: 'Site Cleanup & Handover',
        content: `Inspect work area for stray optical glass slivers using adhesive tape sweep.
Secure wall entry hole with Dialog approved UV-resistant neoprene wall bushing and outdoor silicone sealant.
Coil excess drop slack neatly inside customer premises enclosure; do not exceed bend limit.
Affix Dialog customer asset barcode on the ONT underside. Complete optical power log in mDialog mobile app and obtain customer digital sign-off.`,
      },
    ];

    // Chunks for Doc 2 (Tower & Antenna)
    const twrChunks = [
      {
        id: 'chk-twr-hs',
        document_id: doc2.id,
        section_label: 'Health & Safety',
        content: `100% tie-off mandatory: Field engineers climbing telecommunication towers must utilize full-body safety harness with dual shock-absorbing lanyards and rope grab fall arrester.
Suspension trauma relief straps must be attached to harness.
Climbing prohibited during adverse weather, thunderstorm warnings, or wind speeds exceeding 40 km/h.
Contact Dialog Network Operations Center (NOC) to inhibit RF transmission on sectors before entering the direct antenna RF radiation aperture zone.`,
      },
      {
        id: 'chk-twr-tm',
        document_id: doc2.id,
        section_label: 'Tools & Materials Required',
        content: `Calibrated digital compass and dual-axis antenna alignment tool (3Z Telecom / Sunsight).
Insulated torque wrenches (10 Nm to 50 Nm capacity).
Cadweld exothermic welding kit or Dialog approved C-crimp grounding connectors.
Fluke 1625-2 earth ground resistance clamp meter.
Tinned copper ground tape 25mm x 3mm and 35mm² green/yellow PVC insulated copper earth conductor.
3M Cold Shrink Weatherproofing Kits for 7/16 DIN and 4.3-10 connector assemblies.`,
      },
      {
        id: 'chk-twr-proc',
        document_id: doc2.id,
        section_label: 'Procedure',
        content: `Step 1: Measure existing site tower earth resistance using 3-pole ground tester. Resistance must be strictly below 5.0 Ohms (Dialog telecom standard).
Step 2: Fasten sector antenna mounting brackets to tower boom. Align azimuth and mechanical tilt according to Dialog RF Planning Work Order with ±0.5 degree precision.
Step 3: Connect RF feeder cables; tighten 4.3-10 connector nuts to specified torque (12 Nm) and 7/16 DIN to (28 Nm) using calibrated torque wrench. Never hand-tighten.
Step 4: Weatherproof all outdoor RF connections using 3-layer method (insulating vinyl tape, butyl mastic tape, and UV-resistant outer vinyl tape) or certified cold-shrink sleeve.
Step 5: Bond antenna mount framework and feeder surge arrestor grounding kits to tower main grounding bar (TMGB) using 35mm² copper conductor with bi-metallic washers.`,
      },
      {
        id: 'chk-twr-sc',
        document_id: doc2.id,
        section_label: 'Site Cleanup & Handover',
        content: `Verify all tools are secured before descending.
Re-lock tower safety climb ladder security gate.
Coordinate with Dialog NOC to lift RF carrier power inhibit and verify VSWR is below 1.2:1 across all active carriers.
Submit antenna alignment photo report with digital timestamp and GPS stamp via Dialog Field Portal.`,
      },
    ];

    // Chunks for Doc 3 (Power & Battery)
    const pwrChunks = [
      {
        id: 'chk-pwr-hs',
        document_id: doc3.id,
        section_label: 'Health & Safety',
        content: `Arc Flash and High Current DC Risk: Battery banks have short-circuit capability in excess of 5000A.
Field officers must remove all metallic wristwatches, rings, belt buckles, and necklaces prior to entering battery compartments.
Wear Class-0 (1000V DC rated) dielectric safety gloves and ANSI approved polycarbonate arc face shield.
Ensure battery room ventilation fan is operational to prevent hydrogen gas accumulation during charge cycles. Keep dry chemical Class-C fire extinguisher at door.`,
      },
      {
        id: 'chk-pwr-tm',
        document_id: doc3.id,
        section_label: 'Tools & Materials Required',
        content: `Fully insulated torque wrench (8 Nm - 15 Nm range).
CAT IV 600V certified Digital Multimeter with calibrated test leads.
Midtronics or Hioki battery conductance and internal resistance tester.
Torque seal tamper indicator lacquer (fluorescent yellow).
Acid neutralizer / baking soda solution and lint-free cotton towels.
Pure copper inter-cell connector busbars with nickel plating.`,
      },
      {
        id: 'chk-pwr-proc',
        document_id: doc3.id,
        section_label: 'Procedure',
        content: `Step 1: Switch OFF rectifier DC load breaker feeding the battery bank under maintenance; verify zero current flow with DC clamp meter.
Step 2: Clean battery cell terminals using dry lint-free wipe. Clean any minor lead-sulfate corrosion with neutralizer paste.
Step 3: Inspect inter-cell links; tighten all terminal bolts to manufacturer torque (12 Nm for M8 brass bolts).
Step 4: Apply yellow torque seal indicator stripe across bolt head and washer to reveal any vibration loosening.
Step 5: Measure individual cell internal conductance and record float voltage (Standard: 2.25V to 2.27V per 2V cell, total string float 54.0V ± 0.2V).
Step 6: Switch ON rectifier breaker. Simulate AC mains fail by opening ATS breaker; observe battery bank voltage under live telecom site load for 15 minutes. Voltage must remain > 49.0V.`,
      },
      {
        id: 'chk-pwr-sc',
        document_id: doc3.id,
        section_label: 'Site Cleanup & Handover',
        content: `Dispose of all chemically contaminated wipes in hazard waste container.
Re-seal battery cabinet doors; confirm thermostat and extraction exhaust fans run automatically.
Record cell conductance data in shelter site logbook. Mark battery bank maintenance sticker with date, next due date, and officer Dialog EPF ID.`,
      },
    ];

    // Embed all chunks and store
    for (const chunk of [...ftthChunks, ...twrChunks, ...pwrChunks]) {
      const vector = await embed(`${chunk.section_label}\n${chunk.content}`);
      const doc = this.documents.get(chunk.document_id);
      this.chunks.set(chunk.id, {
        ...chunk,
        embedding: vector,
        document_title: doc?.title,
        document_version: doc?.version,
      });
    }

    // Seed sample initial chats and messages
    const sampleChat: Chat = {
      id: 'chat-sample-01',
      user_id: officer1.id,
      title: 'FTTH Drop Splicing & Optical Power Loss Limit',
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    };
    this.chats.set(sampleChat.id, sampleChat);

    const msg1: Message = {
      id: 'msg-s01',
      chat_id: sampleChat.id,
      role: 'user',
      content: 'What is the acceptable optical power level at the ONT and what are the mandatory PPE items for drop splicing?',
      citations: [],
      feedback: null,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    };

    const msg2: Message = {
      id: 'msg-s02',
      chat_id: sampleChat.id,
      role: 'assistant',
      content: `### 🛡️ Health & Safety
* Mandatory PPE required: Level-3 dielectric hard hat, safety glasses with side shields, high-visibility vest, and safety boots with composite toe caps.
* Laser Safety: Never look directly into optical fiber connectors or transceiver ports (1310/1490/1550nm invisible laser causes retina damage).
* Cleaved optical glass shards must immediately be collected into a sealed puncture-proof disposal bin.

### 🧰 Tools & Materials Required
* Core-alignment optical fusion splicer and precision diamond cleaver.
* Optical Power Meter calibrated to 1310nm, 1490nm, and 1550nm.
* 99.8% Electronic Grade Isopropyl Alcohol (IPA) with lint-free wipes.
* G.657.A2 bend-insensitive drop cable and 45mm heat-shrink sleeves.

### 📋 Procedure
1. Clean bare fiber with IPA wipe using a single unidirectional stroke.
2. Cleave fiber precisely to 10mm cleave length.
3. Splice loss must measure 0.03 dB or lower (reject if > 0.05 dB).
4. Connect SC/APC connector to Optical Power Meter. Verify optical input power is within Dialog spec: -18.0 dBm to -24.0 dBm. If loss exceeds -25.0 dBm, re-splice immediately.

### 🧹 Site Cleanup & Handover
* Inspect work area for stray optical glass slivers using adhesive tape sweep.
* Secure wall entry hole with Dialog approved UV-resistant neoprene wall bushing.
* Affix Dialog customer asset barcode on the ONT underside.

### 📌 Source SOPs & Sections Used
* "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing" (v3.2) - Section: Health & Safety
* "Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing" (v3.2) - Section: Procedure`,
      citations: [
        {
          documentTitle: doc1.title,
          version: doc1.version,
          sectionLabel: 'Health & Safety',
          excerpt: 'Mandatory PPE required: Level-3 dielectric hard hat, safety glasses with side shields...',
          similarity: 0.89,
        },
        {
          documentTitle: doc1.title,
          version: doc1.version,
          sectionLabel: 'Procedure',
          excerpt: 'Connect SC/APC connector to Optical Power Meter. Verify optical input power is within Dialog spec: -18.0 dBm to -24.0 dBm...',
          similarity: 0.94,
        },
      ],
      feedback: 'up',
      created_at: new Date(Date.now() - 2 * 86400000 + 3000).toISOString(),
    };

    this.messages.set(msg1.id, msg1);
    this.messages.set(msg2.id, msg2);

    // Seed indexing job for initial docs
    const job1: IndexingJob = {
      id: 'job-01',
      document_id: doc1.id,
      document_title: doc1.title,
      status: 'done',
      error: null,
      created_at: doc1.uploaded_at,
      extracted_sections_count: 4,
    };
    const job2: IndexingJob = {
      id: 'job-02',
      document_id: doc2.id,
      document_title: doc2.title,
      status: 'done',
      error: null,
      created_at: doc2.uploaded_at,
      extracted_sections_count: 4,
    };
    const job3: IndexingJob = {
      id: 'job-03',
      document_id: doc3.id,
      document_title: doc3.title,
      status: 'done',
      error: null,
      created_at: doc3.uploaded_at,
      extracted_sections_count: 4,
    };
    this.indexingJobs.set(job1.id, job1);
    this.indexingJobs.set(job2.id, job2);
    this.indexingJobs.set(job3.id, job3);
  }

  // User Profile
  public getProfile(userId: string): Profile | undefined {
    return this.profiles.get(userId);
  }

  public getAllProfiles(): Profile[] {
    return Array.from(this.profiles.values());
  }

  public updateProfileLanguage(userId: string, language: SupportedLanguage): Profile | undefined {
    const p = this.profiles.get(userId);
    if (p) {
      p.language = language;
      p.updated_at = new Date().toISOString();
      this.profiles.set(userId, p);
    }
    return p;
  }

  // Rate Limiting (50 queries / hour per user)
  public checkRateLimit(userId: string, maxPerHour: number = 50): RateLimitStatus {
    const now = Date.now();
    const windowMs = 3600000;
    const entry = this.rateLimits.get(userId);

    if (!entry || now > entry.resetTime) {
      this.rateLimits.set(userId, { count: 1, resetTime: now + windowMs });
      return { allowed: true, used: 1, limit: maxPerHour, resetMinutes: 60 };
    }

    if (entry.count >= maxPerHour) {
      const resetMinutes = Math.max(1, Math.ceil((entry.resetTime - now) / 60000));
      return { allowed: false, used: entry.count, limit: maxPerHour, resetMinutes };
    }

    entry.count += 1;
    this.rateLimits.set(userId, entry);
    const resetMinutes = Math.max(1, Math.ceil((entry.resetTime - now) / 60000));
    return { allowed: true, used: entry.count, limit: maxPerHour, resetMinutes };
  }

  // Chats & Messages
  public getUserChats(userId: string): Chat[] {
    return Array.from(this.chats.values())
      .filter(c => c.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getChat(chatId: string): Chat | undefined {
    return this.chats.get(chatId);
  }

  public createChat(userId: string, title?: string): Chat {
    const chat: Chat = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      title: title || 'New SOP Consultation',
      created_at: new Date().toISOString(),
    };
    this.chats.set(chat.id, chat);
    return chat;
  }

  public getChatMessages(chatId: string): Message[] {
    return Array.from(this.messages.values())
      .filter(m => m.chat_id === chatId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public updateMessageFeedback(messageId: string, feedback: 'up' | 'down' | null, feedbackNotes?: string): Message | undefined {
    const msg = this.messages.get(messageId);
    if (msg) {
      msg.feedback = feedback;
      if (feedbackNotes !== undefined) msg.feedback_notes = feedbackNotes;
      this.messages.set(messageId, msg);
    }
    return msg;
  }

  // Core Retrieval & Question Answering
  public async handleUserQuestion(
    userId: string,
    chatId: string,
    question: string
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    await this.ensureInitialized();
    const profile = this.getProfile(userId);
    const language = profile?.language || 'en';

    // 1. Save user message
    const userMsg: Message = {
      id: `msg-${Date.now()}-u`,
      chat_id: chatId,
      role: 'user',
      content: question,
      citations: [],
      feedback: null,
      created_at: new Date().toISOString(),
    };
    this.messages.set(userMsg.id, userMsg);

    // Update chat title if first message
    const chat = this.chats.get(chatId);
    if (chat && chat.title === 'New SOP Consultation') {
      chat.title = question.length > 50 ? question.substring(0, 47) + '...' : question;
      this.chats.set(chatId, chat);
    }

    // 2. Vector search: embed question
    const queryVector = await embed(question);

    // 3. Query sop_chunks with cosine similarity, ONLY from active documents
    const activeDocIds = new Set(
      Array.from(this.documents.values())
        .filter(d => d.status === 'active')
        .map(d => d.id)
    );

    const scoredChunks: Array<{ chunk: SOPChunk; similarity: number }> = [];

    for (const chunk of this.chunks.values()) {
      if (!activeDocIds.has(chunk.document_id) || !chunk.embedding) continue;
      const sim = computeCosineSimilarity(queryVector, chunk.embedding);
      scoredChunks.push({ chunk, similarity: sim });
    }

    // Sort descending by similarity, take top 6
    scoredChunks.sort((a, b) => b.similarity - a.similarity);
    const top6 = scoredChunks.slice(0, 6);

    // Format chunks for AI generator
    const aiContextChunks: AISOPChunk[] = top6.map(({ chunk, similarity }) => {
      const doc = this.documents.get(chunk.document_id);
      return {
        id: chunk.id,
        documentTitle: doc?.title || 'Dialog Field SOP',
        version: doc?.version || '1.0',
        sectionLabel: chunk.section_label,
        content: chunk.content,
        similarity,
      };
    });

    // 4. Generate answer through swappable lib/ai.ts module
    const answerText = await generateAnswer(question, aiContextChunks, language);

    // 5. Build structured citations
    const isNotFound = answerText.includes('not found in the approved Dialog') ||
      answerText.includes('සොයාගත නොහැක') ||
      answerText.includes('காணப்படவில்லை');

    const citations = isNotFound ? [] : aiContextChunks
      .filter(c => (c.similarity && c.similarity > 0.05) || answerText.includes(c.sectionLabel))
      .map(c => ({
        documentTitle: c.documentTitle,
        version: c.version,
        sectionLabel: c.sectionLabel,
        excerpt: c.content.length > 180 ? c.content.substring(0, 177) + '...' : c.content,
        similarity: Math.round((c.similarity || 0) * 100) / 100,
      }));

    // 6. Save assistant message
    const assistantMsg: Message = {
      id: `msg-${Date.now()}-a`,
      chat_id: chatId,
      role: 'assistant',
      content: answerText,
      citations,
      feedback: null,
      created_at: new Date(Date.now() + 100).toISOString(),
    };
    this.messages.set(assistantMsg.id, assistantMsg);

    return { userMessage: userMsg, assistantMessage: assistantMsg };
  }

  // Document Management & Indexing
  public getDocuments(): SOPDocument[] {
    const list = Array.from(this.documents.values());
    for (const doc of list) {
      doc.chunk_count = Array.from(this.chunks.values()).filter(c => c.document_id === doc.id).length;
    }
    return list.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
  }

  public archiveDocument(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.status = 'archived';
      this.documents.set(documentId, doc);
      return true;
    }
    return false;
  }

  public async uploadAndIndexSOP(
    adminUserId: string,
    title: string,
    version: string,
    rawText: string,
    storagePath: string = 'sops/uploaded_document.pdf',
    archiveOldVersionId?: string
  ): Promise<{ document: SOPDocument; job: IndexingJob }> {
    const admin = this.profiles.get(adminUserId);

    // Archive previous version if requested
    if (archiveOldVersionId) {
      this.archiveDocument(archiveOldVersionId);
    }

    const doc: SOPDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      version,
      storage_path: storagePath,
      status: 'active',
      uploaded_by: adminUserId,
      uploader_name: admin?.full_name || 'Admin',
      uploaded_at: new Date().toISOString(),
    };
    this.documents.set(doc.id, doc);

    const job: IndexingJob = {
      id: `job-${Date.now()}`,
      document_id: doc.id,
      document_title: doc.title,
      status: 'processing',
      error: null,
      created_at: new Date().toISOString(),
    };
    this.indexingJobs.set(job.id, job);

    try {
      // Split text into chunks aligned to the document's own section headings
      const sectionChunks = this.splitBySectionHeadings(rawText);

      for (let i = 0; i < sectionChunks.length; i++) {
        const item = sectionChunks[i];
        const chunkId = `chk-${doc.id}-${i + 1}`;
        const vector = await embed(`${item.section_label}\n${item.content}`);
        this.chunks.set(chunkId, {
          id: chunkId,
          document_id: doc.id,
          section_label: item.section_label,
          content: item.content,
          embedding: vector,
          document_title: doc.title,
          document_version: doc.version,
        });
      }

      job.status = 'done';
      job.extracted_sections_count = sectionChunks.length;
      this.indexingJobs.set(job.id, job);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.message || 'Failed to extract sections or compute vector embeddings';
      this.indexingJobs.set(job.id, job);
    }

    return { document: doc, job };
  }

  // Section-aligned text splitter (not fixed-size)
  public splitBySectionHeadings(rawText: string): Array<{ section_label: string; content: string }> {
    const lines = rawText.split('\n');
    const sections: Array<{ section_label: string; content: string }> = [];

    // Heading patterns: "1. Health & Safety", "Section II: Procedure", "Tools & Materials", "3. Site Cleanup", etc.
    const headingRegex = /^(?:(?:section|\d+[\.\)]|[A-Z][\.\)]|\bI{1,3}\b|\bIV\b|\bV\b)\s*[:\.\-]?\s*)?(health\s*&?\s*safety|tools?\s*&?\s*materials?(?:\s*required)?|procedure|process|steps?|site\s*cleanup(?:\s*&?\s*handover)?|commissioning|inspection|safety\s*guidelines|technical\s*specifications|specifications|troubleshooting|testing\s*&?\s*verification)/i;

    let currentLabel = 'General Information';
    let currentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(headingRegex);

      if (match && trimmed.length < 80) {
        if (currentLines.length > 0) {
          sections.push({
            section_label: currentLabel,
            content: currentLines.join('\n').trim(),
          });
          currentLines = [];
        }
        currentLabel = trimmed;
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      sections.push({
        section_label: currentLabel,
        content: currentLines.join('\n').trim(),
      });
    }

    // Fallback if no specific headings were recognized: chunk by paragraphs
    if (sections.length === 1 && sections[0].content.length > 1500) {
      const paras = rawText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      return paras.map((p, idx) => ({
        section_label: `Section ${idx + 1}`,
        content: p.trim(),
      }));
    }

    return sections.filter(s => s.content.length > 20);
  }

  public getIndexingJobs(): IndexingJob[] {
    return Array.from(this.indexingJobs.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Admin Analytics
  public getAnalytics(): AnalyticsSummary {
    const allMessages = Array.from(this.messages.values());
    const userMessages = allMessages.filter(m => m.role === 'user');
    const assistantMessages = allMessages.filter(m => m.role === 'assistant');

    const totalQueries = userMessages.length;
    const helpfulCount = assistantMessages.filter(m => m.feedback === 'up').length;
    const flaggedCount = assistantMessages.filter(m => m.feedback === 'down').length;

    // Detect messages where AI reported "not found in SOPs"
    const unansweredMessages = assistantMessages.filter(m =>
      m.content.toLowerCase().includes('not found in the approved dialog') ||
      m.content.toLowerCase().includes('සොයාගත නොහැක') ||
      m.content.toLowerCase().includes('காணப்படவில்லை') ||
      m.content.toLowerCase().includes('escalate this query immediately')
    );

    // Group most-asked questions by similarity/keywords
    const questionFrequencies: Map<string, { count: number; category: string; lastAsked: string }> = new Map();

    for (const umsg of userMessages) {
      const q = umsg.content.trim();
      let matchedKey = q;
      let category = 'Installation & General';
      const qLower = q.toLowerCase();

      if (qLower.includes('power') || qLower.includes('loss') || qLower.includes('dbm') || qLower.includes('ont')) {
        matchedKey = 'What is the acceptable optical power level at the ONT?';
        category = 'FTTH / Fiber';
      } else if (qLower.includes('ppe') || qLower.includes('safety') || qLower.includes('glove') || qLower.includes('helmet')) {
        matchedKey = 'What PPE is mandatory before working on utility poles or battery banks?';
        category = 'Health & Safety';
      } else if (qLower.includes('earth') || qLower.includes('ground') || qLower.includes('ohm') || qLower.includes('tower')) {
        matchedKey = 'What is the maximum allowed earth resistance for macro cell sites?';
        category = 'Grounding & Tower';
      } else if (qLower.includes('battery') || qLower.includes('float') || qLower.includes('torque') || qLower.includes('dc')) {
        matchedKey = 'What is the recommended float voltage for 48V battery banks?';
        category = 'DC Power & Rectifier';
      }

      const existing = questionFrequencies.get(matchedKey) || { count: 0, category, lastAsked: umsg.created_at };
      existing.count += 1;
      if (new Date(umsg.created_at) > new Date(existing.lastAsked)) {
        existing.lastAsked = umsg.created_at;
      }
      questionFrequencies.set(matchedKey, existing);
    }

    const mostAskedQuestions = Array.from(questionFrequencies.entries())
      .map(([question, data]) => ({ question, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Detailed flagged-down messages
    const flaggedDownMessages = assistantMessages
      .filter(m => m.feedback === 'down')
      .map(m => {
        const chat = this.chats.get(m.chat_id);
        const officer = chat ? this.profiles.get(chat.user_id) : undefined;
        // Find preceding user question
        const chatMsgs = this.getChatMessages(m.chat_id);
        const idx = chatMsgs.findIndex(cm => cm.id === m.id);
        const prevUserMsg = idx > 0 ? chatMsgs[idx - 1] : null;

        return {
          id: m.id,
          chatId: m.chat_id,
          question: prevUserMsg?.content || 'Officer query',
          answer: m.content,
          citations: m.citations,
          officerName: officer?.full_name || 'Field Officer',
          createdAt: m.created_at,
          feedbackNotes: m.feedback_notes || 'Officer indicated procedure lacked specific site clarity or required escalation.',
        };
      });

    // Unanswered queries where AI reported "not found in SOPs"
    const unansweredQueries = unansweredMessages.map(m => {
      const chat = this.chats.get(m.chat_id);
      const officer = chat ? this.profiles.get(chat.user_id) : undefined;
      const chatMsgs = this.getChatMessages(m.chat_id);
      const idx = chatMsgs.findIndex(cm => cm.id === m.id);
      const prevUserMsg = idx > 0 ? chatMsgs[idx - 1] : null;

      let suggestedDomain = 'FTTH / Fiber';
      const qLow = (prevUserMsg?.content || '').toLowerCase();
      if (qLow.includes('microwave') || qLow.includes('radio') || qLow.includes('odu')) {
        suggestedDomain = 'Microwave Transmission SOP Missing';
      } else if (qLow.includes('generator') || qLow.includes('genset') || qLow.includes('diesel')) {
        suggestedDomain = 'Diesel Genset Maintenance SOP Missing';
      } else if (qLow.includes('5g') || qLow.includes('massive mimo') || qLow.includes('c-band')) {
        suggestedDomain = '5G Massive MIMO Alignment SOP Missing';
      } else {
        suggestedDomain = 'Specialized Field Engineering SOP Needed';
      }

      return {
        id: m.id,
        question: prevUserMsg?.content || 'Unanswered query',
        officerName: officer?.full_name || 'Field Officer',
        createdAt: m.created_at,
        language: officer?.language || 'en',
        suggestedDomain,
      };
    });

    const activeDocumentsCount = Array.from(this.documents.values()).filter(d => d.status === 'active').length;

    return {
      totalQueries,
      helpfulCount,
      flaggedCount,
      unansweredCount: unansweredMessages.length,
      activeDocumentsCount,
      mostAskedQuestions,
      flaggedDownMessages,
      unansweredQueries,
    };
  }
}

// Export singleton instance
export const sopStore = new SOPStore();
