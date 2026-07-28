import { Outlet } from "react-router-dom";

export default function GuestLayout() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-slate-400/10 blur-3xl"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-2 pt-7 sm:px-8">
        <p className="animate-fade text-xs font-medium uppercase tracking-[0.22em] text-muted">
          Personal media tool
        </p>
        <p className="animate-fade text-xs text-muted sm:text-sm">
          Fast · Local · MP4
        </p>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-6 sm:px-8 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
