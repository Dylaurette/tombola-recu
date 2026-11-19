import { NextResponse } from "next/server";
import { getAdminSupabase, isAuthorized } from "@/lib/supabase-admin";
export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  try {
    const body = await request.json() as { campaign_id?: string };
    const campaignId = String(body.campaign_id ?? "").trim();
    if (!campaignId) return NextResponse.json({ error: "Aucune tombola active sélectionnée." }, { status: 400 });
    const supabase = getAdminSupabase();
    const { data, error } = await supabase.rpc("reset_draws", { p_campaign_id: campaignId });
    if (error) throw error;
    return NextResponse.json({ ok: true, resetCount: data ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de réinitialiser le tirage." }, { status: 500 });
  }
}
