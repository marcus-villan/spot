"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useSpotAuth } from "../../lib/auth";
import { AuthGate } from "../../components/auth-gate";
import { useSpotRealtime } from "../../lib/spot-realtime";

type CaseRecord = { id: string; title: string; description: string; status: string; category: string; priority: string; attachment_urls: string[]; assigned_to: string | null; user_id: string | null; created_at: string; updated_at: string; resolution_notes: string | null; facilities: { name: string; room: string }; };
type Activity = { id: string; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string; actor_id: string | null };
type Note = { id: string; message: string; created_at: string; user_id: string | null };

function CaseContent() {
  const { id } = useParams<{ id: string }>();
  const { auth } = useSpotAuth();
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const timeline = [
    ...activity.map(item => ({ id: item.id, created_at: item.created_at, type: item.event_type, from: item.from_status, to: item.to_status, text: item.note })),
    ...notes.map(note => ({ id: `note-${note.id}`, created_at: note.created_at, type: "MAINTENANCE_UPDATE", from: null, to: null, text: note.message })),
  ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const load = useCallback(async () => {
    const [{ data: report, error: reportError }, { data: events }, { data: updates }] = await Promise.all([
      supabase.from("reports").select("id,title,description,status,category,priority,attachment_urls,assigned_to,user_id,created_at,updated_at,resolution_notes,facilities(name,room)").eq("id", id).maybeSingle(),
      supabase.from("report_activity").select("id,event_type,from_status,to_status,note,created_at,actor_id").eq("report_id", id).order("created_at"),
      supabase.from("forum_updates").select("id,message,created_at,user_id").eq("report_id", id).order("created_at"),
    ]);
    if (reportError || !report) { setError("This case is unavailable or you do not have access."); return; }
    const ids = [report.user_id, report.assigned_to].filter((value): value is string => Boolean(value));
    if (ids.length) {
      const { data: members } = await supabase.from("profiles").select("id,name,email").in("id", ids);
      setPeople(Object.fromEntries((members ?? []).map(member => [member.id, member.name || member.email || member.id.slice(0, 8)])));
    }
    setRecord(report as unknown as CaseRecord); setActivity((events ?? []) as Activity[]); setNotes((updates ?? []) as Note[]); setError("");
  }, [id]);

  useEffect(() => { async function initialLoad() { await load(); } void initialLoad(); }, [load]);
  useSpotRealtime(`spot-case-${id}`, { onReportUpdate: () => { void load(); }, onReportInsert: () => { void load(); }, onForumUpdateInsert: () => { void load(); }, onReportActivityInsert: () => { void load(); } });

  async function closeCase() {
    if (!record || record.status !== "RESOLVED") return;
    const { error: updateError } = await supabase.from("reports").update({ status: "CLOSED", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "RESOLVED");
    if (updateError) setError("Only an administrator can close a resolved case."); else await load();
  }

  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (!record) return <p className="list-state">Loading case…</p>;
  const statusEvents = ["REPORT_STATUS_CHANGED", "REPORT_ACKNOWLEDGED", "REPORT_RESOLVED", "REPORT_CLOSED"];
  return <main className="app-frame"><header className="app-header"><Link className="wordmark" href="/">SPOT<span className="wordmark-mark">.</span></Link><p className="header-context">MAINTENANCE CASE</p><Link className="text-button" href={auth?.role === "USER" ? "/" : "/maintenance"}>Back</Link></header><div className="page-content"><section className="student-intro"><p className="eyebrow">CASE / {record.id.slice(0, 8).toUpperCase()}</p><div className="maintenance-title-row"><div><h1 className="page-title">{record.title}</h1><p className="page-lede">{record.facilities.room} / {record.facilities.name}</p></div><Status status={record.status} /></div></section><div className="case-grid"><section className="facility-section"><p className="eyebrow">CASE DETAILS</p><dl className="case-details"><dt>Category</dt><dd>{record.category}</dd><dt>Priority</dt><dd>{record.priority}</dd><dt>Submitted</dt><dd>{new Date(record.created_at).toLocaleString()}</dd><dt>Last updated</dt><dd>{new Date(record.updated_at).toLocaleString()}</dd><dt>Status</dt><dd>{record.status}</dd><dt>Reporter</dt><dd>{record.user_id === auth?.user.id ? auth.user.email : record.user_id ? people[record.user_id] ?? "Reporter" : "Legacy report"}</dd><dt>Assigned to</dt><dd>{record.assigned_to === auth?.user.id ? "You" : record.assigned_to ? people[record.assigned_to] ?? "Assigned" : "Unassigned"}</dd></dl><h2 className="section-title">Description</h2><p className="report-description">{record.description}</p>{record.attachment_urls?.length > 0 && <div><h2 className="section-title">Attachments</h2>{record.attachment_urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">View attachment</a>)}</div>}{record.resolution_notes && <><h2 className="section-title">Resolution</h2><p>{record.resolution_notes}</p></>}{auth?.role === "ADMIN" && record.status === "RESOLVED" && <button className="button button-primary" onClick={() => void closeCase()}>Close case</button>}</section><section className="facility-section"><p className="eyebrow">ACTIVITY</p><ol className="case-timeline">{timeline.map(item => <li key={item.id}><span className="timeline-dot" /><div><strong>{item.type === "REPORT_CREATED" ? "Report submitted" : statusEvents.includes(item.type) ? `${item.from ?? "Status"} → ${item.to}` : item.type === "MAINTENANCE_UPDATE" ? "Maintenance update" : item.type.replaceAll("_", " ")}</strong>{item.text && <p>{item.text}</p>}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></div></li>)}</ol>{timeline.length === 0 && <p className="list-state">No activity recorded yet.</p>}</section></div></div></main>;
}

function Status({ status }: { status: string }) { return <span className={`status ${status === "RESOLVED" || status === "CLOSED" ? "status-resolved" : status === "IN_PROGRESS" ? "status-in-progress" : "status-pending"}`}>{status.replaceAll("_", " ")}</span>; }

export default function ReportCasePage() { return <AuthGate><CaseContent /></AuthGate>; }
