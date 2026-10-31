import { EpubCFI, type NavItem, type SearchResult } from '@likecoin/epub-ts';
import { clampPercent, normalizeWhitespace, truncate } from './reader.utils';

export interface FlatTocEntry {
  id: string;
  label: string;
  href: string;
  depth: number;
}

export interface EpubSearchMatch {
  cfi: string;
  excerpt: string;
  chapter: string;
}

const CFI_PREFIX = /^epubcfi\(/i;

/**
 * A saved CFI is only useful if the parser understands it. Malformed values
 * from older builds (or hand-edited IndexedDB records) must not be handed to
 * `rendition.display()`.
 */
export function isValidEpubCfi(cfi: string | null | undefined): cfi is string {
  const candidate = cfi?.trim();
  if (!candidate || !CFI_PREFIX.test(candidate)) {
    return false;
  }

  try {
    const parsed = new EpubCFI(candidate);
    return parsed.spinePos >= 0 && Boolean(parsed.path);
  } catch {
    return false;
  }
}

/** EPUB hrefs are relative, URL-encoded and may carry a fragment. */
export function normalizeEpubHref(href: string | null | undefined): string {
  const value = (href ?? '').trim();
  if (!value) {
    return '';
  }

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  return decoded.replace(/^\.?\//, '').split('#')[0] ?? '';
}

/** Strip markup from navigation labels (EPUB 3 allows HTML inside `<a>`). */
export function cleanTocLabel(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) {
    return '';
  }

  if (typeof DOMParser === 'undefined' || !needsHtmlDecoding(raw)) {
    return truncate(normalizeWhitespace(raw), 240);
  }

  try {
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    return truncate(normalizeWhitespace(parsed.body.textContent), 240);
  } catch {
    return truncate(normalizeWhitespace(raw.replace(/<[^>]*>/g, ' ')), 240);
  }
}

function needsHtmlDecoding(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value) || /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value);
}

/** Flatten the nested EPUB navigation tree while keeping the nesting depth. */
export function flattenToc(items: readonly NavItem[], depth = 0): FlatTocEntry[] {
  const entries: FlatTocEntry[] = [];
  if (depth > 6) {
    return entries;
  }

  for (const item of items) {
    if (!item || typeof item.href !== 'string') {
      continue;
    }

    const label = cleanTocLabel(item.label) || 'Untitled section';
    entries.push({
      id: item.id || `${item.href}-${entries.length}`,
      href: item.href,
      label,
      depth,
    });

    if (item.subitems?.length) {
      entries.push(...flattenToc(item.subitems, depth + 1));
    }
  }

  return entries;
}

/** Resolve the chapter label used in the toolbar and the saved progress. */
export function findChapterLabel(
  entries: readonly FlatTocEntry[],
  href: string | null | undefined,
): string | undefined {
  const target = normalizeHrefKeepingFragment(href);
  if (!target) {
    return undefined;
  }

  // Prefer the most specific TOC entry (fragment included).
  const exact = entries.find((entry) => normalizeHrefKeepingFragment(entry.href) === target);
  if (exact?.label) {
    return exact.label;
  }

  // Fall back to the deepest entry sharing the same document.
  const base = normalizeEpubHref(href);
  const related = entries.filter((entry) => normalizeEpubHref(entry.href) === base && entry.label);
  return related.at(-1)?.label;
}

/** Resolve the single TOC entry that represents the current reading position. */
export function findActiveTocEntry(
  entries: readonly FlatTocEntry[],
  href: string | null | undefined,
): FlatTocEntry | undefined {
  const target = normalizeHrefKeepingFragment(href);
  if (!target) {
    return undefined;
  }

  const exact = entries.find((entry) => normalizeHrefKeepingFragment(entry.href) === target);
  if (exact) {
    return exact;
  }

  const base = normalizeEpubHref(href);
  return entries.find((entry) => normalizeEpubHref(entry.href) === base);
}

function normalizeHrefKeepingFragment(href: string | null | undefined): string {
  const value = (href ?? '').trim();
  if (!value) {
    return '';
  }

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  return decoded.replace(/^\.?\//, '');
}

/** Results from `Section.find()` can contain the whole node text; keep them tidy. */
export function cleanSearchExcerpt(excerpt: string | null | undefined): string {
  return truncate(normalizeWhitespace(excerpt), 220);
}

/**
 * Convert a raw `Section.find()` result into the shape used by the sidebar.
 * CFIs that the library cannot produce are dropped rather than saved.
 */
export function toSearchMatch(
  result: SearchResult,
  chapter: string,
  seen: Set<string>,
): EpubSearchMatch | null {
  const cfi = result?.cfi?.trim();
  if (!cfi || seen.has(cfi)) {
    return null;
  }

  seen.add(cfi);
  return {
    cfi,
    excerpt: cleanSearchExcerpt(result.excerpt),
    chapter,
  };
}

export function clampEpubProgress(percentage: number | null | undefined): number {
  return clampPercent(percentage);
}
