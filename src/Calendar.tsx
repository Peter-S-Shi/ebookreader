import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DayDetailDTO {
  actual_seconds: number;
  planned_seconds: number | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDay(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function todayDay(): string {
  const now = new Date();
  return toDay(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatHm(seconds: number): string {
  if (seconds <= 0) return "0m";
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/// `DESIGN.md` SS13 / `PRODUCT_SPEC.md` SS15 "Calendar": answers "what did
/// I plan, and what reading actually happened?" -- a month grid of
/// Actual-Reading-Time activity dots plus a per-day detail card (Planned
/// vs Actual), matching the accepted v0.5 prototype's composition
/// (`docs/design/EbookReader_UI_Prototype_v0_5.html#calendar`). Kept
/// deliberately narrow per SS15/ROADMAP.md M6: the only "planned" figure
/// is the single lightweight daily reading-time goal
/// (`[[calendar]]`/`set_daily_goal_command`), not a due-date/pacing
/// engine -- no streaks, badges, or per-book scheduling.
export function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [activeDays, setActiveDays] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState(todayDay());
  const [detail, setDetail] = useState<DayDetailDTO | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay(): 0=Sun..6=Sat; the grid starts Monday, so shift to 0=Mon..6=Sun.
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

  const loadMonth = useCallback(async () => {
    const startDay = toDay(year, month, 1);
    const endDay = toDay(year, month, daysInMonth);
    try {
      const rows = await invoke<[string, number][]>("get_calendar_range_command", { startDay, endDay });
      setActiveDays(Object.fromEntries(rows));
    } catch {
      setActiveDays({});
    }
  }, [year, month, daysInMonth]);

  const loadDayDetail = useCallback(async (day: string) => {
    try {
      const d = await invoke<DayDetailDTO>("get_calendar_day_command", { day });
      setDetail(d);
      setGoalInput(d.planned_seconds !== null ? String(Math.round((d.planned_seconds / 3600) * 100) / 100) : "");
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    setGoalSaved(false);
    loadDayDetail(selectedDay);
  }, [selectedDay, loadDayDetail]);

  function goToPreviousMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  async function saveGoal() {
    const hours = parseFloat(goalInput);
    if (!Number.isFinite(hours) || hours < 0) return;
    await invoke("set_daily_goal_command", { effectiveDay: todayDay(), seconds: hours * 3600 }).catch(() => {});
    setGoalSaved(true);
    await loadDayDetail(selectedDay);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section className="calendar" aria-label="Calendar">
      <div className="calendar-header">
        <h2>
          {MONTH_NAMES[month]} {year}
        </h2>
        <span className="ocr-workspace-hint">Plan vs. actual reading</span>
        <div className="calendar-nav">
          <button type="button" onClick={goToPreviousMonth} aria-label="Previous month">
            ‹
          </button>
          <button type="button" onClick={goToNextMonth} aria-label="Next month">
            ›
          </button>
        </div>
      </div>
      <div className="calendar-layout">
        <div className="calendar-grid" role="grid" aria-label={`${MONTH_NAMES[month]} ${year}`}>
          {WEEKDAY_LABELS.map((label) => (
            <b key={label} className="calendar-weekday">
              {label}
            </b>
          ))}
          {cells.map((day, i) =>
            day === null ? (
              <span key={`empty-${i}`} className="calendar-cell calendar-cell-empty" />
            ) : (
              <button
                key={day}
                type="button"
                role="gridcell"
                className={
                  "calendar-cell" +
                  (toDay(year, month, day) === selectedDay ? " calendar-cell-selected" : "") +
                  (activeDays[toDay(year, month, day)] ? " calendar-cell-active" : "")
                }
                onClick={() => setSelectedDay(toDay(year, month, day))}
                aria-selected={toDay(year, month, day) === selectedDay}
              >
                {day}
                {activeDays[toDay(year, month, day)] > 0 && (
                  <span className="calendar-dot" aria-hidden="true">
                    ●
                  </span>
                )}
              </button>
            ),
          )}
        </div>
        <div className="calendar-detail">
          <b>{selectedDay}</b>
          <div className="calendar-detail-metric">
            <span className="ocr-workspace-hint">Planned Book Hours</span>
            <div className="calendar-detail-value">
              {detail?.planned_seconds != null ? formatHm(detail.planned_seconds) : "Not set"}
            </div>
          </div>
          <div className="calendar-detail-metric">
            <span className="ocr-workspace-hint">Actual Reading</span>
            <div className="calendar-detail-value">{formatHm(detail?.actual_seconds ?? 0)}</div>
          </div>
          <div className="calendar-goal-editor">
            <label>
              Daily goal (hours), from today onward
              <input
                type="number"
                min="0"
                step="0.25"
                aria-label="Daily reading goal in hours"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
              />
            </label>
            <button type="button" onClick={saveGoal}>
              Save goal
            </button>
            {goalSaved && <span role="status">Saved.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
