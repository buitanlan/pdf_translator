/**
 * Small, framework-free helpers shared by both readers and the library.
 * Keeping these pure makes them easy to cover with focused regression tests.
 */

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

/** Clamp a percentage that may come from IndexedDB, a URL or a third-party library. */
export function clampPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(clamp(value, 0, 100));
}

/** Book progress is stored as a fraction between 0 and 1. */
export function progressFractionToPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return clampPercent(value * 100);
}

export function formatPercent(value: number | null | undefined): string {
  return `${clampPercent(value)}%`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
}

/** PDF positions are page-based while EPUB positions are percentages. */
export function formatPdfPosition(page: number | null | undefined): string {
  return page && page > 0 ? `Page ${page}` : 'Not started';
}

export function formatEpubPosition(progress: number | null | undefined): string {
  if (progress === null || progress === undefined || !Number.isFinite(progress)) {
    return 'Not started';
  }
  return `${progressFractionToPercent(progress)}% read`;
}

/**
 * True when a keystroke originates from a text-entry control. Reader shortcuts
 * must never steal keys while the user is typing.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const element = target as HTMLElement;
  if (typeof element.closest !== 'function') {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }

  return (
    element.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]',
    ) !== null
  );
}

/** True when the shortcut should be ignored because a modifier is pressed. */
export function hasShortcutModifier(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>): boolean {
  return event.altKey || event.ctrlKey || event.metaKey;
}

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function truncate(value: string, maximum: number): string {
  if (maximum <= 0) {
    return '';
  }
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}
