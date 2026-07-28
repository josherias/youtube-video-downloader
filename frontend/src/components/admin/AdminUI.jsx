import { ConfigProvider } from "antd";

export const adminTheme = {
  token: {
    colorPrimary: "#d61f3c",
    colorLink: "#d61f3c",
    borderRadius: 8,
    fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
    colorText: "#12141a",
    colorTextSecondary: "#6b7280",
    colorBorder: "#e4e6eb",
    controlHeight: 40,
  },
  components: {
    Table: {
      headerBg: "#f7f8fa",
      headerColor: "#6b7280",
      rowHoverBg: "#fafbfc",
      borderColor: "#e4e6eb",
    },
    Button: {
      primaryShadow: "none",
    },
  },
};

export function AdminTheme({ children }) {
  return <ConfigProvider theme={adminTheme}>{children}</ConfigProvider>;
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="admin-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="admin-eyebrow">{eyebrow}</p> : null}
        <h1 className="admin-title">{title}</h1>
        {description ? <p className="admin-desc">{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }) {
  const key = String(status || "unknown").toLowerCase();
  return <span className={`admin-badge admin-badge--${key}`}>{status || "—"}</span>;
}

export function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDayLabel(dateStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr.slice(5);
  }
}

export function successRate(completed, total) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}
