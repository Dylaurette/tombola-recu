"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

type Participant = { invoice_number: string; customer_name: string; phone: string; is_drawn: boolean };
type Draw = { id: string; invoice_number: string; created_at: string };
type Tombola = { id: string; name: string; status: "active" | "archived" | "replaced"; created_at: string; closed_at?: string | null };

let audioContext: AudioContext | null = null;
let suspenseInterval: number | null = null;

function playTone(frequency: number, duration = 0.07, volume = 0.035) {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    if (audioContext.state === "suspended") void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Le tirage reste utilisable si le navigateur bloque les sons.
  }
}

function startSuspenseMusic() {
  stopSuspenseMusic();
  const notes = [110, 146.83, 164.81, 196, 164.81, 146.83];
  let index = 0;
  playTone(82.41, 0.42, 0.045);
  suspenseInterval = window.setInterval(() => {
    playTone(notes[index % notes.length], 0.2, 0.035);
    if (index % 2 === 0) playTone(330 + (index % 3) * 55, 0.07, 0.018);
    index += 1;
  }, 210);
}

function stopSuspenseMusic() {
  if (suspenseInterval !== null) window.clearInterval(suspenseInterval);
  suspenseInterval = null;
}

function playWinnerSound() {
  stopSuspenseMusic();
  playTone(523.25, 0.22, 0.055);
  window.setTimeout(() => playTone(659.25, 0.25, 0.055), 130);
  window.setTimeout(() => playTone(783.99, 0.4, 0.06), 270);
  window.setTimeout(() => playTone(1046.5, 0.55, 0.055), 440);
}

export default function AdminDashboard() {
  const [adminCode, setAdminCode] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [tombolas, setTombolas] = useState<Tombola[]>([]);
  const [activeTombola, setActiveTombola] = useState<Tombola | null>(null);
  const [newTombolaName, setNewTombolaName] = useState("");
  const [newTombolaMode, setNewTombolaMode] = useState<"archive" | "replace">("archive");
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [previewParticipant, setPreviewParticipant] = useState<Participant | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [lastWinner, setLastWinner] = useState<Participant | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("felicity-admin-code");
    if (saved) {
      // Restaure la session administrateur depuis sessionStorage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdminCode(saved);
      setAuthenticated(true);
      void loadData(saved);
    }
  }, []);

  async function loadData(code: string) {
    try {
      const response = await fetch("/api/admin/data", {
        cache: "no-store",
        headers: { "x-admin-code": code },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur de chargement");
      setParticipants(data.participants ?? []);
      setDraws(data.draws ?? []);
      setTombolas(data.tombolas ?? []);
      setActiveTombola(data.activeTombola ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!adminCode.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "x-admin-code": adminCode },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Accès refusé.");
      sessionStorage.setItem("felicity-admin-code", adminCode);
      setAuthenticated(true);
      await loadData(adminCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accès refusé.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("felicity-admin-code");
    setAuthenticated(false);
    setAdminCode("");
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
      if (rows.length < 2) throw new Error("Le fichier doit contenir une ligne d'en-tête et au moins un participant.");
      const header = (rows[0] as unknown[]).slice(0, 3).map((v) => String(v ?? "").trim().toLocaleLowerCase("fr"));
      const findCol = (patterns: RegExp[]) => header.findIndex((h) => patterns.some((p) => p.test(h)));
      let invoiceIndex = findCol([/facture/, /tombola/, /re[cç]u/, /num[eé]ro/]);
      let nameIndex = findCol([/^nom/, /client/, /raison sociale/, /participant/]);
      let phoneIndex = findCol([/t[eé]l/, /telephone/, /mobile/, /whatsapp/, /contact/]);
      if (invoiceIndex < 0 || nameIndex < 0 || phoneIndex < 0) {
        invoiceIndex = 0;
        nameIndex = 1;
        phoneIndex = 2;
      }
      const parsed = rows.slice(1).map((row) => {
        const values = row as unknown[];
        return {
          invoice_number: String(values[invoiceIndex] ?? "").trim(),
          customer_name: String(values[nameIndex] ?? "").trim(),
          phone: String(values[phoneIndex] ?? "").trim(),
        };
      }).filter((p) => p.invoice_number || p.customer_name || p.phone);
      if (!parsed.length) throw new Error("Aucune ligne de participant exploitable dans les trois premières colonnes.");
      if (parsed.some((p) => !p.invoice_number || !p.customer_name || !p.phone)) {
        throw new Error("Une ligne contient un numéro de facture, un nom ou un téléphone vide. Corrige-la puis réimporte le fichier.");
      }
      const seen = new Set<string>();
      for (const p of parsed) {
        if (seen.has(p.invoice_number)) throw new Error(`Le numéro ${p.invoice_number} apparaît plusieurs fois dans le fichier.`);
        seen.add(p.invoice_number);
      }
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ campaign_id: activeTombola?.id, participants: parsed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Importation impossible.");
      setFileName(file.name);
      setMessage(`${data.count} participation(s) importée(s) ou actualisée(s) dans « ${activeTombola?.name ?? "la tombola active"} ». Les autres tombolas restent séparées.`);
      await loadData(adminCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de lire le fichier.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function draw() {
    if (busy || animating || remaining === 0) return;
    setBusy(true);
    setAnimating(true);
    setError("");
    setMessage("");
    setLastWinner(null);
    // Prépare le moteur audio pendant le clic utilisateur pour respecter les règles du navigateur.
    playTone(440, 0.06, 0.015);

    const candidates = participants.filter((p) => !p.is_drawn);

    try {
      // Publie d'abord le signal de départ : l'espace public lance alors la même animation.
      const startResponse = await fetch("/api/admin/draw/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ campaign_id: activeTombola?.id }),
      });
      const startData = await startResponse.json();
      if (!startResponse.ok) throw new Error(startData.error || "Impossible de synchroniser le début du tirage.");

      const requestPromise = fetch("/api/admin/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ campaign_id: activeTombola?.id }),
      });
      startSuspenseMusic();
      // Mélange visuel : la sélection réelle reste faite et enregistrée côté serveur.
      for (let step = 0; step < 30; step += 1) {
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        setPreviewParticipant(candidate);
        playTone(330 + Math.min(step * 12, 300), 0.045, 0.025);
        await new Promise((resolve) => window.setTimeout(resolve, 55 + step * 9));
      }

      const response = await requestPromise;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Le tirage a échoué.");
      setLastWinner(data.winner);
      setPreviewParticipant(data.winner);
      playWinnerSound();
      setMessage("Le gagnant a été enregistré et le résultat est publié sur l'espace public.");
      await loadData(adminCode);
    } catch (e) {
      stopSuspenseMusic();
      setError(e instanceof Error ? e.message : "Erreur pendant le tirage.");
    } finally {
      stopSuspenseMusic();
      setAnimating(false);
      setBusy(false);
    }
  }

  async function resetDraw() {
    if (busy) return;
    const confirmed = window.confirm(
      "Confirmer la réinitialisation ? Tous les gagnants et résultats seront effacés et TOUS les participants repasseront en jeu. La liste des participants et leurs coordonnées seront conservées.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ campaign_id: activeTombola?.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La réinitialisation a échoué.");
      setLastWinner(null);
      setPreviewParticipant(null);
      setMessage(`Tirage réinitialisé : ${data.resetCount ?? 0} ancien(s) résultat(s) effacé(s). Tous les participants sont de nouveau en jeu.`);
      await loadData(adminCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur pendant la réinitialisation.");
    } finally {
      setBusy(false);
    }
  }

  async function createTombola() {
    if (busy || !newTombolaName.trim()) return;
    const warning = newTombolaMode === "replace"
      ? "ATTENTION : les participants et résultats de la tombola actuellement active seront définitivement supprimés. Continuer ?"
      : "L'ancienne tombola sera archivée avec ses participants et ses résultats. Créer la nouvelle tombola ?";
    if (!window.confirm(warning)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/tombolas", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ name: newTombolaName.trim(), mode: newTombolaMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de créer la tombola.");
      setNewTombolaName(""); setLastWinner(null); setPreviewParticipant(null); setFileName("");
      setMessage(newTombolaMode === "archive" ? "Nouvelle tombola créée. L'ancienne a été conservée dans l&apos;historique." : "Nouvelle tombola créée. Les données de l&apos;ancienne tombola ont été supprimées.");
      await loadData(adminCode);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur pendant la création."); }
    finally { setBusy(false); }
  }

  function exportParticipants(format: "xlsx" | "csv") {
    if (!participants.length) { setError("Aucun participant à exporter."); return; }
    const rows = participants.map((p) => ({ "N° facture": p.invoice_number, "Nom du client": p.customer_name, "Téléphone": p.phone, "Statut": p.is_drawn ? "TIRÉ" : "EN JEU" }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Participants");
    const base = (activeTombola?.name || "tombola").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
    XLSX.writeFile(workbook, `${base}-participants.${format}`, { bookType: format });
  }

  async function refreshData() { setError(""); await loadData(adminCode); setMessage("Données actualisées depuis Supabase."); }

  const remaining = useMemo(() => participants.filter((p) => !p.is_drawn).length, [participants]);
  const hasDrawHistory = draws.length > 0 || participants.some((p) => p.is_drawn);

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101010] px-4">
        <form onSubmit={login} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
          <p className="text-xs font-black tracking-[.2em] text-orange-600">FELICITY SOLAR DISTRIBUTION</p>
          <h1 className="mt-2 text-2xl font-black">Accès organisateur</h1>
          <p className="mt-2 text-sm text-gray-500">Cette interface est réservée à l&apos;équipe chargée de la tombola.</p>
          <label className="mt-6 block text-xs font-bold text-gray-600">CODE ADMINISTRATEUR</label>
          <input autoFocus type="password" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-orange-500" placeholder="Saisir le code d'accès" />
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-3 font-black text-white hover:bg-orange-600 disabled:opacity-50">{busy ? "VÉRIFICATION…" : "ACCÉDER AU TABLEAU DE BORD"}</button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <Link href="/" className="mt-5 block text-center text-sm text-gray-500 hover:text-orange-600">← Retour à l&apos;espace public</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-gray-900">
      <header className="border-b-[5px] border-orange-500 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div><p className="text-xs font-black tracking-[.2em] text-orange-500">FELICITY SOLAR DISTRIBUTION</p><h1 className="mt-1 text-2xl font-black">ADMINISTRATION TOMBOLA</h1></div>
          <div className="flex gap-2"><Link href="/" target="_blank" rel="noreferrer" className="rounded-lg border border-white/30 px-3 py-2 text-xs font-bold">OUVRIR L’ÉCRAN PUBLIC ↗</Link><button onClick={logout} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">DÉCONNEXION</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Tableau de bord</h2><p className="mt-1 text-sm text-gray-500">Import des participations et gestion des tirages successifs.</p><p className="mt-2 text-sm font-bold text-orange-700">Tombola active : {activeTombola?.name ?? "Aucune tombola"}</p></div><button onClick={refreshData} disabled={busy} className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">↻ Actualiser les données</button></div>
        {(error || message) && <div className={`mb-5 rounded-xl border p-4 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"}`}>{error || message}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-3"><AdminStat label="PARTICIPATIONS" value={participants.length} /><AdminStat label="NUMÉROS DÉJÀ TIRÉS" value={draws.length} /><AdminStat label="NUMÉROS RESTANTS" value={remaining} /></div>

        <section className="mb-6 rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-black">Nouvelle tombola</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">Réutilisez cette application pour une autre campagne. Vous pouvez conserver l&apos;ancienne dans l&apos;historique ou remplacer définitivement ses données.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input value={newTombolaName} onChange={(e) => setNewTombolaName(e.target.value)} placeholder="Nom de la nouvelle tombola" className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-500" />
            <select value={newTombolaMode} onChange={(e) => setNewTombolaMode(e.target.value as "archive" | "replace")} className="rounded-xl border border-gray-200 px-4 py-3 text-sm">
              <option value="archive">Archiver l&apos;ancienne tombola (conserver les résultats)</option>
              <option value="replace">Tout remplacer (supprimer les anciennes données)</option>
            </select>
            <button onClick={createTombola} disabled={busy || !newTombolaName.trim()} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-50">Créer la tombola</button>
          </div>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Historique des tombolas</p>
            {tombolas.length === 0 ? <p className="text-sm text-gray-400">Aucune campagne enregistrée.</p> : <div className="flex flex-wrap gap-2">{tombolas.map((t) => <span key={t.id} className={`rounded-full px-3 py-1.5 text-xs font-bold ${t.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{t.name} — {t.status === "active" ? "ACTIVE" : t.status === "archived" ? "ARCHIVÉE" : "REMPLACÉE"}</span>)}</div>}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black">1. Importer les participants</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">Importer un fichier Excel ou CSV contenant les trois colonnes : <b>N° facture</b>, <b>Nom du client</b>, <b>Numéro de téléphone</b>. Les montants, dates et statuts de paiement ne sont pas utilisés.</p>
            <label className={`mt-5 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 px-5 py-8 text-center text-sm font-black text-orange-700 hover:bg-orange-100 ${busy ? "pointer-events-none opacity-50" : ""}`}>📁 {busy ? "TRAITEMENT EN COURS…" : "CHOISIR UN FICHIER EXCEL / CSV"}<input type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} className="hidden" disabled={busy} /></label>
            {fileName && <p className="mt-3 text-xs text-gray-500">Dernier fichier : {fileName}</p>}
            <p className="mt-3 text-xs text-gray-400">Un numéro de facture = une chance. Seules les trois premières colonnes sont utilisées. Pour une autre campagne, créez d’abord une nouvelle tombola ci-dessus, puis importez son fichier.</p>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black">2. Lancer le tirage</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">Les numéros défilent et ralentissent progressivement. La sélection gagnante est réellement effectuée et enregistrée par Supabase côté serveur.</p>
            <div className="mt-5 rounded-2xl bg-black p-6 text-center text-white">
              <p className="text-xs font-bold tracking-widest text-orange-400">{animating ? "MÉLANGE DES PARTICIPATIONS…" : lastWinner ? "DERNIER NUMÉRO GAGNANT" : "PROCHAIN TIRAGE"}</p>
              <p className={`my-5 break-all text-2xl font-black text-orange-500 ${animating ? "animate-pulse" : ""}`}>{previewParticipant?.invoice_number ?? "FACT-XXXXXX-XXXX"}</p>
              {(lastWinner || animating) && <><p className="font-bold">{previewParticipant?.customer_name ?? "Bonne chance !"}</p>{!animating && lastWinner && <p className="text-sm text-white/60">{lastWinner.phone}</p>}</>}
              {animating && <p className="mt-3 text-xs font-bold tracking-[.25em] text-orange-300">LE HASARD DÉCIDE…</p>}
              <button onClick={draw} disabled={busy || remaining === 0 || !activeTombola} className="mt-5 w-full rounded-xl bg-orange-500 px-5 py-4 font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-600">{animating ? "🎲 MÉLANGE EN COURS…" : remaining === 0 ? "TOUTES LES PARTICIPATIONS SONT TIRÉES" : "🎲 LANCER LE TIRAGE"}</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={resetDraw} disabled={busy || !hasDrawHistory || !activeTombola} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">↻ Réinitialiser le tirage</button>
              <p className="self-center text-xs text-gray-400">Conserve les participants et efface uniquement les gagnants.</p>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">Liste des participations importées</h3><div className="flex gap-2"><button onClick={() => exportParticipants("xlsx")} disabled={!participants.length} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold hover:bg-gray-50 disabled:opacity-40">Exporter Excel</button><button onClick={() => exportParticipants("csv")} disabled={!participants.length} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold hover:bg-gray-50 disabled:opacity-40">Exporter CSV</button></div></div>
          <div className="overflow-auto rounded-xl border border-gray-100"><table className="w-full min-w-[570px] text-left text-sm"><thead className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500"><tr><th className="px-3 py-3">N° tombola / facture</th><th className="px-3 py-3">Nom du client</th><th className="px-3 py-3">Téléphone</th><th className="px-3 py-3">Statut</th></tr></thead><tbody className="divide-y divide-gray-100">{participants.map((p) => <tr key={p.invoice_number}><td className="whitespace-nowrap px-3 py-3 font-bold">{p.invoice_number}</td><td className="px-3 py-3">{p.customer_name}</td><td className="px-3 py-3">{p.phone}</td><td className="px-3 py-3">{p.is_drawn ? <span className="font-bold text-gray-400">TIRÉ</span> : <span className="font-bold text-green-700">EN JEU</span>}</td></tr>)}{participants.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-400">Aucune participation importée pour le moment.</td></tr>}</tbody></table></div>
        </section>
        <footer className="py-8 text-center text-xs text-gray-400">Interface administrateur — Felicity Solar Distribution</footer>
      </div>
    </main>
  );
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border-l-4 border-orange-500 bg-white p-5 shadow-sm"><p className="text-xs font-bold tracking-wide text-gray-500">{label}</p><p className="mt-2 text-3xl font-black">{value.toLocaleString("fr-FR")}</p></div>;
}
