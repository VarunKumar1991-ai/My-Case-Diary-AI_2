import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";

/** §6.5/§8: persistent sidebar shell, identical across roles, wraps every authenticated route. */
export function DashboardShell() {
  return (
    <div className="flex h-svh bg-background">
      <Sidebar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
