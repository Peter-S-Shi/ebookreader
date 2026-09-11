import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface CalculationCoverageDTO {
  calculated_books: number;
  uncalculated_books: number;
  total_books: number;
}

export interface ProfileBookHoursSummaryDTO {
  profile_id: string;
  profile_name: string;
  difficulty_multiplier: number;
  is_default: boolean;
  total_planned_hours: number;
  total_current_hours: number;
  coverage: CalculationCoverageDTO;
}

export interface CollectionBookHoursSummaryDTO {
  collection_id: string;
  collection_name: string;
  total_planned_hours: number;
  total_current_hours: number;
  coverage: CalculationCoverageDTO;
}

export interface BookHoursCalculationDTO {
  planned_book_hours: number;
  current_book_hours: number;
  cumulative_percent: number;
  baseline_speed: number;
  difficulty_multiplier: number;
}

export interface BookHoursItemDTO {
  book_id: string;
  title: string;
  profile_id: string | null;
  profile_name: string | null;
  quantity: number | null;
  unit: "pages" | "words" | "characters" | "legacy_untyped" | null;
  speed_override: number | null;
  cumulative_percent: number;
  calculation: BookHoursCalculationDTO | null;
}

export interface BookHoursOverviewDTO {
  total_planned_hours: number;
  total_current_hours: number;
  global_coverage: CalculationCoverageDTO;
  profiles: ProfileBookHoursSummaryDTO[];
  collections: CollectionBookHoursSummaryDTO[];
  books: BookHoursItemDTO[];
}

export type BookHoursTab =
  | "overview"
  | "byProfile"
  | "byCollection"
  | "books"
  | "profiles"
  | "formula";

interface BookHoursPlanningProps {
  onBack: () => void;
  initialTab?: BookHoursTab;
}

const TABS: { id: BookHoursTab; label: string; paneId: string }[] = [
  { id: "overview", label: "Overview", paneId: "bhOverview" },
  { id: "byProfile", label: "By Profile", paneId: "bhProfilesView" },
  { id: "byCollection", label: "By Collection", paneId: "bhCollectionsView" },
  { id: "books", label: "Books", paneId: "bhBooksView" },
  { id: "profiles", label: "Profiles", paneId: "bhProfilesManage" },
  { id: "formula", label: "Formula & Defaults", paneId: "bhFormula" },
];

export function BookHoursPlanning({ onBack, initialTab = "overview" }: BookHoursPlanningProps) {
  const [activeTab, setActiveTab] = useState<BookHoursTab>(initialTab);
  const [overview, setOverview] = useState<BookHoursOverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<BookHoursOverviewDTO>("get_book_hours_overview_command")
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const uncalculatedCount = overview?.global_coverage.uncalculated_books ?? 0;
  // Reading Progress is an independent reading fact derived directly from actual reading progress (not recalculated from hours)
  const libraryProgressPercent =
    overview && overview.books.length > 0
      ? Math.round(overview.books.reduce((acc, b) => acc + b.cumulative_percent, 0) / overview.books.length)
      : 0;

  const handleTabKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[nextIndex].id);
      document.getElementById(`tab-${TABS[nextIndex].id}`)?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prevIndex].id);
      document.getElementById(`tab-${TABS[prevIndex].id}`)?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveTab(TABS[0].id);
      document.getElementById(`tab-${TABS[0].id}`)?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveTab(TABS[TABS.length - 1].id);
      document.getElementById(`tab-${TABS[TABS.length - 1].id}`)?.focus();
    }
  };

  return (
    <section className="screen active book-hours-screen" id="bookHours" aria-label="Book Hours Planning">
      <div className="top">
        <button type="button" className="icon" onClick={onBack} aria-label="Back to Data">
          ←
        </button>
        <div>
          <div className="title">Book Hours Planning</div>
          <div className="meta">
            Plan reading workload without changing the truth of how far you have actually read.
          </div>
        </div>
        <div className="grow" />
        {overview && (
          <span className={`stateBadge ${uncalculatedCount > 0 ? "warn" : "good"}`}>
            {uncalculatedCount > 0 ? `${uncalculatedCount} Books need setup` : "All Books calculated"}
          </span>
        )}
        <button
          type="button"
          className="btn"
          id="openFormulaTab"
          onClick={() => setActiveTab("formula")}
        >
          Formula &amp; Defaults
        </button>
      </div>

      <div className="bhShell">
        <div className="bhTabs" id="bhTabs" role="tablist" aria-label="Book Hours Views">
          {TABS.map((tab, idx) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={tab.paneId}
              id={`tab-${tab.id}`}
              className={`bhTab ${activeTab === tab.id ? "active" : ""}`}
              data-bh-pane={tab.paneId}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bhViewport">
          {error && (
            <div className="notice warn" role="alert">
              Could not load Book Hours Overview: {error}
            </div>
          )}

          {loading && !overview && (
            <div className="bhCard" role="status">
              <h3>Loading Book Hours data…</h3>
            </div>
          )}

          {/* Tab 1: Overview (Fully Activated in BH-3A) */}
          <section
            className={`bhPane ${activeTab === "overview" ? "active" : ""}`}
            id="bhOverview"
            role="tabpanel"
            aria-labelledby="tab-overview"
            hidden={activeTab !== "overview"}
          >
            {overview && (
              <>
                <div className="bhHero">
                  <div className="bhCard">
                    <h2>What are Book Hours?</h2>
                    <div className="bhLead">
                      Book Hours are EbookReader’s planning model for reading workload. The system
                      estimates the Book Hours of a Book from its measurable quantity, reading-speed
                      baseline, and exactly one Reading Profile. You do not type the Planned Book
                      Hours result directly.
                    </div>
                    <div className="bhRule">
                      <b>Reading Progress is independent.</b> Changing Book Hours rules can
                      recalculate hours across the system, but it never changes how much of a Book
                      the user has actually read.
                    </div>
                  </div>
                  <div className="bhCard">
                    <h3>Three rules to remember</h3>
                    <div className="bhLead">
                      ① Every Book can belong to multiple Collections.
                      <br />
                      ② Every Book has at most one Reading Profile.
                      <br />
                      ③ A Book may legitimately have no Book Hours yet if required information is
                      missing.
                    </div>
                    <div className="bhBadgeGroup">
                      <span className="bhBadge good">Calculated</span>
                      <span className="bhBadge warn">Needs setup</span>
                    </div>
                  </div>
                </div>

                <div className="bhSummary" aria-label="Book Hours Metrics">
                  <div className="bhMetric">
                    <span>Total Planned Book Hours</span>
                    <b>{overview.total_planned_hours.toFixed(1)}h</b>
                    <small>Across {overview.global_coverage.calculated_books} calculated Books.</small>
                  </div>
                  <div className="bhMetric">
                    <span>Current Book Hours</span>
                    <b>{overview.total_current_hours.toFixed(1)}h</b>
                    <small>Completed-equivalent Book Hours from unchanged reading progress.</small>
                  </div>
                  <div className="bhMetric">
                    <span>Library progress</span>
                    <b>{libraryProgressPercent}%</b>
                    <small>Reading fact; not recalculated when Book Hours rules change.</small>
                  </div>
                  <div className={`bhMetric ${uncalculatedCount > 0 ? "attn" : ""}`}>
                    <span>Calculation coverage</span>
                    <b>
                      {overview.global_coverage.calculated_books} / {overview.global_coverage.total_books}
                    </b>
                    <small>
                      {uncalculatedCount === 0
                        ? "All Books in the library are calculated."
                        : `${uncalculatedCount} Books are excluded from Book Hours totals until configured.`}
                    </small>
                  </div>
                </div>

                <div className="bhTwo">
                  <div className="bhCard" aria-label="Summary by Profile section">
                    <div className="bhSubhead">
                      <h3>Summary by Profile</h3>
                      <div className="grow" />
                      <span className="hint">Exactly one Profile per Book</span>
                    </div>
                    <div className="bhTableWrap">
                      <table className="bhTable" aria-label="Summary by Profile">
                        <thead>
                          <tr>
                            <th>Profile</th>
                            <th>Difficulty</th>
                            <th>Books</th>
                            <th>Planned</th>
                            <th>Current</th>
                            <th>Coverage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.profiles.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="bhMuted bhEmptyCell">
                                No Reading Profiles created yet.
                              </td>
                            </tr>
                          ) : (
                            overview.profiles.map((p) => (
                              <tr key={p.profile_id}>
                                <td>
                                  <span className="bhBadge profile">{p.profile_name}</span>
                                  {p.is_default && (
                                    <span className="bhBadge default">Default</span>
                                  )}
                                </td>
                                <td>{p.difficulty_multiplier.toFixed(1)}</td>
                                <td>{p.coverage.total_books}</td>
                                <td>{p.total_planned_hours.toFixed(1)}h</td>
                                <td>{p.total_current_hours.toFixed(1)}h</td>
                                <td>
                                  {p.coverage.calculated_books} / {p.coverage.total_books}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bhCard" aria-label="Summary by Collection section">
                    <div className="bhSubhead">
                      <h3>Summary by Collection</h3>
                      <div className="grow" />
                      <span className="hint">Books may appear in several Collections</span>
                    </div>
                    <div className="bhTableWrap">
                      <table className="bhTable" aria-label="Summary by Collection">
                        <thead>
                          <tr>
                            <th>Collection</th>
                            <th>Books</th>
                            <th>Planned</th>
                            <th>Current</th>
                            <th>Coverage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.collections.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="bhMuted bhEmptyCell">
                                No Collections created yet.
                              </td>
                            </tr>
                          ) : (
                            overview.collections.map((c) => (
                              <tr key={c.collection_id}>
                                <td>
                                  <b>{c.collection_name}</b>
                                </td>
                                <td>{c.coverage.total_books}</td>
                                <td>{c.total_planned_hours.toFixed(1)}h</td>
                                <td>{c.total_current_hours.toFixed(1)}h</td>
                                <td>
                                  {c.coverage.calculated_books} / {c.coverage.total_books}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="bhNote bhNoteMargin">
                      Collection totals can overlap because the same Book may belong to more than
                      one Collection. Global totals count each Book only once.
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Tab 2: By Profile (Inert Placeholder for BH-3B) */}
          <section
            className={`bhPane ${activeTab === "byProfile" ? "active" : ""}`}
            id="bhProfilesView"
            role="tabpanel"
            aria-labelledby="tab-byProfile"
            hidden={activeTab !== "byProfile"}
          >
            <div className="bhCard">
              <h3>By Profile</h3>
              <p className="bhLead">
                Inspect Book Hours breakdown and member books filtered by Reading Profile.
              </p>
              <div className="bhNote bhNoteMargin">
                This view will be fully activated in the upcoming batch (BH-3B). Currently in
                read-only foundation phase.
              </div>
            </div>
          </section>

          {/* Tab 3: By Collection (Inert Placeholder for BH-3B) */}
          <section
            className={`bhPane ${activeTab === "byCollection" ? "active" : ""}`}
            id="bhCollectionsView"
            role="tabpanel"
            aria-labelledby="tab-byCollection"
            hidden={activeTab !== "byCollection"}
          >
            <div className="bhCard">
              <h3>By Collection</h3>
              <p className="bhLead">
                Inspect reading workload across user-organized Collections with local coverage.
              </p>
              <div className="bhNote bhNoteMargin">
                This view will be fully activated in the upcoming batch (BH-3B). Currently in
                read-only foundation phase.
              </div>
            </div>
          </section>

          {/* Tab 4: Books (Inert Placeholder for BH-3B) */}
          <section
            className={`bhPane ${activeTab === "books" ? "active" : ""}`}
            id="bhBooksView"
            role="tabpanel"
            aria-labelledby="tab-books"
            hidden={activeTab !== "books"}
          >
            <div className="bhCard">
              <h3>Books &amp; Book Hours</h3>
              <p className="bhLead">
                Library-wide book hours list, setup status, and per-book workload configuration.
              </p>
              <div className="bhNote bhNoteMargin">
                This view will be fully activated in the upcoming batch (BH-3B). Currently in
                read-only foundation phase.
              </div>
            </div>
          </section>

          {/* Tab 5: Profiles Manage (Inert Placeholder for BH-3C) */}
          <section
            className={`bhPane ${activeTab === "profiles" ? "active" : ""}`}
            id="bhProfilesManage"
            role="tabpanel"
            aria-labelledby="tab-profiles"
            hidden={activeTab !== "profiles"}
          >
            <div className="bhCard">
              <h3>Reading Profiles</h3>
              <p className="bhLead">
                Manage difficulty coefficients, profile metadata, and default profile assignments.
              </p>
              <div className="bhNote bhNoteMargin">
                This view will be fully activated in the upcoming batch (BH-3C). Currently in
                read-only foundation phase.
              </div>
            </div>
          </section>

          {/* Tab 6: Formula & Defaults (Inert Placeholder for BH-3C) */}
          <section
            className={`bhPane ${activeTab === "formula" ? "active" : ""}`}
            id="bhFormula"
            role="tabpanel"
            aria-labelledby="tab-formula"
            hidden={activeTab !== "formula"}
          >
            <div className="bhCard">
              <h3>Global Formula &amp; Baseline Speed Defaults</h3>
              <p className="bhLead">
                Configure unit-specific baseline speeds (pages/hour, words/hour, characters/hour)
                and preview recalculation impact.
              </p>
              <div className="bhNote bhNoteMargin">
                This view will be fully activated in the upcoming batch (BH-3C). Currently in
                read-only foundation phase.
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
