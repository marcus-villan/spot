"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { useSpotRealtime, type SpotRealtimeRow } from "../lib/spot-realtime";

type ReportStatus = "Pending" | "In Progress" | "Resolved" | "Archived";

type Report = {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  facilities: { name: string; room: string };
};

type PendingUpdate = {
  id: string;
  status: ReportStatus;
  title: string;
  facilityName: string;
  room: string;
};

type ForumUpdate = {
  id: string;
  report_id: string;
  message: string;
  created_at: string;
};

function mergeReports(current: Report[], incoming: Report[]) {
  const byId = new Map(
    incoming.filter((report) => report.status !== "Archived").map((report) => [report.id, report])
  );
  for (const report of current) {
    if (report.status === "Archived") continue;
    const fetched = byId.get(report.id);
    if (!fetched || Date.parse(report.updated_at) > Date.parse(fetched.updated_at)) {
      byId.set(report.id, report);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

function mergeForumUpdates(current: ForumUpdate[], incoming: ForumUpdate[]) {
  const byId = new Map(incoming.map((update) => [update.id, update]));
  for (const update of current) {
    if (!byId.has(update.id)) byId.set(update.id, update);
  }
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

async function fetchUpdatesForReports(reportIds: string[]) {
  if (reportIds.length === 0) {
    return { updates: [] as ForumUpdate[], hasError: false };
  }

  const { data, error } = await supabase
    .from("forum_updates")
    .select("id, report_id, message, created_at")
    .in("report_id", reportIds)
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    updates: !error && data ? (data as ForumUpdate[]) : null,
    hasError: Boolean(error),
  };
}

export default function MaintenancePage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [updateReport, setUpdateReport] = useState<Report | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [postUpdateError, setPostUpdateError] = useState("");
  const [updatesByReportId, setUpdatesByReportId] = useState<Record<string, ForumUpdate[]>>({});
  const [updatesLoadError, setUpdatesLoadError] = useState(false);
  const archivedReportIdsRef = useRef(new Set<string>());

  async function fetchReports() {
    const { data, error } = await supabase
      .from("reports")
      .select("id, title, description, status, created_at, updated_at, facilities(name, room)")
      .neq("status", "Archived")
      .order("created_at", { ascending: false });

    return {
      reports: !error && data ? (data as unknown as Report[]) : null,
      hasError: Boolean(error),
    };
  }

  const loadUpdatesForReports = useCallback(async (reportIds: string[]) => {
    try {
      const result = await fetchUpdatesForReports(reportIds);
      setUpdatesLoadError(result.hasError);
      if (!result.updates) return;

      const grouped = result.updates.reduce<Record<string, ForumUpdate[]>>((groups, update) => {
        groups[update.report_id] ??= [];
        groups[update.report_id].push(update);
        return groups;
      }, {});

      setUpdatesByReportId((current) => {
        const merged = { ...current };
        for (const [reportId, updates] of Object.entries(grouped)) {
          if (!archivedReportIdsRef.current.has(reportId)) {
            merged[reportId] = mergeForumUpdates(current[reportId] ?? [], updates);
          }
        }
        return merged;
      });
    } catch {
      setUpdatesLoadError(true);
    }
  }, []);

  async function loadUpdatesForReport(reportId: string) {
    try {
      const { data, error } = await supabase
        .from("forum_updates")
        .select("id, report_id, message, created_at")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) {
        setUpdatesLoadError(true);
        return;
      }

      setUpdatesLoadError(false);
      setUpdatesByReportId((current) => archivedReportIdsRef.current.has(reportId)
        ? current
        : {
            ...current,
            [reportId]: mergeForumUpdates(current[reportId] ?? [], (data ?? []) as ForumUpdate[]),
          }
      );
    } catch {
      setUpdatesLoadError(true);
    }
  }

  async function loadReports() {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await fetchReports();
      setLoadError(result.hasError);
      if (result.reports) {
        const active = result.reports.filter((report) => !archivedReportIdsRef.current.has(report.id));
        setReports((current) => mergeReports(
          current.filter((report) => !archivedReportIdsRef.current.has(report.id)), active
        ));
        await loadUpdatesForReports(active.map((report) => report.id));
      } else if (!result.hasError) {
        await loadUpdatesForReports([]);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialReports() {
      try {
        const result = await fetchReports();
        setLoadError(result.hasError);
        if (result.reports) {
          const active = result.reports.filter((report) => !archivedReportIdsRef.current.has(report.id));
          setReports((current) => mergeReports(
            current.filter((report) => !archivedReportIdsRef.current.has(report.id)), active
          ));
          await loadUpdatesForReports(active.map((report) => report.id));
        } else if (!result.hasError) {
          await loadUpdatesForReports([]);
        }
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    void loadInitialReports();
  }, [loadUpdatesForReports]);

  async function updateStatus(id: string, status: ReportStatus) {
    const { data, error } = await supabase
      .from("reports")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "Archived")
      .select("id")
      .maybeSingle();

    if (error || !data) return false;

    if (status === "Archived") {
      archivedReportIdsRef.current.add(id);
      setReports((current) => current.filter((report) => report.id !== id));
      setUpdatesByReportId((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }

    await loadReports();
    return true;
  }

  async function confirmStatusUpdate() {
    if (!pendingUpdate) return;
    setIsUpdating(true);
    setUpdateError(false);
    try {
      if (await updateStatus(pendingUpdate.id, pendingUpdate.status)) {
        setPendingUpdate(null);
      } else {
        setUpdateError(true);
      }
    } catch {
      setUpdateError(true);
    } finally {
      setIsUpdating(false);
    }
  }

  async function postServiceUpdate() {
    if (!updateReport || !updateMessage.trim()) return;
    setIsPostingUpdate(true);
    setPostUpdateError("");
    const reportId = updateReport.id;
    try {
      const { error } = await supabase.from("forum_updates").insert({
        report_id: reportId,
        message: updateMessage.trim(),
      });

      if (error) {
        setPostUpdateError("The update could not be posted. Please try again.");
        return;
      }

      setUpdateMessage("");
      setUpdateReport(null);
      await loadUpdatesForReport(reportId);
    } catch {
      setPostUpdateError("The update could not be posted. Please try again.");
    } finally {
      setIsPostingUpdate(false);
    }
  }

  const closeConfirmation = useCallback(() => {
    if (!isUpdating) setPendingUpdate(null);
  }, [isUpdating]);
  const closeUpdateDialog = useCallback(() => {
    if (!isPostingUpdate) {
      setUpdateReport(null);
      setPostUpdateError("");
    }
  }, [isPostingUpdate]);

  const handleReportRealtimeInsert = useCallback(async (record: SpotRealtimeRow) => {
    if (typeof record.id !== "string" || record.status === "Archived") return;
    const { data, error } = await supabase
      .from("reports")
      .select("id, title, description, status, created_at, updated_at, facilities(name, room)")
      .eq("id", record.id)
      .single();

    if (!error && data && data.status !== "Archived" && !archivedReportIdsRef.current.has(data.id)) {
      setReports((current) => mergeReports(current, [data as unknown as Report]));
    }
  }, []);

  const handleReportRealtimeUpdate = useCallback((record: SpotRealtimeRow) => {
    const id = record.id;
    const status = record.status;
    if (
      typeof id !== "string" ||
      (status !== "Pending" && status !== "In Progress" && status !== "Resolved" && status !== "Archived")
    ) return;

    if (status === "Archived") {
      archivedReportIdsRef.current.add(id);
      setReports((current) => current.filter((report) => report.id !== id));
      setUpdatesByReportId((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }

    archivedReportIdsRef.current.delete(id);
    const updatedAt = typeof record.updated_at === "string" ? record.updated_at : undefined;
    setReports((current) => current.map((report) => report.id === id
      ? { ...report, status, updated_at: updatedAt ?? report.updated_at }
      : report
    ));
  }, []);

  useSpotRealtime("spot-maintenance-workflow", {
    onReportInsert: handleReportRealtimeInsert,
    onReportUpdate: handleReportRealtimeUpdate,
  });

  return (
    <main className="app-frame">
      <header className="app-header">
        <Link className="wordmark" href="/" aria-label="Spot home">
          SPOT<span className="wordmark-mark">.</span>
        </Link>
        <p className="header-context">FACILITY REPORTING / MAINTENANCE</p>
      </header>

      <div className="page-content">
        <section className="maintenance-intro" aria-labelledby="queue-title">
          <p className="eyebrow"><span className="eyebrow-index">01</span> MAINTENANCE / INTAKE</p>
          <div className="maintenance-title-row">
            <div>
              <h1 className="page-title" id="queue-title">Report queue</h1>
              <p className="page-lede">Review facility reports and move each issue through its next status.</p>
            </div>
            <span className="queue-count">{reports.length.toString().padStart(2, "0")} TOTAL</span>
          </div>
          <div className="workflow-key" aria-label="Report workflow">
            <span className="workflow-step"><i className="workflow-dot dot-pending" /> Pending</span>
            <span className="workflow-divider" aria-hidden="true">/</span>
            <span className="workflow-step"><i className="workflow-dot dot-progress" /> In progress</span>
            <span className="workflow-divider" aria-hidden="true">/</span>
            <span className="workflow-step"><i className="workflow-dot dot-resolved" /> Resolved</span>
          </div>
        </section>

        <section className="queue-section" aria-label="Maintenance reports">
          <div className="queue-column-head" aria-hidden="true">
            <span>REPORT / LOCATION</span>
            <span>STATUS / NEXT ACTION</span>
          </div>

          {updatesLoadError && !loading && (
            <p className="service-update-error" role="alert">Service updates could not be loaded.</p>
          )}

          <div className="queue-list" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <p className="list-state">Loading reports…</p>
            ) : loadError ? (
              <div className="list-state list-state-error" role="alert">
                <p>Reports could not be loaded.</p>
                <button className="text-button" type="button" onClick={loadReports}>Try again</button>
              </div>
            ) : reports.length === 0 ? (
              <p className="list-state">No reports are waiting in the queue.</p>
            ) : reports.map((report) => (
              <article className="queue-row" key={report.id}>
                <div className="queue-report-copy">
                  <h2 className="report-title">{report.title}</h2>
                  <p className="report-location">
                    {report.facilities.room} <span aria-hidden="true">/</span> {report.facilities.name}
                  </p>
                  <p className="report-description">{report.description}</p>
                  {(updatesByReportId[report.id] ?? []).slice(0, 2).map((update) => (
                    <div className="maintenance-update" key={update.id}>
                      <p>{update.message}</p>
                      <time dateTime={update.created_at}>{formatRelativeTime(update.created_at)}</time>
                    </div>
                  ))}
                </div>

                <div className="queue-row-action">
                  <Status status={report.status} />
                  {report.status === "Pending" ? (
                    <button className="button button-primary" type="button" onClick={() => {
                      setUpdateError(false);
                      setPendingUpdate({ id: report.id, status: "In Progress", title: report.title, facilityName: report.facilities.name, room: report.facilities.room });
                    }}>Start work</button>
                  ) : report.status === "In Progress" ? (
                    <button className="button button-resolve" type="button" onClick={() => {
                      setUpdateError(false);
                      setPendingUpdate({ id: report.id, status: "Resolved", title: report.title, facilityName: report.facilities.name, room: report.facilities.room });
                    }}>Mark resolved</button>
                  ) : (
                    <button className="button button-primary" type="button" onClick={() => {
                      setUpdateError(false);
                      setPendingUpdate({ id: report.id, status: "In Progress", title: report.title, facilityName: report.facilities.name, room: report.facilities.room });
                    }}>Reopen Report</button>
                  )}

                  <button className="button button-secondary button-add-update" type="button" onClick={() => {
                    setPostUpdateError("");
                    setUpdateMessage("");
                    setUpdateReport(report);
                  }}>Add Update</button>
                  <button className="button button-secondary" type="button" onClick={() => {
                    setUpdateError(false);
                    setPendingUpdate({ id: report.id, status: "Archived", title: report.title, facilityName: report.facilities.name, room: report.facilities.room });
                  }}>Remove Report</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {pendingUpdate && (
        <Dialog
          title={pendingUpdate.status === "Archived" ? "Confirm report removal" : "Confirm status change"}
          description={pendingUpdate.status === "Archived"
            ? `“${pendingUpdate.title}” at ${pendingUpdate.room} / ${pendingUpdate.facilityName} will be archived, not deleted. Its report history and service updates will be preserved.`
            : pendingUpdate.status === "In Progress"
              ? `“${pendingUpdate.title}” at ${pendingUpdate.room} / ${pendingUpdate.facilityName} will be returned to In Progress.`
              : `“${pendingUpdate.title}” at ${pendingUpdate.room} / ${pendingUpdate.facilityName} will become ${pendingUpdate.status}.`}
          onClose={closeConfirmation}
          busy={isUpdating}
        >
          {updateError && (
            <p className="form-error" role="alert">
              {pendingUpdate.status === "Archived" ? "The report could not be archived. Please try again." : "Status could not be updated. Please try again."}
            </p>
          )}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={closeConfirmation} disabled={isUpdating} data-dialog-initial-focus>Cancel</button>
            <button className="button button-primary" type="button" onClick={confirmStatusUpdate} disabled={isUpdating}>
              {isUpdating ? (pendingUpdate.status === "Archived" ? "Archiving…" : "Updating…") : (pendingUpdate.status === "Archived" ? "Archive report" : "Confirm")}
            </button>
          </div>
        </Dialog>
      )}

      {updateReport && (
        <Dialog
          title="Add service update"
          description={`${updateReport.title} · ${updateReport.facilities.room} / ${updateReport.facilities.name}`}
          onClose={closeUpdateDialog}
          busy={isPostingUpdate}
        >
          <form className="dialog-form" onSubmit={(event) => {
            event.preventDefault();
            void postServiceUpdate();
          }}>
            {postUpdateError && <p className="form-error" role="alert">{postUpdateError}</p>}
            <label className="field-label" htmlFor="service-update-message">Service update</label>
            <textarea
              id="service-update-message"
              className="text-input text-area"
              value={updateMessage}
              onChange={(event) => setUpdateMessage(event.target.value)}
              placeholder="Describe the latest maintenance progress"
              rows={5}
              required
              disabled={isPostingUpdate}
              data-dialog-initial-focus
            />
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={closeUpdateDialog} disabled={isPostingUpdate}>Cancel</button>
              <button className="button button-primary" type="submit" disabled={isPostingUpdate || !updateMessage.trim()}>
                {isPostingUpdate ? "Posting…" : "Post Update"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </main>
  );
}

function Status({ status }: { status: ReportStatus }) {
  const statusClass = status === "In Progress"
    ? "status-in-progress"
    : status === "Resolved"
      ? "status-resolved"
      : "status-pending";
  return <span className={`status ${statusClass}`}>{status}</span>;
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Dialog({
  title,
  description,
  onClose,
  busy,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const dialogElement = dialog;
    const previousFocus = document.activeElement;
    const focusable = () => Array.from(dialogElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled])'
    ));
    (dialogElement.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? focusable()[0] ?? dialogElement).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialogElement.focus();
      } else if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault();
        items[0].focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [busy, onClose]);

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-dialog-title"
        aria-describedby="maintenance-dialog-description"
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-index">SPOT</span> MAINTENANCE</p>
            <h2 className="dialog-title" id="maintenance-dialog-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close dialog">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="dialog-description" id="maintenance-dialog-description">{description}</p>
        {children}
      </section>
    </div>
  );
}
