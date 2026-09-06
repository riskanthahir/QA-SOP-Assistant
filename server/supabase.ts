import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseServiceKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('xyzcompany')
  );
};

// Administrative server-side client with full privileges (lazy / safe initialization)
export const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  }
  return supabaseAdmin;
}