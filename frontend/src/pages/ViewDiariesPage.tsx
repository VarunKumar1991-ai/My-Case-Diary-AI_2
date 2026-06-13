import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { caseDiariesApi, type CaseDiary, type CaseDiaryListScope } from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStrings } from "@/i18n";
import { type Strings } from "@/i18n/en";
import { formatDateTime } from "@/lib/utils";

const FIR_FILTER_DEBOUNCE_MS = 350;
const SCOPES: CaseDiaryListScope[] = ["mine", "shared", "public", "all"];

function scopeLabel(scope: CaseDiaryListScope, strings: Strings): string {
  switch (scope) {
    case "mine":
      return strings.viewDiaries.scopeMine;
    case "shared":
      return strings.viewDiaries.scopeShared;
    case "public":
      return strings.viewDiaries.scopePublic;
    case "all":
      return strings.viewDiaries.scopeAll;
  }
}

type FetchState =
  | { key: string; status: "ok"; diaries: CaseDiary[] }
  | { key: string; status: "error"; message: string };

/**
 * §6.5 sidebar entry "View Case Diaries" — a global, filterable browse surface
 * (the diary editor's left panel covers the FIR-scoped view; this one spans
 * everything the officer can see: their own drafts, diaries shared with them,
 * the public archive, or the role-aware "all visible" browse scope).
 */
export function ViewDiariesPage() {
  const strings = useStrings();

  const [scope, setScope] = useState<CaseDiaryListScope>("mine");
  const [firFilter, setFirFilter] = useState("");
  const [debouncedFirFilter, setDebouncedFirFilter] = useState("");
  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [state, setState] = useState<FetchState | null>(null);

  const requestKey = `${scope}::${debouncedFirFilter}`;
  const loading = state === null || state.key !== requestKey;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFirFilter(firFilter.trim()), FIR_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [firFilter]);

  useEffect(() => {
    let cancelled = false;
    lookupsApi
      .listCaseTypes()
      .then(({ caseTypes: options }) => {
        if (!cancelled) setCaseTypes(options);
      })
      .catch(() => {
        // Case-type names are a display nicety here — the raw id still renders if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const caseTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of caseTypes) map.set(option.id, option.name);
    return map;
  }, [caseTypes]);

  useEffect(() => {
    let cancelled = false;
    const key = `${scope}::${debouncedFirFilter}`;
    caseDiariesApi
      .list({ scope, firNo: debouncedFirFilter || undefined })
      .then(({ caseDiaries }) => {
        if (!cancelled) setState({ key, status: "ok", diaries: caseDiaries });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : strings.common.somethingWentWrong;
        setState({ key, status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [scope, debouncedFirFilter, strings.common.somethingWentWrong]);

  const diaries = state?.status === "ok" ? state.diaries : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{strings.viewDiaries.heading}</h1>
        <p className="text-sm text-muted-foreground">{strings.viewDiaries.subheading}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={scope} onValueChange={(value) => setScope(value as CaseDiaryListScope)}>
          <TabsList>
            {SCOPES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {scopeLabel(value, strings)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Input
          value={firFilter}
          onChange={(e) => setFirFilter(e.target.value)}
          placeholder={strings.viewDiaries.firFilterPlaceholder}
          aria-label={strings.viewDiaries.firFilterPlaceholder}
          className="sm:w-64"
        />
      </div>

      <div className="flex flex-col gap-3">
        {loading && <p className="text-sm text-muted-foreground">{strings.common.loading}</p>}

        {!loading && state?.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

        {!loading && state?.status === "ok" && diaries.length === 0 && (
          <p className="text-sm text-muted-foreground">{strings.viewDiaries.empty}</p>
        )}

        {!loading &&
          diaries.map((diary) => (
            <Link key={diary.id} to={`/diary/${diary.id}`}>
              <Card className="transition-colors hover:border-primary/60">
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-primary">{diary.caseDiaryNo}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{caseTypeNameById.get(diary.caseTypeId) ?? diary.caseTypeId}</Badge>
                      <Badge variant={diary.status === "finalized" ? "default" : "secondary"}>
                        {diary.status === "finalized" ? strings.diary.finalized : strings.diary.draft}
                      </Badge>
                      <Badge variant="outline">
                        {diary.visibility === "PUBLIC" ? strings.diary.public : strings.diary.private}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-foreground">
                    FIR {diary.firNo} · {diary.underSection}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {diary.plaintiffName} vs. {diary.accusedName} · Updated {formatDateTime(diary.updatedAt)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
