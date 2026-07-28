import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Select, Table } from "antd";
import {
  PageHeader,
  formatWhen,
  successRate,
} from "../../components/admin/AdminUI";
import { getAdminOverview } from "../../services/adminService";
import { ADMIN_DOWNLOADS_PATH } from "../../router/routes";

export default function AdminClients() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const overview = await getAdminOverview({ days });
      setRows(overview.top_ips || []);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not load clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const summary = useMemo(() => {
    const requests = rows.reduce((s, r) => s + r.total, 0);
    const completed = rows.reduce((s, r) => s + r.completed, 0);
    return {
      clients: rows.length,
      requests,
      rate: successRate(completed, requests),
    };
  }, [rows]);

  return (
    <div className="admin-page animate-rise">
      <PageHeader
        eyebrow="Traffic"
        title="Clients"
        description="IP addresses ranked by request volume for the selected window."
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

      <section className="admin-metric-grid admin-metric-grid--3 mb-8">
        <div className="admin-metric">
          <p className="admin-metric-label">Clients listed</p>
          <p className="admin-metric-value">{summary.clients}</p>
          <p className="admin-metric-hint">Top IPs in range</p>
        </div>
        <div className="admin-metric">
          <p className="admin-metric-label">Requests</p>
          <p className="admin-metric-value">{summary.requests}</p>
          <p className="admin-metric-hint">From these IPs</p>
        </div>
        <div className="admin-metric admin-metric--success">
          <p className="admin-metric-label">Completion</p>
          <p className="admin-metric-value">{summary.rate}%</p>
          <p className="admin-metric-hint">Among listed clients</p>
        </div>
      </section>

      <div className="admin-table-shell">
        <Table
          rowKey="ip"
          loading={loading}
          pagination={false}
          dataSource={rows}
          locale={{ emptyText: "No client IP data yet. New downloads will appear here." }}
          columns={[
            {
              title: "#",
              key: "rank",
              width: 56,
              render: (_, __, index) => (
                <span className="admin-rank">{index + 1}</span>
              ),
            },
            {
              title: "IP address",
              dataIndex: "ip",
              key: "ip",
              render: (ip) => (
                <Link
                  className="admin-mono font-medium text-ink hover:text-accent"
                  to={`${ADMIN_DOWNLOADS_PATH}?ip=${encodeURIComponent(ip)}`}
                >
                  {ip}
                </Link>
              ),
            },
            {
              title: "Requests",
              dataIndex: "total",
              key: "total",
              width: 110,
              align: "right",
            },
            {
              title: "Completed",
              dataIndex: "completed",
              key: "completed",
              width: 110,
              align: "right",
            },
            {
              title: "Failed",
              dataIndex: "failed",
              key: "failed",
              width: 90,
              align: "right",
            },
            {
              title: "Success",
              key: "rate",
              width: 150,
              render: (_, row) => {
                const rate = successRate(row.completed, row.total);
                return (
                  <div className="admin-rate">
                    <div className="admin-rate-track">
                      <div
                        className="admin-rate-fill"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span>{rate}%</span>
                  </div>
                );
              },
            },
            {
              title: "Last seen",
              dataIndex: "last_seen",
              key: "last_seen",
              width: 140,
              render: formatWhen,
            },
          ]}
        />
      </div>
    </div>
  );
}
