import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { caseDiariesApi, type CaseDiary } from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStrings } from "@/i18n";
import { formatDateTime } from "@/lib/utils";

/**
 * §6.5: "centered, Google-style search/suggestion box as the primary
 * post-login action — the anchor UX moment". Quick-search chips double as the
 * "suggestion" half before the officer has typed anything (drawn from the
 * active case-type taxonomy via the `lookups` module); submitting the box
 * hits `GET /case-diaries/search` (D6 `SearchService`, keyword/FTS in Phase 1).
 * The "Start a new investigation" action now lives in the sidebar so the home
 * screen stays focused on search.
 */
export function HomePage() {
  const strings = useStrings();
  const location = useLocation();

  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<CaseDiary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Quick-search chip labels — fully resolved by the server from the admin's
  // choices (which case types + how many). Empty until loaded, so nothing flashes.
  const [quickSearchChips, setQuickSearchChips] = useState<string[]>([]);
  // FIR (मुकदमा) numbers whose case-diary list is currently expanded. Every group
  // starts collapsed — only the मुकदमा bars show until the officer clicks one.
  const [expandedFirs, setExpandedFirs] = useState<Set<string>>(new Set());

  function toggleFir(firNo: string) {
    setExpandedFirs((prev) => {
      const next = new Set(prev);
      if (next.has(firNo)) next.delete(firNo);
      else next.add(firNo);
      return next;
    });
  }

  // Navigating Home (even re-clicking it while already here — each navigation is
  // a new `location.key`) returns the page to its clean state: the Quick-searches
  // trigger falls back to its placeholder and any prior results are cleared.
  useEffect(() => {
    setQuery("");
    setSubmittedQuery(null);
    setResults([]);
    setError(null);
    setExpandedFirs(new Set());
  }, [location.key]);

  useEffect(() => {
    let cancelled = false;
    lookupsApi
      .listCaseTypes()
      .then(({ caseTypes: options }) => {
        if (!cancelled) setCaseTypes(options);
      })
      .catch(() => {
        // Quick-search chips are a nicety on top of the search box — degrade silently if the lookup fails.
      });
    lookupsApi
      .getQuickSearchChips()
      .then(({ chips }) => {
        if (!cancelled) setQuickSearchChips(chips);
      })
      .catch(() => {
        if (!cancelled) setQuickSearchChips([]); // hide chips if the config read fails
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

  // Results are presented मुकदमा-वार (by FIR number), not सीडी-वार: the matching
  // case diaries are grouped under their FIR (मुकदमा नं.) — the same grouping the
  // "View Case Diaries" screen uses — so one मुकदमा never spreads across several
  // flat rows. Groups are ordered by most-recent activity.
  const firGroups = useMemo(() => {
    const map = new Map<string, CaseDiary[]>();
    for (const diary of results) {
      const group = map.get(diary.firNo) ?? [];
      group.push(diary);
      map.set(diary.firNo, group);
    }
    return Array.from(map.entries())
      .map(([firNo, entries]) => {
        const sorted = [...entries].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const latestUpdatedAt = sorted.reduce((max, d) => Math.max(max, new Date(d.updatedAt).getTime()), 0);
        return {
          firNo,
          caseTypeId: sorted[0]!.caseTypeId,
          policeStation: sorted[0]!.policeStation,
          plaintiffName: sorted[0]!.plaintiffName,
          accusedName: sorted[0]!.accusedName,
          latestUpdatedAt,
          diaries: sorted,
        };
      })
      .sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  }, [results]);

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setSearching(true);
    setError(null);
    setExpandedFirs(new Set());
    try {
      const { caseDiaries } = await caseDiariesApi.search(trimmed);
      setResults(caseDiaries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }


  const hasSearched = submittedQuery !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-3xl font-semibold tracking-tight text-primary">
          {"> "}
          {strings.app.name}
        </span>
        <p className="max-w-xl text-sm text-muted-foreground">{strings.app.tagline}</p>
      </div>

      <div className="flex w-full max-w-2xl flex-col items-stretch gap-3">
        <form onSubmit={handleSubmit} className="relative w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={strings.home.searchPlaceholder}
            aria-label={strings.home.searchPlaceholder}
            className="h-12 rounded-full pr-28 pl-11 text-base shadow-xs"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full px-4"
            disabled={!query.trim() || searching}
          >
            {searching ? strings.home.searching : strings.common.search}
          </Button>
        </form>

        {/* Quick-search chips — like the shortcuts under Claude's search box.
            Each is the name of an admin-managed active case type; clicking one
            runs that keyword search immediately. Admin controls how many show. */}
        {quickSearchChips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {quickSearchChips.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => void runSearch(label)}
                disabled={searching}
                // Sized/coloured to match the portal-wide Public badge (VisibilityBadge).
                className="inline-flex w-fit shrink-0 items-center justify-center rounded-full bg-green-400 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-green-950 transition-colors hover:bg-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasSearched && (
        <div className="w-full max-w-2xl space-y-6">
          {error && <p className="text-center text-sm text-destructive">{error}</p>}

          {!error && !searching && firGroups.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">{strings.home.noResults}</p>
          )}

          {firGroups.map((group) => {
            const isExpanded = expandedFirs.has(group.firNo);
            return (
              <div key={group.firNo} className="flex flex-col gap-2">
                {/* मुकदमा (FIR) bar — click to reveal/hide its case diaries (collapsed by default) */}
                <button
                  type="button"
                  onClick={() => toggleFir(group.firNo)}
                  aria-expanded={isExpanded}
                  className="rounded-md border border-border bg-secondary px-4 py-3 text-left transition-colors hover:border-primary/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-mono text-sm font-semibold text-primary">
                      <ChevronDownIcon
                        className={`size-4 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                      />
                      मुकदमा नं. {group.firNo}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {group.diaries.length} {strings.home.caseDiariesCount}
                      </span>
                      <Badge variant="outline">{caseTypeNameById.get(group.caseTypeId) ?? group.caseTypeId}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    {group.policeStation} · {group.plaintiffName} vs. {group.accusedName}
                  </p>
                </button>

                {/* Matching case diaries within this मुकदमा — hidden until the bar is clicked */}
                {isExpanded && (
                  <div className="ml-2 flex flex-col gap-2 border-l-2 border-border pl-4">
                    {group.diaries.map((diary) => (
                      <Link key={diary.id} to={`/diary/${diary.id}`}>
                        <Card className="transition-colors hover:border-primary/60">
                          <CardContent className="flex flex-col gap-1.5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-sm font-semibold text-primary">{diary.caseDiaryNo}</span>
                              <Badge variant={diary.status === "finalized" ? "default" : "secondary"}>
                                {diary.status === "finalized" ? strings.diary.finalized : strings.diary.draft}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {diary.underSection} · Updated {formatDateTime(diary.updatedAt)}
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
