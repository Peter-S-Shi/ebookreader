export function formatSearchSnippet(content: string, query: string, maxLength = 120): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (!query || !query.trim()) {
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
  }

  const q = query.trim().toLowerCase();
  const lower = trimmed.toLowerCase();
  const index = lower.indexOf(q);

  if (index === -1) {
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
  }

  const half = Math.floor((maxLength - query.length) / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(trimmed.length, index + query.length + half);

  let snippet = trimmed.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < trimmed.length) snippet = `${snippet}...`;

  return snippet;
}
