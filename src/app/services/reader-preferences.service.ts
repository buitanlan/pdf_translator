import { computed, effect, Injectable, signal } from '@angular/core';
import { clamp } from '../utils/reader.utils';

export type ReadingTheme = 'light' | 'sepia' | 'dark';
export type ReadingFont = 'serif' | 'sans';

export interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  fontFamily: ReadingFont;
  readingTheme: ReadingTheme;
  zoom: number;
}

const STORAGE_KEY = 'readerPreferences.v1';

const DEFAULTS: ReaderPreferences = {
  fontSize: 100,
  lineHeight: 1.75,
  fontFamily: 'serif',
  readingTheme: 'light',
  zoom: 100,
};

const FONT_SIZES = { min: 70, max: 180, step: 10 };
const ZOOM_LEVELS = { min: 80, max: 140, step: 10 };
const LINE_HEIGHTS = [1.5, 1.75, 2] as const;

function isReadingTheme(value: unknown): value is ReadingTheme {
  return value === 'light' || value === 'sepia' || value === 'dark';
}

function isReadingFont(value: unknown): value is ReadingFont {
  return value === 'serif' || value === 'sans';
}

/**
 * Typography and reading-theme preferences for the EPUB reader. Values are
 * validated on load so a corrupt localStorage entry can never break the reader.
 */
@Injectable({ providedIn: 'root' })
export class ReaderPreferencesService {
  private readonly initial = this.read();

  readonly fontSize = signal(this.initial.fontSize);
  readonly lineHeight = signal(this.initial.lineHeight);
  readonly fontFamily = signal(this.initial.fontFamily);
  readonly readingTheme = signal(this.initial.readingTheme);
  readonly zoom = signal(this.initial.zoom);

  readonly fontScale = computed(() => this.fontSize() / 100);
  readonly zoomScale = computed(() => this.zoom() / 100);
  /** Inverse percentage keeps a scaled reader surface exactly filling its frame. */
  readonly inverseZoomPercent = computed(() => 10000 / this.zoom());

  constructor() {
    effect(() => {
      const preferences: ReaderPreferences = {
        fontSize: this.fontSize(),
        lineHeight: this.lineHeight(),
        fontFamily: this.fontFamily(),
        readingTheme: this.readingTheme(),
        zoom: this.zoom(),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      } catch (error) {
        console.error('Could not persist reader preferences:', error);
      }
    });
  }

  increaseFontSize(): void {
    this.fontSize.update((value) =>
      clamp(value + FONT_SIZES.step, FONT_SIZES.min, FONT_SIZES.max),
    );
  }

  decreaseFontSize(): void {
    this.fontSize.update((value) =>
      clamp(value - FONT_SIZES.step, FONT_SIZES.min, FONT_SIZES.max),
    );
  }

  setLineHeight(value: number): void {
    if (!LINE_HEIGHTS.includes(value as (typeof LINE_HEIGHTS)[number])) {
      return;
    }
    this.lineHeight.set(value);
  }

  increaseLineHeight(): void {
    const index = LINE_HEIGHTS.indexOf(this.lineHeight() as (typeof LINE_HEIGHTS)[number]);
    this.lineHeight.set(LINE_HEIGHTS[Math.min(LINE_HEIGHTS.length - 1, index + 1)]);
  }

  decreaseLineHeight(): void {
    const index = LINE_HEIGHTS.indexOf(this.lineHeight() as (typeof LINE_HEIGHTS)[number]);
    this.lineHeight.set(LINE_HEIGHTS[Math.max(0, index - 1)]);
  }

  setFontFamily(font: ReadingFont): void {
    this.fontFamily.set(font);
  }

  setReadingTheme(theme: ReadingTheme): void {
    this.readingTheme.set(theme);
  }

  increaseZoom(): void {
    this.zoom.update((value) => clamp(value + ZOOM_LEVELS.step, ZOOM_LEVELS.min, ZOOM_LEVELS.max));
  }

  decreaseZoom(): void {
    this.zoom.update((value) => clamp(value - ZOOM_LEVELS.step, ZOOM_LEVELS.min, ZOOM_LEVELS.max));
  }

  resetZoom(): void {
    this.zoom.set(DEFAULTS.zoom);
  }

  resetTypography(): void {
    this.fontSize.set(DEFAULTS.fontSize);
    this.lineHeight.set(DEFAULTS.lineHeight);
    this.fontFamily.set(DEFAULTS.fontFamily);
  }

  resetAll(): void {
    this.resetTypography();
    this.readingTheme.set(DEFAULTS.readingTheme);
    this.zoom.set(DEFAULTS.zoom);
  }

  private read(): ReaderPreferences {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULTS };
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return { ...DEFAULTS };
      }

      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed !== 'object' || parsed === null) {
        return { ...DEFAULTS };
      }

      const value = parsed as Partial<ReaderPreferences>;
      return {
        fontSize: Number.isFinite(value.fontSize)
          ? clamp(value.fontSize as number, FONT_SIZES.min, FONT_SIZES.max)
          : DEFAULTS.fontSize,
        lineHeight: LINE_HEIGHTS.includes(value.lineHeight as (typeof LINE_HEIGHTS)[number])
          ? (value.lineHeight as number)
          : DEFAULTS.lineHeight,
        fontFamily: isReadingFont(value.fontFamily) ? value.fontFamily : DEFAULTS.fontFamily,
        readingTheme: isReadingTheme(value.readingTheme)
          ? value.readingTheme
          : DEFAULTS.readingTheme,
        zoom: Number.isFinite(value.zoom)
          ? clamp(value.zoom as number, ZOOM_LEVELS.min, ZOOM_LEVELS.max)
          : DEFAULTS.zoom,
      };
    } catch (error) {
      console.warn('Ignoring invalid reader preferences:', error);
      return { ...DEFAULTS };
    }
  }
}
