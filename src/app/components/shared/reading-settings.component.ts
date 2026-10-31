import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  model,
  viewChild,
} from '@angular/core';
import { ReaderPreferencesService, type ReadingTheme } from '../../services/reader-preferences.service';
import { IconComponent } from './icon.component';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const THEMES: ReadonlyArray<{ id: ReadingTheme; label: string; swatch: string }> = [
  { id: 'light', label: 'Light', swatch: 'bg-white border-gray-300' },
  { id: 'sepia', label: 'Sepia', swatch: 'bg-[#f4ecd8] border-[#d9c9a3]' },
  { id: 'dark', label: 'Dark', swatch: 'bg-gray-900 border-gray-700' },
];

/** Modal reading-settings panel for the EPUB reader. */
@Component({
  selector: 'app-reading-settings',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div class="absolute inset-0 bg-gray-950/50" (click)="close()" aria-hidden="true"></div>

        <div
          #panel
          role="dialog"
          aria-modal="true"
          aria-labelledby="reading-settings-title"
          class="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900"
          (keydown)="onKeydown($event)"
        >
          <div
            class="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800"
          >
            <h2
              id="reading-settings-title"
              class="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Reading settings
            </h2>
            <button
              #closeButton
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              aria-label="Close reading settings"
              (click)="close()"
            >
              <app-icon name="x" size="sm" />
            </button>
          </div>

          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <section aria-labelledby="setting-layout">
              <h3
                id="setting-layout"
                class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Layout
              </h3>
              <div class="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                <button
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  [class]="segmentedClass(preferences.flow() === 'paginated')"
                  [attr.aria-pressed]="preferences.flow() === 'paginated'"
                  (click)="preferences.setFlow('paginated')"
                >
                  Pages
                </button>
                <button
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  [class]="segmentedClass(preferences.flow() === 'scrolled')"
                  [attr.aria-pressed]="preferences.flow() === 'scrolled'"
                  (click)="preferences.setFlow('scrolled')"
                >
                  Continuous scroll
                </button>
              </div>
            </section>

            <section aria-labelledby="setting-text-size">
              <h3
                id="setting-text-size"
                class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Text size
              </h3>
              <div
                class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-2 py-1.5 dark:border-gray-700"
              >
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Decrease text size"
                  [disabled]="preferences.fontSize() <= 70"
                  (click)="preferences.decreaseFontSize()"
                >
                  <app-icon name="minus" size="sm" />
                </button>
                <span
                  class="text-xs font-medium tabular-nums text-gray-700 dark:text-gray-200"
                  aria-live="polite"
                  >{{ preferences.fontSize() }}%</span
                >
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Increase text size"
                  [disabled]="preferences.fontSize() >= 180"
                  (click)="preferences.increaseFontSize()"
                >
                  <app-icon name="plus" size="sm" />
                </button>
              </div>
            </section>

            <section aria-labelledby="setting-line-height">
              <h3
                id="setting-line-height"
                class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Line spacing
              </h3>
              <div class="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                @for (option of lineHeightOptions; track option.value) {
                  <button
                    type="button"
                    class="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                    [class]="segmentedClass(preferences.lineHeight() === option.value)"
                    [attr.aria-pressed]="preferences.lineHeight() === option.value"
                    (click)="preferences.setLineHeight(option.value)"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            </section>

            <section aria-labelledby="setting-typeface">
              <h3
                id="setting-typeface"
                class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Typeface
              </h3>
              <div class="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                <button
                  type="button"
                  class="rounded-md px-2 py-1.5 font-serif text-xs font-medium transition-colors"
                  [class]="segmentedClass(preferences.fontFamily() === 'serif')"
                  [attr.aria-pressed]="preferences.fontFamily() === 'serif'"
                  (click)="preferences.setFontFamily('serif')"
                >
                  Serif
                </button>
                <button
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  [class]="segmentedClass(preferences.fontFamily() === 'sans')"
                  [attr.aria-pressed]="preferences.fontFamily() === 'sans'"
                  (click)="preferences.setFontFamily('sans')"
                >
                  Sans serif
                </button>
              </div>
            </section>

            <section aria-labelledby="setting-theme">
              <h3
                id="setting-theme"
                class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Page theme
              </h3>
              <div class="grid grid-cols-3 gap-2">
                @for (theme of themes; track theme.id) {
                  <button
                    type="button"
                    class="flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors"
                    [class]="themeClass(preferences.readingTheme() === theme.id)"
                    [attr.aria-pressed]="preferences.readingTheme() === theme.id"
                    (click)="preferences.setReadingTheme(theme.id)"
                  >
                    <span
                      class="h-6 w-full rounded border"
                      [class]="theme.swatch"
                      aria-hidden="true"
                    ></span>
                    {{ theme.label }}
                  </button>
                }
              </div>
            </section>

            <section aria-labelledby="setting-zoom">
              <h3
                id="setting-zoom"
                class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Text zoom
              </h3>              <div
                class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-2 py-1.5 dark:border-gray-700"
              >
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Zoom out"
                  [disabled]="preferences.zoom() <= 80"
                  (click)="preferences.decreaseZoom()"
                >
                  <app-icon name="minus" size="sm" />
                </button>
                <span
                  class="text-xs font-medium tabular-nums text-gray-700 dark:text-gray-200"
                  aria-live="polite"
                  >{{ preferences.zoom() }}%</span
                >
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Zoom in"
                  [disabled]="preferences.zoom() >= 140"
                  (click)="preferences.increaseZoom()"
                >
                  <app-icon name="plus" size="sm" />
                </button>
              </div>
            </section>
          </div>

          <div
            class="flex shrink-0 items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800"
          >
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              (click)="preferences.resetAll()"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              (click)="close()"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ReadingSettingsComponent {
  readonly open = model(false);
  readonly preferences = inject(ReaderPreferencesService);
  protected readonly themes = THEMES;
  protected readonly lineHeightOptions = [
    { value: 1.5, label: 'Compact' },
    { value: 1.75, label: 'Normal' },
    { value: 2, label: 'Relaxed' },
  ] as const;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private previousFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        queueMicrotask(() => this.closeButton()?.nativeElement.focus());
        return;
      }

      const target = this.previousFocus;
      this.previousFocus = null;
      if (target) {
        queueMicrotask(() => target.focus());
      }
    });
  }

  close(): void {
    this.open.set(false);
  }

  protected segmentedClass(selected: boolean): string {
    return selected
      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white';
  }

  protected themeClass(selected: boolean): string {
    return selected
      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
      : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600';
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null,
    );
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
