"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AuthGate } from "../components/auth-gate";
import { useSpotAuth, type SpotRole } from "../lib/auth";

type Profile = { id: string; email: string | null; role: SpotRole; created_at: string };

function AdminContent() {
  const { auth } = useSpotAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [counts, setCounts] = useState({ total: 0, open: 0, resolved: 0 });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [{ data: people, error }, { count: total }, { count: open }, { count: resolved }] = await Promise.all([
      supabase.from("profiles").select("id,email,role,created_at").order("created_at", { ascending: false }),
      supabase.from("reports").select("id", { count: "exact", head: true }),
      supabase.from("reports").select("id", { count: "exact", head: true }).in("status", ["SUBMITTED", "ACKNOWLEDGED", "IN_PROGRESS"]),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "RESOLVED"),
    ]);
    if (error) setMessage("Could not load user directory."); else setProfiles((people ?? []) as Profile[]);
    setCounts({ total: total ?? 0, open: open ?? 0, resolved: resolved ?? 0 });
  }, []);
  useEffect(() => { async function initialLoad() { await load(); } void initialLoad(); }, [load]);
  async function changeRole(userId: string, role: SpotRole) {
    setMessage("");
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) setMessage("Role change was denied or could not be saved."); else await load();
  }
  return <main className="app-frame"><header className="app-header"><Link className="wordmark" href="/">SPOT<span className="wordmark-mark">.</span></Link><p className="header-context">ADMINISTRATION</p>{auth && <button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>}</header><div className="page-content"><section className="student-intro"><p className="eyebrow">ADMIN / OVERVIEW</p><h1 className="page-title">Administration</h1><p className="page-lede">Live counts from the current report records. Analytics charts can be added once the operational history is populated.</p></section><div className="maintenance-metrics"><Stat label="Reports" value={counts.total} /><Stat label="Unresolved" value={counts.open} /><Stat label="Resolved" value={counts.resolved} /></div><section className="facility-section"><div className="section-heading"><div><p className="eyebrow">ACCESS MANAGEMENT</p><h2 className="section-title">Users</h2></div><Link className="button button-secondary" href="/maintenance">Maintenance queue</Link></div>{message && <p className="form-error" role="alert">{message}</p>}<div className="queue-list">{profiles.map(profile => <article className="queue-row" key={profile.id}><div className="queue-report-copy"><h3 className="report-title">{profile.email ?? "No email"}</h3><p className="report-location">Joined {new Date(profile.created_at).toLocaleDateString()} · {profile.id.slice(0, 8)}</p></div><label className="field-label">Role <select aria-label={`Role for ${profile.email ?? profile.id}`} className="text-input" value={profile.role} disabled={profile.id === auth?.user.id} onChange={e => void changeRole(profile.id, e.target.value as SpotRole)}><option value="USER">User</option><option value="MAINTENANCE">Maintenance</option><option value="ADMIN">Admin</option></select></label></article>)}</div><p className="page-lede">New accounts start as USER. Bootstrap the first administrator by changing that account’s role in Supabase SQL Editor to ADMIN.</p></section></div></main>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="metric"><span className="metric-label">{label}</span><strong className="metric-value">{value.toString().padStart(2, "0")}</strong></div>; }
export default function AdminPage() { return <AuthGate roles={["ADMIN"]}><AdminContent /></AuthGate>; }
