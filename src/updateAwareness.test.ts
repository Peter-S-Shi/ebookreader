import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, compareVersions } from "./updateAwareness";

describe("compareVersions", () => {
  it("treats a higher version as greater", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
  });

  it("treats a lower version as lesser", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
  });

  it("treats identical versions as equal", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("treats missing trailing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("ignores a leading v prefix", () => {
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
  });

  it("compares the patch segment when major/minor are equal", () => {
    expect(compareVersions("1.0.5", "1.0.2")).toBeGreaterThan(0);
  });
});

describe("checkForUpdate", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports update_available when GitHub's latest release is newer than the current version", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v0.2.0", html_url: "https://example.invalid/releases/v0.2.0" }),
    });

    const result = await checkForUpdate("0.1.0", "owner", "repo");
    expect(result).toEqual({
      status: "update_available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      releaseUrl: "https://example.invalid/releases/v0.2.0",
    });
  });

  it("reports up_to_date when the current version is already the latest", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v0.1.0", html_url: "https://example.invalid/releases/v0.1.0" }),
    });

    const result = await checkForUpdate("0.1.0", "owner", "repo");
    expect(result.status).toBe("up_to_date");
  });

  it("reports check_failed on a non-ok HTTP response rather than throwing", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    const result = await checkForUpdate("0.1.0", "owner", "repo");
    expect(result).toEqual({ status: "check_failed", currentVersion: "0.1.0", latestVersion: null, releaseUrl: null });
  });

  it("reports check_failed when the network request throws (offline)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network unreachable"));

    const result = await checkForUpdate("0.1.0", "owner", "repo");
    expect(result.status).toBe("check_failed");
  });
});
