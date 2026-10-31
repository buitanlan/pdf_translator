import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Accessible overflow menu for secondary actions. Closes on outside pointer
 * down, Escape or action selection, and restores focus to its trigger.
 */
@Component({
  selector: 'app-overflow-menu',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        #trigger
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
        [attr.aria-label]="label()"
        [attr.title]="label()"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <app-icon name="more" />
      </button>

      @if (open()) {
        <div
          #menu
          role="menu"
          [attr.aria-label]="label()"
          class="absolute right-0 top-full z-50 mt-1 max-h-[min(24rem,70vh)] min-w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          (keydown)="onMenuKeydown($event)"
          (click)="onMenuClick($event)"
        >
          <ng-content />
        </div>
      }
    </div>
  `,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class OverflowMenuComponent {
  readonly label = input('More actions');
  readonly open = signal(false);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      queueMicrotask(() => this.menuItems()[0]?.focus());
    });
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(restoreFocus = true): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (restoreFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
      queueMicrotask(() => this.menuItems()[0]?.focus());
    } else if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems();
    if (items.length === 0) {
      return;
    }

    const index = items.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        items[(index + 1) % items.length].focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0].focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1].focus();
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  protected onMenuClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[role="menuitem"], a[href], button')) {
      this.close();
    }
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) {
      return;
    }

    const target = event.target as Node | null;
    if (target && !this.menu()?.nativeElement.contains(target) && !this.trigger().nativeElement.contains(target)) {
      this.close(false);
    }
  }

  private menuItems(): HTMLElement[] {
    const menu = this.menu()?.nativeElement;
    if (!menu) {
      return [];
    }
    return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
  }
}
