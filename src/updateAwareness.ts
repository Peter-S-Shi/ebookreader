/// `PRODUCT_SPEC.md` SS17 "Update Awareness": a stable-release checker,
/// modeled directly on GitHub Releases' own semantics rather than a
/// hand-rolled channel filter -- `GET /repos/{owner}/{repo}/releases/latest`
/// already returns only the latest release that is neither a draft nor
/// a prerelease (GitHub's own documented behavior), which is exactly
/// "stable release channel only" + "draft/prerelease ignored" with no
/// extra filtering logic needed on this side. Runs entirely in the
/// renderer via `fetch` -- no filesystem/native access is needed for a
/// read-only version check, so no Tauri command exists for this.

// This repository/current-version triple, shared by the manual "Check
// Now" (`DataRecovery.tsx`) and the optional startup check (`App.tsx`) so
// there is exactly one place either would need updating for a release.
export const REPO_OWNER = "Peter-S-Shi";
export const REPO_NAME = "ebookreader";
/// The current stable product version of this release candidate.
export const CURRENT_VERSION = "1.0.0";

export type UpdateCheckStatus = "up_to_date" | "update_available" | "check_failed";

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
}

/// Numeric dotted-version comparison (e.g. "0.1.0" vs "0.2.0"). Missing
/// trailing segments compare as 0, so "1.2" == "1.2.0". Returns
/// negative/zero/positive like `Array.prototype.sort`'s comparator.
/// No semver crate/library needed -- V1's own versions are plain
/// numeric dotted triples, not full semver with pre-release tags
/// (GitHub's `/releases/latest` already excludes those).
export function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
}

/// Checks GitHub Releases for a stable release newer than
/// `currentVersion`. Never throws -- any network/parse failure resolves
/// to `"check_failed"` (`PRODUCT_SPEC.md` SS17 "graceful offline/
/// check-failure state"), and this function is always awaited from a
/// caller that does not block the main UI on it.
export async function checkForUpdate(
  currentVersion: string,
  repoOwner: string,
  repoName: string,
): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      return { status: "check_failed", currentVersion, latestVersion: null, releaseUrl: null };
    }
    const release = (await response.json()) as GitHubRelease;
    const latestVersion = release.tag_name.replace(/^v/i, "");
    const status: UpdateCheckStatus = compareVersions(latestVersion, currentVersion) > 0 ? "update_available" : "up_to_date";
    return { status, currentVersion, latestVersion, releaseUrl: release.html_url };
  } catch {
    return { status: "check_failed", currentVersion, latestVersion: null, releaseUrl: null };
  }
}
