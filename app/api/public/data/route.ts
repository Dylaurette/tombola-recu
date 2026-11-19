import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
function maskPhone(phone: string) {
  const digits = phone.replace(/\s/g, "");
  if (digits.length <= 4) return "••••";
  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}
export async function GET() {
  try {
    const supabase = getAdminSupabase();
    const { data: activeTombola, error: activeError } = await supabase.from("tombolas").select("id,name").eq("status", "active").maybeSingle();
    if (activeError) throw activeError;
    if (!activeTombola) return NextResponse.json({ tombola: null, participants: [], draws: [] }, { headers: { "Cache-Control": "no-store" } });
    const [{ data: participants, error: participantError }, { data: draws, error: drawError }] = await Promise.all([
      supabase.from("participants").select("invoice_number,customer_name,phone,is_drawn").eq("campaign_id", activeTombola.id).order("invoice_number", { ascending: true }),
      supabase.from("draws").select("id,invoice_number,created_at").eq("campaign_id", activeTombola.id).order("created_at", { ascending: false }),
    ]);
    if (participantError) throw participantError;
    if (drawError) throw drawError;
    const publicParticipants = (participants ?? []).map(({ phone, ...participant }) => ({ ...participant, phone_masked: maskPhone(phone ?? "") }));
    return NextResponse.json({ tombola: activeTombola, participants: publicParticipants, draws: draws ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur de lecture de la base de données." }, { status: 503 });
  }
}
