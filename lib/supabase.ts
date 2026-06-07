// lib/supabase.ts
// Supabase client — fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// in .env.local, then run supabase/schema.sql in your Supabase SQL editor.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Phase 1 seed user — replaced by real Clerk user IDs in Phase 2.
export const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

// Safe to use in both server and client components.
// For server-only operations (service role), import supabaseAdmin below instead.
export const supabase = createClient(supabaseUrl, supabaseAnon);

// Service-role client — NEVER import this in client components.
// Only use in API routes and server actions.
export function createAdminClient() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
