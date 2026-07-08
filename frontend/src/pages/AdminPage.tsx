import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  adminApi,
  type AdminUser,
  type ApprovalStatus,
  type AuditLogEntry,
  type CreateTaxonomyInput,
  type PrivateAccessRequest,
  type TaxonomyItem,
  type UpdateTaxonomyInput,
} from "@/apis/admin";
import { ApiError } from "@/apis/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, type AccountStatus, type Role } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { type Strings } from "@/i18n/en";
import { formatDateTime } from "@/lib/utils";

const ADG_TECHNICAL_DESIGNATION = "ADG (Technical)";

// ── Section shell ──────────────────────────────────────────────────────────

type AdminSection = "caseTypes" | "designations" | "quickSearch" | "users" | "privateAccess" | "auditLog";
const SECTIONS: AdminSection[] = ["caseTypes", "designations", "quickSearch", "users", "privateAccess", "auditLog"];

function sectionLabel(section: AdminSection, strings: Strings): string {
  switch (section) {
    case "caseTypes":
      return strings.admin.tabs.caseTypes;
    case "designations":
      return strings.admin.tabs.designations;
    case "quickSearch":
      return strings.admin.tabs.quickSearch;
    case "users":
      return strings.admin.tabs.users;
    case "privateAccess":
      return strings.admin.tabs.privateAccess;
    case "auditLog":
      return strings.admin.tabs.auditLog;
  }
}

/**
 * §6.4/§10.1: ADMIN-only console covering taxonomy CRUD (D10), user
 * governance (block/unblock), the ADG-Technical private-access approval
 * workflow, and the append-only audit log. One tab per concern — each owns
 * its own fetch/mutate state so a slow audit-log query never blocks the
 * taxonomy editors and vice versa.
 */
export function AdminPage() {
  const strings = useStrings();
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>("caseTypes");

  if (!user) return null;

  const isAdgTechnical = user.designation === ADG_TECHNICAL_DESIGNATION;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{strings.admin.heading}</h1>
        <p className="text-sm text-muted-foreground">{strings.admin.subheading}</p>
      </div>

      <Tabs value={section} onValueChange={(value) => setSection(value as AdminSection)}>
        <TabsList>
          {SECTIONS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {sectionLabel(value, strings)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {section === "caseTypes" && (
        <TaxonomySection
          key="caseTypes"
          intro={strings.admin.taxonomy.caseTypesIntro}
          addLabel={strings.admin.taxonomy.addCaseType}
          editLabel={strings.admin.taxonomy.editCaseType}
          list={() => adminApi.listCaseTypes().then((r) => r.caseTypes)}
          create={(input) => adminApi.createCaseType(input).then((r) => r.caseType)}
          update={(id, input) => adminApi.updateCaseType(id, input).then((r) => r.caseType)}
          deactivate={(id) => adminApi.deactivateCaseType(id)}
        />
      )}

      {section === "designations" && (
        <TaxonomySection
          key="designations"
          intro={strings.admin.taxonomy.designationsIntro}
          addLabel={strings.admin.taxonomy.addDesignation}
          editLabel={strings.admin.taxonomy.editDesignation}
          list={() => adminApi.listDesignations().then((r) => r.designations)}
          create={(input) => adminApi.createDesignation(input).then((r) => r.designation)}
          update={(id, input) => adminApi.updateDesignation(id, input).then((r) => r.designation)}
          deactivate={(id) => adminApi.deactivateDesignation(id)}
        />
      )}

      {section === "quickSearch" && <QuickSearchSection key="quickSearch" />}

      {section === "users" && <UsersSection key="users" />}

      {section === "privateAccess" && <PrivateAccessSection key="privateAccess" isAdgTechnical={isAdgTechnical} />}

      {section === "auditLog" && <AuditLogSection key="auditLog" />}
    </div>
  );
}

// ── Taxonomy (Case types / Designations — identical shape, D10) ───────────

type TaxonomyFetchState =
  | { key: number; status: "ok"; items: TaxonomyItem[] }
  | { key: number; status: "error"; message: string };

type TaxonomyDialogState = { mode: "create" } | { mode: "edit"; item: TaxonomyItem };

interface TaxonomySectionProps {
  intro: string;
  addLabel: string;
  editLabel: string;
  list: () => Promise<TaxonomyItem[]>;
  create: (input: CreateTaxonomyInput) => Promise<TaxonomyItem>;
  update: (id: string, input: UpdateTaxonomyInput) => Promise<TaxonomyItem>;
  deactivate: (id: string) => Promise<void>;
}

function TaxonomySection({ intro, addLabel, editLabel, list, create, update, deactivate }: TaxonomySectionProps) {
  const strings = useStrings();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<TaxonomyFetchState | null>(null);
  const [dialog, setDialog] = useState<TaxonomyDialogState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loading = state === null || state.key !== reloadToken;

  useEffect(() => {
    let cancelled = false;
    const key = reloadToken;
    list()
      .then((items) => {
        if (!cancelled) setState({ key, status: "ok", items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : strings.common.somethingWentWrong;
        setState({ key, status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [list, reloadToken, strings.common.somethingWentWrong]);

  const items = state?.status === "ok" ? state.items : [];

  const handleToggleActive = (item: TaxonomyItem) => {
    setBusyId(item.id);
    const action = item.isActive ? deactivate(item.id) : update(item.id, { isActive: true });
    action
      .then(() => {
        toast.success(item.isActive ? strings.admin.taxonomy.deactivated : strings.admin.taxonomy.reactivated);
        setReloadToken((token) => token + 1);
      })
      .catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{intro}</p>
        <Button size="sm" className="shrink-0" onClick={() => setDialog({ mode: "create" })}>
          {addLabel}
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{strings.common.loading}</p>}
      {!loading && state?.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      {!loading && state?.status === "ok" && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{strings.admin.taxonomy.empty}</p>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          state?.status === "ok" &&
          items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{item.name}</span>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive ? strings.admin.taxonomy.active : strings.admin.taxonomy.inactive}
                    </Badge>
                  </div>
                  {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDialog({ mode: "edit", item })}>
                    {strings.common.edit}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busyId === item.id} onClick={() => handleToggleActive(item)}>
                    {item.isActive ? strings.admin.taxonomy.deactivate : strings.admin.taxonomy.reactivate}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          {dialog && (
            <TaxonomyDialogForm
              key={dialog.mode === "edit" ? `edit-${dialog.item.id}` : "create"}
              state={dialog}
              addLabel={addLabel}
              editLabel={editLabel}
              onCreate={create}
              onUpdate={update}
              onDone={() => {
                setDialog(null);
                setReloadToken((token) => token + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TaxonomyDialogFormProps {
  state: TaxonomyDialogState;
  addLabel: string;
  editLabel: string;
  onCreate: (input: CreateTaxonomyInput) => Promise<TaxonomyItem>;
  onUpdate: (id: string, input: UpdateTaxonomyInput) => Promise<TaxonomyItem>;
  onDone: () => void;
}

function TaxonomyDialogForm({ state, addLabel, editLabel, onCreate, onUpdate, onDone }: TaxonomyDialogFormProps) {
  const strings = useStrings();
  const [name, setName] = useState(state.mode === "edit" ? state.item.name : "");
  const [description, setDescription] = useState(state.mode === "edit" ? (state.item.description ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const input = { name: name.trim(), description: description.trim() || undefined };
    const action = state.mode === "create" ? onCreate(input) : onUpdate(state.item.id, input);

    action
      .then(() => {
        toast.success(state.mode === "create" ? strings.admin.taxonomy.created : strings.admin.taxonomy.updated);
        onDone();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{state.mode === "create" ? addLabel : editLabel}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="taxonomy-name">{strings.admin.taxonomy.name}</Label>
        <Input id="taxonomy-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="taxonomy-description">{strings.admin.taxonomy.descriptionOptional}</Label>
        <Textarea id="taxonomy-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={saving || name.trim().length < 2}>
          {saving ? strings.common.saving : strings.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Quick-search settings (Home page chips) ────────────────────────────────

const QUICK_SEARCH_MAX = 24;

/**
 * Lets the admin decide how many quick-search chips the Home page shows below
 * the search box. The chips themselves are the active case types (managed in the
 * "Case types" tab); this only caps how many of them appear. 0 hides them.
 */
function QuickSearchSection() {
  const strings = useStrings();
  const [limit, setLimit] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getQuickSearchLimit()
      .then(({ limit: value }) => {
        if (!cancelled) setLimit(String(value));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [strings.common.somethingWentWrong]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number.parseInt(limit, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > QUICK_SEARCH_MAX) {
      setError(strings.admin.quickSearch.invalid);
      return;
    }
    setSaving(true);
    setError(null);
    adminApi
      .setQuickSearchLimit(parsed)
      .then(({ limit: saved }) => {
        setLimit(String(saved));
        toast.success(strings.admin.quickSearch.saved);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.admin.quickSearch.intro}</p>

      {loading ? (
        <p className="text-sm text-muted-foreground">{strings.common.loading}</p>
      ) : (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:max-w-sm">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quick-search-limit">{strings.admin.quickSearch.countLabel}</Label>
                <Input
                  id="quick-search-limit"
                  type="number"
                  min={0}
                  max={QUICK_SEARCH_MAX}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{strings.admin.quickSearch.countHint}</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="shrink-0 self-start" disabled={saving}>
                {saving ? strings.common.saving : strings.common.save}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── User governance ────────────────────────────────────────────────────────

const USER_SEARCH_DEBOUNCE_MS = 350;

type UsersFetchState =
  | { key: string; status: "ok"; users: AdminUser[] }
  | { key: string; status: "error"; message: string };

function UsersSection() {
  const strings = useStrings();
  const { user: currentUser } = useAuth();
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<UsersFetchState | null>(null);
  const [blockTarget, setBlockTarget] = useState<AdminUser | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), USER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const requestKey = `${roleFilter}::${statusFilter}::${debouncedSearch}::${reloadToken}`;
  const loading = state === null || state.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const key = `${roleFilter}::${statusFilter}::${debouncedSearch}::${reloadToken}`;
    adminApi
      .listUsers({
        role: roleFilter === "all" ? undefined : roleFilter,
        accountStatus: statusFilter === "all" ? undefined : statusFilter,
        q: debouncedSearch || undefined,
      })
      .then(({ users }) => {
        if (!cancelled) setState({ key, status: "ok", users });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : strings.common.somethingWentWrong;
        setState({ key, status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [roleFilter, statusFilter, debouncedSearch, reloadToken, strings.common.somethingWentWrong]);

  const users = state?.status === "ok" ? state.users : [];

  const handleUnblock = (target: AdminUser) => {
    setBusyId(target.id);
    adminApi
      .unblockUser(target.id)
      .then(() => {
        toast.success(strings.admin.users.unblocked);
        setReloadToken((token) => token + 1);
      })
      .catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.admin.users.intro}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={strings.admin.users.searchPlaceholder}
          aria-label={strings.admin.users.searchPlaceholder}
          className="sm:max-w-xs"
        />
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as Role | "all")}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{strings.admin.users.allRoles}</SelectItem>
            <SelectItem value="OFFICER">{strings.roles.OFFICER}</SelectItem>
            <SelectItem value="ADMIN">{strings.roles.ADMIN}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AccountStatus | "all")}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{strings.admin.users.allStatuses}</SelectItem>
            <SelectItem value="ACTIVE">{strings.admin.users.statusActive}</SelectItem>
            <SelectItem value="BLOCKED">{strings.admin.users.statusBlocked}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{strings.common.loading}</p>}
      {!loading && state?.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      {!loading && state?.status === "ok" && users.length === 0 && (
        <p className="text-sm text-muted-foreground">{strings.admin.users.empty}</p>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          state?.status === "ok" &&
          users.map((target) => (
            <Card key={target.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{target.name}</span>
                    <Badge variant="outline">{target.designation ?? strings.profile.notProvided}</Badge>
                    <Badge variant={target.role === "ADMIN" ? "default" : "secondary"}>{strings.roles[target.role]}</Badge>
                    <Badge variant={target.accountStatus === "ACTIVE" ? "outline" : "destructive"}>
                      {target.accountStatus === "ACTIVE" ? strings.admin.users.statusActive : strings.admin.users.statusBlocked}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {target.id} · {target.email ?? strings.profile.notProvided} · {target.mobile ?? strings.profile.notProvided}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {target.id !== currentUser?.id && (
                    <Button variant="outline" size="sm" disabled={busyId === target.id} onClick={() => setRoleTarget(target)}>
                      {target.role === "ADMIN" ? strings.admin.users.revokeAdmin : strings.admin.users.makeAdmin}
                    </Button>
                  )}
                  {target.accountStatus === "ACTIVE" ? (
                    <Button variant="outline" size="sm" disabled={busyId === target.id} onClick={() => setBlockTarget(target)}>
                      {strings.common.block}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={busyId === target.id} onClick={() => handleUnblock(target)}>
                      {strings.common.unblock}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <Dialog open={blockTarget !== null} onOpenChange={(open) => { if (!open) setBlockTarget(null); }}>
        <DialogContent>
          {blockTarget && (
            <BlockUserDialogForm
              key={blockTarget.id}
              target={blockTarget}
              onClose={() => setBlockTarget(null)}
              onBlocked={() => {
                setBlockTarget(null);
                setReloadToken((token) => token + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={roleTarget !== null} onOpenChange={(open) => { if (!open) setRoleTarget(null); }}>
        <DialogContent>
          {roleTarget && (
            <RoleChangeDialogForm
              key={roleTarget.id}
              target={roleTarget}
              onClose={() => setRoleTarget(null)}
              onChanged={() => {
                setRoleTarget(null);
                setReloadToken((token) => token + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RoleChangeDialogFormProps {
  target: AdminUser;
  onClose: () => void;
  onChanged: () => void;
}

/** Confirms promoting an OFFICER to ADMIN (or reverting an ADMIN to OFFICER). */
function RoleChangeDialogForm({ target, onClose, onChanged }: RoleChangeDialogFormProps) {
  const strings = useStrings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPromote = target.role !== "ADMIN";
  const nextRole: Role = isPromote ? "ADMIN" : "OFFICER";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    adminApi
      .changeUserRole(target.id, nextRole)
      .then(() => {
        toast.success(isPromote ? strings.admin.users.promoted : strings.admin.users.demoted);
        onChanged();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{isPromote ? strings.admin.users.promoteTitle : strings.admin.users.demoteTitle}</DialogTitle>
        <DialogDescription>
          {target.name} — {isPromote ? strings.admin.users.promoteDescription : strings.admin.users.demoteDescription}
        </DialogDescription>
      </DialogHeader>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {strings.common.cancel}
        </Button>
        <Button type="submit" variant={isPromote ? "default" : "destructive"} disabled={saving}>
          {saving ? strings.common.saving : isPromote ? strings.admin.users.confirmPromote : strings.admin.users.confirmDemote}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface BlockUserDialogFormProps {
  target: AdminUser;
  onClose: () => void;
  onBlocked: () => void;
}

function BlockUserDialogForm({ target, onClose, onBlocked }: BlockUserDialogFormProps) {
  const strings = useStrings();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    adminApi
      .blockUser(target.id, reason.trim())
      .then(() => {
        toast.success(strings.admin.users.blocked);
        onBlocked();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{strings.admin.users.blockTitle}</DialogTitle>
        <DialogDescription>
          {target.name} — {strings.admin.users.blockDescription}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="block-reason">{strings.admin.users.blockReasonLabel}</Label>
        <Textarea
          id="block-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={strings.admin.users.blockReasonPlaceholder}
          autoFocus
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {strings.common.cancel}
        </Button>
        <Button type="submit" variant="destructive" disabled={saving || reason.trim().length < 3}>
          {saving ? strings.common.saving : strings.common.block}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Private access approvals (ADG-Technical workflow — §6.4) ──────────────

type PrivateAccessFetchState =
  | { key: string; status: "ok"; requests: PrivateAccessRequest[] }
  | { key: string; status: "error"; message: string };

type DecisionAction = "approve" | "deny";
interface DecisionTarget {
  request: PrivateAccessRequest;
  action: DecisionAction;
}

function privateAccessStatusLabel(status: ApprovalStatus, strings: Strings): string {
  switch (status) {
    case "approved":
      return strings.admin.privateAccess.statusApproved;
    case "denied":
      return strings.admin.privateAccess.statusDenied;
    case "pending":
      return strings.admin.privateAccess.statusPending;
  }
}

interface PrivateAccessSectionProps {
  isAdgTechnical: boolean;
}

function PrivateAccessSection({ isAdgTechnical }: PrivateAccessSectionProps) {
  const strings = useStrings();
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PrivateAccessFetchState | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);

  const requestKey = `${statusFilter}::${reloadToken}`;
  const loading = state === null || state.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const key = `${statusFilter}::${reloadToken}`;
    adminApi
      .listPrivateAccessRequests(statusFilter === "all" ? undefined : statusFilter)
      .then(({ requests }) => {
        if (!cancelled) setState({ key, status: "ok", requests });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : strings.common.somethingWentWrong;
        setState({ key, status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, reloadToken, strings.common.somethingWentWrong]);

  const requests = state?.status === "ok" ? state.requests : [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.admin.privateAccess.intro}</p>
      {isAdgTechnical && <p className="text-sm text-primary">{strings.admin.privateAccess.adgHint}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as ApprovalStatus | "all")}>
          <TabsList>
            <TabsTrigger value="all">{strings.admin.privateAccess.statusAll}</TabsTrigger>
            <TabsTrigger value="pending">{strings.admin.privateAccess.statusPending}</TabsTrigger>
            <TabsTrigger value="approved">{strings.admin.privateAccess.statusApproved}</TabsTrigger>
            <TabsTrigger value="denied">{strings.admin.privateAccess.statusDenied}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" className="shrink-0" onClick={() => setRequestDialogOpen(true)}>
          {strings.admin.privateAccess.requestNew}
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{strings.common.loading}</p>}
      {!loading && state?.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      {!loading && state?.status === "ok" && requests.length === 0 && (
        <p className="text-sm text-muted-foreground">{strings.admin.privateAccess.empty}</p>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          state?.status === "ok" &&
          requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-foreground">{request.diaryId}</span>
                  <Badge
                    variant={
                      request.status === "approved" ? "default" : request.status === "denied" ? "destructive" : "secondary"
                    }
                  >
                    {privateAccessStatusLabel(request.status, strings)}
                  </Badge>
                </div>
                <p className="text-sm text-foreground">{request.justification}</p>
                <p className="text-xs text-muted-foreground">
                  {strings.admin.privateAccess.requested} {formatDateTime(request.createdAt)}
                  {request.grantedUntil && (
                    <>
                      {" "}
                      · {strings.admin.privateAccess.grantedUntil} {formatDateTime(request.grantedUntil)}
                    </>
                  )}
                </p>
                {isAdgTechnical && request.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => setDecisionTarget({ request, action: "approve" })}>
                      {strings.admin.privateAccess.approve}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDecisionTarget({ request, action: "deny" })}>
                      {strings.admin.privateAccess.deny}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          {requestDialogOpen && (
            <RequestAccessDialogForm
              onClose={() => setRequestDialogOpen(false)}
              onSubmitted={() => {
                setRequestDialogOpen(false);
                setReloadToken((token) => token + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={decisionTarget !== null} onOpenChange={(open) => { if (!open) setDecisionTarget(null); }}>
        <DialogContent>
          {decisionTarget && (
            <DecisionDialogForm
              key={`${decisionTarget.request.id}-${decisionTarget.action}`}
              target={decisionTarget}
              onClose={() => setDecisionTarget(null)}
              onDecided={() => {
                setDecisionTarget(null);
                setReloadToken((token) => token + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RequestAccessDialogFormProps {
  onClose: () => void;
  onSubmitted: () => void;
}

function RequestAccessDialogForm({ onClose, onSubmitted }: RequestAccessDialogFormProps) {
  const strings = useStrings();
  const [diaryId, setDiaryId] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    adminApi
      .requestPrivateAccess(diaryId.trim(), justification.trim())
      .then(() => {
        toast.success(strings.admin.privateAccess.requestSubmitted);
        onSubmitted();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{strings.admin.privateAccess.requestHeading}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="request-diary-id">{strings.admin.privateAccess.diaryIdLabel}</Label>
        <Input
          id="request-diary-id"
          value={diaryId}
          onChange={(e) => setDiaryId(e.target.value)}
          placeholder={strings.admin.privateAccess.diaryIdPlaceholder}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="request-justification">{strings.admin.privateAccess.justificationLabel}</Label>
        <Textarea
          id="request-justification"
          rows={4}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder={strings.admin.privateAccess.justificationPlaceholder}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {strings.common.cancel}
        </Button>
        <Button type="submit" disabled={saving || diaryId.trim().length === 0 || justification.trim().length < 10}>
          {saving ? strings.common.saving : strings.admin.privateAccess.submitRequest}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface DecisionDialogFormProps {
  target: DecisionTarget;
  onClose: () => void;
  onDecided: () => void;
}

function DecisionDialogForm({ target, onClose, onDecided }: DecisionDialogFormProps) {
  const strings = useStrings();
  const [grantedHours, setGrantedHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isApprove = target.action === "approve";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const trimmedHours = grantedHours.trim();
    const action = isApprove
      ? adminApi.approvePrivateAccessRequest(target.request.id, trimmedHours ? Number(trimmedHours) : undefined)
      : adminApi.denyPrivateAccessRequest(target.request.id);

    action
      .then(() => {
        toast.success(strings.admin.privateAccess.decisionRecorded);
        onDecided();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{isApprove ? strings.admin.privateAccess.approveTitle : strings.admin.privateAccess.denyTitle}</DialogTitle>
        <DialogDescription>
          {isApprove ? strings.admin.privateAccess.approveDescription : strings.admin.privateAccess.denyDescription}
        </DialogDescription>
      </DialogHeader>

      {isApprove && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="granted-hours">{strings.admin.privateAccess.grantedHoursLabel}</Label>
          <Input
            id="granted-hours"
            type="number"
            min={1}
            max={168}
            value={grantedHours}
            onChange={(e) => setGrantedHours(e.target.value)}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {strings.common.cancel}
        </Button>
        <Button type="submit" variant={isApprove ? "default" : "destructive"} disabled={saving}>
          {saving ? strings.common.saving : isApprove ? strings.admin.privateAccess.approve : strings.admin.privateAccess.deny}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Audit log (read-only, append-only — §6.4) ─────────────────────────────

const AUDIT_LOG_LIMIT = 100;

type AuditLogFetchState =
  | { key: number; status: "ok"; logs: AuditLogEntry[] }
  | { key: number; status: "error"; message: string };

function AuditLogSection() {
  const strings = useStrings();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<AuditLogFetchState | null>(null);

  const loading = state === null || state.key !== reloadToken;

  useEffect(() => {
    let cancelled = false;
    const key = reloadToken;
    adminApi
      .listAuditLogs(AUDIT_LOG_LIMIT)
      .then(({ logs }) => {
        if (!cancelled) setState({ key, status: "ok", logs });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : strings.common.somethingWentWrong;
        setState({ key, status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, strings.common.somethingWentWrong]);

  const logs = state?.status === "ok" ? state.logs : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{strings.admin.auditLog.intro}</p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setReloadToken((token) => token + 1)}>
          {strings.admin.auditLog.refresh}
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{strings.common.loading}</p>}
      {!loading && state?.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      {!loading && state?.status === "ok" && logs.length === 0 && (
        <p className="text-sm text-muted-foreground">{strings.admin.auditLog.empty}</p>
      )}

      <div className="flex flex-col gap-2">
        {!loading &&
          state?.status === "ok" &&
          logs.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{entry.action}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {strings.admin.auditLog.actor} {entry.actorId ?? strings.admin.auditLog.system} · {strings.admin.auditLog.resource}{" "}
                  {entry.resourceType}
                  {entry.resourceId ? `:${entry.resourceId}` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
