"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { useSpotRealtime, type SpotRealtimeRow } from "./lib/spot-realtime";

type Facility = {
  id: string;
  name: string;
  room: string;
  keycode: string;
  is_archived: boolean;
};

type Report = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  facilities: {
    name: string;
    room: string;
  };
};

type Notice = { kind: "success" | "error"; text: string } | null;

type ServiceUpdate = {
  id: string;
  report_id: string;
  message: string;
  created_at: string;
  report: {
    title: string;
    status: string;
    updated_at: string;
    facilities: { name: string; room: string } | null;
  };
};

function mergeFacilities(current: Facility[], incoming: Facility[], preserveCurrent = false) {
  const byId = new Map(
    incoming.filter((facility) => !facility.is_archived).map((facility) => [facility.id, facility])
  );
  for (const facility of current) {
    if (!facility.is_archived && (preserveCurrent || !byId.has(facility.id))) {
      byId.set(facility.id, facility);
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name) || a.room.localeCompare(b.room)
  );
}

function mergeReports(current: Report[], incoming: Report[]) {
  const reportsById = new Map(
    incoming
      .filter((report) => report.status !== "Archived")
      .map((report) => [report.id, report])
  );

  for (const report of current) {
    if (report.status === "Archived") continue;
    const fetched = reportsById.get(report.id);
    if (!fetched || Date.parse(report.updated_at) > Date.parse(fetched.updated_at)) {
      reportsById.set(report.id, report);
    }
  }

  return Array.from(reportsById.values()).sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

function mergeServiceUpdates(current: ServiceUpdate[], incoming: ServiceUpdate[]) {
  const updatesById = new Map(
    incoming
      .filter((update) => update.report.status !== "Archived")
      .map((update) => [update.id, update])
  );

  for (const update of current) {
    if (update.report.status === "Archived") continue;
    const fetched = updatesById.get(update.id);
    if (
      !fetched ||
      Date.parse(update.report.updated_at) > Date.parse(fetched.report.updated_at)
    ) {
      updatesById.set(update.id, update);
    }
  }

  return Array.from(updatesById.values())
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 20);
}

export default function Home() {
  const [keycode, setKeycode] = useState("");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [facilitiesError, setFacilitiesError] = useState(false);
  const [facility, setFacility] = useState<Facility | null>(null);
  const archivedFacilityIdsRef = useRef(new Set<string>());
  const [reports, setReports] = useState<Report[]>([]);
  const archivedReportIdsRef = useRef(new Set<string>());
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  const [serviceUpdates, setServiceUpdates] = useState<ServiceUpdate[]>([]);
  const [serviceUpdatesLoading, setServiceUpdatesLoading] = useState(true);
  const [serviceUpdatesError, setServiceUpdatesError] = useState(false);
  const [showKeycode, setShowKeycode] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function fetchReports() {
    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, title, description, status, created_at, updated_at, facilities(name, room)"
      )
      .neq("status", "Archived")
      .order("created_at", { ascending: false });

    return {
      reports: !error && data ? (data as unknown as Report[]) : null,
      hasError: Boolean(error),
    };
  }

  async function loadReports() {
    setReportsLoading(true);
    setReportsError(false);

    try {
      const result = await fetchReports();
      setReportsError(result.hasError);
      if (result.reports) {
        const activeReports = result.reports.filter(
          (report) => !archivedReportIdsRef.current.has(report.id)
        );
        setReports((current) =>
          mergeReports(
            current.filter((report) => !archivedReportIdsRef.current.has(report.id)),
            activeReports
          )
        );
      }
    } catch {
      setReportsError(true);
    } finally {
      setReportsLoading(false);
    }
  }

  async function fetchServiceUpdates() {
    const { data, error } = await supabase
      .from("forum_updates")
      .select(
        "id, report_id, message, created_at, report:reports!inner(title, status, updated_at, facilities(name, room))"
      )
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      updates: !error && data ? (data as unknown as ServiceUpdate[]) : null,
      hasError: Boolean(error),
    };
  }

  async function loadServiceUpdates() {
    setServiceUpdatesLoading(true);
    setServiceUpdatesError(false);

    try {
      const result = await fetchServiceUpdates();
      setServiceUpdatesError(result.hasError);
      if (result.updates) {
        const activeUpdates = result.updates.filter(
          (update) => !archivedReportIdsRef.current.has(update.report_id)
        );
        setServiceUpdates((current) => mergeServiceUpdates(current, activeUpdates));
      }
    } catch {
      setServiceUpdatesError(true);
    } finally {
      setServiceUpdatesLoading(false);
    }
  }

  async function fetchFacilities() {
    return supabase
      .from("facilities")
      .select("id, name, room, keycode, is_archived")
      .eq("is_archived", false);
  }

  async function loadFacilities() {
    setFacilitiesLoading(true);
    setFacilitiesError(false);

    try {
      const { data, error } = await fetchFacilities();

      if (error) {
        setFacilitiesError(true);
        return;
      }

      const activeFacilities = ((data ?? []) as Facility[]).filter(
        (availableFacility) => !archivedFacilityIdsRef.current.has(availableFacility.id)
      );
      setFacilities((current) => mergeFacilities(current, activeFacilities, true));
    } catch {
      setFacilitiesError(true);
    } finally {
      setFacilitiesLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialFacilities() {
      try {
        const { data, error } = await fetchFacilities();

        if (error) {
          setFacilitiesError(true);
        } else {
          const activeFacilities = ((data ?? []) as Facility[]).filter(
            (availableFacility) => !archivedFacilityIdsRef.current.has(availableFacility.id)
          );
          setFacilities((current) => mergeFacilities(current, activeFacilities, true));
        }
      } catch {
        setFacilitiesError(true);
      } finally {
        setFacilitiesLoading(false);
      }
    }

    loadInitialFacilities();

    async function loadInitialReports() {
      try {
        const result = await fetchReports();
        setReportsError(result.hasError);
        if (result.reports) {
          const activeReports = result.reports.filter(
            (report) => !archivedReportIdsRef.current.has(report.id)
          );
          setReports((current) =>
            mergeReports(
              current.filter((report) => !archivedReportIdsRef.current.has(report.id)),
              activeReports
            )
          );
        }
      } catch {
        setReportsError(true);
      } finally {
        setReportsLoading(false);
      }
    }

    loadInitialReports();

    async function loadInitialServiceUpdates() {
      try {
        const result = await fetchServiceUpdates();
        setServiceUpdatesError(result.hasError);
        if (result.updates) {
          const activeUpdates = result.updates.filter(
            (update) => !archivedReportIdsRef.current.has(update.report_id)
          );
          setServiceUpdates((current) => mergeServiceUpdates(current, activeUpdates));
        }
      } catch {
        setServiceUpdatesError(true);
      } finally {
        setServiceUpdatesLoading(false);
      }
    }

    loadInitialServiceUpdates();
  }, []);

  async function findFacility() {
    if (!keycode.trim()) return;

    setLoading(true);
    setNotice(null);

    try {
      const { data, error } = await supabase
        .from("facilities")
        .select("id, name, room, keycode, is_archived")
        .eq("keycode", keycode.trim().toUpperCase())
        .eq("is_archived", false)
        .single();

      if (error || !data || archivedFacilityIdsRef.current.has(data.id)) {
        setFacility(null);
        setNotice({ kind: "error", text: "No facility found for that keycode." });
        return;
      }

      setFacility(data);
      setShowKeycode(false);
      setShowReport(true);
    } catch {
      setNotice({
        kind: "error",
        text: "We could not check that keycode. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitReport() {
    if (!facility || !title.trim() || !description.trim()) return;
    if (facility.is_archived || archivedFacilityIdsRef.current.has(facility.id)) {
      setFacility(null);
      setShowReport(false);
      setNotice({ kind: "error", text: "This facility is no longer available. Please select another facility." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const { error } = await supabase.from("reports").insert({
        facility_id: facility.id,
        title: title.trim(),
        description: description.trim(),
      });

      if (error) {
        setNotice({
          kind: "error",
          text: "Your report could not be submitted. Please try again.",
        });
        return;
      }

      setTitle("");
      setDescription("");
      setShowReport(false);
      setFacility(null);
      setNotice({ kind: "success", text: "Report submitted successfully." });
      await loadReports();
    } catch {
      setNotice({
        kind: "error",
        text: "Your report could not be submitted. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const closeKeycodeDialog = useCallback(() => setShowKeycode(false), []);
  const closeReportDialog = useCallback(() => setShowReport(false), []);

  const handleReportRealtimeUpdate = useCallback((record: SpotRealtimeRow) => {
    const id = record.id;
    const status = record.status;
    if (
      typeof id !== "string" ||
      (status !== "Pending" && status !== "In Progress" && status !== "Resolved" && status !== "Archived")
    ) {
      return;
    }

    if (status === "Archived") {
      archivedReportIdsRef.current.add(id);
      setReports((current) => current.filter((report) => report.id !== id));
      setServiceUpdates((current) => current.filter((update) => update.report_id !== id));
      return;
    }

    archivedReportIdsRef.current.delete(id);
    const updatedAt = typeof record.updated_at === "string" ? record.updated_at : undefined;
    setReports((current) =>
      current.map((report) =>
        report.id === id
          ? { ...report, status, updated_at: updatedAt ?? report.updated_at }
          : report
      )
    );
    setServiceUpdates((current) =>
      current.map((update) =>
        update.report_id === id
          ? {
              ...update,
              report: {
                ...update.report,
                status,
                updated_at: updatedAt ?? update.report.updated_at,
              },
            }
          : update
      )
    );
  }, []);

  const handleFacilityRealtimeChange = useCallback(async (record: SpotRealtimeRow) => {
    if (typeof record.id !== "string") return;
    const id = record.id;

    if (record.is_archived === true) {
      archivedFacilityIdsRef.current.add(id);
      setFacilities((current) => current.filter((availableFacility) => availableFacility.id !== id));
      if (facility?.id === id) {
        setFacility(null);
        setShowReport(false);
        setNotice({
          kind: "error",
          text: "This facility was archived and is no longer available. Please select another facility.",
        });
      }
      return;
    }

    const { data, error } = await supabase
      .from("facilities")
      .select("id, name, room, keycode, is_archived")
      .eq("id", id)
      .single();

    if (error || !data) return;
    if (data.is_archived) {
      archivedFacilityIdsRef.current.add(id);
      setFacilities((current) => current.filter((availableFacility) => availableFacility.id !== id));
      if (facility?.id === id) {
        setFacility(null);
        setShowReport(false);
        setNotice({
          kind: "error",
          text: "This facility was archived and is no longer available. Please select another facility.",
        });
      }
      return;
    }

    if (archivedFacilityIdsRef.current.has(id)) return;
    archivedFacilityIdsRef.current.delete(id);
    setFacilities((current) => mergeFacilities(current, [data as Facility]));
  }, [facility?.id]);

  const handleForumUpdateRealtimeInsert = useCallback(async (record: SpotRealtimeRow) => {
    if (typeof record.id !== "string") return;

    const { data, error } = await supabase
      .from("forum_updates")
      .select(
        "id, report_id, message, created_at, report:reports!inner(title, status, updated_at, facilities(name, room))"
      )
      .eq("id", record.id)
      .single();

    if (!error && data && !archivedReportIdsRef.current.has(data.report_id)) {
      const update = data as unknown as ServiceUpdate;
      setServiceUpdates((current) =>
        archivedReportIdsRef.current.has(update.report_id)
          ? current
          : mergeServiceUpdates(current, [update])
      );
    }
  }, []);

  useSpotRealtime("spot-student-workflow", {
    onReportUpdate: handleReportRealtimeUpdate,
    onForumUpdateInsert: handleForumUpdateRealtimeInsert,
    onFacilityInsert: handleFacilityRealtimeChange,
    onFacilityUpdate: handleFacilityRealtimeChange,
  });

  return (
    <main className="app-frame">
      <header className="app-header">
        <span className="wordmark">
          SPOT<span className="wordmark-mark">.</span>
        </span>
        <p className="header-context">FACILITY REPORTING / STUDENT</p>
      </header>

      <div className="page-content">
        <section className="student-intro" aria-labelledby="page-title">
          <p className="eyebrow"><span className="eyebrow-index">01</span> REPORT AN ISSUE</p>
          <h1 className="page-title" id="page-title">Facility issue</h1>
          <p className="page-lede">
            Select the facility where you found an issue. You can also identify
            it manually with the posted keycode.
          </p>
        </section>

        {notice && !showKeycode && !showReport && (
          <div
            className={`notice notice-${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live={notice.kind === "error" ? "assertive" : "polite"}
          >
            <span className="notice-marker" aria-hidden="true" />
            {notice.text}
          </div>
        )}

        <section className="facility-section" aria-labelledby="facility-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-index">01</span> LOCATION</p>
              <h2 className="section-title" id="facility-title">Select a facility</h2>
            </div>
            <button
              className="button button-secondary manual-keycode"
              type="button"
              onClick={() => {
                setNotice(null);
                setShowKeycode(true);
              }}
            >
              Enter keycode instead
            </button>
          </div>

          <div className="facility-list" aria-live="polite" aria-busy={facilitiesLoading}>
            {facilitiesLoading ? (
              <p className="list-state">Loading facilities…</p>
            ) : facilitiesError ? (
              <div className="list-state list-state-error" role="alert">
                <p>Facilities could not be loaded.</p>
                <button className="text-button" type="button" onClick={loadFacilities}>
                  Try again
                </button>
              </div>
            ) : facilities.length === 0 ? (
              <p className="list-state">No facilities are available right now.</p>
            ) : (
              <div className="facility-grid">
                {facilities.map((availableFacility) => {
                  const isSelected = showReport && facility?.id === availableFacility.id;

                  return (
                    <button
                      className={`facility-tile${isSelected ? " facility-tile-selected" : ""}`}
                      type="button"
                      key={availableFacility.id}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setNotice(null);
                        setFacility(availableFacility);
                        setShowKeycode(false);
                        setShowReport(true);
                      }}
                    >
                      <span className="facility-tile-top">
                        <span className="facility-name">{availableFacility.name}</span>
                        <span className="facility-select-mark" aria-hidden="true">↗</span>
                      </span>
                      <span className="facility-room">{availableFacility.room}</span>
                      <span className="facility-keycode">KEY / {availableFacility.keycode}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="student-reports" aria-labelledby="reports-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-index">02</span> STATUS OVERVIEW</p>
              <h2 className="section-title" id="reports-title">Recent reports</h2>
            </div>
            <span className="section-count">{reports.length.toString().padStart(2, "0")} RECORDS</span>
          </div>

          <div className="metrics" aria-label="Report totals">
            <Stat label="All reports" value={reports.length} />
            <Stat
              label="In progress"
              value={reports.filter((report) => report.status === "In Progress").length}
            />
            <Stat
              label="Resolved"
              value={reports.filter((report) => report.status === "Resolved").length}
            />
          </div>

          <div className="report-list" aria-live="polite" aria-busy={reportsLoading}>
            {reportsLoading ? (
              <p className="list-state">Loading reports…</p>
            ) : reportsError ? (
              <div className="list-state list-state-error" role="alert">
                <p>Reports could not be loaded.</p>
                <button className="text-button" type="button" onClick={loadReports}>
                  Try again
                </button>
              </div>
            ) : reports.length === 0 ? (
              <p className="list-state">No reports have been submitted yet.</p>
            ) : (
              reports.map((report) => (
                <article className="student-report-row" key={report.id}>
                  <div className="report-row-main">
                    <h3 className="report-title">{report.title}</h3>
                    <p className="report-location">
                      {report.facilities?.room} <span aria-hidden="true">/</span>{" "}
                      {report.facilities?.name}
                    </p>
                    <p className="report-description">{report.description}</p>
                  </div>
                  <Status status={report.status} />
                </article>
              ))
            )}
          </div>
        </section>

        <section className="live-service-section" aria-labelledby="live-service-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-index">03</span> LIVE SERVICE</p>
              <h2 className="section-title" id="live-service-title">Maintenance updates</h2>
            </div>
            <span className="section-count">LATEST 20</span>
          </div>

          <div className="service-update-list" aria-live="polite" aria-busy={serviceUpdatesLoading}>
            {serviceUpdatesLoading ? (
              <p className="list-state">Loading service updates…</p>
            ) : serviceUpdatesError ? (
              <div className="list-state list-state-error" role="alert">
                <p>Service updates could not be loaded.</p>
                <button className="text-button" type="button" onClick={loadServiceUpdates}>
                  Try again
                </button>
              </div>
            ) : serviceUpdates.length === 0 ? (
              <p className="list-state empty-service-state">No service updates</p>
            ) : (
              serviceUpdates.map((update) => (
                <article
                  className="service-update"
                  key={update.id}
                >
                  <div className="service-update-heading">
                    <div className="service-update-location">
                      <span>{update.report.facilities?.name ?? "Facility"}</span>
                      <span aria-hidden="true">·</span>
                      <span>{update.report.facilities?.room ?? "Room unavailable"}</span>
                    </div>
                    <Status status={update.report.status} />
                  </div>
                  <h3 className="report-title">{update.report.title}</h3>
                  <p className="service-update-message">{update.message}</p>
                  <time className="service-update-time" dateTime={update.created_at}>
                    {formatRelativeTime(update.created_at)}
                  </time>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {showKeycode && (
        <Dialog
          title="Identify your Spot"
          description="Enter the keycode displayed in the room or facility."
          onClose={closeKeycodeDialog}
        >
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              void findFacility();
            }}
          >
            {notice?.kind === "error" && (
              <p className="form-error" role="alert">{notice.text}</p>
            )}
            <label className="field-label" htmlFor="facility-keycode">Facility keycode</label>
            <input
              id="facility-keycode"
              className="text-input"
              value={keycode}
              onChange={(event) => setKeycode(event.target.value)}
              placeholder="e.g. MKT-304"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              data-dialog-initial-focus
            />
            <button className="button button-primary button-full" type="submit" disabled={loading}>
              {loading ? "Checking keycode…" : "Find facility"}
            </button>
          </form>
        </Dialog>
      )}

      {showReport && facility && (
        <Dialog
          title="Report an issue"
          description="Confirm the location and describe the problem."
          onClose={closeReportDialog}
        >
          <div className="facility-summary">
            <span className="field-label">Selected location</span>
            <strong>{facility.name}</strong>
            <span>{facility.room}</span>
          </div>
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitReport();
            }}
          >
            {notice?.kind === "error" && (
              <p className="form-error" role="alert">{notice.text}</p>
            )}
            <label className="field-label" htmlFor="report-title">Issue title</label>
            <input
              id="report-title"
              className="text-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Broken light"
              required
              data-dialog-initial-focus
            />
            <label className="field-label" htmlFor="report-description">Description</label>
            <textarea
              id="report-description"
              className="text-input text-area"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what needs attention"
              rows={4}
              required
            />
            <button
              className="button button-primary button-full"
              type="submit"
              disabled={loading || !title.trim() || !description.trim()}
            >
              {loading ? "Submitting report…" : "Submit report"}
            </button>
          </form>
        </Dialog>
      )}
    </main>
  );
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (Number.isNaN(date.getTime())) return "Time unavailable";
  if (elapsedSeconds < 60) return "Just now";
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} min ago`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} hr ago`;
  if (elapsedSeconds < 604800) return `${Math.floor(elapsedSeconds / 86400)} days ago`;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value.toString().padStart(2, "0")}</strong>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const statusClass =
    status === "In Progress"
      ? "status-in-progress"
      : status === "Resolved"
        ? "status-resolved"
        : "status-pending";

  return <span className={`status ${statusClass}`}>{status}</span>;
}

function Dialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const dialogElement = dialog;

    const previousFocus = document.activeElement;
    const focusable = () =>
      Array.from(
        dialogElement.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

    (dialogElement.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? focusable()[0] ?? dialogElement).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-dialog-title"
        aria-describedby="spot-dialog-description"
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-index">SPOT</span> REPORTING UTILITY</p>
            <h2 className="dialog-title" id="spot-dialog-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="dialog-description" id="spot-dialog-description">{description}</p>
        {children}
      </section>
    </div>
  );
}
