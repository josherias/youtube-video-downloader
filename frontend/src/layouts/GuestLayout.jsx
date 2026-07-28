import { Outlet } from "react-router-dom";

export default function GuestLayout() {
  return (
    <div className="relative min-h-screen overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-slate-400/10 blur-3xl"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 pb-1 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pb-2 sm:pt-7">
        <p className="animate-fade text-[11px] font-medium uppercase tracking-[0.18em] text-muted sm:text-xs sm:tracking-[0.22em]">
          Personal media tool
        </p>
        <p className="animate-fade text-[11px] text-muted sm:text-sm">
          Fast · Local · Clips
        </p>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-8 sm:pb-20 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
