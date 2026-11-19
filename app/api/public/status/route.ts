import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const supabase = getAdminSupabase();
    const { data: tombola, error: tombolaError } = await supabase.from("tombolas").select("id,name,draw_started_at").eq("status", "active").maybeSingle();
    if (tombolaError) throw tombolaError;
    if (!tombola) return NextResponse.json({ tombola: null, latestDraw: null }, { headers: { "Cache-Control": "no-store" } });
    const { data: latestDraw, error: drawError } = await supabase.from("draws").select("id,invoice_number,created_at").eq("campaign_id", tombola.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (drawError) throw drawError;
    return NextResponse.json({ tombola, latestDraw }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur de synchronisation." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
