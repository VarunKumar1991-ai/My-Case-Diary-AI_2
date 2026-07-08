import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";

const SIDEBAR_KEY = "cd_sidebar_open";

/**
 * §6.5/§8: persistent sidebar shell, identical across roles, wraps every
 * authenticated route. The sidebar collapses (Claude-style) to a narrow
 * icon-only rail — all nav options stay reachable as icons — via the toggle in
 * its header. The open/collapsed choice persists in localStorage.
 */
export function DashboardShell() {
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(SIDEBAR_KEY) !== "false");

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(open));
  }, [open]);

  return (
    <div className="flex h-svh bg-background">
      <Sidebar collapsed={!open} onToggle={() => setOpen((v) => !v)} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
