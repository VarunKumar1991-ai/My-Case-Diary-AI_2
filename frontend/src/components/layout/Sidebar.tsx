import {
  FilePenLineIcon,
  FolderOpenIcon,
  HomeIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { cn } from "@/lib/utils";

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  );

/** §6.5: identical sidebar shell for both roles — only the role chip and the `Admin` entry vary. */
export function Sidebar() {
  const strings = useStrings();
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="font-mono text-lg font-semibold tracking-tight text-primary">{"> "}</span>
        <span className="font-mono text-base font-semibold text-foreground">{strings.app.name}</span>
      </div>

      <Separator />

      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground mt-0.5">
            {user.designation ?? strings.roles[user.role]}
          </p>
        </div>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        <NavLink to="/home" className={navLinkClasses}>
          <HomeIcon className="size-4" />
          {strings.nav.home}
        </NavLink>
        <NavLink to="/diary/new" className={navLinkClasses}>
          <FilePenLineIcon className="size-4" />
          {strings.nav.addEditDiary}
        </NavLink>
        <NavLink to="/diaries" className={navLinkClasses}>
          <FolderOpenIcon className="size-4" />
          {strings.nav.viewDiaries}
        </NavLink>
        <NavLink to="/profile" className={navLinkClasses}>
          <UserIcon className="size-4" />
          {strings.nav.profile}
        </NavLink>
        <NavLink to="/settings" className={navLinkClasses}>
          <SettingsIcon className="size-4" />
          {strings.nav.settings}
        </NavLink>
        {user.role === "ADMIN" && (
          <NavLink to="/admin" className={navLinkClasses}>
            <ShieldIcon className="size-4" />
            {strings.nav.admin}
          </NavLink>
        )}
      </nav>

      <Separator />

      <div className="p-2">
        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={() => void signOut()}>
          <LogOutIcon className="size-4" />
          {strings.nav.logout}
        </Button>
      </div>
    </aside>
  );
}
