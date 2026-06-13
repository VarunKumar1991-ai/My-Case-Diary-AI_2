import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { caseDiariesApi, type CaseDiary } from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStrings } from "@/i18n";
import { formatDateTime } from "@/lib/utils";

const QUICK_SEARCH_LIMIT = 6;

/**
 * §6.5: "centered, Google-style search/suggestion box as the primary
 * post-login action — the anchor UX moment". Quick-search chips double as the
 * "suggestion" half before the officer has typed anything (drawn from the
 * active case-type taxonomy via the `lookups` module); submitting the box
 * hits `GET /case-diaries/search` (D6 `SearchService`, keyword/FTS in Phase 1).
 */
export function HomePage() {
  const strings = useStrings();
  const navigate = useNavigate();

  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<CaseDiary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const caseTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of caseTypes) map.set(option.id, option.name);
    return map;
  }, [caseTypes]);

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setSearching(true);
    setError(null);
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

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="relative">
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
        </div>
      </form>

      {!hasSearched && (
        <div className="flex w-full flex-col items-center gap-6">
          {caseTypes.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">{strings.home.suggestionsLabel}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {caseTypes.slice(0, QUICK_SEARCH_LIMIT).map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => void runSearch(type.name)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {type.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" className="gap-2" onClick={() => navigate("/diary/new")}>
            <PlusIcon className="size-4" />
            {strings.home.startNewDiary}
          </Button>
        </div>
      )}

      {hasSearched && (
        <div className="w-full max-w-2xl space-y-3">
          {error && <p className="text-center text-sm text-destructive">{error}</p>}

          {!error && !searching && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">{strings.home.noResults}</p>
          )}

          {results.map((diary) => (
            <Link key={diary.id} to={`/diary/${diary.id}`}>
              <Card className="transition-colors hover:border-primary/60">
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-primary">{diary.caseDiaryNo}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{caseTypeNameById.get(diary.caseTypeId) ?? diary.caseTypeId}</Badge>
                      <Badge variant={diary.status === "finalized" ? "default" : "secondary"}>
                        {diary.status === "finalized" ? strings.diary.finalized : strings.diary.draft}
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
      )}
    </div>
  );
}
