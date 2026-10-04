"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AuthGate } from "../components/auth-gate";
import { SiteHeader } from "../components/site-header";
import { useThemePreference, type ThemePreference } from "../components/theme-provider";
import { useSpotAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { DEFAULT_PREFERENCES, readUiPreferences, saveUiPreferences, subscribeUiPreferences, type UiPreferences } from "../lib/ui-preferences";

function SettingsContent() {
  const { auth } = useSpotAuth();
  const { preference, setPreference } = useThemePreference();
  const preferences = useSyncExternalStore(subscribeUiPreferences, readUiPreferences, () => DEFAULT_PREFERENCES);

  useEffect(() => {
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.dataset.motion = preferences.reduceMotion ? "reduce" : "full";
  }, [preferences]);

  function updatePreferences(next: UiPreferences) {
    document.documentElement.dataset.density = next.density;
    document.documentElement.dataset.motion = next.reduceMotion ? "reduce" : "full";
    saveUiPreferences(next);
  }

  const accountName = String(auth?.user.user_metadata?.full_name ?? auth?.user.user_metadata?.name ?? "").trim();
  const authProvider = String(auth?.user.app_metadata?.provider ?? "email").replaceAll("_", " ");

  return <main className="app-frame settings-frame"><SiteHeader context="PERSONAL SETTINGS" /><div className="page-content settings-content">
    <section className="settings-intro"><p className="eyebrow">YOUR WORKSPACE / SETTINGS</p><h1 className="page-title">Make Spot yours.</h1><p className="page-lede">Personal account details and interface preferences for this device.</p></section>
    <div className="settings-layout"><nav className="settings-index" aria-label="Settings sections"><a href="#account">Account</a><a href="#security">Security</a><a href="#appearance">Appearance</a><a href="#preferences">Preferences</a></nav>
      <div className="settings-sections">
        <section className="settings-section" id="account"><div className="settings-section-heading"><p className="eyebrow">01 / IDENTITY</p><h2 className="section-title">Account</h2><p>Your Spot account information.</p></div><dl className="settings-details">{accountName && <><dt>Name</dt><dd>{accountName}</dd></>}<dt>Email</dt><dd>{auth?.user.email ?? "Not available"}</dd><dt>Access level</dt><dd>{auth?.role}</dd><dt>Member since</dt><dd>{auth?.user.created_at ? new Date(auth.user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not available"}</dd></dl></section>
        <section className="settings-section" id="security"><div className="settings-section-heading"><p className="eyebrow">02 / ACCESS</p><h2 className="section-title">Security</h2><p>Authentication is managed by your Spot sign-in provider.</p></div><div className="settings-row"><div><strong>Sign-in method</strong><p>{authProvider}</p></div><span className="settings-static-badge">ACTIVE</span></div><div className="settings-row"><div><strong>Current session</strong><p>Signed in as {auth?.user.email}</p></div><button className="button button-secondary" type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></section>
        <section className="settings-section" id="appearance"><div className="settings-section-heading"><p className="eyebrow">03 / DISPLAY</p><h2 className="section-title">Appearance</h2><p>Choose a theme. System follows your device setting.</p></div><div className="theme-options" role="radiogroup" aria-label="Color theme">{(["light", "dark", "system"] as ThemePreference[]).map(option => <button key={option} type="button" className={`theme-option${preference === option ? " is-selected" : ""}`} role="radio" aria-checked={preference === option} onClick={() => setPreference(option)}><span className={`theme-preview theme-preview-${option}`} aria-hidden="true"><i /><i /><i /></span><span>{option[0].toUpperCase() + option.slice(1)}</span><span className="theme-option-check" aria-hidden="true">{preference === option ? "✓" : ""}</span></button>)}</div></section>
        <section className="settings-section" id="preferences"><div className="settings-section-heading"><p className="eyebrow">04 / COMFORT</p><h2 className="section-title">Preferences</h2><p>These preferences are saved in this browser.</p></div><><div className="settings-row"><div><strong>Information density</strong><p>Adjust the spacing in work lists.</p></div><select className="text-input settings-select" aria-label="Information density" value={preferences.density} onChange={event => updatePreferences({ ...preferences, density: event.target.value === "compact" ? "compact" : "comfortable" })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div><div className="settings-row"><div><strong>Reduce motion</strong><p>Limit nonessential interface transitions.</p></div><label className="switch-control"><input type="checkbox" checked={preferences.reduceMotion} onChange={event => updatePreferences({ ...preferences, reduceMotion: event.target.checked })} /><span aria-hidden="true" /><span className="sr-only">Reduce motion</span></label></div></></section>
        {auth?.role === "ADMIN" && <section className="settings-section settings-admin-links"><div className="settings-section-heading"><p className="eyebrow">ADMINISTRATOR</p><h2 className="section-title">Administration shortcuts</h2><p>Open existing operational tools.</p></div><div className="settings-shortcuts"><a href="/admin">Analytics &amp; user roles <span aria-hidden="true">↗</span></a><a href="/maintenance">Facilities &amp; work queue <span aria-hidden="true">↗</span></a></div></section>}
      </div>
    </div>
  </div></main>;
}

export default function SettingsPage() { return <AuthGate><SettingsContent /></AuthGate>; }
