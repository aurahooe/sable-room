import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const views = ["floor", "desk", "mine"];

function fmtHour(key) {
  if (!key) return "";
  const d = new Date(key);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}

function initials(email) {
  if (!email) return "·";
  return email.slice(0, 1).toUpperCase();
}

export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("floor");
  const [hours, setHours] = useState([]);
  const [publicSlips, setPublicSlips] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState({ title: "", body: "", is_public: false });
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: h }, { data: p }] = await Promise.all([
      supabase.from("sable_hours").select("*").order("created_at", { ascending: false }).limit(24),
      supabase.from("sable_slips").select("*").eq("is_public", true).order("created_at", { ascending: false }).limit(40),
    ]);
    setHours(h || []);
    setPublicSlips(p || []);
    if (session?.user) {
      const { data: m } = await supabase
        .from("sable_slips")
        .select("*")
        .eq("author_id", session.user.id)
        .order("created_at", { ascending: false });
      setMine(m || []);
    } else {
      setMine([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [session?.user?.id]);

  const featured = useMemo(() => {
    const id = hours[0]?.featured_slip_id;
    if (!id) return null;
    return publicSlips.find((s) => s.id === id) || mine.find((s) => s.id === id) || null;
  }, [hours, publicSlips, mine]);

  const nextHour = useMemo(() => {
    const now = new Date(tick);
    const n = new Date(now);
    n.setMinutes(60, 0, 0);
    return Math.max(0, n.getTime() - now.getTime());
  }, [tick]);

  function clock(ms) {
    const s = Math.floor(ms / 1000);
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  async function onAuth(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    const fn =
      authMode === "signup"
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setBusy(false);
    if (error) setNotice(error.message);
    else if (authMode === "signup") setNotice("Check your inbox if confirmation is on. Then sign in.");
    else setNotice("");
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    setView("floor");
  }

  async function saveSlip(e) {
    e.preventDefault();
    if (!session?.user) return;
    setBusy(true);
    setNotice("");
    const wasPublic = draft.is_public;
    const { error } = await supabase.from("sable_slips").insert({
      author_id: session.user.id,
      title: draft.title.trim(),
      body: draft.body.trim(),
      is_public: draft.is_public,
    });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setDraft({ title: "", body: "", is_public: false });
    setNotice(wasPublic ? "Pinned to the floor." : "Saved to your desk.");
    await load();
    setView(wasPublic ? "floor" : "mine");
  }

  async function togglePublic(slip) {
    const { error } = await supabase
      .from("sable_slips")
      .update({ is_public: !slip.is_public })
      .eq("id", slip.id);
    if (error) setNotice(error.message);
    else await load();
  }

  async function removeSlip(slip) {
    if (!window.confirm("Throw this slip out?")) return;
    const { error } = await supabase.from("sable_slips").delete().eq("id", slip.id);
    if (error) setNotice(error.message);
    else await load();
  }

  const current = hours[0];

  return (
    <div className="shell">
      <div className="grain" aria-hidden="true" />
      <header className="top">
        <a className="mark" href="#floor" onClick={() => setView("floor")}>
          <span className="lamp" />
          Sable Room
        </a>
        <nav>
          {views.map((v) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)} type="button">
              {v === "floor" ? "Floor" : v === "desk" ? "Write" : "My slips"}
            </button>
          ))}
        </nav>
        <div className="who">
          <div className="hourglass">
            next hour <b>{clock(nextHour)}</b>
          </div>
          {session?.user ? (
            <>
              <span className="chip">{initials(session.user.email)}</span>
              <button type="button" className="ghost" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <span className="muted">guest</span>
          )}
        </div>
      </header>

      {notice ? <div className="banner">{notice}</div> : null}

      {view === "floor" && (
        <main className="page fade-in">
          <section className="hero">
            <p className="kicker">{current?.kicker || "This hour"}</p>
            <h1>{current?.headline || "The desk is warming up."}</h1>
            <p className="lede">{current?.body}</p>
            <p className="meta">{current ? fmtHour(current.hour_key) : ""}</p>
          </section>
          {featured && (
            <aside className="pin">
              <span>Pinned this hour</span>
              <h2>{featured.title}</h2>
              <p>{featured.body}</p>
            </aside>
          )}
          <section>
            <div className="row-head">
              <h3>On the floor</h3>
              <p>Anything a member marks public hangs here. Private slips stay at their desk.</p>
            </div>
            {loading ? (
              <p className="muted">Lifting the papers…</p>
            ) : publicSlips.length === 0 ? (
              <p className="empty">The floor is empty. Write something and mark it public.</p>
            ) : (
              <ul className="grid">
                {publicSlips.map((s, i) => (
                  <li key={s.id} className="card" style={{ animationDelay: `${i * 40}ms` }}>
                    <h4>{s.title}</h4>
                    <p>{s.body}</p>
                    <time>{new Date(s.created_at).toLocaleDateString()}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {hours.length > 1 && (
            <section className="archive">
              <h3>Earlier hours</h3>
              <ol>
                {hours.slice(1).map((h) => (
                  <li key={h.hour_key}>
                    <strong>{h.headline}</strong>
                    <span>{fmtHour(h.hour_key)}</span>
                    <em>{h.kicker}</em>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </main>
      )}

      {view === "desk" && (
        <main className="page fade-in narrow">
          {!session ? (
            <AuthBox mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={onAuth} busy={busy} />
          ) : (
            <form className="composer" onSubmit={saveSlip}>
              <h1>Write a slip</h1>
              <p className="lede">Keep it private, or hang it on the floor. The hourly desk may pin a public one.</p>
              <label>Title<input required maxLength={140} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="A short name for the slip" /></label>
              <label>Body<textarea required maxLength={8000} rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="What do you want to keep?" /></label>
              <label className="check"><input type="checkbox" checked={draft.is_public} onChange={(e) => setDraft({ ...draft, is_public: e.target.checked })} /> Mark public — show on the floor</label>
              <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save slip"}</button>
            </form>
          )}
        </main>
      )}

      {view === "mine" && (
        <main className="page fade-in narrow">
          {!session ? (
            <AuthBox mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={onAuth} busy={busy} />
          ) : mine.length === 0 ? (
            <p className="empty">No slips yet. Write one at the desk.</p>
          ) : (
            <ul className="stack">
              {mine.map((s) => (
                <li key={s.id} className="card own">
                  <div className="card-top">
                    <h4>{s.title}</h4>
                    <span className={s.is_public ? "tag pub" : "tag"}>{s.is_public ? "public" : "private"}</span>
                  </div>
                  <p>{s.body}</p>
                  <div className="actions">
                    <button type="button" onClick={() => togglePublic(s)}>{s.is_public ? "Make private" : "Make public"}</button>
                    <button type="button" className="danger" onClick={() => removeSlip(s)}>Discard</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      )}

      <footer>
        <p>Sable Room · the desk turns every hour · slips persist in your account</p>
      </footer>
    </div>
  );
}

function AuthBox({ mode, setMode, email, setEmail, password, setPassword, onSubmit, busy }) {
  return (
    <form className="composer auth" onSubmit={onSubmit}>
      <h1>{mode === "signup" ? "Take a key" : "Come in"}</h1>
      <p className="lede">Accounts live in Supabase Auth. Your slips stay with you. Only public slips reach the floor.</p>
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
      <button type="submit" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}</button>
      <button type="button" className="ghost" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
        {mode === "signup" ? "Already have a key? Sign in" : "New here? Create an account"}
      </button>
    </form>
  );
}
