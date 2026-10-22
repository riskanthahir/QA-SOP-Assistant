import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dns from 'dns';
import { promisify } from 'util';

dotenv.config();

const dnsLookup = promisify(dns.lookup);

export function getResolvedSupabaseUrl(): string | undefined {
  const raw = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL
  );
  if (!raw) return undefined;

  // Clean raw URL: extract clean http(s) URL without accidentally attached env var names or keys
  const match = raw.match(/https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?/);
  if (match) {
    return match[0].trim().replace(/\/+$/, '');
  }
  return raw.trim().replace(/\/+$/, '');
}

export function getResolvedSupabaseKey(): string | undefined {
  const raw = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  );
  if (!raw) return undefined;

  // If multiple keys or tokens were joined, extract the standard JWT token
  const tokenMatch = raw.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  if (tokenMatch) {
    return tokenMatch[0].trim();
  }
  return raw.trim();
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

// Health state management for graceful offline resilience
let isSupabaseHealthy: boolean = isSupabaseConfigured();
let isCheckingHealth: boolean = false;
let lastUnhealthyReason: string | null = null;
let lastCheckTimestamp: number = 0;
const HEALTH_CHECK_COOLDOWN_MS = 60 * 1000; // 60-second cooldown between re-checks when failing

export function isNetworkOrFetchError(err: any): boolean {
  if (!err) return false;
  const str = `${err?.name} ${err?.message} ${err?.code} ${err?.details} ${err?.cause?.code} ${err?.cause?.message} ${JSON.stringify(err)}`;
  return (
    str.includes('ENOTFOUND') ||
    str.includes('fetch failed') ||
    str.includes('ECONNREFUSED') ||
    str.includes('ETIMEDOUT') ||
    str.includes('EAI_AGAIN') ||
    str.includes('AuthRetryableFetchError')
  );
}

export function markSupabaseUnhealthy(err: any) {
  isSupabaseHealthy = false;
  lastCheckTimestamp = Date.now();
  const reason = err?.message || err?.details || String(err || 'Connection error');
  if (lastUnhealthyReason !== reason) {
    lastUnhealthyReason = reason;
    console.log('[Supabase] Host unreachable or offline:', reason);
  }
}

export function markSupabaseHealthy() {
  isSupabaseHealthy = true;
  lastUnhealthyReason = null;
  lastCheckTimestamp = Date.now();
}

export function isSupabaseAvailable(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (!isSupabaseHealthy) {
    if (Date.now() - lastCheckTimestamp >= HEALTH_CHECK_COOLDOWN_MS) {
      // Trigger background reachability probe without blocking caller
      checkSupabaseReachability().catch(() => {});
    }
    return false;
  }
  return true;
}

export async function checkSupabaseReachability(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    isSupabaseHealthy = false;
    return false;
  }

  // If in cooldown period after a recent failure, remain in safe fallback
  if (!isSupabaseHealthy && Date.now() - lastCheckTimestamp < HEALTH_CHECK_COOLDOWN_MS) {
    return false;
  }

  if (isCheckingHealth) return isSupabaseHealthy;
  isCheckingHealth = true;

  try {
    const urlStr = getResolvedSupabaseUrl();
    if (!urlStr) {
      markSupabaseUnhealthy(new Error('Invalid Supabase URL'));
      return false;
    }

    const parsed = new URL(urlStr);

    // 1. Fast DNS pre-flight check
    try {
      await dnsLookup(parsed.hostname);
    } catch (dnsErr: any) {
      markSupabaseUnhealthy(dnsErr);
      return false;
    }

    // 2. Fast HTTP probe with 2.5s timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const probeRes = await fetch(`${urlStr}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          apikey: getResolvedSupabaseKey() || '',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (probeRes.status < 500) {
        markSupabaseHealthy();
        return true;
      }
    } catch (fetchErr: any) {
      clearTimeout(timer);
      markSupabaseUnhealthy(fetchErr);
      return false;
    }

    markSupabaseHealthy();
    return true;
  } catch (err: any) {
    markSupabaseUnhealthy(err);
    return false;
  } finally {
    isCheckingHealth = false;
  }
}

let clientInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const url = getResolvedSupabaseUrl();
  const key = getResolvedSupabaseKey();

  if (url && key) {
    if (!clientInstance) {
      clientInstance = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
    return clientInstance;
  }

  throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
}

export function getSupabaseAdminOrNull(): SupabaseClient | null {
  try {
    return isSupabaseAvailable() ? getSupabaseAdmin() : null;
  } catch {
    return null;
  }
}

// Administrative server-side client with full privileges (backward compatibility export)
export const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured() ? getSupabaseAdminOrNull() : null;
