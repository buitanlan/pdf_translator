import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { IconComponent } from '../shared/icon.component';

/** App-wide light/dark control. The preference is persisted by ThemeService. */
@Component({
  selector: 'app-theme-toggle',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="themeService.toggle()"
    >
      <app-icon [name]="themeService.isDark() ? 'sun' : 'moon'" />
    </button>
  `,
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);
  readonly compact = input(false);
  protected readonly label = computed(() =>
    this.themeService.isDark() ? 'Switch to light theme' : 'Switch to dark theme',
  );

  protected readonly buttonClass = computed(
    () =>
      `inline-flex shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white ${
        this.compact() ? 'h-9 w-9' : 'h-10 w-10'
      }`,
  );
}
