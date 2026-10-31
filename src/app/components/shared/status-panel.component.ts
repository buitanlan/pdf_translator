import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, type IconName } from './icon.component';

export type StatusVariant = 'loading' | 'error' | 'empty' | 'info';

/** Shared empty / loading / error presentation used by the library and readers. */
@Component({
  selector: 'app-status-panel',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-full flex-col items-center justify-center px-6 py-10 text-center">
      @if (variant() === 'loading') {
        <span
          class="mb-4 h-9 w-9 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 dark:border-blue-950 dark:border-t-blue-400"
          aria-hidden="true"
        ></span>
      } @else {
        <span
          [class]="iconContainerClass()"
          aria-hidden="true"
        >
          <app-icon [name]="icon()" size="lg" />
        </span>
      }

      <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ title() }}</h2>
      @if (message()) {
        <p class="mt-1.5 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
          {{ message() }}
        </p>
      }

      <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
  host: { class: 'block w-full' },
})
export class StatusPanelComponent {
  readonly variant = input<StatusVariant>('info');
  readonly title = input.required<string>();
  readonly message = input<string | undefined>(undefined);
  readonly icon = input<IconName>('info');

  protected readonly iconContainerClass = computed(() => {
    const base = 'mb-4 flex h-12 w-12 items-center justify-center rounded-full';
    return this.variant() === 'error'
      ? `${base} bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400`
      : `${base} bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300`;
  });
}
