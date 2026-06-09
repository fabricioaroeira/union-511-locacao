// =====================================================================
// Cliente Supabase
// =====================================================================

export const MOCK_MODE = false;

export const SUPABASE_URL = 'https://nqmciizayetxojuthqjp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbWNpaXpheWV0eG9qdXRocWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MDUxMDksImV4cCI6MjA5NDk4MTEwOX0.Aq8FHaZ-JXu-wjKRpnkysgKY1o_9yrUAYJvQEMoCET8';

let _client = null;

export async function getSupabase() {
  if (MOCK_MODE) return null;
  if (_client) return _client;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return _client;
}
