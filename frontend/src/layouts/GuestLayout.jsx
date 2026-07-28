import { Link, Outlet } from "react-router-dom";
import { ADMIN_LOGIN_PATH, HOME_PATH } from "../router/routes";

export default function GuestLayout() {
  return (
    <div className="home-shell relative min-h-screen overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_70%_55%_at_15%_0%,rgba(214,31,60,0.12),transparent_60%),radial-gradient(ellipse_50%_40%_at_90%_10%,rgba(18,20,26,0.05),transparent_55%)]"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
        <Link to={HOME_PATH} className="home-header-brand">
          <span className="font-display text-xl text-ink sm:text-2xl">
            Tube<span className="text-accent">Grab</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted sm:gap-6 sm:text-xs">
          <span className="hidden sm:inline">Local · Fast · Private</span>
          <Link
            to={ADMIN_LOGIN_PATH}
            className="transition hover:text-ink"
          >
            Admin
          </Link>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-3 sm:px-8 sm:pb-20 sm:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
