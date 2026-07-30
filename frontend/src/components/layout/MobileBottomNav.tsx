import { useState } from "react";
import {
  EllipsisIcon,
  FilePenLineIcon,
  FolderOpenIcon,
  HomeIcon,
  InfoIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { NewInvestigationDialog } from "@/components/layout/NewInvestigationDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { cn } from "@/lib/utils";

/** Shared look for every primary tab (icon over a tiny label), active state matches Sidebar's. */
const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
    isActive ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground",
  );

/** Same treatment for the rows inside the "More" sheet, mirroring Sidebar's nav links. */
const moreRowClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium outline-none transition-colors",
    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  );

/**
 * §6.5 mobile counterpart to the desktop rail: below `lg`, `Sidebar` is hidden
 * (see Sidebar.tsx) and this fixed bottom tab bar takes over — the four most
 * common actions directly, everything else (Profile/Settings/About/Admin/
 * Logout) behind a "More" sheet, the same pattern phone apps use so the
 * officer's thumb never has to reach the top of the screen.
 */
export function MobileBottomNav() {
  const strings = useStrings();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Same forced-fresh-navigation trick as Sidebar's Home link, so HomePage resets its search. */}
        <NavLink
          to="/home"
          className={tabClass}
          onClick={(e) => {
            e.preventDefault();
            setMoreOpen(false);
            navigate("/home", { replace: true, state: { home: Date.now() } });
          }}
        >
          <HomeIcon className="size-5 shrink-0" />
          {strings.nav.home}
        </NavLink>

        <NewInvestigationDialog
          label={strings.nav.newFir}
          className="h-auto flex-1 flex-col items-center justify-center gap-0.5 rounded-none px-1 py-2 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        />

        <NavLink to="/diary/new" className={tabClass} title={strings.nav.addEditDiary}>
          <FilePenLineIcon className="size-5 shrink-0" />
          {strings.nav.addEditDiaryShort}
        </NavLink>

        <NavLink to="/diaries" className={tabClass} title={strings.nav.viewDiaries}>
          <FolderOpenIcon className="size-5 shrink-0" />
          {strings.nav.viewDiariesShort}
        </NavLink>

        <button type="button" onClick={() => setMoreOpen(true)} className={tabClass({ isActive: false })}>
          <EllipsisIcon className="size-5 shrink-0" />
          {strings.nav.more}
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{user.name}</DialogTitle>
            <DialogDescription>{user.designation ?? strings.roles[user.role]}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <NavLink to="/profile" className={moreRowClass} onClick={() => setMoreOpen(false)}>
              <UserIcon className="size-4 shrink-0" />
              {strings.nav.profile}
            </NavLink>
            <NavLink to="/settings" className={moreRowClass} onClick={() => setMoreOpen(false)}>
              <SettingsIcon className="size-4 shrink-0" />
              {strings.nav.settings}
            </NavLink>
            <NavLink to="/about" className={moreRowClass} onClick={() => setMoreOpen(false)}>
              <InfoIcon className="size-4 shrink-0" />
              {strings.nav.aboutPortal}
            </NavLink>
            {user.role === "ADMIN" && (
              <NavLink to="/admin" className={moreRowClass} onClick={() => setMoreOpen(false)}>
                <ShieldIcon className="size-4 shrink-0" />
                {strings.nav.admin}
              </NavLink>
            )}
          </div>

          <Separator />

          <Button
            variant="ghost"
            className="justify-start gap-3 text-muted-foreground"
            onClick={() => {
              setMoreOpen(false);
              void signOut();
            }}
          >
            <LogOutIcon className="size-4 shrink-0" />
            {strings.nav.logout}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
