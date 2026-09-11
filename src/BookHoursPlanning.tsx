import { useEffect, useRef, useState } from "react";
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

export interface ProfileDifficultyUpdateDTO {
  profile_id: string;
  difficulty_multiplier: number;
}

export interface RecalculationPreviewRequestDTO {
  proposed_defaults?: GlobalBookHoursDefaultsDTO | null;
  proposed_profiles?: ProfileDifficultyUpdateDTO[] | null;
}

export interface CoverageDeltaDTO {
  old_calculated_books: number;
  new_calculated_books: number;
  delta: number;
  total_books: number;
}

export interface BookRecalculationImpactDTO {
  book_id: string;
  title: string;
  old_planned_hours: number | null;
  new_planned_hours: number | null;
  old_current_hours: number | null;
  new_current_hours: number | null;
  hours_delta: number;
  was_calculated: boolean;
  is_calculated: boolean;
}

export interface ProfileRecalculationImpactDTO {
  profile_id: string;
  profile_name: string;
  old_planned_hours: number;
  new_planned_hours: number;
  hours_delta: number;
  coverage_delta: CoverageDeltaDTO;
}

export interface CollectionRecalculationImpactDTO {
  collection_id: string;
  collection_name: string;
  old_planned_hours: number;
  new_planned_hours: number;
  hours_delta: number;
  coverage_delta: CoverageDeltaDTO;
}

export interface RecalculationPreviewResultDTO {
  total_books_count: number;
  affected_books_count: number;
  progress_changed_count: number; // ALWAYS 0
  old_total_planned_hours: number;
  new_total_planned_hours: number;
  total_hours_delta: number;
  old_total_current_hours: number;
  new_total_current_hours: number;
  global_coverage_delta: CoverageDeltaDTO;
  affected_books: BookRecalculationImpactDTO[];
  profile_impacts: ProfileRecalculationImpactDTO[];
  collection_impacts: CollectionRecalculationImpactDTO[];
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
  initialBookId?: string;
  onConsumeInitialBookId?: () => void;
}

const TABS: { id: BookHoursTab; label: string; paneId: string }[] = [
  { id: "overview", label: "Overview", paneId: "bhOverview" },
  { id: "byProfile", label: "By Profile", paneId: "bhProfilesView" },
  { id: "byCollection", label: "By Collection", paneId: "bhCollectionsView" },
  { id: "books", label: "Books", paneId: "bhBooksView" },
  { id: "profiles", label: "Profiles", paneId: "bhProfilesManage" },
  { id: "formula", label: "Formula & Defaults", paneId: "bhFormula" },
];

export function BookHoursPlanning({
  onBack,
  initialTab = "overview",
  initialBookId,
  onConsumeInitialBookId,
}: BookHoursPlanningProps) {
  const [activeTab, setActiveTab] = useState<BookHoursTab>(initialTab);
  const [overview, setOverview] = useState<BookHoursOverviewDTO | null>(null);
  const [globalDefaults, setGlobalDefaults] = useState<GlobalBookHoursDefaultsDTO | null>(null);
  const [allProfiles, setAllProfiles] = useState<ReadingProfileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One-shot deep link consumption ref
  const consumedInitialBookIdRef = useRef<string | null>(null);

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

  // Profile Drawer state (Create / Edit)
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileDiffInput, setProfileDiffInput] = useState("1.0");
  const [profileDescInput, setProfileDescInput] = useState("");
  const [profileDrawerSaving, setProfileDrawerSaving] = useState(false);
  const [profileDrawerError, setProfileDrawerError] = useState<string | null>(null);

  // Profile Delete state
  const [profileToDelete, setProfileToDelete] = useState<ReadingProfileDTO | null>(null);
  const [profileDeleting, setProfileDeleting] = useState(false);
  const [profileDeleteError, setProfileDeleteError] = useState<string | null>(null);

  // Global defaults inputs (truthful, no invented fallbacks)
  const [globalSpeedPages, setGlobalSpeedPages] = useState<string>("");
  const [globalSpeedWords, setGlobalSpeedWords] = useState<string>("");
  const [globalSpeedChars, setGlobalSpeedChars] = useState<string>("");

  // Recalculation Impact Preview Modal state
  const [impactOverlayOpen, setImpactOverlayOpen] = useState(false);
  const [recalcPreviewResult, setRecalcPreviewResult] = useState<RecalculationPreviewResultDTO | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recalcApplying, setRecalcApplying] = useState(false);

  const fetchOverview = async () => {
    try {
      const [overviewRes, defaultsRes, profilesRes] = await Promise.allSettled([
        invoke<BookHoursOverviewDTO>("get_book_hours_overview_command"),
        invoke<GlobalBookHoursDefaultsDTO>("get_global_book_hours_defaults_command"),
        invoke<ReadingProfileDTO[]>("list_reading_profiles_command"),
      ]);

      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value || null);
        setError(null);
      } else {
        setError(String(overviewRes.reason));
      }

      if (defaultsRes.status === "fulfilled") {
        setGlobalDefaults(defaultsRes.value || null);
      } else {
        setGlobalDefaults(null);
      }

      if (profilesRes.status === "fulfilled") {
        setAllProfiles(profilesRes.value || []);
      } else {
        setAllProfiles([]);
      }

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

  // Synchronize global defaults inputs
  useEffect(() => {
    if (globalDefaults) {
      setGlobalSpeedPages(String(globalDefaults.pages_per_hour));
      setGlobalSpeedWords(String(globalDefaults.words_per_hour));
      setGlobalSpeedChars(String(globalDefaults.characters_per_hour));
    } else {
      setGlobalSpeedPages("");
      setGlobalSpeedWords("");
      setGlobalSpeedChars("");
    }
  }, [globalDefaults]);

  // Deep-link initialBookId (one-shot navigation intent)
  useEffect(() => {
    if (initialBookId && overview && consumedInitialBookIdRef.current !== initialBookId) {
      consumedInitialBookIdRef.current = initialBookId;
      const b = overview.books.find((book) => book.book_id === initialBookId);
      if (b) {
        openBookSetupDrawer(b);
      }
      onConsumeInitialBookId?.();
    }
  }, [initialBookId, overview, onConsumeInitialBookId]);

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
    const profileId =
      book.profile_id ??
      allProfiles.find((p) => p.is_default)?.id ??
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
    if (!globalDefaults) return null;
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

  // Selected Profile for Tab 2
  const effectiveSelectedProfileId =
    selectedProfileId || (overview?.profiles.length ? overview.profiles[0].profile_id : "");
  const activeProfileData = overview?.profiles.find((p) => p.profile_id === effectiveSelectedProfileId);
  const activeProfileBooks = overview?.books.filter((b) => b.profile_id === effectiveSelectedProfileId) ?? [];

  // Selected Collection for Tab 3
  const effectiveSelectedCollectionId =
    selectedCollectionId || (overview?.collections.length ? overview.collections[0].collection_id : "");
  const activeCollectionData = overview?.collections.find((c) => c.collection_id === effectiveSelectedCollectionId);
  const activeCollectionBooks =
    overview?.books.filter(
      (b) => activeCollectionData && b.collections.includes(activeCollectionData.collection_name),
    ) ?? [];

  // Filtered Books for Tab 4
  const filteredBooks = (overview?.books ?? []).filter((b) => {
    if (booksSearchQuery.trim() !== "") {
      const q = booksSearchQuery.toLowerCase();
      if (!b.title.toLowerCase().includes(q)) return false;
    }
    if (booksProfileFilter !== "all") {
      if (b.profile_id !== booksProfileFilter && b.profile_name !== booksProfileFilter) return false;
    }
    if (booksCollectionFilter !== "all") {
      if (!b.collections.includes(booksCollectionFilter)) return false;
    }
    if (booksStateFilter === "calculated") {
      if (!b.calculation) return false;
    } else if (booksStateFilter === "uncalculated") {
      if (b.calculation) return false;
    }
    return true;
  });

  // Profile CRUD Handlers
  const openNewProfileDrawer = () => {
    setEditingProfileId(null);
    setProfileNameInput("");
    setProfileDiffInput("1.0");
    setProfileDescInput("");
    setProfileDrawerError(null);
    setProfileDrawerOpen(true);
  };

  const openEditProfileDrawer = (p: ReadingProfileDTO) => {
    setEditingProfileId(p.id);
    setProfileNameInput(p.name);
    setProfileDiffInput(String(p.difficulty_multiplier));
    setProfileDescInput(p.description);
    setProfileDrawerError(null);
    setProfileDrawerOpen(true);
  };

  const closeProfileDrawer = () => {
    setProfileDrawerOpen(false);
    setProfileDrawerError(null);
  };

  const handleSaveProfile = async () => {
    const name = profileNameInput.trim();
    if (!name) {
      setProfileDrawerError("Profile name cannot be empty.");
      return;
    }
    const diff = Number.parseFloat(profileDiffInput);
    if (!Number.isFinite(diff) || diff <= 0) {
      setProfileDrawerError("Difficulty multiplier must be a positive number (> 0).");
      return;
    }
    setProfileDrawerSaving(true);
    setProfileDrawerError(null);
    try {
      if (editingProfileId) {
        await invoke("update_reading_profile_command", {
          id: editingProfileId,
          name,
          difficultyMultiplier: diff,
          description: profileDescInput.trim(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        const id = `profile-${Date.now()}`;
        await invoke("create_reading_profile_command", {
          id,
          name,
          difficultyMultiplier: diff,
          description: profileDescInput.trim(),
          isDefault: false,
          createdAt: new Date().toISOString(),
        });
      }
      await fetchOverview();
      closeProfileDrawer();
    } catch (err) {
      setProfileDrawerError(String(err));
    } finally {
      setProfileDrawerSaving(false);
    }
  };

  const handleSetDefaultProfile = async (id: string) => {
    try {
      await invoke("set_default_reading_profile_command", { id });
      await fetchOverview();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDeleteProfileClick = (p: ReadingProfileDTO) => {
    if (p.is_default) {
      setError("Cannot delete the default reading profile.");
      return;
    }
    setProfileToDelete(p);
    setProfileDeleteError(null);
  };

  const confirmDeleteProfile = async () => {
    if (!profileToDelete) return;
    setProfileDeleting(true);
    setProfileDeleteError(null);
    try {
      await invoke("delete_reading_profile_command", { id: profileToDelete.id });
      setProfileToDelete(null);
      await fetchOverview();
    } catch (err) {
      setProfileDeleteError(String(err));
    } finally {
      setProfileDeleting(false);
    }
  };

  // Formula & Defaults Handlers
  const buildProposedDefaults = (): GlobalBookHoursDefaultsDTO | null => {
    const p = Number.parseFloat(globalSpeedPages);
    const w = Number.parseFloat(globalSpeedWords);
    const c = Number.parseFloat(globalSpeedChars);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(c) || c <= 0) {
      return null;
    }
    return {
      pages_per_hour: p,
      words_per_hour: w,
      characters_per_hour: c,
    };
  };

  const handlePreviewRecalculation = async () => {
    const proposed = buildProposedDefaults();
    if (!proposed) {
      setError("Baseline speeds must all be positive numbers (> 0).");
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await invoke<RecalculationPreviewResultDTO>(
        "preview_book_hours_recalculation_command",
        {
          request: {
            proposed_defaults: proposed,
            proposed_profiles: null,
          },
        },
      );
      setRecalcPreviewResult(result);
      setImpactOverlayOpen(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyRecalculation = async () => {
    const proposed = buildProposedDefaults();
    if (!proposed) {
      setPreviewError("Baseline speeds must all be positive numbers (> 0).");
      return;
    }
    setRecalcApplying(true);
    setPreviewError(null);
    try {
      await invoke<RecalculationPreviewResultDTO>(
        "apply_book_hours_recalculation_command",
        {
          request: {
            proposed_defaults: proposed,
            proposed_profiles: null,
          },
        },
      );
      setImpactOverlayOpen(false);
      await fetchOverview();
    } catch (err) {
      setPreviewError(String(err));
    } finally {
      setRecalcApplying(false);
    }
  };

  const defaultProfileName =
    allProfiles.find((p) => p.is_default)?.name ??
    overview?.profiles.find((p) => p.is_default)?.profile_name ??
    "Default";

  const defaultProfileDiff =
    allProfiles.find((p) => p.is_default)?.difficulty_multiplier ??
    overview?.profiles.find((p) => p.is_default)?.difficulty_multiplier ??
    1.0;

  return (
    <section
      className="bhShell"
      aria-label="Book Hours Planning"
      role="region"
      id="bookHoursPlanningSection"
    >
      <header className="top">
        <button
          type="button"
          className="icon"
          onClick={onBack}
          aria-label="Back to Data"
        >
          ← Back
        </button>
        <div className="title">Book Hours Planning</div>
        <div className="grow" />
        <span className="meta">
          Canonical Formula: (Quantity / Baseline Speed) × Difficulty
        </span>
      </header>

      <div className="bhTabs" role="tablist" aria-label="Book Hours Planning Views">
        {TABS.map((tab, idx) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={tab.paneId}
            className={`bhTab ${activeTab === tab.id ? "active" : ""}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bhViewport">
        {loading && (
          <div className="bhNote" style={{ marginBottom: "16px" }}>
            Loading Book Hours data…
          </div>
        )}

        {error && (
          <div className="bhWarn" role="alert" style={{ marginBottom: "16px" }}>
            <strong>Error loading Book Hours:</strong> {error}
            <div style={{ marginTop: "8px" }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchOverview();
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="bhPanes">
          {/* Tab 1: Overview */}
          <section
            className={`bhPane ${activeTab === "overview" ? "active" : ""}`}
            id="bhOverview"
            role="tabpanel"
            aria-labelledby="tab-overview"
            hidden={activeTab !== "overview"}
          >
            <div className="bhHero">
              <div className="bhCard">
                <h2>What are Book Hours?</h2>
                <div className="bhLead">
                  Book Hours represents the estimated total reading investment of your library.
                  Planned Book Hours is system-calculated from Quantity, Baseline Speed, and
                  Reading Profile difficulty. Current Book Hours scales Planned Book Hours by
                  reading progress.
                </div>
                <div className="bhRule">
                  <b>Key Rule:</b> Planned Book Hours is an estimate. Reading Progress is an
                  independent reading fact. Recalculating Book Hours never modifies reading progress
                  or completed reads.
                </div>
              </div>

              <div className="bhCard">
                <h3>Calculation Coverage</h3>
                <div className="bhLead">
                  Books missing quantity or required inputs remain Not Calculated (Needs setup).
                </div>
                <div className="bhRule">
                  <b>{overview ? overview.global_coverage.calculated_books : 0}</b> of{" "}
                  <b>{overview ? overview.global_coverage.total_books : 0}</b> Books calculated.
                  {uncalculatedCount > 0 && (
                    <div className="bhBadgeGroup">
                      <span className="bhBadge warn">
                        {uncalculatedCount} Needs setup
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {overview && (
              <div className="bhSummary">
                <div className="bhMetric">
                  <span>Planned Book Hours</span>
                  <b id="bhTotalPlanned">
                    {overview.total_planned_hours.toFixed(1)}h
                  </b>
                  <small>System-calculated total workload</small>
                </div>
                <div className="bhMetric">
                  <span>Current Book Hours</span>
                  <b id="bhTotalCurrent">
                    {overview.total_current_hours.toFixed(1)}h
                  </b>
                  <small>Weighted by independent reading progress</small>
                </div>
                <div className="bhMetric">
                  <span>Book Hours Completion</span>
                  <b id="bhCompletionRate">
                    {bookHoursCompletionPercent !== null
                      ? `${bookHoursCompletionPercent}%`
                      : "—"}
                  </b>
                  <small>
                    Total Current / Total Planned Book Hours
                  </small>
                </div>
                <div className={`bhMetric ${uncalculatedCount > 0 ? "attn" : ""}`}>
                  <span>Calculation Coverage</span>
                  <b id="bhCoverageRate">
                    {overview.global_coverage.total_books > 0
                      ? `${Math.round(
                          (overview.global_coverage.calculated_books /
                            overview.global_coverage.total_books) *
                            100,
                        )}%`
                      : "100%"}
                  </b>
                  <small>
                    {overview.global_coverage.calculated_books} of{" "}
                    {overview.global_coverage.total_books} books calculated
                  </small>
                </div>
              </div>
            )}

            {overview && (
              <div className="bhTwo">
                <div className="bhCard">
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
                          <th>Books</th>
                          <th>Planned</th>
                          <th>Current</th>
                          <th>Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.profiles.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="bhMuted bhEmptyCell">
                              No profiles found.
                            </td>
                          </tr>
                        ) : (
                          overview.profiles.map((p) => (
                            <tr key={p.profile_id}>
                              <td>
                                <span className="bhBadge profile">
                                  {p.profile_name}
                                  {p.is_default && (
                                    <span className="bhBadge default">[Default]</span>
                                  )}
                                </span>
                              </td>
                              <td>{p.coverage.total_books}</td>
                              <td>{p.total_planned_hours.toFixed(1)}h</td>
                              <td>{p.total_current_hours.toFixed(1)}h</td>
                              <td>
                                {p.coverage.calculated_books}/{p.coverage.total_books}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bhCard">
                  <div className="bhSubhead">
                    <h3>Summary by Collection</h3>
                    <div className="grow" />
                    <span className="hint">Books may appear in multiple Collections</span>
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
                              No collections found.
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
                                {c.coverage.calculated_books}/{c.coverage.total_books}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="bhNote bhNoteMargin">
                    Collection totals can overlap because the same Book may belong to more than one
                    Collection. Global totals count each Book only once.
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Tab 2: By Profile */}
          <section
            className={`bhPane ${activeTab === "byProfile" ? "active" : ""}`}
            id="bhProfilesView"
            role="tabpanel"
            aria-labelledby="tab-byProfile"
            hidden={activeTab !== "byProfile"}
          >
            {overview && (
              <div className="bhMasterDetail">
                <aside className="bhList" aria-label="Profiles List">
                  {overview.profiles.map((p) => (
                    <button
                      key={p.profile_id}
                      type="button"
                      className={`bhListItem ${selectedProfileId === p.profile_id ? "active" : ""}`}
                      onClick={() => setSelectedProfileId(p.profile_id)}
                    >
                      <b>
                        {p.profile_name}
                        {p.is_default ? " (Default)" : ""}
                      </b>
                      <small>
                        Difficulty {p.difficulty_multiplier.toFixed(1)} · {p.coverage.total_books}{" "}
                        Books · {p.total_planned_hours.toFixed(1)}h planned
                      </small>
                    </button>
                  ))}
                </aside>

                <div className="bhDetail">
                  {activeProfileData && (
                    <>
                      <div className="bhDetailHead">
                        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                          <span className="bhBadge profile">Reading Profile</span>
                          <h2 style={{ fontSize: "20px", margin: 0 }}>
                            {activeProfileData.profile_name}
                          </h2>
                          <div className="grow" />
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const p = allProfiles.find((x) => x.id === activeProfileData.profile_id);
                              if (p) openEditProfileDrawer(p);
                            }}
                          >
                            Edit Profile
                          </button>
                        </div>
                        <div className="bhLead">
                          Difficulty coefficient {activeProfileData.difficulty_multiplier.toFixed(1)}
                          . Uses the global canonical formula.
                        </div>
                        <div className="stats">
                          <div className="stat">
                            <span className="meta">Books</span>
                            <b>{activeProfileData.coverage.total_books}</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Coverage</span>
                            <b>
                              {activeProfileData.coverage.calculated_books}/
                              {activeProfileData.coverage.total_books}
                            </b>
                          </div>
                          <div className="stat">
                            <span className="meta">Planned BH</span>
                            <b>{activeProfileData.total_planned_hours.toFixed(1)}h</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Current BH</span>
                            <b>{activeProfileData.total_current_hours.toFixed(1)}h</b>
                          </div>
                        </div>
                      </div>

                      <div className="bhCard">
                        <div className="bhSubhead">
                          <h3>Books using this Profile</h3>
                          <div className="grow" />
                          <span className="hint">
                            Each Book still keeps its own Collections and Reading Progress.
                          </span>
                        </div>
                        <div className="bhTableWrap">
                          <table className="bhTable" aria-label="Books for Selected Profile">
                            <thead>
                              <tr>
                                <th>Book</th>
                                <th>Collections</th>
                                <th>Progress</th>
                                <th>Planned</th>
                                <th>Current</th>
                                <th>Remaining</th>
                                <th>Status</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeProfileBooks.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="bhMuted bhEmptyCell">
                                    No books currently use this profile.
                                  </td>
                                </tr>
                              ) : (
                                activeProfileBooks.map((b) => (
                                  <tr key={b.book_id}>
                                    <td>
                                      <span className="bhName">{b.title}</span>
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
                                      {b.calculation
                                        ? `${Math.max(
                                            0,
                                            b.calculation.planned_book_hours -
                                              b.calculation.current_book_hours,
                                          ).toFixed(1)}h`
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
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Tab 3: By Collection */}
          <section
            className={`bhPane ${activeTab === "byCollection" ? "active" : ""}`}
            id="bhCollectionsView"
            role="tabpanel"
            aria-labelledby="tab-byCollection"
            hidden={activeTab !== "byCollection"}
          >
            {overview && (
              <div className="bhMasterDetail">
                <aside className="bhList" aria-label="Collections List">
                  {overview.collections.map((c) => (
                    <button
                      key={c.collection_id}
                      type="button"
                      className={`bhListItem ${
                        selectedCollectionId === c.collection_id ? "active" : ""
                      }`}
                      onClick={() => setSelectedCollectionId(c.collection_id)}
                    >
                      <b>{c.collection_name}</b>
                      <small>
                        {c.coverage.total_books} Books · {c.total_planned_hours.toFixed(1)}h planned
                      </small>
                    </button>
                  ))}
                </aside>

                <div className="bhDetail">
                  {activeCollectionData && (
                    <>
                      <div className="bhDetailHead">
                        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                          <span className="bhBadge">Collection</span>
                          <h2 style={{ fontSize: "20px", margin: 0 }}>
                            {activeCollectionData.collection_name}
                          </h2>
                        </div>
                        <div className="bhLead">
                          A Collection organizes Books. The same Book can appear here and in other
                          Collections, while its Reading Profile remains singular.
                        </div>
                        <div className="stats">
                          <div className="stat">
                            <span className="meta">Books</span>
                            <b>{activeCollectionData.coverage.total_books}</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Coverage</span>
                            <b>
                              {activeCollectionData.coverage.calculated_books}/
                              {activeCollectionData.coverage.total_books}
                            </b>
                          </div>
                          <div className="stat">
                            <span className="meta">Planned BH</span>
                            <b>{activeCollectionData.total_planned_hours.toFixed(1)}h</b>
                          </div>
                          <div className="stat">
                            <span className="meta">Current BH</span>
                            <b>{activeCollectionData.total_current_hours.toFixed(1)}h</b>
                          </div>
                        </div>
                      </div>

                      <div className="bhCard">
                        <div className="bhCoverage">
                          <strong>Coverage:</strong>{" "}
                          {activeCollectionData.coverage.calculated_books} of{" "}
                          {activeCollectionData.coverage.total_books} Books currently contribute to
                          Collection Book Hours totals.
                          {activeCollectionData.coverage.uncalculated_books > 0 && (
                            <span className="bhBadge warn" style={{ marginLeft: "8px" }}>
                              {activeCollectionData.coverage.uncalculated_books} Needs setup
                            </span>
                          )}
                        </div>
                        <div className="bhTableWrap">
                          <table className="bhTable" aria-label="Books in Selected Collection">
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
                                    No books in this collection.
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
                      <div className="bhNote">
                        Collection totals are intentionally local to the Collection and may overlap
                        with other Collections. The Overview’s global total deduplicates Books.
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Tab 4: Books */}
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

                <div className="bhFilters">
                  <input
                    type="search"
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
                      <option key={p.profile_id} value={p.profile_id}>
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

          {/* Tab 5: Profiles Manage (BH-3C) */}
          <section
            className={`bhPane ${activeTab === "profiles" ? "active" : ""}`}
            id="bhProfilesManage"
            role="tabpanel"
            aria-labelledby="tab-profiles"
            hidden={activeTab !== "profiles"}
          >
            <div className="bhHero" style={{ gridTemplateColumns: "1fr 320px" }}>
              <div className="bhCard">
                <div className="bhSubhead">
                  <h3>Reading Profiles</h3>
                  <div className="grow" />
                  <button
                    type="button"
                    className="primary"
                    id="newProfileBtn"
                    onClick={openNewProfileDrawer}
                  >
                    ＋ New Profile
                  </button>
                </div>
                <div className="bhLead">
                  Profiles are not ordinary multi-tags. A Book selects exactly one Profile for Book
                  Hours calculation. A Profile defines the Difficulty Coefficient. Baseline reading
                  speed is configured per quantity unit (pages/hour, words/hour, characters/hour)
                  under Formula &amp; Defaults or overridden on the Book.
                </div>
              </div>
              <div className="bhCard">
                <h3>Profile inheritance</h3>
                <div className="bhLead">
                  Global Formula (Unit Speeds) × Profile Difficulty → Book inputs. Changing a
                  Profile recalculates the Books using that Profile, but never their Reading
                  Progress.
                </div>
              </div>
            </div>

            <div className="bhProfileCards">
              {allProfiles.map((p) => {
                const summary = overview?.profiles.find((op) => op.profile_id === p.id);
                const bookCount = summary ? summary.coverage.total_books : 0;
                const plannedH = summary ? `${summary.total_planned_hours.toFixed(1)}h` : "—";
                const currentH = summary ? `${summary.total_current_hours.toFixed(1)}h` : "—";

                return (
                  <div key={p.id} className="bhProfileCard">
                    <div className="topline">
                      <div className="bhProfileIdentity">
                        <span className="bhBadge profile">Profile</span>
                        <b>{p.name}</b>
                        {p.is_default && <span className="bhBadge default">[Default]</span>}
                      </div>
                      <div className="bhProfileActions">
                        <button
                          type="button"
                          className="btn"
                          data-open-profile-editor
                          style={{ height: "30px" }}
                          onClick={() => openEditProfileDrawer(p)}
                        >
                          Edit
                        </button>
                        {!p.is_default && (
                          <>
                            <button
                              type="button"
                              className="btn"
                              style={{ height: "30px", fontSize: "10px" }}
                              onClick={() => handleSetDefaultProfile(p.id)}
                            >
                              Set Default
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ height: "30px", color: "var(--danger, #a34c45)" }}
                              onClick={() => handleDeleteProfileClick(p)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="bhLead" style={{ marginTop: "8px" }}>
                      {p.description || "No description provided."}
                    </div>
                    <div className="profileStats">
                      <div>
                        <span>Difficulty</span>
                        <b>{p.difficulty_multiplier.toFixed(1)}</b>
                      </div>
                      <div>
                        <span>Books</span>
                        <b>{bookCount}</b>
                      </div>
                      <div>
                        <span>Planned</span>
                        <b>{plannedH}</b>
                      </div>
                      <div>
                        <span>Current</span>
                        <b>{currentH}</b>
                      </div>
                    </div>
                    <div className="bhNote">
                      Difficulty coefficient {p.difficulty_multiplier.toFixed(1)} · Uses unit-based
                      baseline speed
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Tab 6: Formula & Defaults (BH-3C) */}
          <section
            className={`bhPane ${activeTab === "formula" ? "active" : ""}`}
            id="bhFormula"
            role="tabpanel"
            aria-labelledby="tab-formula"
            hidden={activeTab !== "formula"}
          >
            <div className="bhHero">
              <div className="bhCard">
                <h2>Global Book Hours Formula</h2>
                <div className="bhLead">
                  This is the system-wide fallback rule. Newly imported Books use it automatically
                  when sufficient information is available. Profiles supply the difficulty; baseline
                  speed resolves per quantity unit. Users never type the Planned Book Hours result
                  directly.
                </div>
                <div className="bhFormulaFlow">
                  <div className="bhFormulaToken">
                    <span>Quantity</span>
                    <b>Book size</b>
                  </div>
                  <span className="bhOp">÷</span>
                  <div className="bhFormulaToken">
                    <span>Baseline Speed</span>
                    <b>unit-specific speed</b>
                  </div>
                  <span className="bhOp">×</span>
                  <div className="bhFormulaToken">
                    <span>Difficulty</span>
                    <b>Profile coefficient</b>
                  </div>
                  <span className="bhOp">=</span>
                  <div className="bhFormulaToken bhFormulaResult">
                    <span>System result</span>
                    <b>Planned Book Hours</b>
                  </div>
                </div>
                <div className="bhFormulaFlow">
                  <div className="bhFormulaToken">
                    <span>Planned Book Hours</span>
                    <b>system calculated</b>
                  </div>
                  <span className="bhOp">×</span>
                  <div className="bhFormulaToken">
                    <span>Cumulative Reading %</span>
                    <b>independent reading fact</b>
                  </div>
                  <span className="bhOp">=</span>
                  <div className="bhFormulaToken bhFormulaResult">
                    <span>Completed-equivalent</span>
                    <b>Current Book Hours</b>
                  </div>
                </div>
              </div>

              <div className="bhCard">
                <h3>Not Calculated is a valid state</h3>
                <div className="bhLead">
                  If EbookReader cannot determine a required input such as Quantity, the Book
                  remains fully usable but receives no Book Hours result yet.
                </div>
                <div className="bhRule">
                  <span className="bhBadge warn">Needs setup</span>
                  <br />
                  <br />
                  Not-calculated Books stay visible in every relevant list and are excluded from
                  aggregates with explicit coverage counts.
                </div>
              </div>
            </div>

            {!globalDefaults && (
              <div className="bhWarn" role="alert" style={{ marginBottom: "16px", borderColor: "var(--danger, #d9534f)" }}>
                <b>Error / Unavailable:</b> Global baseline speeds are unavailable (failed to load from system). Recalculation preview and saving defaults are disabled.
              </div>
            )}

            <div className="bhRuleGrid">
              <div className="bhCard">
                <h3>Global defaults</h3>
                <div className="bhControl">
                  <div>
                    <b>Fallback Reading Profile</b>
                    <div className="desc">
                      Default profile used when a Book has no explicit Profile assignment.
                    </div>
                  </div>
                  <div>
                    <span className="bhBadge profile">
                      {defaultProfileName} ({defaultProfileDiff.toFixed(1)})
                    </span>
                  </div>
                </div>

                <div className="bhControl">
                  <div>
                    <label htmlFor="bhGlobalSpeedPages" style={{ fontWeight: 700, display: "block" }}>
                      Baseline Speed (Pages)
                    </label>
                    <div className="desc">Default speed for physical pages (PDF).</div>
                  </div>
                  <input
                    id="bhGlobalSpeedPages"
                    type="number"
                    min="1"
                    step="any"
                    disabled={!globalDefaults}
                    value={globalSpeedPages}
                    onChange={(e) => setGlobalSpeedPages(e.target.value)}
                  />
                </div>

                <div className="bhControl">
                  <div>
                    <label htmlFor="bhGlobalSpeedWords" style={{ fontWeight: 700, display: "block" }}>
                      Baseline Speed (Words)
                    </label>
                    <div className="desc">Default speed for words (EPUB/TXT, ~250 wpm).</div>
                  </div>
                  <input
                    id="bhGlobalSpeedWords"
                    type="number"
                    min="1"
                    step="any"
                    disabled={!globalDefaults}
                    value={globalSpeedWords}
                    onChange={(e) => setGlobalSpeedWords(e.target.value)}
                  />
                </div>

                <div className="bhControl">
                  <div>
                    <label htmlFor="bhGlobalSpeedChars" style={{ fontWeight: 700, display: "block" }}>
                      Baseline Speed (Characters)
                    </label>
                    <div className="desc">
                      Default speed for characters (EPUB/TXT, ~500 cpm).
                    </div>
                  </div>
                  <input
                    id="bhGlobalSpeedChars"
                    type="number"
                    min="1"
                    step="any"
                    disabled={!globalDefaults}
                    value={globalSpeedChars}
                    onChange={(e) => setGlobalSpeedChars(e.target.value)}
                  />
                </div>
              </div>

              <div className="bhCard">
                <h3>Recalculation impact</h3>
                <div className="bhLead">
                  Changing Book Hours rules or Profile defaults can recalculate planning values
                  across Books and Collections. Reading Progress never changes.
                </div>
                {overview && (
                  <div className="bhImpact">
                    <div>
                      <span>Calculated Books</span>
                      <b>{overview.global_coverage.calculated_books}</b>
                    </div>
                    <div>
                      <span>Profiles</span>
                      <b>{overview.profiles.length}</b>
                    </div>
                    <div>
                      <span>Collections</span>
                      <b>{overview.collections.length}</b>
                    </div>
                    <div>
                      <span>Progress changed</span>
                      <b>0</b>
                    </div>
                  </div>
                )}
                <div className="bhWarn">
                  <b>Important:</b> Book Hours is a planning model. A rule change can alter Planned
                  and Current Book Hours across the library. It does not alter page position,
                  completed-read count, or Reading Progress %.
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                    marginTop: "13px",
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    id="previewBhImpact"
                    onClick={handlePreviewRecalculation}
                    disabled={!globalDefaults || !buildProposedDefaults() || previewLoading}
                  >
                    {previewLoading ? "Calculating…" : "Preview recalculation"}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    id="saveBhDefaults"
                    onClick={handlePreviewRecalculation}
                    disabled={!globalDefaults || !buildProposedDefaults() || previewLoading}
                  >
                    Save defaults…
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Book Hours Setup Drawer (BH-3B / BH-3C) */}
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
                {drawerBook.unit === "legacy_untyped" && (
                  <option value="legacy_untyped">Legacy / Untyped</option>
                )}
              </select>
              {drawerUnit === "legacy_untyped" && (
                <div className="bhWarn" style={{ marginTop: "6px" }}>
                  Migrating legacy book: please select a standard unit (Pages, Words, or Characters)
                  to use global baseline speeds.
                </div>
              )}
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
                    : globalDefaults
                      ? `Default: ${
                          drawerUnit === "pages"
                            ? globalDefaults.pages_per_hour
                            : drawerUnit === "words"
                              ? globalDefaults.words_per_hour
                              : globalDefaults.characters_per_hour
                        }`
                      : "Global defaults unavailable — override required"
                }
              />
              <div className="bhLock">
                {globalDefaults ? (
                  <>
                    Baseline Speed resolves from unit defaults ({globalDefaults.pages_per_hour} pages/h,{" "}
                    {globalDefaults.words_per_hour} words/h, {globalDefaults.characters_per_hour} chars/h) and
                    can be overridden for this Book.
                  </>
                ) : (
                  <>
                    Global baseline speeds are currently unavailable. An explicit speed override is required
                    to calculate Book Hours.
                  </>
                )}
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
                  : drawerUnit === "legacy_untyped" && !drawerSpeedOverride
                    ? "Needs setup (legacy untyped unit requires explicit speed override)."
                    : !globalDefaults && !drawerSpeedOverride
                      ? "Needs setup (global baseline speeds unavailable; enter speed override)."
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

      {/* Profile Create / Edit Drawer (BH-3C) */}
      {profileDrawerOpen && (
        <>
          <div
            className="bhDrawerOverlay"
            onClick={closeProfileDrawer}
            aria-hidden="true"
          />
          <aside
            className="bhDrawer open"
            id="bhProfileDrawer"
            role="dialog"
            aria-label={editingProfileId ? "Edit Reading Profile" : "Create Reading Profile"}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeProfileDrawer();
            }}
          >
            <div className="bhDrawerHead">
              <h2>{editingProfileId ? "Edit Reading Profile" : "New Reading Profile"}</h2>
              <div className="grow" />
              <button
                type="button"
                className="icon"
                id="closeBhProfileDrawer"
                onClick={closeProfileDrawer}
                aria-label="Close Profile Drawer"
              >
                ×
              </button>
            </div>
            <div className="bhLead">
              A Reading Profile defines a shared difficulty coefficient, not a baseline speed or
              format unit.
            </div>
            <div className="sep" />

            {profileDrawerError && (
              <div className="bhWarn" style={{ marginBottom: "12px" }}>
                {profileDrawerError}
              </div>
            )}

            <div className="bhField">
              <label htmlFor="bhProfileNameInput">Profile Name</label>
              <input
                id="bhProfileNameInput"
                type="text"
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                placeholder="e.g. Textbook, Novel, Research Paper"
              />
            </div>

            <div className="bhField">
              <label htmlFor="bhProfileDiffInput">Difficulty Coefficient</label>
              <input
                id="bhProfileDiffInput"
                type="number"
                step="0.1"
                min="0.01"
                value={profileDiffInput}
                onChange={(e) => setProfileDiffInput(e.target.value)}
              />
            </div>

            <div className="bhField">
              <label htmlFor="bhProfileDescInput">Description</label>
              <input
                id="bhProfileDescInput"
                type="text"
                value={profileDescInput}
                onChange={(e) => setProfileDescInput(e.target.value)}
                placeholder="Optional description of this reading category"
              />
            </div>

            <div className="bhWarn">
              Saving this Profile can recalculate Book Hours for every Book using it. Their Reading
              Progress remains unchanged.
            </div>

            <div className="bhImpact">
              <div>
                <span>Books affected</span>
                <b>
                  {editingProfileId
                    ? overview?.books.filter((b) => b.profile_id === editingProfileId).length ?? 0
                    : 0}
                </b>
              </div>
              <div>
                <span>Progress changed</span>
                <b>0</b>
              </div>
              <div>
                <span>Formula</span>
                <b>Global</b>
              </div>
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="btn"
                id="cancelBhProfile"
                onClick={closeProfileDrawer}
                disabled={profileDrawerSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSaveProfile}
                disabled={profileDrawerSaving}
              >
                {profileDrawerSaving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Delete Profile Confirmation Dialog */}
      {profileToDelete && (
        <div
          className="overlay open"
          role="dialog"
          aria-label="Confirm Delete Profile"
        >
          <div className="modal">
            <div className="modalHead">
              <h2>Delete Reading Profile?</h2>
            </div>
            <p style={{ marginTop: "12px" }}>
              Are you sure you want to delete profile <b>{profileToDelete.name}</b>?
            </p>
            <div className="bhNote">
              Books currently assigned to this profile will be reassigned to the default profile.
              Their reading progress will not be changed.
            </div>
            {profileDeleteError && (
              <div className="bhWarn" style={{ marginTop: "10px" }}>
                {profileDeleteError}
              </div>
            )}
            <div className="modalActions">
              <button
                type="button"
                className="btn"
                onClick={() => setProfileToDelete(null)}
                disabled={profileDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary danger"
                style={{ background: "var(--danger, #a34c45)", borderColor: "var(--danger, #a34c45)", color: "#fff" }}
                onClick={confirmDeleteProfile}
                disabled={profileDeleting}
              >
                {profileDeleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recalculation Impact Overlay / Modal (BH-3C) */}
      {impactOverlayOpen && recalcPreviewResult && (
        <div
          className="overlay open"
          id="bhImpactOverlay"
          role="dialog"
          aria-label="Book Hours Recalculation Preview"
        >
          <div className="modal" style={{ width: "min(680px, 94vw)" }}>
            <div className="modalHead">
              <h2>Book Hours Recalculation Preview</h2>
              <div className="grow" />
              <button
                type="button"
                className="icon"
                id="closeBhImpact"
                onClick={() => setImpactOverlayOpen(false)}
                aria-label="Close Preview"
              >
                ×
              </button>
            </div>
            <div className="hint" style={{ marginTop: "7px" }}>
              No reading facts have changed. This preview shows planning values only.
            </div>

            <div className="previewList">
              <div className="previewCell">
                <span>Calculated Books affected</span>
                <b>{recalcPreviewResult.affected_books_count}</b>
              </div>
              <div className="previewCell">
                <span>Profiles affected</span>
                <b>
                  {
                    recalcPreviewResult.profile_impacts.filter(
                      (p) => Math.abs(p.hours_delta) > 0.001,
                    ).length
                  }
                </b>
              </div>
              <div className="previewCell">
                <span>Collections touched</span>
                <b>
                  {
                    recalcPreviewResult.collection_impacts.filter(
                      (c) => Math.abs(c.hours_delta) > 0.001,
                    ).length
                  }
                </b>
              </div>
              <div className="previewCell">
                <span>Reading Progress changes</span>
                <b>0</b>
              </div>
              <div className="previewCell">
                <span>Old library Planned BH</span>
                <b>{recalcPreviewResult.old_total_planned_hours.toFixed(1)}h</b>
              </div>
              <div className="previewCell">
                <span>Preview Planned BH</span>
                <b>{recalcPreviewResult.new_total_planned_hours.toFixed(1)}h</b>
              </div>
            </div>

            {recalcPreviewResult.affected_books.length > 0 && (
              <div style={{ margin: "14px 0" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  Affected Books ({recalcPreviewResult.affected_books.length})
                </div>
                <div className="bhTableWrap" style={{ maxHeight: "200px" }}>
                  <table className="bhTable" aria-label="Affected Books">
                    <thead>
                      <tr>
                        <th>Book</th>
                        <th>Old Planned</th>
                        <th>New Planned</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recalcPreviewResult.affected_books.map((ab) => (
                        <tr key={ab.book_id}>
                          <td>{ab.title}</td>
                          <td>
                            {ab.old_planned_hours !== null
                              ? `${ab.old_planned_hours.toFixed(1)}h`
                              : "—"}
                          </td>
                          <td>
                            {ab.new_planned_hours !== null
                              ? `${ab.new_planned_hours.toFixed(1)}h`
                              : "—"}
                          </td>
                          <td
                            style={{
                              color:
                                Math.abs(ab.hours_delta) < 0.001
                                  ? "var(--muted)"
                                  : ab.hours_delta > 0
                                    ? "var(--accent)"
                                    : "var(--danger, #a34c45)",
                            }}
                          >
                            {Math.abs(ab.hours_delta) < 0.001
                              ? "0.0h"
                              : ab.hours_delta > 0
                                ? `+${ab.hours_delta.toFixed(1)}h`
                                : `${ab.hours_delta.toFixed(1)}h`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {previewError && (
              <div className="bhWarn" style={{ marginBottom: "12px" }}>
                {previewError}
              </div>
            )}

            <div className="bhWarn">
              Changing calculation rules can affect every Book Hours aggregate. Books missing
              required data remain Not Calculated and are not silently treated as 0h.
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="btn"
                id="cancelBhImpact"
                onClick={() => setImpactOverlayOpen(false)}
                disabled={recalcApplying}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleApplyRecalculation}
                disabled={recalcApplying}
              >
                {recalcApplying ? "Applying…" : "Apply after confirmation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
