import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Input, Pagination, Select, Table } from "antd";
import {
  PageHeader,
  StatusBadge,
  formatWhen,
} from "../../components/admin/AdminUI";
import { getAdminJobs } from "../../services/adminService";
import { formatBytes } from "../../services/downloadService";

export default function AdminDownloads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    per_page: 25,
  });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [ip, setIp] = useState(searchParams.get("ip") || "");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (nextPage = 1, filters = { status, ip, q }) => {
    setLoading(true);
    setError("");
    try {
      const jobRes = await getAdminJobs({
        page: nextPage,
        status: filters.status,
        ip: filters.ip,
        q: filters.q,
      });
      setJobs(jobRes.data || []);
      setMeta(
        jobRes.meta || {
          current_page: 1,
          last_page: 1,
          total: 0,
          per_page: 25,
        }
      );
      setPage(jobRes.meta?.current_page || nextPage);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not load downloads.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const nextStatus = searchParams.get("status") || "";
    const nextIp = searchParams.get("ip") || "";
    const nextQ = searchParams.get("q") || "";
    setStatus(nextStatus);
    setIp(nextIp);
    setQ(nextQ);
    load(1, { status: nextStatus, ip: nextIp, q: nextQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const applyFilters = () => {
    const next = {};
    if (status) next.status = status;
    if (ip) next.ip = ip;
    if (q) next.q = q;
    setSearchParams(next);
  };

  const clearFilters = () => {
    setStatus("");
    setIp("");
    setQ("");
    setSearchParams({});
  };

  const columns = useMemo(
    () => [
      {
        title: "When",
        dataIndex: "created_at",
        key: "created_at",
        width: 140,
        render: formatWhen,
      },
      {
        title: "Client",
        dataIndex: "client_ip",
        key: "client_ip",
        width: 128,
        render: (v) => <span className="admin-mono">{v || "—"}</span>,
      },
      {
        title: "Title",
        dataIndex: "title",
        key: "title",
        ellipsis: true,
        render: (v, row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{v || "Untitled"}</p>
            <p className="truncate text-xs text-muted">{row.channel || row.url}</p>
          </div>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (v) => <StatusBadge status={v} />,
      },
      {
        title: "Output",
        key: "format",
        width: 120,
        render: (_, row) => (
          <span className="admin-mono text-xs uppercase">
            {row.format || "—"} · {row.quality || "—"}
          </span>
        ),
      },
      {
        title: "Size",
        dataIndex: "size",
        key: "size",
        width: 88,
        align: "right",
        render: (v) => (v ? formatBytes(v) : "—"),
      },
    ],
    []
  );

  return (
    <div className="admin-page animate-rise">
      <PageHeader
        eyebrow="Activity"
        title="Downloads"
        description="Every queued job with client IP, status, and request metadata."
        actions={
          <Button className="admin-btn" onClick={() => load(page)} loading={loading}>
            Refresh
          </Button>
        }
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-6" /> : null}

      <div className="admin-toolbar">
        <Select
          allowClear
          placeholder="Status"
          className="admin-select min-w-36"
          value={status || undefined}
          onChange={(v) => setStatus(v || "")}
          options={[
            { value: "queued", label: "Queued" },
            { value: "processing", label: "Processing" },
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <Input
          allowClear
          placeholder="Filter by IP"
          className="admin-field w-40"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onPressEnter={applyFilters}
        />
        <Input
          allowClear
          placeholder="Search title or URL"
          className="admin-field min-w-48 flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={applyFilters}
        />
        <Button type="primary" className="admin-btn-primary" onClick={applyFilters}>
          Apply
        </Button>
        <Button className="admin-btn" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      <div className="admin-table-shell">
        <div className="admin-table-meta">
          <p>
            <strong>{meta.total}</strong> results
          </p>
        </div>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          pagination={false}
          columns={columns}
          dataSource={jobs}
          locale={{ emptyText: "No downloads match these filters." }}
          expandable={{
            expandedRowRender: (row) => (
              <div className="admin-expand">
                <div>
                  <span className="admin-expand-label">URL</span>
                  <a href={row.url} target="_blank" rel="noreferrer" className="break-all">
                    {row.url}
                  </a>
                </div>
                <div>
                  <span className="admin-expand-label">User agent</span>
                  <p className="admin-mono text-xs">{row.user_agent || "—"}</p>
                </div>
                {row.error_message ? (
                  <div>
                    <span className="admin-expand-label">Error</span>
                    <p className="text-accent">{row.error_message}</p>
                  </div>
                ) : null}
                {row.batch_id ? (
                  <div>
                    <span className="admin-expand-label">Batch</span>
                    <p className="admin-mono text-xs">
                      {row.batch_id} · #{row.batch_index}
                    </p>
                  </div>
                ) : null}
              </div>
            ),
          }}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Pagination
          current={meta.current_page}
          total={meta.total}
          pageSize={meta.per_page || 25}
          onChange={(p) => load(p)}
          showSizeChanger={false}
        />
      </div>
    </div>
  );
}
