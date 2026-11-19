import { NextResponse } from "next/server";
import { getAdminSupabase, isAuthorized } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  try {
    const body = await request.json() as { campaign_id?: string };
    const campaignId = String(body.campaign_id ?? "").trim();
    if (!campaignId) return NextResponse.json({ error: "Aucune tombola active sélectionnée." }, { status: 400 });
    const supabase = getAdminSupabase();
    const startedAt = new Date().toISOString();
    const { data, error } = await supabase.from("tombolas").update({ draw_started_at: startedAt }).eq("id", campaignId).eq("status", "active").select("id,draw_started_at").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Cette tombola n'est plus active." }, { status: 409 });
    return NextResponse.json({ ok: true, draw_started_at: data.draw_started_at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de publier le lancement du tirage." }, { status: 500 });
  }
}
