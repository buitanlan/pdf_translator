import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconName =
  | 'arrow-left'
  | 'book'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'columns'
  | 'download'
  | 'expand'
  | 'contract'
  | 'file-text'
  | 'grid'
  | 'info'
  | 'library'
  | 'loader'
  | 'menu'
  | 'minus'
  | 'moon'
  | 'more'
  | 'plus'
  | 'scroll'
  | 'search'
  | 'settings'
  | 'sun'
  | 'trash'
  | 'type'
  | 'upload'
  | 'x'
  | 'alert';

/**
 * One icon set for the whole app so stroke weight, sizing and alignment stay
 * consistent between the library and both readers.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [class]="sizeClass()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('arrow-left') {
          <path d="M15 19l-7-7 7-7" />
        }
        @case ('chevron-left') {
          <path d="M14 6l-6 6 6 6" />
        }
        @case ('chevron-right') {
          <path d="M10 6l6 6-6 6" />
        }
        @case ('chevron-down') {
          <path d="M6 10l6 6 6-6" />
        }
        @case ('book') {
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        }
        @case ('library') {
          <path d="M4 3h4v18H4zM10 3h4v18h-4z" />
          <path d="M16.5 4.2l3.5 17.1-3.9.8L12.6 5z" />
        }
        @case ('menu') {
          <path d="M4 6h16M4 12h16M4 18h16" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.2-4.2" />
        }
        @case ('scroll') {
          <path d="M8 4h11a2 2 0 012 2v12a2 2 0 01-2 2H8" />
          <path d="M5 8v8M2 10l3-3 3 3M2 14l3 3 3-3" />
        }
        @case ('columns') {
          <rect x="3" y="4" width="8" height="16" rx="1" />
          <rect x="13" y="4" width="8" height="16" rx="1" />
        }
        @case ('x') {
          <path d="M6 6l12 12M18 6L6 18" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('minus') {
          <path d="M5 12h14" />
        }
        @case ('type') {
          <path d="M5 7V5h14v2M12 5v14M9 19h6" />
        }
        @case ('settings') {
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        }
        @case ('moon') {
          <path d="M20.5 14.5A8.5 8.5 0 019.5 3.5 8.5 8.5 0 1020.5 14.5z" />
        }
        @case ('upload') {
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        }
        @case ('download') {
          <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
        }
        @case ('trash') {
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5" />
        }
        @case ('expand') {
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        }
        @case ('contract') {
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        }
        @case ('more') {
          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
        }
        @case ('grid') {
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        }
        @case ('file-text') {
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h5" />
        }
        @case ('info') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        }
        @case ('alert') {
          <path d="M12 3l9 17H3z" />
          <path d="M12 9v5M12 17h.01" />
        }
        @case ('loader') {
          <path d="M12 3a9 9 0 109 9" />
        }
      }
    </svg>
  `,
  host: { class: 'inline-flex shrink-0 items-center justify-center' },
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');

  protected readonly sizeClass = computed(() => {
    switch (this.size()) {
      case 'xs':
        return 'h-3.5 w-3.5';
      case 'sm':
        return 'h-4 w-4';
      case 'lg':
        return 'h-5 w-5';
      default:
        return 'h-[18px] w-[18px]';
    }
  });
}
