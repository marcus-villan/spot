"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "../lib/supabase";
import { useSpotAuth } from "../lib/auth";

function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { auth, loading } = useSpotAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  useEffect(() => { if (!loading && auth) router.replace(destination); }, [auth, destination, loading, router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (mode === "signup" && !result.data.session) setMessage("Check your email to confirm your account, then sign in.");
    else router.replace(destination);
  }

  return <main className="app-frame"><header className="app-header"><span className="wordmark">SPOT<span className="wordmark-mark">.</span></span><p className="header-context">FACILITY OPERATIONS</p></header><div className="page-content"><section className="student-intro"><p className="eyebrow">SECURE ACCESS</p><h1 className="page-title">{mode === "signin" ? "Welcome back" : "Create your account"}</h1><p className="page-lede">Sign in to submit and track facility reports.</p></section><section className="facility-section"><form className="dialog-form" onSubmit={submit}><label className="field-label" htmlFor="email">Email</label><input className="text-input" id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /><label className="field-label" htmlFor="password">Password</label><input className="text-input" id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />{message && <p className="form-error" role="alert">{message}</p>}<button className="button button-primary button-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button></form><button className="text-button" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Need an account? Sign up" : "Already registered? Sign in"}</button></section></div></main>;
}

export default function LoginPage() { return <Suspense fallback={<p className="list-state">Loading…</p>}><LoginForm /></Suspense>; }
