import { NextResponse } from "next/server";
import { getAdminSupabase, isAuthorized } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Code administrateur incorrect." }, { status: 401 });
  try {
    const body = await request.json() as { campaign_id?: string; participants?: { invoice_number: string; customer_name: string; phone: string }[] };
    const campaignId = String(body.campaign_id ?? "").trim();
    const participants = body.participants;
    if (!campaignId) return NextResponse.json({ error: "Aucune tombola active sélectionnée." }, { status: 400 });
    if (!Array.isArray(participants) || participants.length === 0) return NextResponse.json({ error: "Aucune participation à importer." }, { status: 400 });
    if (participants.length > 10000) return NextResponse.json({ error: "Le fichier dépasse la limite de 10 000 lignes par import." }, { status: 400 });
    const supabase = getAdminSupabase();
    const { data: campaign, error: campaignError } = await supabase.from("tombolas").select("id").eq("id", campaignId).eq("status", "active").maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return NextResponse.json({ error: "Cette tombola n'est plus active. Actualisez la page." }, { status: 409 });
    const cleaned = participants.map((p) => ({ campaign_id: campaignId, invoice_number: String(p.invoice_number ?? "").trim(), customer_name: String(p.customer_name ?? "").trim(), phone: String(p.phone ?? "").trim() }));
    if (cleaned.some((p) => !p.invoice_number || !p.customer_name || !p.phone)) return NextResponse.json({ error: "Chaque ligne doit avoir un numéro de facture, un nom et un téléphone." }, { status: 400 });
    const keys = cleaned.map((p) => p.invoice_number);
    if (new Set(keys).size !== keys.length) return NextResponse.json({ error: "Le fichier contient des numéros de facture en double." }, { status: 409 });
    const { error } = await supabase.from("participants").upsert(cleaned, { onConflict: "campaign_id,invoice_number", ignoreDuplicates: false });
    if (error) throw error;
    return NextResponse.json({ count: cleaned.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur pendant l'importation." }, { status: 500 });
  }
}
