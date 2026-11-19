"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Participant = { invoice_number: string; customer_name: string; phone_masked: string; is_drawn: boolean };
type Draw = { id: string; invoice_number: string; created_at: string };
type Tombola = { id: string; name: string; draw_started_at?: string | null };
type PublicStatus = { tombola: Tombola | null; latestDraw: Draw | null };

let publicAudioContext: AudioContext | null = null;
function tone(frequency: number, duration = 0.12, volume = 0.035, type: OscillatorType = "sine") {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    publicAudioContext ??= new AudioContextClass();
    if (publicAudioContext.state === "suspended") void publicAudioContext.resume();
    const oscillator = publicAudioContext.createOscillator();
    const gain = publicAudioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, publicAudioContext.currentTime);
    gain.gain.setValueAtTime(volume, publicAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, publicAudioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(publicAudioContext.destination);
    oscillator.start();
    oscillator.stop(publicAudioContext.currentTime + duration);
  } catch { /* Le suivi public reste disponible si le navigateur bloque le son. */ }
}

function winnerSound() {
  tone(523.25, 0.28, 0.06);
  window.setTimeout(() => tone(659.25, 0.3, 0.06), 150);
  window.setTimeout(() => tone(783.99, 0.5, 0.065), 310);
  window.setTimeout(() => tone(1046.5, 0.65, 0.055), 520);
}

export default function PublicTombola() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [tombola, setTombola] = useState<Tombola | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [previewNumber, setPreviewNumber] = useState("");
  const [winner, setWinner] = useState<Draw | null>(null);
  const [projectionMode, setProjectionMode] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const lastStartedRef = useRef<string | null>(null);
  const lastDrawIdRef = useRef<string | null>(null);
  const soundIntervalRef = useRef<number | null>(null);
  const animationRef = useRef(false);
  const initializedStatusRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/public/data", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les données.");
      setParticipants(payload.participants ?? []);
      setDraws(payload.draws ?? []);
      setTombola(payload.tombola ?? null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally { setLoading(false); }
  }, []);

  const stopSuspense = useCallback(() => {
    if (soundIntervalRef.current !== null) window.clearInterval(soundIntervalRef.current);
    soundIntervalRef.current = null;
  }, []);

  const startSuspense = useCallback(() => {
    if (!soundEnabled) return;
    stopSuspense();
    const notes = [110, 146.83, 164.81, 196, 164.81, 146.83];
    let index = 0;
    tone(82.41, 0.42, 0.045, "triangle");
    soundIntervalRef.current = window.setInterval(() => {
      tone(notes[index % notes.length], 0.2, 0.035, "triangle");
      if (index % 2 === 0) tone(330 + (index % 3) * 55, 0.07, 0.018, "sine");
      index += 1;
    }, 210);
  }, [soundEnabled, stopSuspense]);

  const runPublicAnimation = useCallback(async (status: PublicStatus) => {
    if (animationRef.current) return;
    animationRef.current = true;
    setAnimating(true);
    setWinner(null);
    startSuspense();
    let animationParticipants = participants;
    try {
      const latestDataResponse = await fetch("/api/public/data", { cache: "no-store" });
      if (latestDataResponse.ok) {
        const latestData = await latestDataResponse.json();
        animationParticipants = latestData.participants ?? participants;
        setParticipants(animationParticipants);
        setDraws(latestData.draws ?? []);
      }
    } catch { /* On conserve les participants déjà chargés si l'actualisation échoue. */ }
    const eligible = animationParticipants.filter((participant) => !participant.is_drawn);
    for (let step = 0; step < 30; step += 1) {
      if (eligible.length) {
        const candidate = eligible[Math.floor(Math.random() * eligible.length)];
        setPreviewNumber(candidate.invoice_number);
      }
      if (soundEnabled) tone(320 + Math.min(step * 11, 300), 0.045, 0.018);
      await new Promise((resolve) => window.setTimeout(resolve, 55 + step * 9));
    }
    stopSuspense();
    // Attend le résultat serveur si le tirage a pris un peu plus de temps que l'animation.
    let latest = status.latestDraw;
    for (let attempt = 0; attempt < 12 && (!latest || latest.id === lastDrawIdRef.current); attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const response = await fetch("/api/public/status", { cache: "no-store" });
      if (response.ok) {
        const next = await response.json() as PublicStatus;
        latest = next.latestDraw;
      }
    }
    if (latest && latest.id !== lastDrawIdRef.current) {
      lastDrawIdRef.current = latest.id;
      setWinner(latest);
      setPreviewNumber(latest.invoice_number);
      if (soundEnabled) winnerSound();
      void refresh();
    }
    setAnimating(false);
    animationRef.current = false;
  }, [participants, refresh, soundEnabled, startSuspense, stopSuspense]);

  useEffect(() => {
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(window.location.href)}`);
    void refresh();
    const pollData = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(pollData);
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/public/status", { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json() as PublicStatus;
        if (!alive) return;
        const startedAt = status.tombola?.draw_started_at ?? null;
        if (!initializedStatusRef.current) {
          initializedStatusRef.current = true;
          lastStartedRef.current = startedAt;
          lastDrawIdRef.current = status.latestDraw?.id ?? null;
          // Si la page est ouverte pendant un tirage déjà lancé mais pas encore enregistré,
          // on rejoint l'animation en cours. Sinon, on ne rejoue pas un ancien tirage.
          if (startedAt && (!status.latestDraw || new Date(startedAt).getTime() > new Date(status.latestDraw.created_at).getTime())) {
            lastStartedRef.current = null;
          }
        }
        if (startedAt && startedAt !== lastStartedRef.current) {
          lastStartedRef.current = startedAt;
          void runPublicAnimation(status);
        }
      } catch { /* La prochaine vérification réessaiera automatiquement. */ }
    };
    void checkStatus();
    const pollStatus = window.setInterval(() => void checkStatus(), 500);
    return () => { alive = false; window.clearInterval(pollStatus); };
  }, [runPublicAnimation]);

  useEffect(() => () => stopSuspense(), [stopSuspense]);

  const drawnNumbers = useMemo(() => new Set(draws.map((draw) => draw.invoice_number)), [draws]);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("fr");
    if (!q) return participants;
    return participants.filter((p) => `${p.invoice_number} ${p.customer_name} ${p.phone_masked}`.toLocaleLowerCase("fr").includes(q));
  }, [participants, search]);
  const latestDraws = useMemo(() => [...draws].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [draws]);
  const displayedWinner = winner ?? latestDraws[0] ?? null;
  async function toggleProjection() {
    if (!projectionMode) {
      try { await document.documentElement.requestFullscreen?.(); } catch { /* Le mode écran reste utilisable sans plein écran. */ }
      setProjectionMode(true);
    } else {
      setProjectionMode(false);
      if (document.fullscreenElement) await document.exitFullscreen?.();
    }
  }

  return (
    <main className={`min-h-screen text-[#171717] ${projectionMode ? "bg-black" : "bg-[#f5f5f5]"}`}>
      <header className="border-b-[5px] border-orange-500 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <div><p className="text-xs font-extrabold tracking-[.22em] text-orange-500">FELICITY SOLAR DISTRIBUTION</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{tombola?.name ?? "TOMBOLA FELICITY"}</h1></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => { setSoundEnabled((enabled) => !enabled); if (!soundEnabled) { try { publicAudioContext ??= new AudioContext(); void publicAudioContext.resume(); tone(660, 0.1, 0.02); } catch { /* Audio indisponible sur ce navigateur. */ } } else stopSuspense(); }} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-bold text-white hover:bg-white/10">{soundEnabled ? "🔊 SON ACTIVÉ" : "🔇 ACTIVER LE SON"}</button>
            <button onClick={toggleProjection} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-black text-white hover:bg-orange-600">{projectionMode ? "QUITTER PROJECTION" : "MODE PROJECTION"}</button>
            {!projectionMode && <a href="/admin" className="rounded-lg border border-white/25 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10">ADMIN</a>}
          </div>
        </div>
      </header>

      <div className={`mx-auto max-w-7xl px-4 py-7 sm:px-6 ${projectionMode ? "max-w-none" : ""}`}>
        {error && !projectionMode && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} — Vérifiez la configuration de la connexion à la base de données.</div>}

        <section className={`mb-7 overflow-hidden rounded-3xl bg-black text-white shadow-lg ${projectionMode ? "min-h-[72vh] border border-orange-500/40 p-8 sm:p-14" : "p-6 sm:p-9"}`}>
          <p className="text-xs font-bold tracking-[.25em] text-orange-400">TIRAGE OFFICIEL • EN DIRECT</p>
          <h2 className={`mt-3 font-black ${projectionMode ? "text-center text-3xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>{animating ? "LE HASARD EST EN TRAIN DE DÉCIDER…" : winner ? "FÉLICITATIONS À NOTRE GAGNANT !" : "La chance peut vous sourire !"}</h2>
          {projectionMode ? (
            <div className="flex min-h-[48vh] flex-col items-center justify-center text-center">
              <p className="text-sm font-bold tracking-[.3em] text-orange-300">{animating ? "MÉLANGE DES PARTICIPATIONS" : winner ? "NUMÉRO GAGNANT" : "PROCHAIN TIRAGE"}</p>
              <p className={`my-7 break-all font-black text-orange-500 ${animating ? "animate-pulse text-4xl sm:text-6xl" : "text-4xl sm:text-7xl"}`}>{previewNumber || winner?.invoice_number || "À VOUS DE JOUER !"}</p>
              {displayedWinner && !animating && <p className="text-2xl font-bold">{participants.find((p) => p.invoice_number === displayedWinner.invoice_number)?.customer_name ?? "Félicitations !"}</p>}
              {!animating && !winner && <p className="mt-3 text-white/60">Le tirage sera affiché ici dès son lancement par l'organisateur.</p>}
            </div>
          ) : (
            <>
              {animating && <div className="mt-6 rounded-2xl border border-orange-500/40 bg-white/5 p-5 text-center"><p className="text-xs font-black tracking-[.25em] text-orange-300">MÉLANGE DES PARTICIPATIONS</p><p className="my-3 break-all text-3xl font-black text-orange-400 sm:text-5xl animate-pulse">{previewNumber || "FACT-XXXXXX-XXXX"}</p><p className="text-xs text-white/60">Le numéro gagnant est en cours de sélection…</p></div>}
              {!animating && displayedWinner && <div className="mt-6 rounded-2xl border border-orange-500/40 bg-white/5 p-5 text-center"><p className="text-xs font-black tracking-[.25em] text-orange-300">DERNIER NUMÉRO GAGNANT</p><p className="my-3 break-all text-2xl font-black text-orange-400 sm:text-4xl">{displayedWinner.invoice_number}</p><p className="text-sm font-bold">{participants.find((p) => p.invoice_number === displayedWinner.invoice_number)?.customer_name ?? "Félicitations à notre gagnant !"}</p></div>}
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Retrouvez ici les participations enregistrées et suivez les résultats du tirage au sort Felicity Solar Distribution.</p><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><PublicStat label="PARTICIPATIONS" value={participants.length} /><PublicStat label="NUMÉROS TIRÉS" value={draws.length} /><PublicStat label="ENCORE EN JEU" value={Math.max(0, participants.length - drawnNumbers.size)} /></div>
            </>
          )}
        </section>

        {!projectionMode && <>
          <div className="mb-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
            <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-lg font-black">Résultats du tirage</h3><p className="text-xs text-gray-500">Les numéros gagnants apparaissent ici en direct.</p></div><span className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black tracking-wider text-orange-700">{draws.length} GAGNANT(S)</span></div>
              {loading ? <Empty>Chargement des résultats…</Empty> : latestDraws.length === 0 ? <Empty><span className="text-3xl">🏆</span><br/>Le tirage n&apos;a pas encore commencé.</Empty> : <div className="space-y-3">{latestDraws.map((draw, index) => { const person = participants.find((p) => p.invoice_number === draw.invoice_number); return <div key={draw.id} className="rounded-xl border border-orange-100 bg-orange-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black tracking-widest text-orange-700">GAGNANT N° {latestDraws.length - index}</p><p className="mt-1 break-all text-xl font-black text-orange-600">{draw.invoice_number}</p><p className="mt-2 text-sm font-bold">{person?.customer_name ?? "Client"}</p><p className="text-sm text-gray-600">{person?.phone_masked ?? "Téléphone masqué"}</p></div><span className="text-2xl">🏆</span></div></div>; })}</div>}
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4"><h3 className="text-lg font-black">Liste des participants</h3><p className="text-xs text-gray-500">Chaque facture correspond à une chance au tirage.</p></div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un numéro de tombola ou un nom…" className="mb-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-orange-500" />
              <div className="max-h-[540px] overflow-auto rounded-xl border border-gray-100"><table className="w-full min-w-[490px] text-left text-sm"><thead className="sticky top-0 bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500"><tr><th className="px-3 py-3">N° tombola</th><th className="px-3 py-3">Nom du client</th><th className="px-3 py-3">Téléphone</th><th className="px-3 py-3">Statut</th></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map((p) => { const won = drawnNumbers.has(p.invoice_number) || p.is_drawn; return <tr key={p.invoice_number} className="hover:bg-orange-50/50"><td className="whitespace-nowrap px-3 py-3 font-bold">{p.invoice_number}</td><td className="px-3 py-3">{p.customer_name}</td><td className="whitespace-nowrap px-3 py-3">{p.phone_masked}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${won ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-700"}`}>{won ? "TIRÉ" : "EN JEU"}</span></td></tr>; })}{!loading && filtered.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">Aucun participant trouvé.</td></tr>}</tbody></table></div>
              <p className="mt-3 text-[11px] text-gray-400">{filtered.length} participant(s) affiché(s) sur {participants.length} participation(s).</p>
            </section>
          </div>
          <section className="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-white p-5 text-center shadow-sm sm:flex-row sm:text-left"><div className="rounded-lg bg-white p-2"><img src={qrUrl} alt="QR code pour suivre le tirage public" width={132} height={132} /></div><div><h3 className="text-lg font-black">Suivez le tirage depuis votre téléphone</h3><p className="mt-1 max-w-xl text-sm text-gray-500">Scannez ce QR code pour ouvrir cette page publique. Vous pouvez aussi partager directement le lien de cette page aux participants éloignés.</p><button onClick={() => void navigator.clipboard?.writeText(window.location.href)} className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-xs font-black text-white">COPIER LE LIEN PUBLIC</button></div></section>
          <footer className="py-8 text-center text-xs text-gray-400">FELICITY SOLAR DISTRIBUTION © 2026 — TOMBOLA OFFICIELLE</footer>
        </>}
      </div>
    </main>
  );
}

function PublicStat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/10 bg-white/[.07] p-4"><p className="text-[10px] font-bold tracking-wider text-white/50">{label}</p><p className="mt-1 text-3xl font-black text-orange-400">{value.toLocaleString("fr-FR")}</p></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-xl bg-gray-50 py-12 text-center text-sm text-gray-400">{children}</div>; }
