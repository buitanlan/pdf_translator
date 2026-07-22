import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  readonly preference = signal<ThemePreference>(this.loadPreference());
  readonly isDark = computed(() => {
    const pref = this.preference();
    if (pref === 'dark') return true;
    if (pref === 'light') return false;
    return this.mediaQuery.matches;
  });

  constructor() {
    this.applyTheme(this.isDark());

    const onSystemChange = (): void => {
      if (this.preference() === 'system') {
        this.applyTheme(this.mediaQuery.matches);
      }
    };

    this.mediaQuery.addEventListener('change', onSystemChange);
    this.destroyRef.onDestroy(() => {
      this.mediaQuery.removeEventListener('change', onSystemChange);
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    if (preference === 'system') {
      localStorage.removeItem(STORAGE_KEY);
      this.applyTheme(this.mediaQuery.matches);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
      this.applyTheme(preference === 'dark');
    }
  }

  toggle(): void {
    this.setPreference(this.isDark() ? 'light' : 'dark');
  }

  private loadPreference(): ThemePreference {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return 'system';
  }

  private applyTheme(isDark: boolean): void {
    document.documentElement.classList.toggle('dark', isDark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#111827' : '#2563eb');
  }
}
