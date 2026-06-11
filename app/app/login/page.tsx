"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "app-session";

async function login(formData: FormData) {
  "use server";
  const entered = formData.get("password") as string;
  const correct = process.env.APP_PASSWORD;
  const from    = (formData.get("from") as string) || "/";

  if (!correct || entered === correct) {
    const jar = await cookies();
    jar.set(COOKIE, correct ?? "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    redirect(from);
  }

  redirect(`/login?from=${encodeURIComponent(from)}&error=1`);
}

interface Props {
  searchParams: Promise<{ from?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { from = "/", error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
      <div className="bg-white border border-[#dddddd] rounded-sm p-8 w-full max-w-sm">
        <h1 className="text-lg font-semibold text-[#3a3a3a] mb-1">Easton Digital</h1>
        <p className="text-sm text-[#6b7280] mb-6">Enter the access password to continue.</p>

        <form action={login}>
          <input type="hidden" name="from" value={from} />
          <div className="space-y-3">
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              autoFocus
              className="w-full border border-[#dddddd] rounded-sm px-3 py-2 text-sm text-[#3a3a3a] focus:outline-none focus:border-[#0170B9]"
            />
            {error && (
              <p className="text-xs text-red-600">Incorrect password. Try again.</p>
            )}
            <button
              type="submit"
              className="w-full bg-[#0170B9] text-white text-sm font-medium py-2 rounded-sm hover:bg-[#015fa0] transition-colors"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
