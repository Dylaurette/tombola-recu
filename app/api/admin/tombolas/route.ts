import { NextResponse } from "next/server";
import { getAdminSupabase, isAuthorized } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  try {
    const body = await request.json() as { name?: string; mode?: "archive" | "replace" };
    const name = String(body.name ?? "").trim();
    const mode = body.mode;
    if (!name) return NextResponse.json({ error: "Donnez un nom à cette tombola." }, { status: 400 });
    if (mode !== "archive" && mode !== "replace") return NextResponse.json({ error: "Choisissez le mode de création." }, { status: 400 });
    const supabase = getAdminSupabase();
    const { data: id, error } = await supabase.rpc("create_tombola", { p_name: name, p_mode: mode });
    if (error) throw error;
    if (!id) throw new Error("Supabase n'a pas retourné la nouvelle tombola.");
    const { data: tombola, error: readError } = await supabase.from("tombolas").select("id,name,status,created_at").eq("id", id).single();
    if (readError) throw readError;
    return NextResponse.json({ tombola });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de créer la tombola." }, { status: 500 });
  }
}
