"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ThemeButton } from "../components/site-header";
import { Skeleton } from "../components/skeletons";
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

  return <main className="app-frame login-frame"><header className="app-header login-header"><Link className="wordmark" href="/" aria-label="Spot"><span className="wordmark-name">SPOT</span><span className="wordmark-mark">/</span></Link><p className="header-context">CAMPUS OPERATIONS / SECURE ACCESS</p><ThemeButton /></header><div className="page-content login-content"><section className="student-intro login-intro"><p className="eyebrow">SPOT / ACCOUNT</p><h1 className="page-title">{mode === "signin" ? "Welcome back" : "Create your account"}</h1><p className="page-lede">Sign in to report facility issues and follow the work through.</p><span className="login-index" aria-hidden="true">CAMPUS / FACILITIES / SERVICE</span></section><section className="facility-section login-panel"><div className="section-heading"><div><p className="eyebrow">SECURE ACCESS</p><h2 className="section-title">{mode === "signin" ? "Sign in" : "Create account"}</h2></div></div><form className="dialog-form" onSubmit={submit}><label className="field-label" htmlFor="email">Email</label><input className="text-input" id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /><label className="field-label" htmlFor="password">Password</label><input className="text-input" id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />{message && <p className="form-error" role="alert">{message}</p>}<button className="button button-primary button-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button></form><button className="text-button login-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Need an account? Sign up" : "Already registered? Sign in"}</button></section></div></main>;
}

export default function LoginPage() { return <Suspense fallback={<main className="app-frame"><div className="page-content access-loading"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" /><div className="access-loading-block"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-description" /><Skeleton className="skeleton-description" /><Skeleton className="skeleton-badge" /></div></div></main>}><LoginForm /></Suspense>; }
