import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  model,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Collapsible reader sidebar: an in-flow panel on desktop and a modal drawer on
 * small screens. The component owns focus restoration and a mobile focus trap so
 * both readers get identical, accessible drawer behaviour.
 */
@Component({
  selector: 'app-reader-sidebar',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-40 bg-gray-950/40 lg:hidden"
        aria-hidden="true"
        (click)="close()"
      ></div>
    }

    <aside
      #panel
      [id]="panelId()"
      class="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-gray-800 dark:bg-gray-900 lg:static lg:z-0 lg:h-full lg:w-72 lg:max-w-none lg:shrink-0 lg:shadow-none"
      [class.-translate-x-full]="!open()"
      [class.translate-x-0]="open()"
      [class.lg:hidden]="!open()"
      [attr.aria-hidden]="open() ? null : 'true'"
      [attr.inert]="open() ? null : ''"
      [attr.aria-label]="label()"
      (keydown)="onKeydown($event)"
    >
      <div
        class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 dark:border-gray-800"
      >
        <h2
          class="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400"
        >
          {{ heading() }}
        </h2>
        <button
          #closeButton
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          aria-label="Close sidebar"
          (click)="close()"
        >
          <app-icon name="x" size="sm" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ng-content />
      </div>
    </aside>
  `,
})
export class ReaderSidebarComponent {
  readonly open = model(false);
  readonly heading = input.required<string>();
  readonly label = input('Reader sidebar');
  readonly panelId = input('reader-sidebar');

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');
  private previousFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const isOpen = this.open();

      if (isOpen) {
        this.previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        queueMicrotask(() => {
          if (this.open()) {
            const preferred = this.panel().nativeElement.querySelector<HTMLElement>(
              '[data-autofocus]',
            );
            (preferred ?? this.closeButton().nativeElement).focus();
          }
        });
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

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key !== 'Tab' || !this.isDrawerMode()) {
      return;
    }

    const focusable = Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null);

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

  private isDrawerMode(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
  }
}
