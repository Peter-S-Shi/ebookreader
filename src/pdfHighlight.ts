import type { HighlightColor } from "./highlightUtils";

export interface PdfAnnotationItem {
  id: string;
  kind?: string;
  text: string;
  color: HighlightColor;
  contextPrefix?: string | null;
  contextSuffix?: string | null;
}

interface TextNodeEntry {
  node: Text;
  parentSpan: HTMLElement | null;
  startOffset: number;
  endOffset: number;
  text: string;
}

/**
 * Collects all Text nodes in document order inside container with their global character offsets.
 */
function collectTextNodes(container: HTMLElement): { entries: TextNodeEntry[]; fullText: string } {
  const entries: TextNodeEntry[] = [];
  let currentOffset = 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const textNode = currentNode as Text;
      const text = textNode.nodeValue || "";
      if (text.length > 0) {
        const parent = textNode.parentElement;
        entries.push({
          node: textNode,
          parentSpan: parent && parent !== container ? parent : null,
          startOffset: currentOffset,
          endOffset: currentOffset + text.length,
          text,
        });
        currentOffset += text.length;
      }
    }
    currentNode = walker.nextNode();
  }

  const fullText = entries.map((e) => e.text).join("");
  return { entries, fullText };
}

/**
 * Finds the best match offset range for `query` in `fullText`, using prefix/suffix context if available.
 * Handles whitespace differences, newlines, and cross-span line breaks robustly.
 */
function findMatchRange(
  fullText: string,
  query: string,
  contextPrefix?: string | null,
  contextSuffix?: string | null,
): { start: number; end: number } | null {
  if (!query || !fullText) return null;

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return null;

  // Build mapping of non-whitespace characters from fullText to raw character offsets
  const fullChars: { char: string; rawIndex: number }[] = [];
  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i];
    if (!/\s/.test(ch)) {
      fullChars.push({ char: ch.toLowerCase(), rawIndex: i });
    }
  }

  // Extract non-whitespace characters from query
  const queryChars: string[] = [];
  for (let i = 0; i < normalizedQuery.length; i++) {
    const ch = normalizedQuery[i];
    if (!/\s/.test(ch)) {
      queryChars.push(ch.toLowerCase());
    }
  }

  if (queryChars.length === 0 || fullChars.length === 0) {
    return null;
  }

  const normFullStr = fullChars.map((c) => c.char).join("");
  const normQueryStr = queryChars.join("");

  // Search all candidate occurrences of normQueryStr in normFullStr
  const candidateIndices: number[] = [];
  let searchFrom = 0;
  while (searchFrom < normFullStr.length) {
    const idx = normFullStr.indexOf(normQueryStr, searchFrom);
    if (idx === -1) break;
    candidateIndices.push(idx);
    searchFrom = idx + 1;
  }

  if (candidateIndices.length === 0) {
    return null;
  }

  const prefixChars = (contextPrefix || "").replace(/\s/g, "").toLowerCase();
  const suffixChars = (contextSuffix || "").replace(/\s/g, "").toLowerCase();

  let bestIdx = candidateIndices[0];
  let bestScore = -1;

  if (candidateIndices.length === 1 || (!prefixChars && !suffixChars)) {
    bestIdx = candidateIndices[0];
  } else {
    for (const idx of candidateIndices) {
      let score = 0;
      if (prefixChars) {
        const beforeText = normFullStr.slice(Math.max(0, idx - prefixChars.length - 20), idx);
        if (beforeText.endsWith(prefixChars) || beforeText.includes(prefixChars)) {
          score += 10;
        }
      }
      if (suffixChars) {
        const afterText = normFullStr.slice(idx + normQueryStr.length, idx + normQueryStr.length + suffixChars.length + 20);
        if (afterText.startsWith(suffixChars) || afterText.includes(suffixChars)) {
          score += 10;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }
  }

  const rawStart = fullChars[bestIdx].rawIndex;
  const rawEnd = fullChars[bestIdx + normQueryStr.length - 1].rawIndex + 1;

  return { start: rawStart, end: rawEnd };
}

/**
 * Wraps or tags the slice [startOffset, endOffset] with highlight span.
 */
export function applyPdfHighlights(
  container: HTMLElement,
  annotations: PdfAnnotationItem[],
  onSelectHighlight?: (assetId: string, text: string) => void,
): void {
  for (const ann of annotations) {
    if (!ann.text?.trim()) continue;

    // We re-collect text nodes for each annotation in case a previous annotation split a text node
    const { entries, fullText } = collectTextNodes(container);
    const match = findMatchRange(fullText, ann.text, ann.contextPrefix, ann.contextSuffix);
    if (!match) continue;

    const { start: matchStart, end: matchEnd } = match;

    // Find all entries overlapping [matchStart, matchEnd]
    for (const entry of entries) {
      if (entry.endOffset <= matchStart || entry.startOffset >= matchEnd) {
        continue;
      }

      const localStart = Math.max(0, matchStart - entry.startOffset);
      const localEnd = Math.min(entry.text.length, matchEnd - entry.startOffset);

      const node = entry.node;
      const parent = node.parentNode;
      if (!parent) continue;

      // Extract parts
      const beforeText = entry.text.slice(0, localStart);
      const matchedText = entry.text.slice(localStart, localEnd);
      const afterText = entry.text.slice(localEnd);

      if (entry.parentSpan === null && !matchedText.trim()) {
        continue;
      }

      const highlightSpan = document.createElement("span");
      highlightSpan.className = "reader-highlight";
      highlightSpan.dataset.color = ann.color;
      highlightSpan.dataset.assetId = ann.id;
      highlightSpan.textContent = matchedText;

      if (onSelectHighlight) {
        highlightSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectHighlight(ann.id, ann.text);
        });
      }

      const fragment = document.createDocumentFragment();
      if (beforeText) fragment.appendChild(document.createTextNode(beforeText));
      fragment.appendChild(highlightSpan);
      if (afterText) fragment.appendChild(document.createTextNode(afterText));

      parent.replaceChild(fragment, node);
    }
  }
}

/**
 * Recolors existing highlights matching assetId.
 */
export function recolorPdfHighlight(container: HTMLElement, assetId: string, newColor: HighlightColor): void {
  const spans = container.querySelectorAll<HTMLElement>(`[data-asset-id="${assetId}"]`);
  for (const span of spans) {
    span.dataset.color = newColor;
  }
}

/**
 * Clears/unwraps highlights matching assetId.
 */
export function clearPdfHighlights(container: HTMLElement, assetId: string): void {
  const spans = Array.from(container.querySelectorAll<HTMLElement>(`[data-asset-id="${assetId}"]`));
  for (const span of spans) {
    const parent = span.parentNode;
    if (parent) {
      const textNode = document.createTextNode(span.textContent || "");
      parent.replaceChild(textNode, span);
      parent.normalize();
    }
  }
}
