"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type SpotRole = "USER" | "MAINTENANCE" | "ADMIN";
type AuthState = { user: User; role: SpotRole } | null;
type AuthContextValue = { auth: AuthState; loading: boolean; refreshRole: () => Promise<void> };
const AuthContext = createContext<AuthContextValue>({ auth: null, loading: true, refreshRole: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function resolve(user: User | null) {
      if (!user) {
        if (alive) { setAuth(null); setLoading(false); }
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (alive) {
        const role = String(data?.role ?? "").toUpperCase();
        setAuth({ user, role: role === "ADMIN" || role === "MAINTENANCE" ? role : "USER" });
        setLoading(false);
      }
    }
    void supabase.auth.getSession().then(({ data }) => resolve(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolve(session?.user ?? null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  const refreshRole = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setAuth(null); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const role = String(profile?.role ?? "").toUpperCase();
    setAuth({ user: data.user, role: role === "ADMIN" || role === "MAINTENANCE" ? role : "USER" });
  };

  return <AuthContext.Provider value={{ auth, loading, refreshRole }}>{children}</AuthContext.Provider>;
}

export function useSpotAuth() { return useContext(AuthContext); }
