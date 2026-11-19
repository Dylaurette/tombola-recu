import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/supabase-admin";
export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
