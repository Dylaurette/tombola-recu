import { NextResponse } from "next/server";
import { getAdminSupabase, isAuthorized } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  try {
    const supabase = getAdminSupabase();
    const [{ data: tombolas, error: tombolaError }, { data: activeTombola, error: activeError }] = await Promise.all([
      supabase.from("tombolas").select("id,name,status,created_at,closed_at").order("created_at", { ascending: false }),
      supabase.from("tombolas").select("id,name,status,created_at").eq("status", "active").maybeSingle(),
    ]);
    if (tombolaError) throw tombolaError;
    if (activeError) throw activeError;
    if (!activeTombola) return NextResponse.json({ tombolas: tombolas ?? [], activeTombola: null, participants: [], draws: [] }, { headers: { "Cache-Control": "no-store, private" } });
    const [{ data: participants, error: participantError }, { data: draws, error: drawError }] = await Promise.all([
      supabase.from("participants").select("invoice_number,customer_name,phone,is_drawn").eq("campaign_id", activeTombola.id).order("invoice_number", { ascending: true }),
      supabase.from("draws").select("id,invoice_number,created_at").eq("campaign_id", activeTombola.id).order("created_at", { ascending: false }),
    ]);
    if (participantError) throw participantError;
    if (drawError) throw drawError;
    return NextResponse.json({ tombolas: tombolas ?? [], activeTombola, participants: participants ?? [], draws: draws ?? [] }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur de lecture de la base de données." }, { status: 503 });
  }
}
