import { describe, expect, it } from 'vitest';
import type { NavItem } from '@likecoin/epub-ts';
import {
  clampEpubProgress,
  cleanSearchExcerpt,
  findActiveTocEntry,
  findChapterLabel,
  flattenToc,
  isValidEpubCfi,
  normalizeEpubHref,
  removeTranslationGuards,
  sanitizeLanguageTag,
  splitEpubHref,
  toSearchMatch,
} from './epub.utils';

const VALID_CFI = 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)';

const toc: NavItem[] = [
  {
    id: 'chapter-1',
    href: 'Text/chapter-1.xhtml',
    label: 'Chapter One',
    subitems: [
      { id: 'section-1-1', href: 'Text/chapter-1.xhtml#part-a', label: '<span>Part A</span>' },
    ],
  },
  {
    id: 'chapter-2',
    href: 'Text/chapter-2.xhtml',
    label: 'Chapter Two &amp; More',
  },
];

describe('EPUB utils', () => {
  it('accepts well-formed CFIs and rejects malformed or missing values', () => {
    expect(isValidEpubCfi(VALID_CFI)).toBe(true);
    expect(isValidEpubCfi('not-a-cfi')).toBe(false);
    expect(isValidEpubCfi('epubcfi()')).toBe(false);
    expect(isValidEpubCfi('')).toBe(false);
    expect(isValidEpubCfi(null)).toBe(false);
    expect(isValidEpubCfi(undefined)).toBe(false);
  });

  it('normalises relative, encoded and fragment hrefs', () => {
    expect(normalizeEpubHref('Text/chapter-1.xhtml#part-a')).toBe('Text/chapter-1.xhtml');
    expect(normalizeEpubHref('./Text/chap%20one.xhtml')).toBe('Text/chap one.xhtml');
    expect(normalizeEpubHref('/Text/chapter-2.xhtml')).toBe('Text/chapter-2.xhtml');
    expect(normalizeEpubHref('')).toBe('');
  });

  it('flattens nested navigation while keeping depth and clean labels', () => {
    const flat = flattenToc(toc);
    expect(flat).toHaveLength(3);
    expect(flat[0]).toMatchObject({ label: 'Chapter One', depth: 0 });
    expect(flat[1]).toMatchObject({ label: 'Part A', depth: 1 });
    expect(flat[2]).toMatchObject({ label: 'Chapter Two & More', depth: 0 });
  });

  it('resolves chapter labels from CFI hrefs, including fragments', () => {
    const flat = flattenToc(toc);
    expect(findChapterLabel(flat, 'Text/chapter-2.xhtml#anywhere')).toBe('Chapter Two & More');
    expect(findChapterLabel(flat, 'Text/chapter-1.xhtml#part-a')).toBe('Part A');
    expect(findChapterLabel(flat, 'Text/unknown.xhtml')).toBeUndefined();
  });

  it('highlights only the most specific table-of-contents entry', () => {
    const flat = flattenToc(toc);
    expect(findActiveTocEntry(flat, 'Text/chapter-1.xhtml#part-a')?.label).toBe('Part A');
    expect(findActiveTocEntry(flat, 'Text/chapter-1.xhtml')?.label).toBe('Chapter One');
    expect(findActiveTocEntry(flat, 'Text/chapter-2.xhtml#missing-anchor')?.label).toBe(
      'Chapter Two & More',
    );
    expect(findActiveTocEntry(flat, 'Text/unknown.xhtml')).toBeUndefined();
  });

  it('cleans and limits search excerpts', () => {
    expect(cleanSearchExcerpt('  many\n\n spaces\t and line breaks  ')).toBe(
      'many spaces and line breaks',
    );
    expect(cleanSearchExcerpt('x'.repeat(400)).length).toBe(220);
  });

  it('deduplicates search matches and drops matches without a CFI', () => {
    const seen = new Set<string>();
    const first = toSearchMatch({ cfi: VALID_CFI, excerpt: 'Hello world' }, 'Chapter', seen);
    const duplicate = toSearchMatch({ cfi: VALID_CFI, excerpt: 'Hello again' }, 'Chapter', seen);
    const missing = toSearchMatch({ cfi: '', excerpt: 'Nope' }, 'Chapter', seen);

    expect(first).toEqual({ cfi: VALID_CFI, excerpt: 'Hello world', chapter: 'Chapter' });
    expect(duplicate).toBeNull();
    expect(missing).toBeNull();
  });

  it('clamps EPUB progress percentages', () => {
    expect(clampEpubProgress(undefined)).toBe(0);
    expect(clampEpubProgress(42.4)).toBe(42);
    expect(clampEpubProgress(-1)).toBe(0);
    expect(clampEpubProgress(1000)).toBe(100);
  });

  it('accepts safe language tags and splits hrefs with fragments', () => {
    expect(sanitizeLanguageTag('fr')).toBe('fr');
    expect(sanitizeLanguageTag('pt-BR')).toBe('pt-BR');
    expect(sanitizeLanguageTag('')).toBeUndefined();
    expect(sanitizeLanguageTag('<script>')).toBeUndefined();
    expect(splitEpubHref('Text/chapter.xhtml#part%20a')).toEqual({
      path: 'Text/chapter.xhtml',
      fragment: 'part a',
    });
    expect(splitEpubHref('Text/chapter.xhtml')).toEqual({
      path: 'Text/chapter.xhtml',
      fragment: '',
    });
  });

  it('strips translation blockers from book markup', () => {
    const element = document.createElement('p');
    element.setAttribute('translate', 'no');
    element.classList.add('notranslate', 'chapter');
    element.setAttribute('data-notranslate', '');
    removeTranslationGuards(element);
    expect(element.hasAttribute('translate')).toBe(false);
    expect(element.hasAttribute('data-notranslate')).toBe(false);
    expect(element.classList.contains('notranslate')).toBe(false);
    expect(element.classList.contains('chapter')).toBe(true);
  });
});
