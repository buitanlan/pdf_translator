import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

export type DocumentFormat = 'PDF' | 'EPUB';

/**
 * Shared reading-header for both formats: library navigation, document title,
 * format badge and room for the theme control and secondary actions.
 */
@Component({
  selector: 'app-reader-header',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="relative z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-white/95 px-1.5 backdrop-blur sm:gap-2 sm:px-4 dark:border-gray-800 dark:bg-gray-900/95"
    >
      <button
        type="button"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
        [attr.aria-label]="backLabel()"
        [attr.title]="backLabel()"
        (click)="back.emit()"
      >
        <app-icon name="arrow-left" />
      </button>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <h1
            class="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
            [attr.title]="title()"
          >
            {{ title() }}
          </h1>
          @if (format(); as format) {
            <span [class]="badgeClass()">{{ format }}</span>
          }
        </div>
        @if (subtitle()) {
          <p class="truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400">
            {{ subtitle() }}
          </p>
        }
      </div>

      <div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }

    .format-badge {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      border-radius: 9999px;
      border-width: 1px;
      padding: 0 0.4rem;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1.35rem;
    }
  `,
})
export class ReaderHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
  readonly format = input<DocumentFormat | undefined>(undefined);
  readonly backLabel = input('Back to library');
  readonly back = output<void>();

  protected readonly badgeClass = computed(() =>
    this.format() === 'EPUB'
      ? 'format-badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300'
      : 'format-badge border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/70 dark:text-red-300',
  );
}