"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type SpotRealtimeRow = Record<string, unknown>;

type SpotRealtimeHandlers = {
  onReportInsert?: (record: SpotRealtimeRow) => void;
  onReportUpdate?: (record: SpotRealtimeRow) => void;
  onForumUpdateInsert?: (record: SpotRealtimeRow) => void;
  onFacilityInsert?: (record: SpotRealtimeRow) => void;
  onFacilityUpdate?: (record: SpotRealtimeRow) => void;
  onReportActivityInsert?: (record: SpotRealtimeRow) => void;
};

export function useSpotRealtime(
  channelName: string,
  handlers: SpotRealtimeHandlers
) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports" },
        (payload: RealtimePostgresChangesPayload<SpotRealtimeRow>) => {
          if (payload.eventType === "INSERT") {
            handlersRef.current.onReportInsert?.(payload.new);
          } else if (payload.eventType === "UPDATE") {
            handlersRef.current.onReportUpdate?.(payload.new);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_updates" },
        (payload: RealtimePostgresChangesPayload<SpotRealtimeRow>) => {
          handlersRef.current.onForumUpdateInsert?.(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "report_activity" },
        (payload: RealtimePostgresChangesPayload<SpotRealtimeRow>) => {
          handlersRef.current.onReportActivityInsert?.(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "facilities" },
        (payload: RealtimePostgresChangesPayload<SpotRealtimeRow>) => {
          if (payload.eventType === "INSERT") {
            handlersRef.current.onFacilityInsert?.(payload.new);
          } else if (payload.eventType === "UPDATE") {
            handlersRef.current.onFacilityUpdate?.(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName]);
}
