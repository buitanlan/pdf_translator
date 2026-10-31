import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Toolbar control with an icon and an optional text label. Text labels are
 * hidden on narrow screens via the `hideTextOnMobile` input while the accessible name
 * is always provided by `aria-label`.
 */
@Component({
  selector: 'app-toolbar-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.title]="tooltip() ?? label()"
      [attr.aria-pressed]="active() ? 'true' : null"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="controls()"
      (click)="pressed.emit()"
    >
      <ng-content />
      @if (text()) {
        <span [class]="labelClass()">{{ text() }}</span>
      }
    </button>
  `,
})
export class ToolbarButtonComponent {
  readonly label = input.required<string>();
  readonly text = input<string | undefined>(undefined);
  readonly tooltip = input<string | undefined>(undefined);
  readonly active = input(false);
  readonly disabled = input(false);
  readonly expanded = input<boolean | null>(null);
  readonly controls = input<string | undefined>(undefined);
  /** Hides the text label below the `sm` breakpoint. */
  readonly hideTextOnMobile = input(true);
  readonly pressed = output<void>();

  protected readonly buttonClass = computed(() => {
    const base =
      'inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40';
    return this.active()
      ? `${base} bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/70`
      : `${base} text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white`;
  });

  protected readonly labelClass = computed(() =>
    this.hideTextOnMobile() ? 'hidden text-xs sm:inline' : 'text-xs',
  );
}
