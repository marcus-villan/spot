"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { AuthGate } from "../components/auth-gate";
import { useSpotAuth, type SpotRole } from "../lib/auth";
import { useSpotRealtime } from "../lib/spot-realtime";

type Profile = { id: string; email: string | null; role: SpotRole; created_at: string };
type Facility = { id: string; name: string; room: string; is_archived: boolean };
type Report = {
  id: string;
  facility_id: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
};
type AnalyticsData = { facilities: Facility[]; reports: Report[] };

const REPORT_PAGE_SIZE = 500;

async function fetchAllReports(): Promise<Report[]> {
  const reports: Report[] = [];
  let offset = 0;
  let expectedCount: number | null = null;

  while (true) {
    const { data, error, count } = await supabase
      .from("reports")
      .select("id, facility_id, category, priority, status, created_at", { count: "exact" })
      .order("id", { ascending: true })
      .range(offset, offset + REPORT_PAGE_SIZE - 1);

    if (error) throw error;
    if (expectedCount === null) {
      if (data === null) throw new Error("Report analytics returned no page data.");
      if (count === null) throw new Error("Report analytics could not confirm the total row count.");
      expectedCount = count;
    }
    const page = (data ?? []) as Report[];
    reports.push(...page);
    if (reports.length >= expectedCount) return reports;
    if (page.length === 0) throw new Error("Report analytics pagination ended before all rows were fetched.");
    offset += page.length;
  }
}

async function fetchAnalytics(): Promise<AnalyticsData> {
  const [reports, facilityResult] = await Promise.all([
    fetchAllReports(),
    supabase.from("facilities").select("id, name, room, is_archived").order("name", { ascending: true }),
  ]);

  if (facilityResult.error) throw facilityResult.error;
  return { reports, facilities: (facilityResult.data ?? []) as Facility[] };
}

function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadSequence = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const nextData = await fetchAnalytics();
      if (sequence === loadSequence.current) {
        setData(nextData);
        setError(false);
      }
    } catch {
      if (sequence === loadSequence.current) setError(true);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void load(), 180);
  }, [load]);

  useEffect(() => {
    async function initialLoad() { await load(); }
    void initialLoad();
    return () => {
      loadSequence.current += 1;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [load]);

  useSpotRealtime("spot-admin-analytics", {
    onReportInsert: scheduleRefresh,
    onReportUpdate: scheduleRefresh,
    onFacilityInsert: scheduleRefresh,
    onFacilityUpdate: scheduleRefresh,
  });

  const reports = data?.reports ?? [];
  const facilityRows = (data?.facilities ?? []).map((facility) => {
    const facilityReports = reports.filter((report) => report.facility_id === facility.id);
    return {
      ...facility,
      reportCount: facilityReports.length,
      highCount: facilityReports.filter((report) => report.priority === "HIGH").length,
      urgentCount: facilityReports.filter((report) => report.priority === "URGENT").length,
      categories: countBy(facilityReports, (report) => report.category),
    };
  }).sort((a, b) => b.reportCount - a.reportCount || a.name.localeCompare(b.name) || a.room.localeCompare(b.room));

  const categoryValues = Array.from(new Set(reports.map((report) => report.category))).sort((a, b) => a.localeCompare(b));
  const statusCounts = countBy(reports, (report) => report.status).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const highUrgentRows = [...facilityRows].sort((a, b) =>
    b.highCount + b.urgentCount - (a.highCount + a.urgentCount) || a.name.localeCompare(b.name) || a.room.localeCompare(b.room)
  );
  const highUrgentMax = Math.max(0, ...facilityRows.map((facility) => facility.highCount + facility.urgentCount));
  const reportMax = Math.max(0, ...facilityRows.map((facility) => facility.reportCount));
  const categoryMax = Math.max(0, ...facilityRows.map((facility) => facility.reportCount));
  const statusMax = Math.max(0, ...statusCounts.map((status) => status.count));
  const highUrgentTotal = reports.filter((report) => report.priority === "HIGH" || report.priority === "URGENT").length;

  return (
    <section className="admin-analytics" aria-labelledby="analytics-heading">
      <div className="student-intro analytics-intro">
        <p className="eyebrow">ADMIN / ANALYTICS</p>
        <h2 className="page-title" id="analytics-heading">Report analytics</h2>
        <p className="page-lede">Facility, priority, category, and status counts from persisted Spot reports.</p>
      </div>

      {loading && !data ? <p className="list-state analytics-state" role="status">Loading report analytics…</p> : null}
      {error ? (
        <div className="list-state-error analytics-state" role="alert">
          <p>Analytics could not be loaded. Check your connection and try again.</p>
          <button className="button button-secondary" type="button" onClick={() => { setLoading(true); void load(); }}>Retry</button>
        </div>
      ) : null}

      {data ? <>
        <div className="maintenance-metrics analytics-metrics">
          <Stat label="Reports" value={reports.length} />
          <Stat label="High / urgent" value={highUrgentTotal} />
          <Stat label="Facilities" value={data.facilities.length} />
        </div>

        <div className="analytics-grid" aria-busy={loading}>
          <ChartCard title="Reports by facility / room" description="All persisted reports, including reports at archived facilities.">
            {facilityRows.length ? <div className="analytics-rows">
              {facilityRows.map((facility) => <div className="analytics-row" key={facility.id}>
                <FacilityLabel name={facility.name} room={facility.room} archived={facility.is_archived} />
                <div className="analytics-bar-line">
                  <BarTrack label={`${facility.reportCount} reports`}>
                    <span className="analytics-bar analytics-bar-total" style={{ width: `${percent(facility.reportCount, reportMax)}%` }} />
                  </BarTrack>
                  <strong className="analytics-count">{facility.reportCount}</strong>
                </div>
              </div>)}
            </div> : <EmptyState text="No facilities are available." />}
          </ChartCard>

          <ChartCard title="HIGH / URGENT by facility" description="Only reports whose stored priority is HIGH or URGENT are counted.">
            {facilityRows.length ? <>
              <Legend items={[{ label: "HIGH", className: "priority-high" }, { label: "URGENT", className: "priority-urgent" }]} />
              <div className="analytics-rows">
                {highUrgentRows.map((facility) => <div className="analytics-row" key={facility.id}>
                  <FacilityLabel name={facility.name} room={facility.room} archived={facility.is_archived} />
                  <div className="analytics-bar-line">
                    <BarTrack label={`${facility.highCount} HIGH and ${facility.urgentCount} URGENT reports`}>
                      <span className="analytics-bar priority-high" style={{ width: `${percent(facility.highCount, highUrgentMax)}%` }} />
                      <span className="analytics-bar priority-urgent" style={{ width: `${percent(facility.urgentCount, highUrgentMax)}%` }} />
                    </BarTrack>
                    <strong className="analytics-count">{facility.highCount + facility.urgentCount}</strong>
                  </div>
                </div>)}
              </div>
            </> : <EmptyState text="No facilities are available." />}
          </ChartCard>

          <ChartCard title="Categories by facility" description="Categories are derived from values currently stored on reports.">
            {categoryValues.length ? <>
              <Legend items={categoryValues.map((category, index) => ({
                label: category,
                color: categoryColor(index, categoryValues.length),
              }))} />
              <div className="analytics-rows">
                {facilityRows.map((facility) => <div className="analytics-row" key={facility.id}>
                  <FacilityLabel name={facility.name} room={facility.room} archived={facility.is_archived} />
                  <div className="analytics-bar-line">
                    <BarTrack label={categoryValues.map((category) => `${category}: ${facility.categories.find((item) => item.value === category)?.count ?? 0}`).join(", ")}>
                      {categoryValues.map((category, index) => {
                        const count = facility.categories.find((item) => item.value === category)?.count ?? 0;
                        return <span
                          className="analytics-bar"
                          key={category}
                          title={`${category}: ${count}`}
                          aria-hidden="true"
                          style={{ width: `${percent(count, categoryMax)}%`, backgroundColor: categoryColor(index, categoryValues.length) }}
                        />;
                      })}
                    </BarTrack>
                    <strong className="analytics-count">{facility.reportCount}</strong>
                  </div>
                </div>)}
              </div>
            </> : <EmptyState text="No report categories are available yet." />}
          </ChartCard>

          <ChartCard title="Current status distribution" description="Observed status values and counts from current report rows.">
            {statusCounts.length ? <div className="analytics-rows">
              {statusCounts.map((status) => <div className="analytics-row analytics-status-row" key={status.value}>
                <span className="analytics-status-label">{status.value.replaceAll("_", " ")}</span>
                <div className="analytics-bar-line">
                  <BarTrack label={`${status.count} reports with status ${status.value}`}>
                    <span className="analytics-bar analytics-bar-status" style={{ width: `${percent(status.count, statusMax)}%` }} />
                  </BarTrack>
                  <strong className="analytics-count">{status.count}</strong>
                </div>
              </div>)}
            </div> : <EmptyState text="No reports are available yet." />}
          </ChartCard>
        </div>

        <p className="analytics-footnote">Reports over time is deferred until the persisted report history can support a useful trend.</p>
      </> : null}
    </section>
  );
}

function countBy<T>(items: T[], getValue: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = getValue(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({ value, count }));
}

function percent(value: number, max: number) {
  return max === 0 ? 0 : (value / max) * 100;
}

function categoryColor(index: number, total: number) {
  return `hsl(${(index * 360) / total} 48% 38%)`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span className="metric-label">{label}</span><strong className="metric-value">{value.toLocaleString()}</strong></div>;
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="facility-section analytics-card">
    <div className="section-heading analytics-card-heading"><div><h3 className="section-title">{title}</h3><p className="analytics-description">{description}</p></div></div>
    {children}
  </section>;
}

function FacilityLabel({ name, room, archived }: { name: string; room: string; archived: boolean }) {
  return <div className="analytics-facility-label">
    <strong>{name}</strong><span>{room}</span>{archived ? <span className="analytics-archived">Archived</span> : null}
  </div>;
}

function BarTrack({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="analytics-track" role="img" aria-label={label}>{children}</div>;
}

function Legend({ items }: { items: { label: string; className?: string; color?: string }[] }) {
  return <ul className="analytics-legend" aria-label="Chart legend">
    {items.map((item) => <li key={item.label}><span className={`analytics-legend-swatch ${item.className ?? ""}`} style={item.color ? { backgroundColor: item.color } : undefined} aria-hidden="true" />{item.label}</li>)}
  </ul>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="list-state analytics-empty">{text}</p>;
}

function AdminContent() {
  const { auth } = useSpotAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [message, setMessage] = useState("");
  const loadProfiles = useCallback(async () => {
    const { data: people, error } = await supabase
      .from("profiles")
      .select("id,email,role,created_at")
      .order("created_at", { ascending: false });
    if (error) setMessage("Could not load user directory."); else { setProfiles((people ?? []) as Profile[]); setMessage(""); }
  }, []);

  useEffect(() => { async function initialLoad() { await loadProfiles(); } void initialLoad(); }, [loadProfiles]);

  async function changeRole(userId: string, role: SpotRole) {
    setMessage("");
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) setMessage("Role change was denied or could not be saved."); else await loadProfiles();
  }

  return <main className="app-frame">
    <header className="app-header"><Link className="wordmark" href="/">SPOT<span className="wordmark-mark">.</span></Link><p className="header-context">ADMINISTRATION</p>{auth && <button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>}</header>
    <div className="page-content">
      <AnalyticsDashboard />
      <section className="facility-section admin-users-section">
        <div className="section-heading"><div><p className="eyebrow">ACCESS MANAGEMENT</p><h2 className="section-title">Users</h2></div><Link className="button button-secondary" href="/maintenance">Maintenance queue</Link></div>
        {message && <p className="form-error" role="alert">{message}</p>}
        <div className="queue-list">{profiles.map(profile => <article className="queue-row" key={profile.id}><div className="queue-report-copy"><h3 className="report-title">{profile.email ?? "No email"}</h3><p className="report-location">Joined {new Date(profile.created_at).toLocaleDateString()} · {profile.id.slice(0, 8)}</p></div><label className="field-label">Role <select aria-label={`Role for ${profile.email ?? profile.id}`} className="text-input" value={profile.role} disabled={profile.id === auth?.user.id} onChange={e => void changeRole(profile.id, e.target.value as SpotRole)}><option value="USER">User</option><option value="MAINTENANCE">Maintenance</option><option value="ADMIN">Admin</option></select></label></article>)}</div>
        <p className="page-lede admin-users-note">New accounts start as USER. Bootstrap the first administrator by changing that account’s role in Supabase SQL Editor to ADMIN.</p>
      </section>
    </div>
  </main>;
}

export default function AdminPage() {
  return <AuthGate roles={["ADMIN"]}><AdminContent /></AuthGate>;
}
