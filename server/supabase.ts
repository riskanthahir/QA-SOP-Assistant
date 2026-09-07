import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export function getResolvedSupabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL
  );
}

export function getResolvedSupabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

export const isSupabaseConfigured = (): boolean => {
  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();
  return Boolean(
    url &&
    key &&
    url.startsWith('http') &&
    !url.includes('xyzcompany')
  );
};

let clientInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (clientInstance) return clientInstance;

  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();

  if (isSupabaseConfigured() && url && key) {
    clientInstance = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return clientInstance;
  }

  throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
}

export function getSupabaseAdminOrNull(): SupabaseClient | null {
  try {
    return isSupabaseConfigured() ? getSupabaseAdmin() : null;
  } catch {
    return null;
  }
}

// Administrative server-side client with full privileges (backward compatibility export)
export const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured() ? getSupabaseAdminOrNull() : null;

