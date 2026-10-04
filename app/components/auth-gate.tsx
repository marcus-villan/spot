"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSpotAuth } from "../lib/auth";
import { AccessSkeleton } from "./skeletons";

export function AuthGate({ children, roles }: { children: React.ReactNode; roles?: Array<"USER" | "MAINTENANCE" | "ADMIN"> }) {
  const { auth, loading } = useSpotAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !auth) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!loading && auth && roles && !roles.includes(auth.role)) router.replace("/");
  }, [auth, loading, pathname, roles, router]);
  if (loading || !auth || (roles && !roles.includes(auth.role))) return <AccessSkeleton />;
  return <>{children}</>;
}
