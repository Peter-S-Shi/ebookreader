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
  collections: string[];
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

export interface GlobalBookHoursDefaultsDTO {
  pages_per_hour: number;
  words_per_hour: number;
  characters_per_hour: number;
}

export interface ReadingProfileDTO {
  id: string;
  name: string;
  difficulty_multiplier: number;
  description: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
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
  const [globalDefaults, setGlobalDefaults] = useState<GlobalBookHoursDefaultsDTO | null>(null);
  const [allProfiles, setAllProfiles] = useState<ReadingProfileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // By Profile & By Collection selection states
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  // Books tab filter states
  const [booksSearchQuery, setBooksSearchQuery] = useState("");
  const [booksProfileFilter, setBooksProfileFilter] = useState("all");
  const [booksCollectionFilter, setBooksCollectionFilter] = useState("all");
  const [booksStateFilter, setBooksStateFilter] = useState<"all" | "calculated" | "uncalculated">("all");

  // Book setup drawer state
  const [drawerBook, setDrawerBook] = useState<BookHoursItemDTO | null>(null);
  const [drawerProfileId, setDrawerProfileId] = useState<string>("");
  const [drawerQuantity, setDrawerQuantity] = useState<string>("");
  const [drawerUnit, setDrawerUnit] = useState<"pages" | "words" | "characters" | "legacy_untyped">("pages");
  const [drawerSpeedOverride, setDrawerSpeedOverride] = useState<string>("");
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      const [overviewData, defaultsData, profilesData] = await Promise.all([
        invoke<BookHoursOverviewDTO>("get_book_hours_overview_command"),
        invoke<GlobalBookHoursDefaultsDTO>("get_global_book_hours_defaults_command").catch(() => ({
          pages_per_hour: 60,
          words_per_hour: 15000,
          characters_per_hour: 30000,
        })),
        invoke<ReadingProfileDTO[]>("list_reading_profiles_command").catch(() => []),
      ]);
      setOverview(overviewData || null);
      setGlobalDefaults(defaultsData || {
        pages_per_hour: 60,
        words_per_hour: 15000,
        characters_per_hour: 30000,
      });
      setAllProfiles(profilesData || []);
      setLoading(false);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOverview().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Update selected IDs when overview loads
  useEffect(() => {
    if (overview) {
      if (!selectedProfileId && overview.profiles.length > 0) {
        setSelectedProfileId(overview.profiles[0].profile_id);
      }
      if (!selectedCollectionId && overview.collections.length > 0) {
        setSelectedCollectionId(overview.collections[0].collection_id);
      }
    }
  }, [overview, selectedProfileId, selectedCollectionId]);

  const uncalculatedCount = overview?.global_coverage.uncalculated_books ?? 0;
  const bookHoursCompletionPercent =
    overview && overview.total_planned_hours > 0
      ? Math.round((overview.total_current_hours / overview.total_planned_hours) * 100)
      : null;

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

  // Open Drawer for a specific book
  const openBookSetupDrawer = (book: BookHoursItemDTO) => {
    setDrawerBook(book);
    setDrawerError(null);
    // Find matching profile or default profile
    const profileId =
      book.profile_id ??
      overview?.profiles.find((p) => p.is_default)?.profile_id ??
      overview?.profiles[0]?.profile_id ??
      "profile-default";
    setDrawerProfileId(profileId);
    setDrawerQuantity(book.quantity !== null && book.quantity !== undefined ? String(book.quantity) : "");
    setDrawerUnit(book.unit ?? "pages");
    setDrawerSpeedOverride(
      book.speed_override !== null && book.speed_override !== undefined ? String(book.speed_override) : "",
    );
  };

  const closeBookSetupDrawer = () => {
    setDrawerBook(null);
    setDrawerError(null);
  };

  // Save Book Setup
  const handleSaveBookSetup = async () => {
    if (!drawerBook) return;
    setDrawerSaving(true);
    setDrawerError(null);
    try {
      const qNum = drawerQuantity.trim() === "" ? null : Number.parseFloat(drawerQuantity);
      if (qNum !== null && (!Number.isFinite(qNum) || qNum <= 0)) {
        setDrawerError("Quantity must be a positive number if provided.");
        setDrawerSaving(false);
        return;
      }

      const spNum = drawerSpeedOverride.trim() === "" ? null : Number.parseFloat(drawerSpeedOverride);
      if (spNum !== null && (!Number.isFinite(spNum) || spNum <= 0)) {
        setDrawerError("Baseline speed override must be a positive number if provided.");
        setDrawerSaving(false);
        return;
      }

      const setupPayload = {
        profile_id: drawerProfileId || null,
        quantity: qNum,
        unit: drawerUnit || null,
        speed_override: spNum,
      };

      await invoke("set_book_workload_command", {
        bookId: drawerBook.book_id,
        setup: setupPayload,
      });

      await fetchOverview();
      closeBookSetupDrawer();
    } catch (err) {
      setDrawerError(String(err));
    } finally {
      setDrawerSaving(false);
    }
  };

  // Helper calculations for Drawer Preview
  const selectedDrawerProfile =
    (allProfiles || []).find((p) => p.id === drawerProfileId) ??
    (overview?.profiles || []).find((p) => p.profile_id === drawerProfileId);
  const drawerDifficulty = selectedDrawerProfile?.difficulty_multiplier ?? 1.0;

  const getEffectiveBaselineSpeed = (
    unit: "pages" | "words" | "characters" | "legacy_untyped",
    overrideStr: string,
  ): number | null => {
    const sp = Number.parseFloat(overrideStr);
    if (Number.isFinite(sp) && sp > 0) return sp;
    if (unit === "legacy_untyped") return null;
    if (!globalDefaults) return unit === "pages" ? 60 : unit === "words" ? 15000 : 30000;
    switch (unit) {
      case "pages":
        return globalDefaults.pages_per_hour;
      case "words":
        return globalDefaults.words_per_hour;
      case "characters":
        return globalDefaults.characters_per_hour;
      default:
        return null;
    }
  };

  const previewSpeed = getEffectiveBaselineSpeed(drawerUnit, drawerSpeedOverride);
  const previewQuantity = Number.parseFloat(drawerQuantity);
  const isPreviewCalculable =
    Number.isFinite(previewQuantity) &&
    previewQuantity > 0 &&
    previewSpeed !== null &&
    previewSpeed > 0 &&
    drawerDifficulty > 0;

  const previewPlannedHours = isPreviewCalculable ? (previewQuantity / previewSpeed!) * drawerDifficulty : null;
  const previewCurrentHours =
    previewPlannedHours !== null && drawerBook
      ? previewPlannedHours * (drawerBook.cumulative_percent / 100)
      : null;

  // Selected profile in By Profile tab
  const activeProfile =
    overview?.profiles.find((p) => p.profile_id === selectedProfileId) ?? overview?.profiles[0];
  const activeProfileBooks = overview?.books.filter((b) => b.profile_id === activeProfile?.profile_id) ?? [];
  const activeProfileCollectionsTouched = new Set(activeProfileBooks.flatMap((b) => b.collections)).size;

  // Selected collection in By Collection tab
  const activeCollection =
    overview?.collections.find((c) => c.collection_id === selectedCollectionId) ?? overview?.collections[0];
  const activeCollectionBooks =
    overview?.books.filter((b) => b.collections.includes(activeCollection?.collection_name ?? "")) ?? [];
  const activeCollectionProfilesUsed = new Set(
    activeCollectionBooks.map((b) => b.profile_name).filter(Boolean),
  ).size;

  // Filtered books in Books tab
  const filteredBooks = (overview?.books ?? []).filter((book) => {
    if (booksSearchQuery.trim()) {
      const q = booksSearchQuery.toLowerCase();
      if (!book.title.toLowerCase().includes(q)) return false;
    }
    if (booksProfileFilter !== "all") {
      if (book.profile_name !== booksProfileFilter) return false;
    }
    if (booksCollectionFilter !== "all") {
      if (!book.collections.includes(booksCollectionFilter)) return false;
    }
    if (booksStateFilter === "calculated") {
      if (!book.calculation) return false;
    } else if (booksStateFilter === "uncalculated") {
      if (book.calculation) return false;
    }
    return true;
  });

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
            {uncalculatedCount > 0
              ? uncalculatedCount === 1
                ? "1 Book needs setup"
                : `${uncalculatedCount} Books need setup`
              : "All Books calculated"}
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
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={tab.paneId}
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
            <div className="bhWarn" role="alert">
              Could not load Book Hours Overview: {error}
            </div>
          )}

          {/* Tab 1: Overview */}
          <section
            className={`bhPane ${activeTab === "overview" ? "active" : ""}`}
            id="bhOverview"
            role="tabpanel"
            aria-labelledby="tab-overview"
            hidden={activeTab !== "overview"}
          >
            {loading && !overview && <div className="bhMuted">Loading Book Hours overview…</div>}

            {overview && (
              <>
                <div className="bhHero">
                  <div className="bhCard">
                    <h2>What are Book Hours?</h2>
                    <div className="bhLead">
                      Book Hours are EbookReader’s planning model for reading workload. The system
                      estimates the Book Hours of a Book from its measurable quantity,
                      reading-speed baseline, and exactly one Reading Profile. You do not type the
                      Planned Book Hours result directly.
                    </div>
                    <div className="bhRule">
                      <b>Reading Progress is independent.</b> Reading Progress is an independent
                      per-Book reading fact and is never changed by Book Hours recalculation.
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
                    <div className="bhRule">
                      <b>Planned Book Hours is calculated.</b> Planned Book Hours is always derived:
                      (Quantity ÷ Baseline Speed) × Profile Difficulty.
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="bhGrid">
                  <div className="bhMetric">
                    <span className="bhMetricLabel">Total Planned Book Hours</span>
                    <div className="bhMetricVal">
                      {overview.total_planned_hours > 0
                        ? `${overview.total_planned_hours.toFixed(1)}h`
                        : "0.0h"}
                    </div>
                    <div className="bhMetricSub">
                      Across {overview.global_coverage.calculated_books} calculated Books.
                    </div>
                  </div>
                  <div className="bhMetric">
                    <span className="bhMetricLabel">Total Current Book Hours</span>
                    <div className="bhMetricVal">
                      {overview.total_current_hours > 0
                        ? `${overview.total_current_hours.toFixed(1)}h`
                        : "0.0h"}
                    </div>
                    <div className="bhMetricSub">
                      Completed-equivalent Book Hours from unchanged reading progress.
                    </div>
                  </div>
                  <div className="bhMetric">
                    <span className="bhMetricLabel">Book Hours Completion</span>
                    <div className="bhMetricVal">
                      {bookHoursCompletionPercent !== null
                        ? `${bookHoursCompletionPercent}%`
                        : "—"}
                    </div>
                    <div className="bhMetricSub">
                      {bookHoursCompletionPercent !== null
                        ? "Total Current Book Hours ÷ Total Planned Book Hours."
                        : "No planned book hours available yet."}
                    </div>
                  </div>
                  <div className="bhMetric">
                    <span className="bhMetricLabel">Calculation Coverage</span>
                    <div className="bhMetricVal">
                      {overview.global_coverage.calculated_books} /{" "}
                      {overview.global_coverage.total_books}
                    </div>
                    <div className="bhMetricSub">
                      {uncalculatedCount > 0
                        ? `${uncalculatedCount} ${
                            uncalculatedCount === 1 ? "Book is" : "Books are"
                          } excluded from Book Hours totals until configured.`
                        : "All Books in the library are calculated."}
                    </div>
                  </div>
                </div>

                {/* Summaries */}
                <div className="bhSplit">
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
                    <div className="bhNote bhNoteMargin">
                      Reading Profiles own difficulty coefficients only. Baseline speed is resolved
                      by quantity unit.
                    </div>
                  </div>

                  <div className="bhCard">
                    <div className="bhSubhead">
                      <h3>Summary by Collection</h3>
                      <div className="grow" />
                      <span className="hint">Books may belong to multiple Collections</span>
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

          {/* Tab 2: By Profile (BH-3B Master-Detail) */}
          <section
            className={`bhPane ${activeTab === "byProfile" ? "active" : ""}`}
            id="bhProfilesView"
            role="tabpanel"
            aria-labelledby="tab-byProfile"
            hidden={activeTab !== "byProfile"}
          >
            {overview && (
              <div className="bhMasterDetail">
                <aside className="bhList" aria-label="Profiles list">
                  <h3>Reading Profiles</h3>
                  {overview.profiles.length === 0 ? (
                    <div className="bhMuted" style={{ padding: "12px" }}>
                      No profiles found.
                    </div>
                  ) : (
                    overview.profiles.map((p) => (
                      <button
                        key={p.profile_id}
                        type="button"
                        className={`bhListItem ${activeProfile?.profile_id === p.profile_id ? "active" : ""}`}
                        onClick={() => setSelectedProfileId(p.profile_id)}
                      >
                        <b>{p.profile_name}</b>
                        <small>
                          Difficulty {p.difficulty_multiplier.toFixed(1)} · {p.coverage.total_books}{" "}
                          Books · {p.total_planned_hours.toFixed(1)}h planned
                        </small>
                      </button>
                    ))
                  )}
                </aside>

                <div className="bhDetail">
                  {activeProfile ? (
                    <>
                      <div className="bhDetailHead">
                        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                          <span className="bhBadge profile">Reading Profile</span>
                          <h2 style={{ fontSize: "20px", margin: 0 }}>{activeProfile.profile_name}</h2>
                          {activeProfile.is_default && (
                            <span className="bhBadge default">Default</span>
                          )}
                        </div>
                        <div className="bhLead">
                          Shared difficulty coefficient {activeProfile.difficulty_multiplier.toFixed(1)}.
                          Uses unit-specific global baseline speeds or book-level speed overrides.
                        </div>
                        <div className="stats">
                          <div className="stat">
                            <span className="meta">Books</span>
                            <b>{activeProfile.coverage.total_books}</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Collections touched</span>
                            <b>{activeProfileCollectionsTouched}</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Planned BH</span>
                            <b>{activeProfile.total_planned_hours.toFixed(1)}h</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Current BH</span>
                            <b>{activeProfile.total_current_hours.toFixed(1)}h</b>
                          </div>
                        </div>
                      </div>

                      <div className="bhCard">
                        <div className="bhCoverage">
                          <strong>Coverage:</strong> {activeProfile.coverage.calculated_books} of{" "}
                          {activeProfile.coverage.total_books}{" "}
                          {activeProfile.coverage.total_books === 1 ? "Book" : "Books"} currently
                          contribute to Profile Book Hours totals.
                          {activeProfile.coverage.uncalculated_books > 0 && (
                            <span className="bhBadge warn" style={{ marginLeft: "8px" }}>
                              {activeProfile.coverage.uncalculated_books} Needs setup
                            </span>
                          )}
                        </div>
                        <div className="bhSubhead">
                          <h3>Books using this Profile</h3>
                          <div className="grow" />
                          <span className="hint">
                            Each Book still keeps its own Collections and Reading Progress.
                          </span>
                        </div>
                        <div className="bhTableWrap">
                          <table className="bhTable" aria-label={`Books in ${activeProfile.profile_name}`}>
                            <thead>
                              <tr>
                                <th>Book</th>
                                <th>Collections</th>
                                <th>Progress</th>
                                <th>Planned</th>
                                <th>Current</th>
                                <th>Remaining</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeProfileBooks.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="bhMuted bhEmptyCell">
                                    No Books assigned to this Reading Profile.
                                  </td>
                                </tr>
                              ) : (
                                activeProfileBooks.map((b) => {
                                  const plannedH = b.calculation?.planned_book_hours ?? null;
                                  const currentH = b.calculation?.current_book_hours ?? null;
                                  const remainingH =
                                    plannedH !== null && currentH !== null
                                      ? Math.max(0, plannedH - currentH)
                                      : null;
                                  return (
                                    <tr key={b.book_id}>
                                      <td>
                                        <span className="bhName">{b.title}</span>
                                      </td>
                                      <td>
                                        <div className="bhCollections">
                                          {b.collections.length > 0 ? (
                                            b.collections.map((c) => (
                                              <span key={c} className="bhCollectionChip">
                                                {c}
                                              </span>
                                            ))
                                          ) : (
                                            <span className="bhMuted">—</span>
                                          )}
                                        </div>
                                      </td>
                                      <td>
                                        <div className="bhProg">
                                          <div className="bhProgBar">
                                            <div
                                              className="bhProgFill"
                                              style={{
                                                width: `${Math.min(100, Math.max(0, b.cumulative_percent))}%`,
                                              }}
                                            />
                                          </div>
                                          <span>{Math.round(b.cumulative_percent)}%</span>
                                        </div>
                                      </td>
                                      <td>{plannedH !== null ? `${plannedH.toFixed(1)}h` : "—"}</td>
                                      <td>{currentH !== null ? `${currentH.toFixed(1)}h` : "—"}</td>
                                      <td>
                                        {remainingH !== null ? (
                                          `${remainingH.toFixed(1)}h`
                                        ) : (
                                          <span className="bhBadge warn">Needs setup</span>
                                        )}
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="btn bhEditBook"
                                          style={{ height: "30px", fontSize: "11px" }}
                                          onClick={() => openBookSetupDrawer(b)}
                                        >
                                          Edit
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bhMuted">Select a profile to view details.</div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Tab 3: By Collection (BH-3B Symmetric Master-Detail) */}
          <section
            className={`bhPane ${activeTab === "byCollection" ? "active" : ""}`}
            id="bhCollectionsView"
            role="tabpanel"
            aria-labelledby="tab-byCollection"
            hidden={activeTab !== "byCollection"}
          >
            {overview && (
              <div className="bhMasterDetail">
                <aside className="bhList" aria-label="Collections list">
                  <h3>Collections</h3>
                  {overview.collections.length === 0 ? (
                    <div className="bhMuted" style={{ padding: "12px" }}>
                      No collections found.
                    </div>
                  ) : (
                    overview.collections.map((c) => (
                      <button
                        key={c.collection_id}
                        type="button"
                        className={`bhListItem ${activeCollection?.collection_id === c.collection_id ? "active" : ""}`}
                        onClick={() => setSelectedCollectionId(c.collection_id)}
                      >
                        <b>{c.collection_name}</b>
                        <small>
                          {c.coverage.total_books} Books · {c.total_planned_hours.toFixed(1)}h planned
                        </small>
                      </button>
                    ))
                  )}
                </aside>

                <div className="bhDetail">
                  {activeCollection ? (
                    <>
                      <div className="bhDetailHead">
                        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                          <span className="bhBadge profile">Collection</span>
                          <h2 style={{ fontSize: "20px", margin: 0 }}>
                            {activeCollection.collection_name}
                          </h2>
                        </div>
                        <div className="bhLead">
                          User-organized reading list. Books can belong to multiple Collections.
                        </div>
                        <div className="stats">
                          <div className="stat">
                            <span className="meta">Total Books</span>
                            <b>{activeCollection.coverage.total_books}</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Profiles used</span>
                            <b>{activeCollectionProfilesUsed}</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Planned BH</span>
                            <b>{activeCollection.total_planned_hours.toFixed(1)}h</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Current BH</span>
                            <b>{activeCollection.total_current_hours.toFixed(1)}h</b>
                          </div>
                        </div>
                      </div>

                      <div className="bhCard">
                        <div className="bhCoverage">
                          <strong>Coverage:</strong> {activeCollection.coverage.calculated_books} of{" "}
                          {activeCollection.coverage.total_books}{" "}
                          {activeCollection.coverage.total_books === 1 ? "Book" : "Books"} currently
                          contribute to Collection Book Hours totals.
                          {activeCollection.coverage.uncalculated_books > 0 && (
                            <span className="bhBadge warn" style={{ marginLeft: "8px" }}>
                              {activeCollection.coverage.uncalculated_books} Needs setup
                            </span>
                          )}
                        </div>
                        <div className="bhTableWrap">
                          <table className="bhTable" aria-label={`Books in ${activeCollection.collection_name}`}>
                            <thead>
                              <tr>
                                <th>Book</th>
                                <th>Profile</th>
                                <th>Difficulty</th>
                                <th>Progress</th>
                                <th>Planned</th>
                                <th>Current</th>
                                <th>Status</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeCollectionBooks.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="bhMuted bhEmptyCell">
                                    No Books in this Collection.
                                  </td>
                                </tr>
                              ) : (
                                activeCollectionBooks.map((b) => (
                                  <tr key={b.book_id}>
                                    <td>
                                      <span className="bhName">{b.title}</span>
                                    </td>
                                    <td>
                                      <span className="bhBadge profile">
                                        {b.profile_name ?? "Default"}
                                      </span>
                                    </td>
                                    <td>
                                      {b.calculation
                                        ? b.calculation.difficulty_multiplier.toFixed(1)
                                        : "—"}
                                    </td>
                                    <td>{Math.round(b.cumulative_percent)}%</td>
                                    <td>
                                      {b.calculation
                                        ? `${b.calculation.planned_book_hours.toFixed(1)}h`
                                        : "—"}
                                    </td>
                                    <td>
                                      {b.calculation
                                        ? `${b.calculation.current_book_hours.toFixed(1)}h`
                                        : "—"}
                                    </td>
                                    <td>
                                      {b.calculation ? (
                                        <span className="bhBadge good">Calculated</span>
                                      ) : (
                                        <span className="bhBadge warn">Needs setup</span>
                                      )}
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="btn bhEditBook"
                                        style={{ height: "30px", fontSize: "11px" }}
                                        onClick={() => openBookSetupDrawer(b)}
                                      >
                                        Edit
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="bhNote">
                        Collection totals are intentionally local to the Collection and may overlap
                        with other Collections. The Overview’s global total deduplicates Books.
                      </div>
                    </>
                  ) : (
                    <div className="bhMuted">Select a collection to view details.</div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Tab 4: Books Management & Filters (BH-3B) */}
          <section
            className={`bhPane ${activeTab === "books" ? "active" : ""}`}
            id="bhBooksView"
            role="tabpanel"
            aria-labelledby="tab-books"
            hidden={activeTab !== "books"}
          >
            {overview && (
              <div className="bhCard">
                <div className="bhSubhead">
                  <h3>Books &amp; Book Hours</h3>
                  <div className="grow" />
                  <span className="hint">
                    One Profile · many Collections · progress stays independent
                  </span>
                </div>
                <div className="bhFilters" aria-label="Books filters">
                  <input
                    type="text"
                    placeholder="Search Books…"
                    value={booksSearchQuery}
                    onChange={(e) => setBooksSearchQuery(e.target.value)}
                    aria-label="Search Books"
                  />
                  <select
                    value={booksProfileFilter}
                    onChange={(e) => setBooksProfileFilter(e.target.value)}
                    aria-label="Filter by Profile"
                  >
                    <option value="all">All Profiles</option>
                    {overview.profiles.map((p) => (
                      <option key={p.profile_id} value={p.profile_name}>
                        {p.profile_name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={booksCollectionFilter}
                    onChange={(e) => setBooksCollectionFilter(e.target.value)}
                    aria-label="Filter by Collection"
                  >
                    <option value="all">All Collections</option>
                    {overview.collections.map((c) => (
                      <option key={c.collection_id} value={c.collection_name}>
                        {c.collection_name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={booksStateFilter}
                    onChange={(e) =>
                      setBooksStateFilter(
                        e.target.value as "all" | "calculated" | "uncalculated",
                      )
                    }
                    aria-label="Filter by Calculation State"
                  >
                    <option value="all">All calculation states</option>
                    <option value="calculated">Calculated</option>
                    <option value="uncalculated">Needs setup</option>
                  </select>
                </div>

                <div className="bhCoverage">
                  <strong>Calculation coverage:</strong> {overview.global_coverage.calculated_books}{" "}
                  of {overview.global_coverage.total_books} Books. Not-calculated Books remain
                  fully valid Library Books; they are simply excluded from Book Hours aggregates
                  until sufficient information exists.
                </div>

                <div className="bhTableWrap">
                  <table className="bhTable" aria-label="All Books Book Hours">
                    <thead>
                      <tr>
                        <th>Book</th>
                        <th>Profile</th>
                        <th>Collections</th>
                        <th>Progress</th>
                        <th>Planned BH</th>
                        <th>Current BH</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBooks.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="bhMuted bhEmptyCell">
                            No books match the current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredBooks.map((b) => (
                          <tr key={b.book_id}>
                            <td>
                              <span className="bhName">{b.title}</span>
                            </td>
                            <td>
                              <span className="bhBadge profile">
                                {b.profile_name ?? "Default"}
                              </span>
                            </td>
                            <td>
                              {b.collections.length > 0 ? (
                                <div className="bhCollections">
                                  {b.collections.map((coll) => (
                                    <span key={coll} className="bhCollectionChip">
                                      {coll}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="bhMuted">—</span>
                              )}
                            </td>
                            <td>
                              <div className="bhProg">
                                <div className="bhProgBar">
                                  <div
                                    className="bhProgFill"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, b.cumulative_percent))}%`,
                                    }}
                                  />
                                </div>
                                <span>{Math.round(b.cumulative_percent)}%</span>
                              </div>
                            </td>
                            <td>
                              {b.calculation
                                ? `${b.calculation.planned_book_hours.toFixed(1)}h`
                                : "—"}
                            </td>
                            <td>
                              {b.calculation
                                ? `${b.calculation.current_book_hours.toFixed(1)}h`
                                : "—"}
                            </td>
                            <td>
                              {b.calculation ? (
                                <span className="bhBadge good">Calculated</span>
                              ) : (
                                <span className="bhBadge warn">
                                  {b.quantity === null || b.quantity === undefined
                                    ? "Needs quantity"
                                    : "Needs setup"}
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn bhEditBook"
                                style={{ height: "30px", fontSize: "11px" }}
                                onClick={() => openBookSetupDrawer(b)}
                              >
                                {b.calculation ? "Edit" : "Set up"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Tab 5: Profiles Manage (Placeholder for BH-3C) */}
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

          {/* Tab 6: Formula & Defaults (Placeholder for BH-3C) */}
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

      {/* Book Hours Setup Drawer (BH-3B) */}
      {drawerBook && (
        <>
          <div
            className="bhDrawerOverlay"
            onClick={closeBookSetupDrawer}
            aria-hidden="true"
          />
          <aside
            className="bhDrawer open"
            id="bhBookDrawer"
            role="dialog"
            aria-label={`Book Hours Setup for ${drawerBook.title}`}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                closeBookSetupDrawer();
              }
            }}
          >
            <div className="bhDrawerHead">
              <h2>Book Hours Setup</h2>
              <div className="grow" />
              <button
                type="button"
                className="icon"
                id="closeBhBookDrawer"
                onClick={closeBookSetupDrawer}
                aria-label="Close Book Setup Drawer"
              >
                ×
              </button>
            </div>
            <div className="bhLead" id="bhDrawerBookName">
              {drawerBook.title}
            </div>
            <div className="sep" />

            {drawerError && (
              <div className="bhWarn" style={{ marginBottom: "12px" }}>
                {drawerError}
              </div>
            )}

            <div className="bhField">
              <label htmlFor="bhDrawerProfile">
                Reading Profile · exactly one (defines difficulty)
              </label>
              <select
                id="bhDrawerProfile"
                value={drawerProfileId}
                onChange={(e) => setDrawerProfileId(e.target.value)}
              >
                {allProfiles.length > 0
                  ? allProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.difficulty_multiplier.toFixed(1)})
                      </option>
                    ))
                  : overview?.profiles.map((p) => (
                      <option key={p.profile_id} value={p.profile_id}>
                        {p.profile_name} ({p.difficulty_multiplier.toFixed(1)})
                      </option>
                    ))}
              </select>
            </div>

            <div className="bhField">
              <label>Collections · may be multiple (read-only)</label>
              <div className="bhCollections">
                {drawerBook.collections.length > 0 ? (
                  drawerBook.collections.map((coll) => (
                    <span key={coll} className="bhCollectionChip">
                      {coll}
                    </span>
                  ))
                ) : (
                  <span className="bhMuted">No Collections assigned</span>
                )}
              </div>
              <div className="bhLock">
                Collections are organized in the Library. A Book can belong to multiple
                Collections.
              </div>
            </div>

            <div className="bhField">
              <label htmlFor="bhDrawerQuantity">Quantity</label>
              <input
                id="bhDrawerQuantity"
                type="number"
                min="0"
                step="any"
                value={drawerQuantity}
                onChange={(e) => setDrawerQuantity(e.target.value)}
                placeholder="Required for calculation"
              />
            </div>

            <div className="bhField">
              <label htmlFor="bhDrawerUnit">Quantity Unit</label>
              <select
                id="bhDrawerUnit"
                value={drawerUnit}
                onChange={(e) =>
                  setDrawerUnit(
                    e.target.value as "pages" | "words" | "characters" | "legacy_untyped",
                  )
                }
              >
                <option value="pages">Pages (PDF)</option>
                <option value="words">Words (EPUB/TXT)</option>
                <option value="characters">Characters (EPUB/TXT)</option>
                <option value="legacy_untyped">Legacy / Untyped</option>
              </select>
            </div>

            <div className="bhField">
              <label htmlFor="bhDrawerSpeed">Baseline Speed Override</label>
              <input
                id="bhDrawerSpeed"
                type="number"
                min="0"
                step="any"
                value={drawerSpeedOverride}
                onChange={(e) => setDrawerSpeedOverride(e.target.value)}
                placeholder={
                  drawerUnit === "legacy_untyped"
                    ? "Required for legacy untyped"
                    : `Default: ${
                        drawerUnit === "pages"
                          ? globalDefaults?.pages_per_hour ?? 60
                          : drawerUnit === "words"
                            ? globalDefaults?.words_per_hour ?? 15000
                            : globalDefaults?.characters_per_hour ?? 30000
                      }`
                }
              />
              <div className="bhLock">
                Baseline Speed resolves from unit defaults (
                {globalDefaults?.pages_per_hour ?? 60} pages/h,{" "}
                {globalDefaults?.words_per_hour ?? 15000} words/h,{" "}
                {globalDefaults?.characters_per_hour ?? 30000} chars/h) and can be overridden for
                this Book.
              </div>
            </div>

            <div className="bhField">
              <label htmlFor="bhDrawerDifficulty">Difficulty Coefficient</label>
              <input
                id="bhDrawerDifficulty"
                type="text"
                value={drawerDifficulty.toFixed(1)}
                disabled
              />
              <div className="bhLock">
                Difficulty is owned by the Reading Profile. Change the Profile definition to change
                the shared coefficient.
              </div>
            </div>

            <div className="bhField">
              <label htmlFor="bhDrawerProgress">Reading Progress</label>
              <input
                id="bhDrawerProgress"
                type="text"
                value={`${Math.round(drawerBook.cumulative_percent)}%`}
                disabled
              />
              <div className="bhLock">
                Reading Progress is an independent reading fact. Book Hours recalculation never
                changes it.
              </div>
            </div>

            <div className="calcPreview">
              <span>Planned Book Hours · system calculated</span>
              <b id="bhDrawerPlanned">
                {previewPlannedHours !== null ? `${previewPlannedHours.toFixed(1)}h` : "—"}
              </b>
              <span id="bhDrawerFormula">
                {previewPlannedHours !== null
                  ? `${previewQuantity} ${drawerUnit} ÷ ${previewSpeed} ${drawerUnit}/hour × ${drawerDifficulty.toFixed(
                      1,
                    )} = ${previewPlannedHours.toFixed(1)}h`
                  : "Needs setup (enter quantity and valid unit speed)."}
              </span>
              <div className="sep" />
              <span>Current Book Hours</span>
              <b id="bhDrawerCurrent">
                {previewCurrentHours !== null ? `${previewCurrentHours.toFixed(1)}h` : "—"}
              </b>
              <span>
                {previewPlannedHours !== null
                  ? `${previewPlannedHours.toFixed(1)}h × ${Math.round(
                      drawerBook.cumulative_percent,
                    )}% reading progress`
                  : "—"}
              </span>
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="btn"
                id="cancelBhBook"
                onClick={closeBookSetupDrawer}
                disabled={drawerSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSaveBookSetup}
                disabled={drawerSaving}
              >
                {drawerSaving ? "Saving…" : "Save Book Setup"}
              </button>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
