import { describe, expect, it } from "vitest";
import { computeCompletedReadMarkText, computeLibraryDisplayPercent } from "./libraryProgressDisplay";
import type { ReadingProgressDTO } from "./useReadingProgress";

function progress(overrides: Partial<ReadingProgressDTO>): ReadingProgressDTO {
  return { completed_read_count: 0, active_read_in_progress: false, active_pass_progress: 0, ...overrides };
}

describe("computeLibraryDisplayPercent", () => {
  it("cumulative mode: never-started book shows 0%", () => {
    expect(computeLibraryDisplayPercent(progress({ active_read_in_progress: true, active_pass_progress: 0 }), "cumulative")).toBe(0);
  });

  it("cumulative mode: active read in progress adds to completed credit", () => {
    const p = progress({ completed_read_count: 1, active_read_in_progress: true, active_pass_progress: 31 });
    expect(computeLibraryDisplayPercent(p, "cumulative")).toBe(131);
  });

  it("cumulative mode: completed with no active next read shows exactly completed*100", () => {
    const p = progress({ completed_read_count: 2, active_read_in_progress: false, active_pass_progress: 0 });
    expect(computeLibraryDisplayPercent(p, "cumulative")).toBe(200);
  });

  it("current-read mode: active read shows the active position (0-100 range)", () => {
    const p = progress({ completed_read_count: 3, active_read_in_progress: true, active_pass_progress: 31 });
    expect(computeLibraryDisplayPercent(p, "current")).toBe(31);
  });

  it("current-read mode: completed book with no active next read shows 100%", () => {
    const p = progress({ completed_read_count: 1, active_read_in_progress: false, active_pass_progress: 0 });
    expect(computeLibraryDisplayPercent(p, "current")).toBe(100);
  });

  it("current-read mode: never-started book shows 0%", () => {
    const p = progress({ completed_read_count: 0, active_read_in_progress: true, active_pass_progress: 0 });
    expect(computeLibraryDisplayPercent(p, "current")).toBe(0);
  });
});

describe("computeCompletedReadMarkText", () => {
  it("returns null when the mark is hidden, regardless of completed count", () => {
    const p = progress({ completed_read_count: 3 });
    expect(computeCompletedReadMarkText(p, "hide")).toBeNull();
  });

  it("returns null when shown but nothing has been completed yet", () => {
    const p = progress({ completed_read_count: 0 });
    expect(computeCompletedReadMarkText(p, "show")).toBeNull();
  });

  it("reports the count in the compact badge format (V2-M3 final corrective: 'Read Nx', not 'Read N times')", () => {
    expect(computeCompletedReadMarkText(progress({ completed_read_count: 1 }), "show")).toBe("Read 1x");
    expect(computeCompletedReadMarkText(progress({ completed_read_count: 2 }), "show")).toBe("Read 2x");
    expect(computeCompletedReadMarkText(progress({ completed_read_count: 7 }), "show")).toBe("Read 7x");
  });
});
