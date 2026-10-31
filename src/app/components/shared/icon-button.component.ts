import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent, type IconName } from './icon.component';

/**
 * Compact icon-only control used in the reader header and toolbar.
 * A visible focus ring comes from the global `:focus-visible` rule.
 */
@Component({
  selector: 'app-icon-button',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.title]="tooltip() ?? label()"
      [attr.aria-pressed]="active() ? 'true' : null"
      (click)="pressed.emit()"
    >
      <app-icon [name]="icon()" [size]="size()" />
    </button>
  `,
})
export class IconButtonComponent {
  readonly icon = input.required<IconName>();
  readonly label = input.required<string>();
  readonly tooltip = input<string | undefined>(undefined);
  readonly active = input(false);
  readonly disabled = input(false);
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  readonly pressed = output<void>();

  protected readonly buttonClass = computed(() => {
    const base =
      'inline-flex h-9 min-w-9 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40';
    return this.active()
      ? `${base} bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/70`
      : `${base} text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white`;
  });
}
