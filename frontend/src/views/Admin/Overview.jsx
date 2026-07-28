import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Select, Skeleton } from "antd";
import { PageHeader, formatDayLabel, successRate } from "../../components/admin/AdminUI";
import { getAdminOverview } from "../../services/adminService";
import { formatBytes } from "../../services/downloadService";
import { ADMIN_CLIENTS_PATH, ADMIN_DOWNLOADS_PATH } from "../../router/routes";

function Metric({ label, value, hint, tone }) {
  return (
    <div className={`admin-metric${tone ? ` admin-metric--${tone}` : ""}`}>
      <p className="admin-metric-label">{label}</p>
      <p className="admin-metric-value">{value}</p>
      {hint ? <p className="admin-metric-hint">{hint}</p> : null}
    </div>
  );
}

function VolumeChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  const total = days.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="admin-chart">
      <div className="admin-chart-meta">
        <div>
          <p className="admin-section-kicker">Activity</p>
          <h2 className="admin-section-title">Daily volume</h2>
        </div>
        <p className="admin-chart-total">
          <strong>{total}</strong> jobs in range
        </p>
      </div>

      <div className="admin-chart-bars" role="img" aria-label="Daily download volume">
        {days.map((day) => {
          const height = `${Math.max(day.total ? 8 : 3, (day.total / max) * 100)}%`;
          const completedH =
            day.total > 0 ? `${(day.completed / day.total) * 100}%` : "0%";
          return (
            <div key={day.date} className="admin-bar-col" title={`${day.date}: ${day.total}`}>
              <div className="admin-bar-track">
                <div className="admin-bar" style={{ height }}>
                  <div className="admin-bar-fill" style={{ height: completedH }} />
                </div>
              </div>
              <span className="admin-bar-label">{formatDayLabel(day.date)}</span>
            </div>
          );
        })}
      </div>

      <div className="admin-legend">
        <span>
          <i className="admin-swatch admin-swatch--total" /> Total
        </span>
        <span>
          <i className="admin-swatch admin-swatch--ok" /> Completed
        </span>
      </div>
    </div>
  );
}

function Distribution({ title, rows, keyName }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="admin-panel">
      <p className="admin-section-kicker">Breakdown</p>
      <h2 className="admin-section-title">{title}</h2>
      <ul className="admin-dist mt-5">
        {rows.length === 0 ? (
          <li className="text-sm text-muted">No data yet.</li>
        ) : (
          rows.map((row) => (
            <li key={row[keyName]} className="admin-dist-row">
              <div className="admin-dist-head">
                <span className="admin-dist-name">{row[keyName]}</span>
                <span className="admin-dist-count">{row.total}</span>
              </div>
              <div className="admin-dist-track">
                <div
                  className="admin-dist-fill"
                  style={{ width: `${(row.total / max) * 100}%` }}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function AdminOverview() {
  const [days, setDays] = useState(14);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setOverview(await getAdminOverview({ days }));
    } catch (err) {
      setError(err?.response?.data?.error || "Could not load overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const totals = overview?.totals;
  const rate = useMemo(
    () => (totals ? successRate(totals.completed, totals.all) : 0),
    [totals]
  );

  return (
    <div className="admin-page animate-rise">
      <PageHeader
        eyebrow="Dashboard"
        title="Overview"
        description="Live pulse on downloads, completion rate, and format mix."
        actions={
          <>
            <Select
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: "Last 7 days" },
                { value: 14, label: "Last 14 days" },
                { value: 30, label: "Last 30 days" },
                { value: 90, label: "Last 90 days" },
              ]}
              className="admin-select min-w-40"
            />
            <Button className="admin-btn" onClick={load} loading={loading}>
              Refresh
            </Button>
          </>
        }
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-6" /> : null}

      {loading && !overview ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : totals ? (
        <>
          <section className="admin-metric-grid">
            <Metric
              label="Downloads"
              value={totals.all}
              hint={`${totals.active} in progress`}
            />
            <Metric
              label="Completed"
              value={totals.completed}
              hint={formatBytes(totals.bytes_completed || 0)}
              tone="success"
            />
            <Metric
              label="Success rate"
              value={`${rate}%`}
              hint={`${totals.failed} failed · ${totals.cancelled} cancelled`}
            />
            <Metric
              label="Unique clients"
              value={totals.unique_ips}
              hint={`${totals.batches} batch runs`}
            />
          </section>

          <section className="admin-overview-grid">
            <VolumeChart days={overview.daily || []} />
            <div className="admin-side-stack">
              <div className="admin-panel admin-panel--accent">
                <p className="admin-section-kicker">Shortcuts</p>
                <h2 className="admin-section-title">Investigate</h2>
                <div className="mt-5 space-y-3">
                  <Link className="admin-quick-link" to={ADMIN_DOWNLOADS_PATH}>
                    <span>View all downloads</span>
                    <span aria-hidden>→</span>
                  </Link>
                  <Link className="admin-quick-link" to={ADMIN_CLIENTS_PATH}>
                    <span>Inspect top IPs</span>
                    <span aria-hidden>→</span>
                  </Link>
                  <Link
                    className="admin-quick-link"
                    to={`${ADMIN_DOWNLOADS_PATH}?status=failed`}
                  >
                    <span>Failed jobs only</span>
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
              <Distribution
                title="Formats"
                rows={overview.by_format || []}
                keyName="format"
              />
            </div>
          </section>

          <div className="mt-4">
            <Distribution
              title="Quality preference"
              rows={overview.by_quality || []}
              keyName="quality"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
