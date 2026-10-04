"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSpotAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useThemePreference } from "./theme-provider";

export function SiteHeader({ context }: { context?: string }) {
  const pathname = usePathname();
  const { auth } = useSpotAuth();
  const nav = [{ href: "/", label: "Overview", show: true }, { href: "/maintenance", label: "Work queue", show: auth?.role === "MAINTENANCE" || auth?.role === "ADMIN" }, { href: "/admin", label: "Administration", show: auth?.role === "ADMIN" }].filter(item => item.show);
  return <>
    <header className="app-header site-header">
      <Link className="wordmark" href="/" aria-label="Spot home"><span className="wordmark-name">SPOT</span><span className="wordmark-mark">/</span></Link>
      <p className="header-context">{context ?? "CAMPUS OPERATIONS"}</p>
      <nav className="primary-nav" aria-label="Main navigation">
        {nav.map(item => <Link key={item.href} className="primary-nav-link" href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}
      </nav>
      <div className="header-actions">
        <Link className="header-icon-link" href="/settings" aria-label="Settings" title="Settings"><span aria-hidden="true">⌘</span></Link>
        <ThemeButton />
        <details className="account-menu">
          <summary aria-label="Account menu"><span className="account-avatar">{(auth?.user.email?.[0] ?? "S").toUpperCase()}</span><span className="account-email">{auth?.user.email ?? "Account"}</span><span className="account-chevron" aria-hidden="true">⌄</span></summary>
          <div className="account-popover"><p className="account-role">{auth?.role ?? "SPOT ACCOUNT"}</p><Link href="/settings">Personal settings</Link><button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button></div>
        </details>
      </div>
    </header>
    <nav className="mobile-primary-nav" aria-label="Mobile navigation" style={{ gridTemplateColumns: `repeat(${nav.length + 1}, minmax(0, 1fr))` }}>
      {nav.map(item => <Link key={item.href} className="mobile-primary-link" href={item.href} aria-current={pathname === item.href ? "page" : undefined}><span className="mobile-nav-mark" aria-hidden="true">{item.href === "/" ? "⌂" : item.href === "/maintenance" ? "↗" : "▦"}</span><span>{item.label === "Administration" ? "Admin" : item.label === "Work queue" ? "Work" : "Home"}</span></Link>)}
      <Link className="mobile-primary-link" href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}><span className="mobile-nav-mark" aria-hidden="true">⚙</span><span>Settings</span></Link>
    </nav>
  </>;
}

export function ThemeButton() {
  const { preference, setPreference } = useThemePreference();
  const themeLabel = preference === "system" ? "System theme" : `${preference[0].toUpperCase()}${preference.slice(1)} theme`;
  return <button className="header-icon-link theme-cycle" type="button" aria-label={`Theme: ${themeLabel}. Activate to change theme.`} title={themeLabel} onClick={() => setPreference(preference === "system" ? "dark" : preference === "dark" ? "light" : "system")}><span aria-hidden="true">{preference === "dark" ? "◐" : preference === "light" ? "☼" : "◑"}</span></button>;
}
