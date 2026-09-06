import { createClient } from '@supabase/supabase-js';

// Browser-accessible public environment variables
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('xyzcompany'));

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
