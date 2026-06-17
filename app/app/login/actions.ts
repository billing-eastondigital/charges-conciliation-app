"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "app-session";

export async function login(formData: FormData) {
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
