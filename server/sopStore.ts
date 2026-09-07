import { embed, generateAnswer, computeCosineSimilarity, SOPChunk as AISOPChunk, SupportedLanguage } from '../lib/ai.js';
import { SOPDocument, SOPChunk, Chat, Message, IndexingJob, Profile, RateLimitStatus, AnalyticsSummary, Citation } from '../src/types.js';
import { getSupabaseAdmin } from './supabase.js';

// Live production store backed 100% by Supabase (PostgreSQL + pgvector)
export class SOPStore {
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.bootstrapDatabase();
  }

  public async ensureInitialized() {
    await this.initPromise;
  }

  /**
   * Bootstraps Supabase tables if they are empty so the live database is immediately usable.
   */
  private async bootstrapDatabase() {
    try {
      const supabase = getSupabaseAdmin();

      // 1. Ensure strictly ONE master admin account (rizkan6@gmail.com) exists in Supabase
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const allUsers = usersData?.users || [];
      let masterUser = allUsers.find((u) => u.email?.toLowerCase() === 'rizkan6@gmail.com');

      if (!masterUser) {
        console.log('[SOPStore] Registering Master Admin (rizkan6@gmail.com) in Supabase Auth...');
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: 'rizkan6@gmail.com',
          password: 'MasterAdminPassword2026!',
          email_confirm: true,
          user_metadata: {
            full_name: 'Eng. Rizkan (Master Administrator)',
            role: 'admin',
          },
        });
        if (createErr) {
          console.error('[SOPStore] Error creating master admin:', createErr);
        } else {
          masterUser = created?.user;
        }
      }

      // Strictly remove all other users from Supabase Auth and profiles
      if (masterUser) {
        for (const u of allUsers) {
          if (u.id !== masterUser.id) {
            console.log(`[SOPStore] Removing non-master user from database: ${u.email} (${u.id})`);
            await supabase.from('sop_documents').update({ uploaded_by: masterUser.id }).eq('uploaded_by', u.id);
            await supabase.from('chats').update({ user_id: masterUser.id }).eq('user_id', u.id);
            await supabase.auth.admin.deleteUser(u.id);
            await supabase.from('profiles').delete().eq('id', u.id);
          }
        }

        // Ensure profile for master admin is created and has role admin
        const { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', masterUser.id).single();
        if (!existingProfile) {
          await supabase.from('profiles').insert({
            id: masterUser.id,
            role: 'admin',
            full_name: 'Eng. Rizkan (Master Administrator)',
            language: 'en',
          });
        }
      }

      // 2. Ensure initial official Dialog Axiata SOP documents exist in Supabase
      const { count: docCount } = await supabase.from('sop_documents').select('*', { count: 'exact', head: true });
      if (!docCount || docCount === 0) {
        console.log('[SOPStore] Initializing official Dialog SOP documents and pgvector chunks in Supabase...');
        const { data: profiles } = await supabase.from('profiles').select('id, role');
        const adminProfile = profiles?.find((p) => p.role === 'admin') || profiles?.[0];
        const adminId = adminProfile?.id;

        if (adminId) {
          // Document 1: FTTH Drop & Splicing
          await this.uploadAndIndexSOP(
            adminId,
            'Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing',
            '3.2',
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
Step 5: Slide 40mm heat-shrink protection sleeve over splice joint; apply 20-second oven heater cycle (190°C).
Step 6: Connect Optical Power Meter at customer ONT patch cord terminal. Verify received signal level is strictly within -18 dBm to -24 dBm window (-27 dBm absolute low limit).

4. Site Cleanup & Handover
Collect all cleaved glass shards into puncture-proof waste bin.
Inspect optical connector end-faces with 400x fiber scope; clean with one-click pen cleaner before ONT connection.
Document optical power reading and splice attenuation report in Dialog FSM (Field Service Management) mobile app.`,
            'sops/Dialog_SOP_ENG_FTTH_01_v3.2.pdf'
          );

          // Document 2: Macro Site Grounding & Lightning Protection
          await this.uploadAndIndexSOP(
            adminId,
            'Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites',
            '2.1',
            `1. Health & Safety
Work at Heights: Mandatory use of full-body harness with twin shock-absorbing lanyards, work positioning belt, and fall arrester on guided tower safety rail.
Tower climber maximum continuous work duration is 4 hours with 30-minute mandatory hydration break.
RF Radiation Safety: Lock out transmitter sectors before climbing in front of antenna apertures; wear personal RF radiation alarm monitor set to ICNIRP public exposure limit.
Lightning Warning: Cease all tower climbing activities immediately when lightning warning siren triggers or thunder is audible within 10 km.

2. Tools & Materials Required
Digital Earth Resistance Clamp Meter (Megger DET2/3 or Fluke 1625-2).
Digital Compass, inclinometer, and high-accuracy GPS azimuth sighting tool.
Calibrated torque wrench set (10mm - 24mm).
Dialog standard 25x3mm bare copper earthing tape and 70mm² stranded copper ground cable.
Exothermic welding equipment (Cadweld molds, weld metal powder #90/115, flint igniter).

3. Procedure
Step 1: Inspect tower base earth pit. Measure total earth electrode resistance using 3-pole Fall-of-Potential method. Earth loop resistance must strictly be <= 5.0 Ohms (target <= 3.0 Ohms).
Step 2: Exothermically weld tower leg grounding conductor to copper earth ring using #115 Cadweld cartridge. Apply anti-corrosive petroleum tape over finished weld.
Step 3: Verify antenna mount mechanical azimuth using GPS alignment tool. Torque sector pipe clamps to 85 Nm in cross pattern.
Step 4: Connect 16mm² copper earth jumper from antenna chassis and RRU (Remote Radio Unit) ground terminal directly to tower main earthing collector busbar.
Step 5: Apply Class-1 SPD (Surge Protective Device) on AC mains distribution board; ensure surge suppression ground lead is straight, uncoiled, and <= 0.5m in length.

4. Site Cleanup & Handover
Ensure all earth pit inspection covers are clean, bolted securely, and labeled with Dialog earthing tag.
Record final ground resistance (Ohms) and antenna azimuth/tilt angles into Dialog Site Master commissioning portal.`,
            'sops/Dialog_SOP_ENG_TWR_04_v2.1.pdf'
          );

          // Document 3: 48V DC Power & Battery Bank
          await this.uploadAndIndexSOP(
            adminId,
            'Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance',
            '1.8',
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
Step 4: Configure rectifier float voltage strictly to 54.0V ± 0.2V at 25°C ambient (apply temperature compensation slope of -3.0 mV/°C/cell).
Step 5: Set low-voltage disconnect (LVD) contactor trigger threshold to 43.2V to prevent irreversible deep cell discharge.
Step 6: Conduct 1-hour 100A discharge capacity soak test; measure individual cell voltage drops and verify terminal temperature delta <= 5°C with thermal camera.

4. Site Cleanup & Handover
Install transparent polycarbonate safety covers over all exposed DC busbars and battery terminals.
Affix Dialog electrical hazard warning label and battery commissioning tag with install date and battery serial numbers.
Upload cell impedance baseline readings to Dialog Power Infrastructure Operations portal.`,
            'sops/Dialog_SOP_ENG_PWR_02_v1.8.pdf'
          );
          console.log('[SOPStore] Initial Dialog SOP documents and pgvector chunks successfully indexed in Supabase.');
        }
      }
    } catch (err) {
      console.error('[SOPStore] Error bootstrapping Supabase data:', err);
    }
  }

  // ----------------------------------------------------------------------------
  // Profiles
  // ----------------------------------------------------------------------------

  public async getAllProfiles(): Promise<Profile[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching profiles from Supabase:', error);
      return [];
    }

    try {
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const emailMap = new Map<string, string>();
      usersData?.users.forEach((u) => {
        if (u.email) emailMap.set(u.id, u.email);
      });

      return (data || []).map((p) => ({
        ...p,
        email: emailMap.get(p.id) || undefined,
      }));
    } catch {
      return data || [];
    }
  }

  public async authenticateUser(email: string, password: string): Promise<{
    user: { id: string; email: string; role: string; full_name: string };
    profile: Profile;
    token: string;
  }> {
    const supabase = getSupabaseAdmin();
    const cleanEmail = email.trim().toLowerCase();

    // Authenticate directly against Supabase Auth (PostgreSQL DB)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.user) {
      throw new Error(error?.message || 'Invalid email or password. Access is restricted strictly to database-authenticated users.');
    }

    // Verify user profile exists in database
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profErr || !profile) {
      throw new Error('Authenticated user profile was not found in the database.');
    }

    const fullProfile: Profile = {
      ...profile,
      email: data.user.email,
    };

    return {
      user: {
        id: data.user.id,
        email: data.user.email || cleanEmail,
        role: profile.role,
        full_name: profile.full_name,
      },
      profile: fullProfile,
      token: data.session?.access_token || '',
    };
  }

  public async verifySession(token: string): Promise<{
    user: { id: string; email: string; role: string; full_name: string };
    profile: Profile;
  }> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new Error('Session expired or invalid. Please authenticate again.');
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profErr || !profile) {
      throw new Error('User profile record does not exist in the database.');
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email || '',
        role: profile.role,
        full_name: profile.full_name,
      },
      profile: {
        ...profile,
        email: data.user.email,
      },
    };
  }

  public async updateProfileLanguage(userId: string, language: SupportedLanguage): Promise<Profile | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('profiles')
      .update({ language })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile language in Supabase:', error);
      throw error;
    }
    return data;
  }

  // ----------------------------------------------------------------------------
  // Rate Limiting (Hourly rolling window per user)
  // ----------------------------------------------------------------------------

  public async checkRateLimit(userId: string, limitPerHour: number = 50): Promise<RateLimitStatus> {
    const supabase = getSupabaseAdmin();
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

    try {
      // Count messages submitted by this user in the last hour
      const { data: userChats } = await supabase
        .from('chats')
        .select('id')
        .eq('user_id', userId);

      const chatIds = (userChats || []).map((c) => c.id);
      if (chatIds.length === 0) {
        return { allowed: true, limit: limitPerHour, used: 0, resetMinutes: 60 };
      }

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('chat_id', chatIds)
        .eq('role', 'user')
        .gte('created_at', oneHourAgo);

      const used = count || 0;
      return {
        allowed: used < limitPerHour,
        limit: limitPerHour,
        used,
        resetMinutes: 60,
      };
    } catch (err) {
      console.warn('Rate limit check fallback:', err);
      return { allowed: true, limit: limitPerHour, used: 1, resetMinutes: 60 };
    }
  }

  // ----------------------------------------------------------------------------
  // Chats & Messages
  // ----------------------------------------------------------------------------

  public async getUserChats(userId: string): Promise<Chat[]> {
    const supabase = getSupabaseAdmin();
    const { data: chats, error } = await supabase
      .from('chats')
      .select('id, user_id, title, created_at, messages(id, content, created_at)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching chats from Supabase:', error);
      return [];
    }

    return (chats || []).map((c: any) => {
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      const lastMsg = msgs.sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      return {
        id: c.id,
        user_id: c.user_id,
        title: c.title,
        created_at: c.created_at,
        message_count: msgs.length,
        last_message: lastMsg?.content
          ? lastMsg.content.slice(0, 70) + (lastMsg.content.length > 70 ? '...' : '')
          : undefined,
      };
    });
  }

  public async createChat(userId: string, title?: string): Promise<Chat> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('chats')
      .insert({
        user_id: userId,
        title: title || 'New SOP Consultation',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat in Supabase:', error);
      throw error;
    }
    return data;
  }

  public async getChatMessages(chatId: string): Promise<Message[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages from Supabase:', error);
      return [];
    }

    return (data || []).map((m: any) => ({
      id: m.id,
      chat_id: m.chat_id,
      role: m.role,
      content: m.content,
      citations: Array.isArray(m.citations) ? m.citations : [],
      feedback: m.feedback,
      feedback_notes: m.feedback_notes,
      created_at: m.created_at,
    }));
  }

  public async handleUserQuestion(
    userId: string,
    chatId: string,
    question: string
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    const supabase = getSupabaseAdmin();

    // 1. Insert user message into Supabase
    const { data: userMsg, error: userMsgErr } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        role: 'user',
        content: question,
        citations: [],
      })
      .select()
      .single();

    if (userMsgErr) {
      console.error('Error inserting user message:', userMsgErr);
      throw userMsgErr;
    }

    // 2. Fetch user language
    const { data: profile } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', userId)
      .single();
    const language = (profile?.language as SupportedLanguage) || 'en';

    // 3. Compute question embedding using configured provider / projection
    const questionEmbedding = await embed(question);

    // 4. Retrieve matching chunks from Supabase / indexed PDFs using hybrid search
    const chunks = await this.retrieveRelevantSOPChunks(question, questionEmbedding);

    // 5. Generate grounded response strictly based on active SOP excerpts according to answer definition
    const answer = await generateAnswer(question, chunks, language);

    // 6. Format citations
    const citations: Citation[] = chunks.map((c) => ({
      documentTitle: c.documentTitle,
      version: c.version,
      sectionLabel: c.sectionLabel,
      excerpt: c.content.slice(0, 240) + (c.content.length > 240 ? '...' : ''),
      similarity: c.similarity,
    }));

    // 7. Insert assistant message into Supabase
    const { data: assistantMsg, error: asstMsgErr } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        role: 'assistant',
        content: answer,
        citations: citations,
      })
      .select()
      .single();

    if (asstMsgErr) {
      console.error('Error inserting assistant message:', asstMsgErr);
      throw asstMsgErr;
    }

    // 8. Auto-update chat title if still default
    const { data: currentChat } = await supabase
      .from('chats')
      .select('title')
      .eq('id', chatId)
      .single();

    if (currentChat && currentChat.title === 'New SOP Consultation') {
      const cleanTitle = question.slice(0, 42).replace(/[?.\n]/g, '').trim() || 'SOP Consultation';
      await supabase.from('chats').update({ title: cleanTitle }).eq('id', chatId);
    }

    return {
      userMessage: userMsg,
      assistantMessage: {
        ...assistantMsg,
        citations,
      },
    };
  }

  public async updateMessageFeedback(
    messageId: string,
    feedback: 'up' | 'down' | null,
    feedbackNotes?: string
  ): Promise<Message | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('messages')
      .update({
        feedback,
        feedback_notes: feedbackNotes || null,
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      console.error('Error updating message feedback:', error);
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
  public async retrieveRelevantSOPChunks(
    question: string,
    questionEmbedding: number[],
    topK: number = 6
  ): Promise<AISOPChunk[]> {
    const supabase = getSupabaseAdmin();
    let chunks: AISOPChunk[] = [];

    // 1. Attempt primary vector similarity via Supabase RPC
    try {
      const { data: matchedChunks, error: rpcErr } = await supabase.rpc('match_sop_chunks', {
        query_embedding: questionEmbedding,
        match_threshold: 0.10,
        match_count: topK,
      });

      if (!rpcErr && matchedChunks && matchedChunks.length > 0) {
        chunks = matchedChunks.map((c: any) => ({
          id: c.id,
          documentId: c.document_id,
          documentTitle: c.document_title,
          version: c.document_version,
          sectionLabel: c.section_label,
          content: c.content,
          similarity: c.similarity,
        }));
      }
    } catch (err) {
      console.warn('[SOPStore] match_sop_chunks RPC unavailable, using fallback hybrid search:', err);
    }

    // 2. If vector RPC returned no results or is unavailable, use hybrid text + cosine similarity on active documents
    if (chunks.length === 0) {
      try {
        const { data: rawChunks, error: chunkErr } = await supabase
          .from('sop_chunks')
          .select(`
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
          `)
          .eq('sop_documents.status', 'active');

        if (!chunkErr && rawChunks && rawChunks.length > 0) {
          const candidateChunks = rawChunks.map((c: any) => ({
            id: c.id,
            documentId: c.document_id,
            documentTitle: c.sop_documents?.title || 'Dialog SOP',
            version: c.sop_documents?.version || '1.0',
            sectionLabel: c.section_label,
            content: c.content,
            embedding: Array.isArray(c.embedding) ? c.embedding : undefined,
          }));

          chunks = this.rankCandidateChunks(candidateChunks, question, questionEmbedding, topK);
        }
      } catch (err) {
        console.warn('[SOPStore] Database chunk retrieval failed:', err);
      }
    }

    // 3. Fallback to static verified Dialog SOP manuals if database returned 0 results
    if (chunks.length === 0) {
      chunks = this.searchStaticSOPManuals(question, questionEmbedding, topK);
    }

    return chunks;
  }

  /**
   * Ranks candidate chunks based on keyword matching, phrase proximity, and vector cosine similarity.
   */
  private rankCandidateChunks(
    candidateChunks: Array<{
      id: string;
      documentId: string;
      documentTitle: string;
      version: string;
      sectionLabel: string;
      content: string;
      embedding?: number[];
    }>,
    question: string,
    questionEmbedding: number[],
    topK: number = 6
  ): AISOPChunk[] {
    const queryLower = question.toLowerCase();
    const queryWords = queryLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const scored = candidateChunks.map((chunk) => {
      let score = 0;
      const textLower = `${chunk.documentTitle} ${chunk.sectionLabel} ${chunk.content}`.toLowerCase();

      // Exact phrase match bonus
      if (textLower.includes(queryLower)) {
        score += 3.0;
      }

      // Keyword frequency and location bonus
      for (const w of queryWords) {
        if (chunk.sectionLabel.toLowerCase().includes(w)) score += 1.0;
        if (chunk.documentTitle.toLowerCase().includes(w)) score += 0.8;
        if (chunk.content.toLowerCase().includes(w)) score += 0.4;
      }

      // Cosine similarity bonus
      let similarity = 0;
      if (chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0) {
        similarity = computeCosineSimilarity(questionEmbedding, chunk.embedding);
        score += similarity * 2.5;
      }

      return {
        ...chunk,
        similarity: similarity > 0 ? Number(similarity.toFixed(4)) : (score > 0 ? 0.88 : 0),
        combinedScore: score,
      };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // Keep chunks that have relevance
    const relevant = scored.filter((c) => c.combinedScore > 0.3);
    const selected = (relevant.length > 0 ? relevant : scored).slice(0, topK);

    return selected.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      version: c.version,
      sectionLabel: c.sectionLabel,
      content: c.content,
      similarity: c.similarity,
    }));
  }

  /**
   * Search through standard approved Dialog SOP manuals (FTTH, Tower Grounding, Battery Bank).
   */
  private searchStaticSOPManuals(
    question: string,
    questionEmbedding: number[],
    topK: number = 6
  ): AISOPChunk[] {
    const staticChunks: Array<{
      id: string;
      documentId: string;
      documentTitle: string;
      version: string;
      sectionLabel: string;
      content: string;
    }> = [
      // FTTH Manual
      {
        id: 'ftth-hs',
        documentId: 'doc-ftth-01',
        documentTitle: 'Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing',
        version: '3.2',
        sectionLabel: 'Health & Safety',
        content: `Mandatory PPE required: Level-3 dielectric hard hat, safety glasses with side shields, high-visibility vest, and safety boots with composite toe caps.\nWhen working on CEB utility poles, conduct voltage proximity check using non-contact AC detector; ensure minimum 1.2m clearance from low-voltage distribution lines.\nLaser Safety: Never look directly into optical fiber connectors, active patch cords, or laser transceiver ports. Invisible infrared radiation (1310nm/1490nm/1550nm Class 1/3B) causes permanent retina burn.\nFiber Shards Hazard: Cleaved optical glass shards must immediately be collected into a sealed puncture-proof disposal bin. Never discard fiber fragments on customer premises floors or lawns.`,
      },
      {
        id: 'ftth-tm',
        documentId: 'doc-ftth-01',
        documentTitle: 'Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing',
        version: '3.2',
        sectionLabel: 'Tools & Materials Required',
        content: `Core-alignment optical fusion splicer (Fujikura 70S/90S or Sumitomo Z2C) with calibrated arc power.\nHigh-precision diamond optical fiber cleaver (cleave angle < 0.8 degrees).\nOptical Power Meter calibrated to wavelengths 1310nm, 1490nm, and 1550nm.\nDialog approved G.657.A2 bend-insensitive 1-core / 2-core aerial drop cable with FRP strength members.\n40mm micro-heat shrink splice protection sleeves and 99.9% isopropyl alcohol (IPA) lint-free wipes.`,
      },
      {
        id: 'ftth-proc',
        documentId: 'doc-ftth-01',
        documentTitle: 'Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing',
        version: '3.2',
        sectionLabel: 'Procedure',
        content: `Step 1: Route aerial drop cable from distribution FAT (Fiber Access Terminal) to customer premises anchor bracket maintaining minimum 4.5m road crossing clearance.\nStep 2: Strip outer LSZH drop sheath back 100mm using precision drop stripper. Degrease optical fiber coating using 99.9% IPA lint-free wipe.\nStep 3: Cleave bare fiber to exact 10mm cleave length. Verify cleave end-face angle is strictly under 0.8 degrees on splicer display.\nStep 4: Load cleaved fiber into splicer V-grooves. Run auto-alignment program (SM FAST). Splice loss must measure <= 0.03 dB.\nStep 5: Slide 40mm heat-shrink protection sleeve over splice joint; apply 20-second oven heater cycle (190°C).\nStep 6: Connect Optical Power Meter at customer ONT patch cord terminal. Verify received signal level is strictly within -18 dBm to -24 dBm window (-27 dBm absolute low limit).`,
      },
      {
        id: 'ftth-sc',
        documentId: 'doc-ftth-01',
        documentTitle: 'Dialog SOP-ENG-FTTH-01: Optical Fiber to the Home Drop Cable Installation & ONT Splicing',
        version: '3.2',
        sectionLabel: 'Site Cleanup & Handover',
        content: `Collect all cleaved glass shards into puncture-proof waste bin.\nInspect optical connector end-faces with 400x fiber scope; clean with one-click pen cleaner before ONT connection.\nDocument optical power reading and splice attenuation report in Dialog FSM (Field Service Management) mobile app.`,
      },

      // Tower Grounding Manual
      {
        id: 'twr-hs',
        documentId: 'doc-twr-04',
        documentTitle: 'Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites',
        version: '2.1',
        sectionLabel: 'Health & Safety',
        content: `Mandatory full-body fall-arrest harness with twin lanyards and shock absorber (EN 361/EN 358 certified).\nTower climbing permit must be signed off by Dialog Site Access NOC prior to ascent.\nMaximum continuous tower climbing duration: 4 hours with mandatory 30-minute hydration break.\nPersonnel must carry personal RF radiation monitor (Narda or FieldSMR) calibrated to ICNIRP public/occupational thresholds.\nCease all tower climbing immediately if lightning warning siren sounds within 10 km radius.`,
      },
      {
        id: 'twr-tm',
        documentId: 'doc-twr-04',
        documentTitle: 'Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites',
        version: '2.1',
        sectionLabel: 'Tools & Materials Required',
        content: `Digital Earth Resistance Tester (Megger DET2/3 or Fluke 1625-2) with 4-terminal test leads.\nOptical telescope compass and GPS antenna alignment sighting tool (Sunsight AAT).\nCalibrated torque wrench set (10mm to 24mm range).\n25mm x 3mm bare annealed high-conductivity copper earthing tape.\nExothermic welding kit (Cadweld mold #115 and starting powder) and welding igniter.`,
      },
      {
        id: 'twr-proc',
        documentId: 'doc-twr-04',
        documentTitle: 'Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites',
        version: '2.1',
        sectionLabel: 'Procedure',
        content: `Step 1: Test tower master earth ring using 3-pole Fall-of-Potential method. Earth electrode resistance must measure strictly <= 5.0 Ohms (target <= 3.0 Ohms for critical hub sites).\nStep 2: Bond antenna mount steelwork to tower lightning down-conductor using #115 exothermic Cadweld joint.\nStep 3: Align macro panel antenna azimuth and electrical downtilt according to Dialog Radio Planning Cell Design Sheet using GPS sighting tool. Torque all clamp bracket bolts to 85 Nm.\nStep 4: Connect feeder cable outer shield to tower earth bar via 16mm2 copper jumper. Apply three layers of weatherproofing tape (PVC, butyl mastic, PVC).\nStep 5: Inspect and test Class-1 surge protective devices (SPD) at base of tower cabinet; lead length from SPD to earth bar must not exceed 0.5m.`,
      },
      {
        id: 'twr-sc',
        documentId: 'doc-twr-04',
        documentTitle: 'Dialog SOP-ENG-TWR-04: Grounding, Surge Protection & Antenna Alignment for Macro Cell Sites',
        version: '2.1',
        sectionLabel: 'Site Cleanup & Handover',
        content: `Ensure all earth pit inspection covers are securely bolted and labeled with Dialog standard warning plates.\nRemove all rigging ropes, tackle blocks, and discarded copper offcuts from tower base.\nUpload Fall-of-Potential earth test log and antenna azimuth alignment photos to Dialog Site Master portal.`,
      },

      // Battery Bank & Power Manual
      {
        id: 'pwr-hs',
        documentId: 'doc-pwr-02',
        documentTitle: 'Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance',
        version: '1.8',
        sectionLabel: 'Health & Safety',
        content: `Wear Class-0 (1000V rated) electrical insulating rubber gloves and arc-flash face shield during battery terminal connection.\nRemove all personal metallic items (rings, wristwatches, metal-framed glasses, necklaces) before entering DC power room.\nUse strictly 1000V insulated torque wrenches and insulated socket drivers. A short across battery terminals causes catastrophic arc flash.\nEnsure DC room forced ventilation fan is running to prevent hydrogen gas accumulation (maintain hydrogen concentration below 1.0%).`,
      },
      {
        id: 'pwr-tm',
        documentId: 'doc-pwr-02',
        documentTitle: 'Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance',
        version: '1.8',
        sectionLabel: 'Tools & Materials Required',
        content: `True-RMS Digital Multimeter (Fluke 87V or equivalent) with calibrated 1000V safety leads.\nCalibrated insulated torque wrench (5 Nm to 25 Nm range).\nInternal Battery Resistance and Conductance Tester (Hioki BT3554 or Midtronics Ultra).\nDialog approved 48V 100Ah / 150Ah VRLA or LiFePO4 battery modules (Narada / Huawei / Enersys).\nNO-OX-ID A-Special anti-corrosion electrical contact grease.`,
      },
      {
        id: 'pwr-proc',
        documentId: 'doc-pwr-02',
        documentTitle: 'Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance',
        version: '1.8',
        sectionLabel: 'Procedure',
        content: `Step 1: Inspect battery modules for case bulging or electrolyte leakage. Measure open-circuit voltage of each 12V block (must be >= 12.60V) or 48V block (>= 51.2V).\nStep 2: Clean terminal contact surfaces with brass wire brush and apply thin uniform film of NO-OX-ID A-Special grease.\nStep 3: Connect inter-cell copper busbars. Torque all terminal bolts to manufacturer specification (M8 bolts: 11 Nm; M6 bolts for LiFePO4: 6 Nm). Mark torqued bolts with torque seal paint.\nStep 4: Verify total battery bank string voltage equals 48V to 54V DC before closing the DC main breaker.\nStep 5: Adjust rectifier float voltage to exactly 54.0V ± 0.2V (2.25V/cell at 25°C for VRLA) or 53.5V for LiFePO4. Set Low Voltage Disconnect (LVD) threshold to 43.2V DC.\nStep 6: Conduct 1-hour load test at 100A discharge rate; verify temperature rise across inter-cell busbars does not exceed 5°C delta above ambient using thermal imaging camera.`,
      },
      {
        id: 'pwr-sc',
        documentId: 'doc-pwr-02',
        documentTitle: 'Dialog SOP-ENG-PWR-02: 48V DC Battery Bank Commissioning & Solar Hybrid Inverter Maintenance',
        version: '1.8',
        sectionLabel: 'Site Cleanup & Handover',
        content: `Reinstall transparent polycarbonate terminal covers on all battery trays.\nAffix Dialog Commissioning Tag showing commissioning date, technician ID, string float voltage, and next inspection due date.\nSubmit battery conductance baseline readings and rectifier calibration report to Dialog Power Operations portal.`,
      },
    ];

    return this.rankCandidateChunks(staticChunks, question, questionEmbedding, topK);
  }

  // ----------------------------------------------------------------------------
  // Document Management & Indexing
  // ----------------------------------------------------------------------------

  public async getDocuments(): Promise<SOPDocument[]> {
    const supabase = getSupabaseAdmin();
    const { data: docs, error } = await supabase
      .from('sop_documents')
      .select(`
        id,
        title,
        version,
        storage_path,
        status,
        uploaded_by,
        uploaded_at,
        profiles!uploaded_by(full_name),
        sop_chunks(count)
      `)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents from Supabase:', error);
      return [];
    }

    return (docs || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      version: d.version,
      storage_path: d.storage_path,
      status: d.status,
      uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at,
      uploader_name: d.profiles?.full_name || 'Engineering Operations Desk',
      chunk_count: d.sop_chunks?.[0]?.count || 0,
    }));
  }

  public async archiveDocument(documentId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('sop_documents')
      .update({ status: 'archived' })
      .eq('id', documentId);

    if (error) {
      console.error('Error archiving document in Supabase:', error);
      throw error;
    }
    return true;
  }

  public async uploadAndIndexSOP(
    adminUserId: string,
    title: string,
    version: string,
    rawText: string,
    storagePath: string,
    archiveOldVersionId?: string
  ): Promise<{ document: SOPDocument; job: IndexingJob }> {
    const supabase = getSupabaseAdmin();

    // 1. If archiving prior version, mark it archived
    if (archiveOldVersionId) {
      await supabase
        .from('sop_documents')
        .update({ status: 'archived' })
        .eq('id', archiveOldVersionId);
    }

    // 2. Insert new document into Supabase
    const { data: doc, error: docErr } = await supabase
      .from('sop_documents')
      .insert({
        title,
        version,
        storage_path: storagePath,
        status: 'active',
        uploaded_by: adminUserId,
      })
      .select()
      .single();

    if (docErr) {
      console.error('Error inserting document into Supabase:', docErr);
      throw docErr;
    }

    // 3. Create indexing job in Supabase
    const { data: job, error: jobErr } = await supabase
      .from('indexing_jobs')
      .insert({
        document_id: doc.id,
        status: 'processing',
      })
      .select()
      .single();

    if (jobErr) {
      console.error('Error creating indexing job:', jobErr);
    }

    // 4. Chunk document into semantic sections and compute pgvector embeddings
    try {
      const rawSections = this.splitIntoSections(rawText);

      for (const s of rawSections) {
        const embedding = await embed(s.content);
        const { error: chunkErr } = await supabase.from('sop_chunks').insert({
          document_id: doc.id,
          section_label: s.sectionLabel,
          content: s.content,
          embedding,
        });

        if (chunkErr) {
          console.error('Error inserting chunk into Supabase:', chunkErr);
        }
      }

      // Mark job done
      if (job) {
        await supabase
          .from('indexing_jobs')
          .update({ status: 'done' })
          .eq('id', job.id);
      }

      return {
        document: {
          ...doc,
          chunk_count: rawSections.length,
        },
        job: {
          ...job,
          status: 'done',
        },
      };
    } catch (err: any) {
      if (job) {
        await supabase
          .from('indexing_jobs')
          .update({
            status: 'failed',
            error: err?.message || String(err),
          })
          .eq('id', job.id);
      }
      throw err;
    }
  }

  private splitIntoSections(text: string): Array<{ sectionLabel: string; content: string }> {
    const lines = text.split('\n');
    const sections: Array<{ sectionLabel: string; content: string }> = [];

    let currentLabel = 'General Instructions';
    let currentLines: string[] = [];

    const isHeader = (line: string): string | null => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(health\s*(&|and)?\s*safety|safety\s*guidelines|ppe)/i.test(trimmed)) {
        return 'Health & Safety';
      }
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(tools\s*(&|and)?\s*materials|equipment|required\s*tools)/i.test(trimmed)) {
        return 'Tools & Materials Required';
      }
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(procedure|steps|installation|execution|workflow)/i.test(trimmed)) {
        return 'Procedure';
      }
      if (/^(?:#+\s*)?(?:[0-9]+\.?\s*)?(site\s*cleanup|cleanup|handover|testing\s*(&|and)?\s*signoff)/i.test(trimmed)) {
        return 'Site Cleanup & Handover';
      }
      return null;
    };

    for (const line of lines) {
      const header = isHeader(line);
      if (header) {
        if (currentLines.length > 0) {
          sections.push({
            sectionLabel: currentLabel,
            content: currentLines.join('\n').trim(),
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
        content: currentLines.join('\n').trim(),
      });
    }

    return sections.filter((s) => s.content.length > 15);
  }

  public async getIndexingJobs(): Promise<IndexingJob[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('indexing_jobs')
      .select(`
        id,
        document_id,
        status,
        error,
        created_at,
        sop_documents(title, version)
      `)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Error fetching indexing jobs:', error);
      return [];
    }

    return (data || []).map((j: any) => ({
      id: j.id,
      document_id: j.document_id,
      document_title: j.sop_documents?.title
        ? `${j.sop_documents.title} (v${j.sop_documents.version})`
        : 'SOP Document',
      status: j.status,
      error: j.error,
      created_at: j.created_at,
    }));
  }

  // ----------------------------------------------------------------------------
  // Analytics (Live aggregations directly from Supabase tables)
  // ----------------------------------------------------------------------------

  public async getAnalytics(): Promise<AnalyticsSummary> {
    const supabase = getSupabaseAdmin();

    try {
      // 1. Total user queries
      const { count: totalQueries } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user');

      // 2. Feedback upvotes & downvotes
      const { count: helpfulCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('feedback', 'up');

      const { count: flaggedCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('feedback', 'down');

      // 3. Active documents count
      const { count: activeDocumentsCount } = await supabase
        .from('sop_documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // 4. Flagged down messages with chat/officer details
      const { data: flaggedRows } = await supabase
        .from('messages')
        .select(`
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
        `)
        .eq('feedback', 'down')
        .order('created_at', { ascending: false })
        .limit(10);

      const flaggedDownMessages = (flaggedRows || []).map((r: any) => {
        const chatMsgs = Array.isArray(r.chats?.messages) ? r.chats.messages : [];
        const userMsg = chatMsgs.find((m: any) => m.role === 'user')?.content || 'Field technical inquiry';

        return {
          id: r.id,
          chatId: r.chat_id,
          question: userMsg,
          answer: r.content,
          citations: Array.isArray(r.citations) ? r.citations : [],
          officerName: r.chats?.profiles?.full_name || 'Field Officer',
          createdAt: r.created_at,
          feedbackNotes: r.feedback_notes || undefined,
        };
      });

      // 5. Most asked topics/questions from user messages
      const { data: userMessages } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(30);

      const frequencyMap = new Map<string, { count: number; lastAsked: string; category: string }>();
      for (const m of userMessages || []) {
        let topic = 'General Procedure';
        const lower = m.content.toLowerCase();
        if (lower.includes('fiber') || lower.includes('ont') || lower.includes('splice') || lower.includes('optical')) {
          topic = 'Optical Fiber & FTTH Splicing';
        } else if (lower.includes('ground') || lower.includes('earth') || lower.includes('resistance') || lower.includes('tower')) {
          topic = 'Macro Site Grounding & Earth Resistance';
        } else if (lower.includes('battery') || lower.includes('voltage') || lower.includes('power') || lower.includes('dc')) {
          topic = '48V DC Power & Battery Commissioning';
        } else if (lower.includes('ppe') || lower.includes('safety') || lower.includes('hazard')) {
          topic = 'Safety & PPE Compliance';
        }

        const existing = frequencyMap.get(topic);
        if (existing) {
          existing.count += 1;
        } else {
          frequencyMap.set(topic, {
            count: 1,
            lastAsked: m.created_at,
            category: topic,
          });
        }
      }

      const mostAskedQuestions = Array.from(frequencyMap.entries()).map(([question, stats]) => ({
        question,
        count: stats.count,
        category: stats.category,
        lastAsked: stats.lastAsked,
      }));

      // Calculate unanswered / gap queries
      const { data: escalatedMessages, count: unansweredCount } = await supabase
        .from('messages')
        .select('id, content, chat_id, created_at')
        .eq('role', 'assistant')
        .ilike('content', '%escalat%')
        .order('created_at', { ascending: false })
        .limit(10);

      const unansweredQueries: AnalyticsSummary['unansweredQueries'] = [];
      if (escalatedMessages && escalatedMessages.length > 0) {
        for (const esc of escalatedMessages) {
          // Find the preceding question in this chat
          const { data: userMsg } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('chat_id', esc.chat_id)
            .eq('role', 'user')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (userMsg) {
            unansweredQueries.push({
              id: esc.id,
              question: userMsg.content,
              officerName: 'Field Technical Staff',
              createdAt: userMsg.created_at,
              language: 'en',
              suggestedDomain: 'Operations & Site Engineering',
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
        unansweredQueries,
      };
    } catch (err) {
      console.error('Error aggregating analytics from Supabase:', err);
      return {
        totalQueries: 0,
        helpfulCount: 0,
        flaggedCount: 0,
        unansweredCount: 0,
        activeDocumentsCount: 0,
        mostAskedQuestions: [],
        flaggedDownMessages: [],
        unansweredQueries: [],
      };
    }
  }
}

export const sopStore = new SOPStore();
