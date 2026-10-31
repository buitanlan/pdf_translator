import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampPercent,
  formatEpubPosition,
  formatFileSize,
  formatPdfPosition,
  formatPercent,
  hasShortcutModifier,
  isTypingTarget,
  progressFractionToPercent,
  truncate,
} from './reader.utils';

describe('reader utils', () => {
  it('clamps and rounds percentages from storage or libraries', () => {
    expect(clampPercent(undefined)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(-12)).toBe(0);
    expect(clampPercent(42.6)).toBe(43);
    expect(clampPercent(180)).toBe(100);
  });

  it('converts stored EPUB fractions to percentages', () => {
    expect(progressFractionToPercent(undefined)).toBe(0);
    expect(progressFractionToPercent(0.426)).toBe(43);
    expect(progressFractionToPercent(1)).toBe(100);
    expect(progressFractionToPercent(1.4)).toBe(100);
  });

  it('formats human readable file sizes', () => {
    expect(formatFileSize(0)).toBe('0 KB');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(15 * 1024 * 1024)).toBe('15 MB');
  });

  it('keeps PDF page progress distinct from EPUB percentage progress', () => {
    expect(formatPdfPosition(undefined)).toBe('Not started');
    expect(formatPdfPosition(12)).toBe('Page 12');
    expect(formatEpubPosition(undefined)).toBe('Not started');
    expect(formatEpubPosition(0)).toBe('0% read');
    expect(formatEpubPosition(0.426)).toBe('43% read');
    expect(formatPercent(42.4)).toBe('42%');
  });

  it('recognises text-entry targets so shortcuts never steal typing', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const plain = document.createElement('div');

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(plain)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);

    const child = document.createElement('span');
    input.appendChild(child);
    expect(isTypingTarget(child)).toBe(true);
  });

  it('detects shortcut modifiers and truncates long labels', () => {
    expect(hasShortcutModifier({ altKey: true, ctrlKey: false, metaKey: false })).toBe(true);
    expect(hasShortcutModifier({ altKey: false, ctrlKey: true, metaKey: false })).toBe(true);
    expect(hasShortcutModifier({ altKey: false, ctrlKey: false, metaKey: false })).toBe(false);
    expect(truncate('A very long document title', 10)).toBe('A very lo…');
    expect(truncate('short', 10)).toBe('short');
    expect(clamp(120, 70, 180)).toBe(120);
    expect(clamp(10, 70, 180)).toBe(70);
  });
});
