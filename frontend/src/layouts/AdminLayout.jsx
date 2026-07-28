import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "antd";
import { AdminTheme } from "../components/admin/AdminUI";
import {
  adminLogout,
  adminMe,
  clearAdminToken,
  getAdminToken,
  getAdminUser,
} from "../services/adminService";
import {
  ADMIN_CLIENTS_PATH,
  ADMIN_DOWNLOADS_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_OVERVIEW_PATH,
  HOME_PATH,
} from "../router/routes";

const NAV = [
  {
    to: ADMIN_OVERVIEW_PATH,
    label: "Overview",
    hint: "Totals & trends",
    end: true,
  },
  {
    to: ADMIN_DOWNLOADS_PATH,
    label: "Downloads",
    hint: "Job activity",
  },
  {
    to: ADMIN_CLIENTS_PATH,
    label: "Clients",
    hint: "IPs & volume",
  },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getAdminUser());
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate(ADMIN_LOGIN_PATH, { replace: true });
      return;
    }

    adminMe()
      .then((me) => {
        setUser(me);
        setReady(true);
      })
      .catch(() => {
        clearAdminToken();
        navigate(ADMIN_LOGIN_PATH, { replace: true });
      });
  }, [navigate]);

  const signOut = async () => {
    await adminLogout();
    navigate(ADMIN_LOGIN_PATH, { replace: true });
  };

  if (!ready) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center">
        <div className="admin-loading">
          <span className="admin-loading-mark" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const sidebar = (
    <div className="admin-sidebar-inner">
      <div className="admin-brand">
        <p className="admin-brand-kicker">TubeGrab</p>
        <p className="admin-brand-title">Operations</p>
        <div className="admin-user-chip">
          <span className="admin-user-dot" aria-hidden />
          <div className="min-w-0">
            <p className="admin-user-name">{user?.name || "Admin"}</p>
            <p className="admin-user-email">{user?.email}</p>
          </div>
        </div>
      </div>

      <nav className="admin-nav" aria-label="Admin">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `admin-nav-link${isActive ? " is-active" : ""}`
            }
            onClick={() => setMobileOpen(false)}
          >
            <span className="admin-nav-label">{item.label}</span>
            <span className="admin-nav-hint">{item.hint}</span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar-foot">
        <Link to={HOME_PATH} className="admin-foot-link">
          ← Downloader
        </Link>
        <Button className="admin-signout" block onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <AdminTheme>
      <div className="admin-shell min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        {mobileOpen ? (
          <button
            type="button"
            className="admin-backdrop lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          className={`admin-sidebar ${mobileOpen ? "is-open" : ""}`}
        >
          {sidebar}
        </aside>

        <div className="admin-main min-w-0">
          <header className="admin-mobile-bar lg:hidden">
            <button
              type="button"
              className="admin-menu-btn"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? "Close" : "Menu"}
            </button>
            <p className="font-display text-lg text-ink">TubeGrab</p>
            <span className="w-12" />
          </header>

          <main className="admin-content">
            <Outlet context={{ user }} />
          </main>
        </div>
      </div>
    </AdminTheme>
  );
}
