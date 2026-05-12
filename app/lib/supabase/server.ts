import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://unogorchezflktiweebg.supabase.co";
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA";

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components — cookies are read-only there
          }
        },
      },
    }
  );
}
