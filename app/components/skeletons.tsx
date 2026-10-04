export function Skeleton({ className = "" }: { className?: string }) { return <span aria-hidden="true" className={`skeleton ${className}`} />; }

export function ReportListSkeleton({ count = 3 }: { count?: number }) {
  return <div className="skeleton-list" aria-label="Loading reports" role="status">{Array.from({ length: count }, (_, index) => <article className="skeleton-report" key={index}><div className="skeleton-copy"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" /><Skeleton className="skeleton-description" /></div><Skeleton className="skeleton-badge" /></article>)}</div>;
}

export function TimelineSkeleton() { return <div className="skeleton-timeline" aria-label="Loading activity" role="status">{[0, 1, 2].map(item => <div className="skeleton-event" key={item}><Skeleton className="skeleton-node" /><div><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" /><Skeleton className="skeleton-description" /></div></div>)}</div>; }

export function AnalyticsSkeleton() { return <div className="analytics-grid" aria-label="Loading analytics" role="status">{[0, 1, 2, 3].map(card => <section className="facility-section analytics-card skeleton-chart" key={card}><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" />{[0, 1, 2, 3].map(row => <div className="skeleton-chart-row" key={row}><Skeleton className="skeleton-meta" /><Skeleton className="skeleton-chart-bar" /></div>)}</section>)}</div>; }

export function AccessSkeleton() { return <main className="app-frame"><div className="page-content access-loading" role="status" aria-label="Checking your access"><Skeleton className="skeleton-meta" /><Skeleton className="skeleton-title" /><Skeleton className="skeleton-description" /><div className="access-loading-block"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" /></div></div></main>; }
