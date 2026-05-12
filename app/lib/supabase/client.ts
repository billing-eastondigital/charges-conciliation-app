import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "https://unogorchezflktiweebg.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
