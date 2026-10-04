"use client";
//maintenance page for SPOT, used by the maintenance team to manage reports and facilities
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { useSpotRealtime, type SpotRealtimeRow } from "../lib/spot-realtime";
import { AuthGate } from "../components/auth-gate";
import { useSpotAuth } from "../lib/auth";

type ReportStatus = "SUBMITTED" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "Pending" | "In Progress" | "Resolved" | "Archived";

type Report = {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  category: string;
  priority: string;
  assigned_to: string | null;
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

type Facility = {
  id: string;
  name: string;
  room: string;
  keycode: string;
  is_archived: boolean;
  created_at: string;
};

type FacilityDraft = {
  id?: string;
  name: string;
  room: string;
  keycode: string;
};

function mergeFacilities(current: Facility[], incoming: Facility[], preserveCurrent = false) {
  const byId = new Map(incoming.map((facility) => [facility.id, facility]));
  for (const facility of current) {
    if (preserveCurrent || !byId.has(facility.id)) byId.set(facility.id, facility);
  }
  return Array.from(byId.values()).sort((a, b) =>
    Number(a.is_archived) - Number(b.is_archived) ||
    a.name.localeCompare(b.name) ||
    a.room.localeCompare(b.room)
  );
}

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

function MaintenanceContent() {
  const { auth } = useSpotAuth();
  const [mobilePanel, setMobilePanel] = useState<"queue" | "facilities">("queue");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [facilitiesError, setFacilitiesError] = useState(false);
  const [facilityFeedback, setFacilityFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [facilityDraft, setFacilityDraft] = useState<FacilityDraft | null>(null);
  const [facilityFormError, setFacilityFormError] = useState("");
  const [isSavingFacility, setIsSavingFacility] = useState(false);
  const [facilityArchiveTarget, setFacilityArchiveTarget] = useState<Facility | null>(null);
  const [facilityArchiveError, setFacilityArchiveError] = useState("");
  const [isArchivingFacility, setIsArchivingFacility] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [facilityFilter, setFacilityFilter] = useState("ALL");
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
  const archivedFacilityIdsRef = useRef(new Set<string>());

  async function fetchFacilities() {
    const { data, error } = await supabase
      .from("facilities")
      .select("id, name, room, keycode, is_archived, created_at")
      .order("name", { ascending: true });

    return {
      facilities: !error && data ? (data as Facility[]) : null,
      hasError: Boolean(error),
    };
  }

  async function loadFacilities() {
    setFacilitiesLoading(true);
    setFacilitiesError(false);
    try {
      const result = await fetchFacilities();
      setFacilitiesError(result.hasError);
      if (result.facilities) {
        const facilitiesWithoutStaleArchives = result.facilities.map((facility) =>
          archivedFacilityIdsRef.current.has(facility.id)
            ? { ...facility, is_archived: true }
            : facility
        );
        setFacilities((current) => mergeFacilities(
          current,
          facilitiesWithoutStaleArchives,
          true
        ));
      }
    } catch {
      setFacilitiesError(true);
    } finally {
      setFacilitiesLoading(false);
    }
  }

  function openFacilityForm(target?: Facility) {
    setFacilityFeedback(null);
    setFacilityFormError("");
    setFacilityDraft(target
      ? { id: target.id, name: target.name, room: target.room, keycode: target.keycode }
      : { name: "", room: "", keycode: "" }
    );
  }

  async function saveFacility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!facilityDraft) return;

    const name = facilityDraft.name.trim();
    const room = facilityDraft.room.trim();
    const keycode = facilityDraft.keycode.trim().toUpperCase();
    if (!name || !room || !keycode) {
      setFacilityFormError("Enter a facility name, room, and keycode.");
      return;
    }

    setIsSavingFacility(true);
    setFacilityFormError("");
    try {
      const query = facilityDraft.id
        ? supabase
            .from("facilities")
            .update({ name, room, keycode })
            .eq("id", facilityDraft.id)
        : supabase
            .from("facilities")
            .insert({ name, room, keycode, is_archived: false });
      const { data, error } = await query
        .select("id, name, room, keycode, is_archived, created_at")
        .single();

      if (error) {
        const duplicate = error.code === "23505" || /duplicate key|unique constraint/i.test(error.message);
        setFacilityFormError(duplicate
          ? "That keycode is already assigned to another facility."
          : "The facility could not be saved. Please try again."
        );
        return;
      }

      const savedFacility = data as Facility;
      setFacilities((current) => mergeFacilities(current, [savedFacility]));
      setFacilityDraft(null);
      setFacilityFeedback({
        kind: "success",
        text: facilityDraft.id ? "Facility changes saved." : "Facility added.",
      });
    } catch {
      setFacilityFormError("The facility could not be saved. Please try again.");
    } finally {
      setIsSavingFacility(false);
    }
  }

  async function confirmFacilityArchive() {
    if (!facilityArchiveTarget) return;
    setIsArchivingFacility(true);
    setFacilityArchiveError("");
    try {
      const { data, error } = await supabase
        .from("facilities")
        .update({ is_archived: true })
        .eq("id", facilityArchiveTarget.id)
        .eq("is_archived", false)
        .select("id, name, room, keycode, is_archived, created_at")
        .maybeSingle();

      if (error || !data) {
        setFacilityArchiveError("The facility could not be archived. Please try again.");
        return;
      }

      const archivedFacility = data as Facility;
      archivedFacilityIdsRef.current.add(archivedFacility.id);
      setFacilities((current) => mergeFacilities(current, [archivedFacility]));
      setFacilityArchiveTarget(null);
      setFacilityFeedback({ kind: "success", text: "Facility archived. Existing reports and history are unchanged." });
    } catch {
      setFacilityArchiveError("The facility could not be archived. Please try again.");
    } finally {
      setIsArchivingFacility(false);
    }
  }

  const closeFacilityForm = useCallback(() => {
    if (!isSavingFacility) {
      setFacilityDraft(null);
      setFacilityFormError("");
    }
  }, [isSavingFacility]);
  const closeFacilityArchive = useCallback(() => {
    if (!isArchivingFacility) {
      setFacilityArchiveTarget(null);
      setFacilityArchiveError("");
    }
  }, [isArchivingFacility]);

  async function fetchReports() {
    const { data, error } = await supabase
      .from("reports")
      .select("id, title, description, status, category, priority, assigned_to, created_at, updated_at, facilities(name, room)")
      .neq("status", "Archived")
      .neq("status", "CLOSED")
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
    async function loadInitialFacilities() {
      try {
        const result = await fetchFacilities();
        setFacilitiesError(result.hasError);
        if (result.facilities) {
          const facilitiesWithoutStaleArchives = result.facilities.map((facility) =>
            archivedFacilityIdsRef.current.has(facility.id)
              ? { ...facility, is_archived: true }
              : facility
          );
          setFacilities((current) => mergeFacilities(
            current,
            facilitiesWithoutStaleArchives,
            true
          ));
        }
      } catch {
        setFacilitiesError(true);
      } finally {
        setFacilitiesLoading(false);
      }
    }

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

    void loadInitialFacilities();
    void loadInitialReports();
  }, [loadUpdatesForReports]);

  async function updateStatus(id: string, status: ReportStatus) {
    const { data, error } = await supabase
      .from("reports")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "Archived")
      .neq("status", "CLOSED")
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
        user_id: auth?.user.id,
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
      .select("id, title, description, status, category, priority, assigned_to, created_at, updated_at, facilities(name, room)")
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
      typeof id !== "string" || typeof status !== "string" ||
      (!["Pending", "In Progress", "Resolved", "Archived", "SUBMITTED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status))
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

    if (status === "CLOSED") {
      setReports((current) => current.filter((report) => report.id !== id));
      setUpdatesByReportId((current) => { const next = { ...current }; delete next[id]; return next; });
      return;
    }

    archivedReportIdsRef.current.delete(id);
    const updatedAt = typeof record.updated_at === "string" ? record.updated_at : undefined;
    setReports((current) => current.map((report) => report.id === id
      ? { ...report, status: status as ReportStatus, updated_at: updatedAt ?? report.updated_at }
      : report
    ));
  }, []);

  const handleFacilityRealtimeChange = useCallback(async (record: SpotRealtimeRow) => {
    if (typeof record.id !== "string") return;
    const id = record.id;

    if (record.is_archived === true) {
      archivedFacilityIdsRef.current.add(id);
      setFacilities((current) => current.map((availableFacility) =>
        availableFacility.id === id ? { ...availableFacility, is_archived: true } : availableFacility
      ));
      return;
    }

    const { data, error } = await supabase
      .from("facilities")
      .select("id, name, room, keycode, is_archived, created_at")
      .eq("id", id)
      .single();

    if (error || !data) return;
    const facilityRecord = data as Facility;
    if (facilityRecord.is_archived) {
      archivedFacilityIdsRef.current.add(id);
      setFacilities((current) => current.map((availableFacility) =>
        availableFacility.id === id ? { ...availableFacility, is_archived: true } : availableFacility
      ));
      return;
    }

    archivedFacilityIdsRef.current.delete(id);
    setFacilities((current) => mergeFacilities(current, [facilityRecord]));
  }, []);

  useSpotRealtime("spot-maintenance-workflow", {
    onReportInsert: handleReportRealtimeInsert,
    onReportUpdate: handleReportRealtimeUpdate,
    onFacilityInsert: handleFacilityRealtimeChange,
    onFacilityUpdate: handleFacilityRealtimeChange,
  });

  const activeFacilities = facilities.filter((facility) => !facility.is_archived);
  const archivedFacilities = facilities.filter((facility) => facility.is_archived);
  const visibleReports = reports
    .filter(report => (statusFilter === "ALL" || report.status === statusFilter)
      && (priorityFilter === "ALL" || report.priority === priorityFilter)
      && (categoryFilter === "ALL" || report.category === categoryFilter)
      && (facilityFilter === "ALL" || report.facilities.name === facilityFilter))
    .sort((a, b) => ["URGENT", "HIGH", "NORMAL", "LOW"].indexOf(a.priority) - ["URGENT", "HIGH", "NORMAL", "LOW"].indexOf(b.priority));

  return (
    <main className="app-frame">
      <header className="app-header">
        <Link className="wordmark" href="/" aria-label="Spot home">
          SPOT<span className="wordmark-mark">.</span>
        </Link>
        <p className="header-context">
          <span className="desktop-header-context">FACILITY REPORTING / MAINTENANCE</span>
          <span className="mobile-header-context">MAINTENANCE</span>
        </p>
        {auth?.role === "ADMIN" && <Link className="text-button" href="/admin">Admin</Link>}
        {auth && <button className="text-button" type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>}
      </header>

      <div className="page-content">
        <section className="maintenance-intro" data-mobile-view data-mobile-active={mobilePanel === "queue"} aria-labelledby="queue-title">
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

        <div className="maintenance-metrics" data-mobile-view data-mobile-active={mobilePanel === "queue"} aria-label="Report totals">
          <Stat label="Submitted" value={reports.filter((report) => report.status === "SUBMITTED" || report.status === "Pending").length} />
          <Stat label="In progress" value={reports.filter((report) => report.status === "IN_PROGRESS" || report.status === "In Progress").length} />
          <Stat label="Resolved" value={reports.filter((report) => report.status === "RESOLVED" || report.status === "Resolved").length} />
          <Stat label="Total" value={reports.length} />
        </div>

        <nav className="mobile-view-nav maintenance-mobile-nav" aria-label="Maintenance views">
          <button className="mobile-view-tab" type="button" aria-controls="maintenance-queue-panel" aria-pressed={mobilePanel === "queue"} onClick={() => setMobilePanel("queue")}>Queue</button>
          <button className="mobile-view-tab" type="button" aria-controls="maintenance-facilities-panel" aria-pressed={mobilePanel === "facilities"} onClick={() => setMobilePanel("facilities")}>Facilities</button>
        </nav>

        <div className="maintenance-dashboard">
        <section className="facility-section" id="maintenance-facilities-panel" data-mobile-view data-mobile-active={mobilePanel === "facilities"} aria-labelledby="facilities-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-index">02</span> FACILITY REGISTER</p>
              <h2 className="section-title" id="facilities-title">Facilities</h2>
            </div>
            <button className="button button-primary" type="button" onClick={() => openFacilityForm()}>
              Add Facility
            </button>
          </div>

          {facilityFeedback && (
            <p
              className={`notice notice-${facilityFeedback.kind}`}
              role={facilityFeedback.kind === "error" ? "alert" : "status"}
              aria-live={facilityFeedback.kind === "error" ? "assertive" : "polite"}
            >
              <span className="notice-marker" aria-hidden="true" />
              {facilityFeedback.text}
            </p>
          )}

          <div className="facility-list" aria-live="polite" aria-busy={facilitiesLoading}>
            {facilitiesLoading ? (
              <p className="list-state">Loading facilities…</p>
            ) : facilitiesError ? (
              <div className="list-state list-state-error" role="alert">
                <p>Facilities could not be loaded.</p>
                <button className="text-button" type="button" onClick={loadFacilities}>Try again</button>
              </div>
            ) : facilities.length === 0 ? (
              <p className="list-state">No facilities have been added yet.</p>
            ) : (
              <>
                {activeFacilities.length > 0 && (
                  <div className="queue-list" aria-label="Active facilities">
                    {activeFacilities.map((facility) => (
                      <article className="queue-row" key={facility.id}>
                        <div className="queue-report-copy">
                          <div className="service-update-heading">
                            <h3 className="report-title">{facility.name}</h3>
                            <span className="status status-in-progress">ACTIVE</span>
                          </div>
                          <p className="report-location">
                            {facility.room} <span aria-hidden="true">/</span> KEY / {facility.keycode}
                          </p>
                        </div>
                        <div className="queue-row-action">
                          <button className="button button-secondary" type="button" onClick={() => openFacilityForm(facility)}>
                            Edit
                          </button>
                          <button className="button button-secondary" type="button" onClick={() => {
                            setFacilityFeedback(null);
                            setFacilityArchiveError("");
                            setFacilityArchiveTarget(facility);
                          }}>
                            Archive
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {archivedFacilities.length > 0 && (
                  <div className="queue-list" aria-label="Archived facilities">
                    <p className="eyebrow"><span className="eyebrow-index">ARCHIVE</span> UNAVAILABLE FOR NEW REPORTS</p>
                    {archivedFacilities.map((facility) => (
                      <article className="queue-row" key={facility.id}>
                        <div className="queue-report-copy">
                          <div className="service-update-heading">
                            <h3 className="report-title">{facility.name}</h3>
                            <span className="status status-pending">ARCHIVED</span>
                          </div>
                          <p className="report-location">
                            {facility.room} <span aria-hidden="true">/</span> KEY / {facility.keycode}
                          </p>
                        </div>
                        <div className="queue-row-action">
                          <button className="button button-secondary" type="button" onClick={() => openFacilityForm(facility)}>
                            Edit
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="queue-section" id="maintenance-queue-panel" data-mobile-view data-mobile-active={mobilePanel === "queue"} aria-labelledby="maintenance-reports-title">
          <div className="section-heading queue-section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-index">03</span> WORK ORDER FLOW</p>
              <h2 className="section-title" id="maintenance-reports-title">Report queue</h2>
            </div>
            <span className="section-count">{reports.length.toString().padStart(2, "0")} RECORDS</span>
          </div>
          <div className="queue-column-head" aria-hidden="true">
            <span>REPORT / LOCATION</span>
            <span>STATUS / NEXT ACTION</span>
          </div>
          <div className="queue-filters" aria-label="Filter work queue">
            <label>Status <select className="text-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="SUBMITTED">Submitted</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label>
            <label>Priority <select className="text-input" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}><option value="ALL">All priorities</option><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></label>
            <label>Category <select className="text-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="ALL">All categories</option>{Array.from(new Set(reports.map(report => report.category))).sort().map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Facility <select className="text-input" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}><option value="ALL">All facilities</option>{Array.from(new Set(reports.map(report => report.facilities.name))).sort().map(value => <option key={value}>{value}</option>)}</select></label>
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
            ) : visibleReports.length === 0 ? (
              <p className="list-state">No reports match these filters.</p>
            ) : visibleReports.map((report) => (
              <article className="queue-row" key={report.id}>
                <div className="queue-report-copy">
                  <p className="eyebrow">CASE / {report.id.slice(0, 8).toUpperCase()}</p>
                  <h2 className="report-title"><Link href={`/reports/${report.id}`}>{report.title}</Link></h2>
                  <p className="report-location">
                    {report.facilities.room} <span aria-hidden="true">/</span> {report.facilities.name}
                  </p>
                  <p className="report-location">{report.category} <span aria-hidden="true">/</span> {report.priority}</p>
                  <p className="report-location">{report.assigned_to === auth?.user.id ? "Assigned to you" : report.assigned_to ? `Assigned · ${report.assigned_to.slice(0, 8)}` : "Unassigned"}</p>
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
                  {report.status === "Pending" || report.status === "SUBMITTED" ? (
                    <button className="button button-primary" type="button" onClick={() => {
                      setUpdateError(false);
                      setPendingUpdate({ id: report.id, status: "ACKNOWLEDGED", title: report.title, facilityName: report.facilities.name, room: report.facilities.room });
                    }}>Acknowledge</button>
                  ) : report.status === "ACKNOWLEDGED" ? (
                    <button className="button button-primary" type="button" onClick={() => setPendingUpdate({ id: report.id, status: "IN_PROGRESS", title: report.title, facilityName: report.facilities.name, room: report.facilities.room })}>Start work</button>
                  ) : report.status === "In Progress" || report.status === "IN_PROGRESS" ? (
                    <button className="button button-resolve" type="button" onClick={() => {
                      setUpdateError(false);
                      setPendingUpdate({ id: report.id, status: "RESOLVED", title: report.title, facilityName: report.facilities.name, room: report.facilities.room });
                    }}>Mark resolved</button>
                  ) : report.status === "RESOLVED" ? (
                    <span className="completed-indicator">Resolved · awaiting closure</span>
                  ) : (
                    <span className="completed-indicator">Case {report.status.toLowerCase()}</span>
                  )}

                  <button className="button button-secondary button-add-update" type="button" onClick={() => {
                    setPostUpdateError("");
                    setUpdateMessage("");
                    setUpdateReport(report);
                  }}>Add Update</button>
                  {!report.assigned_to && <button className="button button-secondary" type="button" onClick={async () => { const { error } = await supabase.from("reports").update({ assigned_to: auth?.user.id, updated_at: new Date().toISOString() }).eq("id", report.id); if (error) setLoadError(true); else await loadReports(); }}>Assign to me</button>}
                  <Link className="button button-secondary" href={`/reports/${report.id}`}>Open case</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
        </div>
      </div>

      {facilityDraft && (
        <Dialog
          title={facilityDraft.id ? "Edit facility" : "Add facility"}
          description={facilityDraft.id
            ? "Update the facility name, room, or keycode."
            : "Register a facility so students can select it when reporting an issue."}
          onClose={closeFacilityForm}
          busy={isSavingFacility}
        >
          <form className="dialog-form" onSubmit={saveFacility}>
            {facilityFormError && <p className="form-error" role="alert">{facilityFormError}</p>}
            <label className="field-label" htmlFor="maintenance-facility-name">Facility name</label>
            <input
              id="maintenance-facility-name"
              className="text-input"
              value={facilityDraft.name}
              onChange={(event) => setFacilityDraft((current) => current ? { ...current, name: event.target.value } : current)}
              required
              maxLength={120}
              disabled={isSavingFacility}
              data-dialog-initial-focus
            />
            <label className="field-label" htmlFor="maintenance-facility-room">Room</label>
            <input
              id="maintenance-facility-room"
              className="text-input"
              value={facilityDraft.room}
              onChange={(event) => setFacilityDraft((current) => current ? { ...current, room: event.target.value } : current)}
              required
              maxLength={80}
              disabled={isSavingFacility}
            />
            <label className="field-label" htmlFor="maintenance-facility-keycode">Keycode</label>
            <input
              id="maintenance-facility-keycode"
              className="text-input"
              value={facilityDraft.keycode}
              onChange={(event) => setFacilityDraft((current) => current ? { ...current, keycode: event.target.value } : current)}
              required
              maxLength={80}
              autoCapitalize="characters"
              spellCheck={false}
              disabled={isSavingFacility}
            />
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={closeFacilityForm} disabled={isSavingFacility}>Cancel</button>
              <button
                className="button button-primary"
                type="submit"
                disabled={isSavingFacility || !facilityDraft.name.trim() || !facilityDraft.room.trim() || !facilityDraft.keycode.trim()}
              >
                {isSavingFacility ? "Saving…" : facilityDraft.id ? "Save changes" : "Add Facility"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {facilityArchiveTarget && (
        <Dialog
          title="Confirm facility archive"
          description={`“${facilityArchiveTarget.name}” in ${facilityArchiveTarget.room} will be archived and removed from student facility selection. Existing reports and their history will remain unchanged.`}
          onClose={closeFacilityArchive}
          busy={isArchivingFacility}
        >
          {facilityArchiveError && <p className="form-error" role="alert">{facilityArchiveError}</p>}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={closeFacilityArchive} disabled={isArchivingFacility} data-dialog-initial-focus>Cancel</button>
            <button className="button button-primary" type="button" onClick={confirmFacilityArchive} disabled={isArchivingFacility}>
              {isArchivingFacility ? "Archiving…" : "Archive facility"}
            </button>
          </div>
        </Dialog>
      )}

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

export default function MaintenancePage() {
  return <AuthGate roles={["MAINTENANCE", "ADMIN"]}><MaintenanceContent /></AuthGate>;
}

function Status({ status }: { status: ReportStatus }) {
  const statusClass = status === "In Progress" || status === "IN_PROGRESS"
    ? "status-in-progress"
    : status === "Resolved" || status === "RESOLVED" || status === "CLOSED"
      ? "status-resolved"
      : "status-pending";
  return <span className={`status ${statusClass}`}>{status.replaceAll("_", " ")}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value.toString().padStart(2, "0")}</strong>
    </div>
  );
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
