import {
  FilePenLineIcon,
  FolderOpenIcon,
  HomeIcon,
  InfoIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { NewInvestigationDialog } from "@/components/layout/NewInvestigationDialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * §6.5: identical sidebar shell for both roles — only the role chip and the
 * `Admin` entry vary. Collapses to an icon-only rail (Claude-style): every nav
 * option stays clickable as an icon (with a hover tooltip) so the panel remains
 * usable when collapsed.
 */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const strings = useStrings();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center rounded-md py-2 text-sm font-medium outline-none transition-colors",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      collapsed ? "justify-center px-0" : "gap-3 px-3",
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-150",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand + collapse/expand toggle */}
      <div className={cn("flex items-center py-5", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-lg font-semibold tracking-tight text-primary">{"> "}</span>
            <span className="truncate font-mono text-base font-semibold text-foreground">{strings.app.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? strings.nav.showSidebar : strings.nav.hideSidebar}
          title={collapsed ? strings.nav.showSidebar : strings.nav.hideSidebar}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <PanelLeftIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
        </button>
      </div>

      <Separator />

      {/* User — avatar always; name/designation only when expanded */}
      <div className={cn("flex items-center py-4", collapsed ? "justify-center px-2" : "gap-3 px-4")}>
        <div
          title={user.name}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {user.designation ?? strings.roles[user.role]}
            </p>
          </div>
        )}
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {/* Force a fresh navigation on every click (a new location.key) even when
            already on /home, so HomePage resets its search + Quick-searches dropdown. */}
        <NavLink
          to="/home"
          className={itemClass}
          title={strings.nav.home}
          onClick={(e) => {
            e.preventDefault();
            navigate("/home", { replace: true, state: { home: Date.now() } });
          }}
        >
          <HomeIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.home}
        </NavLink>
        <NewInvestigationDialog collapsed={collapsed} />
        <NavLink to="/diary/new" className={itemClass} title={strings.nav.addEditDiary}>
          <FilePenLineIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.addEditDiary}
        </NavLink>
        <NavLink to="/diaries" className={itemClass} title={strings.nav.viewDiaries}>
          <FolderOpenIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.viewDiaries}
        </NavLink>
        <NavLink to="/profile" className={itemClass} title={strings.nav.profile}>
          <UserIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.profile}
        </NavLink>
        <NavLink to="/settings" className={itemClass} title={strings.nav.settings}>
          <SettingsIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.settings}
        </NavLink>
        <NavLink to="/about" className={itemClass} title={strings.nav.aboutPortal}>
          <InfoIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.aboutPortal}
        </NavLink>
        {user.role === "ADMIN" && (
          <NavLink to="/admin" className={itemClass} title={strings.nav.admin}>
            <ShieldIcon className="size-4 shrink-0" />
            {!collapsed && strings.nav.admin}
          </NavLink>
        )}
      </nav>

      <Separator />

      <div className="p-2">
        <Button
          variant="ghost"
          title={strings.nav.logout}
          className={cn("w-full text-muted-foreground", collapsed ? "justify-center px-0" : "justify-start gap-3")}
          onClick={() => void signOut()}
        >
          <LogOutIcon className="size-4 shrink-0" />
          {!collapsed && strings.nav.logout}
        </Button>
      </div>
    </aside>
  );
}
