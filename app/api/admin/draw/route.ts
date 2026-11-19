import { NextResponse } from "next/server";
import { getAdminSupabase, isAuthorized } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  let campaignId = "";
  let supabase: ReturnType<typeof getAdminSupabase> | null = null;
  try {
    supabase = getAdminSupabase();
    const body = await request.json() as { campaign_id?: string };
    campaignId = String(body.campaign_id ?? "").trim();
    if (!campaignId) return NextResponse.json({ error: "Aucune tombola active sélectionnée." }, { status: 400 });
    const { data, error } = await supabase.rpc("draw_next_participant", { p_campaign_id: campaignId });
    if (error) throw error;
    const winner = Array.isArray(data) ? data[0] : data;
    if (!winner) {
      await supabase.from("tombolas").update({ draw_started_at: null }).eq("id", campaignId);
      return NextResponse.json({ error: "Il n'y a plus de participation disponible pour le tirage." }, { status: 409 });
    }
    return NextResponse.json({ winner });
  } catch (error) {
    if (campaignId && supabase) await supabase.from("tombolas").update({ draw_started_at: null }).eq("id", campaignId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur pendant le tirage." }, { status: 500 });
  }
}
