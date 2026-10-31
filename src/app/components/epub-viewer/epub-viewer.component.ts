import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import ePub, {
  type Book,
  type Contents,
  type Location,
  type Rendition,
} from '@likecoin/epub-ts';
import { StoredDocument } from '../../models/document.interface';
import { DocumentService } from '../../services/document.service';
import {
  ReaderPreferencesService,
  type ReadingTheme,
} from '../../services/reader-preferences.service';
import {
  findActiveTocEntry,
  findChapterLabel,
  flattenToc,
  isValidEpubCfi,
  toSearchMatch,
  type EpubSearchMatch,
  type FlatTocEntry,
} from '../../utils/epub.utils';
import {
  clampPercent,
  formatFileSize,
  hasShortcutModifier,
  isTypingTarget,
  progressFractionToPercent,
} from '../../utils/reader.utils';
import { IconComponent } from '../shared/icon.component';
import { OverflowMenuComponent } from '../shared/overflow-menu.component';
import { ReaderHeaderComponent } from '../shared/reader-header.component';
import { ReaderSidebarComponent } from '../shared/reader-sidebar.component';
import { ReadingSettingsComponent } from '../shared/reading-settings.component';
import { StatusPanelComponent } from '../shared/status-panel.component';
import { ToolbarButtonComponent } from '../shared/toolbar-button.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

type SidebarTab = 'contents' | 'search';

interface PendingProgress {
  documentId: string;
  cfi: string;
  chapter: string;
  href: string;
  progress: number;
}

/**
 * EPUB reader built on @likecoin/epub-ts. Rendering, navigation and CFI
 * handling stay in this component; cross-cutting presentation is shared with
 * the PDF reader through the components in `shared/`.
 */
@Component({
  selector: 'app-epub-viewer',
  imports: [
    IconComponent,
    OverflowMenuComponent,
    ReaderHeaderComponent,
    ReaderSidebarComponent,
    ReadingSettingsComponent,
    StatusPanelComponent,
    ThemeToggleComponent,
    ToolbarButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onWindowKeydown($event)',
    '(window:beforeunload)': 'saveReadingState()',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
  template: `
    <div #readerRoot class="flex h-dvh flex-col overflow-hidden bg-[#eef0f3] dark:bg-[#0a0e15]">
      <app-reader-header
        [title]="documentName()"
        [subtitle]="subtitle()"
        format="EPUB"
        backLabel="Back to document library"
        (back)="goBack()"
      >
        <app-theme-toggle [compact]="true" />
        <app-overflow-menu class="md:hidden" label="More reading actions">
          <button type="button" role="menuitem" class="menu-item" (click)="openSettings()">
            <app-icon name="settings" size="sm" />
            Reading settings
          </button>
          <button type="button" role="menuitem" class="menu-item" (click)="toggleFullscreen()">
            <app-icon [name]="isFullscreen() ? 'contract' : 'expand'" size="sm" />
            {{ isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen' }}
          </button>
          <button type="button" role="menuitem" class="menu-item" (click)="downloadEpub()">
            <app-icon name="download" size="sm" />
            Download EPUB
          </button>
        </app-overflow-menu>
      </app-reader-header>

      <section
        class="shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
        aria-label="EPUB reading controls"
      >
        <div class="flex h-11 items-center gap-0.5 px-1 sm:gap-1 sm:px-3">
          <app-toolbar-button
            label="Table of contents"
            tooltip="Table of contents"
            [active]="sidebarOpen() && sidebarTab() === 'contents'"
            [expanded]="sidebarOpen() && sidebarTab() === 'contents'"
            controls="reader-sidebar"
            (pressed)="toggleContents()"
          >
            <app-icon name="menu" />
          </app-toolbar-button>

          <span class="mx-0.5 hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-700"></span>

          <app-toolbar-button
            label="Previous page"
            tooltip="Previous page (←)"
            [disabled]="previousDisabled()"
            (pressed)="previous()"
          >
            <app-icon name="chevron-left" />
          </app-toolbar-button>
          <app-toolbar-button
            label="Next page"
            tooltip="Next page (→)"
            [disabled]="nextDisabled()"
            (pressed)="next()"
          >
            <app-icon name="chevron-right" />
          </app-toolbar-button>

          <div
            class="mx-1 flex min-w-0 flex-1 flex-col items-center justify-center gap-0 leading-tight sm:flex-row sm:gap-3"
            aria-live="off"
          >
            <span
              class="w-full min-w-0 truncate text-center text-[11px] font-medium text-gray-700 sm:w-auto sm:text-left sm:text-xs dark:text-gray-200"
            >
              {{ currentChapter() || 'Reading' }}
            </span>
            <div class="flex items-center gap-1.5 sm:gap-2">
              <div
                class="hidden h-1 w-24 overflow-hidden rounded-full bg-gray-200 sm:block lg:w-32 dark:bg-gray-700"
                role="progressbar"
                aria-label="Book progress"
                [attr.aria-valuenow]="progressPercent()"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div
                  class="h-full rounded-full bg-blue-600 transition-[width] duration-300 dark:bg-blue-500"
                  [style.width.%]="progressPercent()"
                ></div>
              </div>
              <span class="text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">
                {{ progressPercent() }}%
              </span>
            </div>
          </div>

          <app-toolbar-button
            label="Search book"
            tooltip="Search this book (/)"
            [active]="sidebarOpen() && sidebarTab() === 'search'"
            [expanded]="sidebarOpen() && sidebarTab() === 'search'"
            controls="reader-sidebar"
            (pressed)="toggleSearch()"
          >
            <app-icon name="search" />
          </app-toolbar-button>
          <app-toolbar-button
            label="Reading settings"
            tooltip="Reading settings"
            [active]="settingsOpen()"
            (pressed)="toggleSettings()"
          >
            <app-icon name="settings" />
          </app-toolbar-button>

          <span class="mx-0.5 hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-700"></span>

          <app-toolbar-button
            class="hidden sm:inline-flex"
            label="Enter fullscreen"
            [tooltip]="isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen'"
            (pressed)="toggleFullscreen()"
          >
            <app-icon [name]="isFullscreen() ? 'contract' : 'expand'" />
          </app-toolbar-button>
          <app-toolbar-button
            class="hidden md:inline-flex"
            label="Download EPUB"
            tooltip="Download this EPUB"
            (pressed)="downloadEpub()"
          >
            <app-icon name="download" />
          </app-toolbar-button>
        </div>
      </section>

      <div class="flex min-h-0 flex-1 overflow-hidden">
        <app-reader-sidebar
          [(open)]="sidebarOpen"
          heading="Book navigation"
          label="Contents and search"
          panelId="reader-sidebar"
        >
          <div
            class="sticky top-0 z-10 flex border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
            role="tablist"
            aria-label="Book navigation"
            (keydown)="onTabKeydown($event)"
          >
            <button
              id="epub-tab-contents"
              type="button"
              role="tab"
              [class]="tabClass(sidebarTab() === 'contents')"
              [attr.aria-selected]="sidebarTab() === 'contents'"
              [attr.aria-controls]="'epub-panel-contents'"
              [attr.tabindex]="sidebarTab() === 'contents' ? 0 : -1"
              (click)="selectTab('contents')"
            >
              Contents
            </button>
            <button
              id="epub-tab-search"
              type="button"
              role="tab"
              [class]="tabClass(sidebarTab() === 'search')"
              [attr.aria-selected]="sidebarTab() === 'search'"
              [attr.aria-controls]="'epub-panel-search'"
              [attr.tabindex]="sidebarTab() === 'search' ? 0 : -1"
              (click)="selectTab('search')"
            >
              Search
            </button>
          </div>

          @if (sidebarTab() === 'contents') {
            <div
              id="epub-panel-contents"
              role="tabpanel"
              aria-labelledby="epub-tab-contents"
              class="p-2"
            >
              <nav aria-label="Book chapters">
                @for (entry of toc(); track entry.id + entry.href) {
                  <button
                    type="button"
                    [class]="tocEntryClass(entry)"
                    [style.padding-left.px]="10 + entry.depth * 12"
                    [attr.title]="entry.label"
                    (click)="goToTocEntry(entry)"
                  >
                    <span class="truncate">{{ entry.label }}</span>
                  </button>
                } @empty {
                  <p class="px-3 py-6 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    This book does not include a table of contents.
                  </p>
                }
              </nav>
            </div>
          } @else {
            <div id="epub-panel-search" role="tabpanel" aria-labelledby="epub-tab-search">
              <form class="border-b border-gray-200 p-3 dark:border-gray-800" (submit)="runSearch($event)">
                <label class="sr-only" for="epub-search-input">Search inside this book</label>
                <div class="relative">
                  <span
                    class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  >
                    <app-icon name="search" size="sm" />
                  </span>
                  <input
                    #searchInput
                    id="epub-search-input"
                    type="search"
                    class="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                    placeholder="Search this book"
                    autocomplete="off"
                    data-autofocus
                    [value]="searchQuery()"
                    (input)="onSearchInput($event)"
                  />
                  @if (searchQuery()) {
                    <button
                      type="button"
                      class="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      aria-label="Clear search"
                      (click)="clearSearch()"
                    >
                      <app-icon name="x" size="sm" />
                    </button>
                  }
                </div>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <span class="min-w-0 truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {{ searchStatus() }}
                  </span>
                  <button
                    type="submit"
                    class="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    [disabled]="searchLoading() || searchQuery().trim().length < 2"
                  >
                    {{ searchLoading() ? 'Searching…' : 'Search' }}
                  </button>
                </div>
              </form>

              <div class="p-2" aria-live="polite">
                @if (searchLoading()) {
                  <div
                    class="flex items-center justify-center gap-2 py-8 text-xs text-gray-500 dark:text-gray-400"
                    role="status"
                  >
                    <span
                      class="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 dark:border-blue-950 dark:border-t-blue-400"
                      aria-hidden="true"
                    ></span>
                    Searching every chapter…
                  </div>
                } @else if (searchPerformed() && searchResults().length === 0) {
                  <p class="px-3 py-6 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
                    No matches for “{{ searchQuery().trim() }}” in this book.
                  </p>
                } @else if (searchResults().length === 0) {
                  <p class="px-3 py-6 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Search runs across the whole book and keeps you on the current page until you
                    pick a result.
                  </p>
                } @else {
                  <ul class="space-y-0.5" aria-label="Search results">
                    @for (result of searchResults(); track result.cfi) {
                      <li>
                        <button
                          type="button"
                          [class]="searchResultClass()"
                          [attr.title]="result.chapter + ': ' + result.excerpt"
                          (click)="goToSearchResult(result)"
                        >
                          <span
                            class="block truncate text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300"
                          >
                            {{ result.chapter }}
                          </span>
                          <span class="mt-0.5 block text-xs leading-5 text-gray-600 dark:text-gray-300">
                            {{ result.excerpt }}
                          </span>
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          }
        </app-reader-sidebar>

        <main class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div class="flex h-full w-full items-stretch justify-center p-1.5 sm:p-4 lg:p-6">
            <div
              class="relative h-full w-full max-w-3xl overflow-hidden rounded-lg border shadow-sm sm:rounded-xl"
              [class]="surfaceClass()"
            >
              <div
                #viewerHost
                class="epub-host absolute left-0 top-0 origin-top-left"
                [style.width.%]="preferences.inverseZoomPercent()"
                [style.height.%]="preferences.inverseZoomPercent()"
                [style.transform]="'scale(' + preferences.zoomScale() + ')'"
                aria-label="EPUB reading area"
              ></div>
            </div>
          </div>

          @if (loading()) {
            <div
              class="absolute inset-0 z-10 flex items-center justify-center bg-[#eef0f3]/95 dark:bg-[#0a0e15]/95"
              role="status"
              aria-live="polite"
            >
              <div class="text-center">
                <span
                  class="mx-auto mb-4 block h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 dark:border-blue-950 dark:border-t-blue-400"
                  aria-hidden="true"
                ></span>
                <p class="text-sm text-gray-600 dark:text-gray-300">Opening EPUB…</p>
              </div>
            </div>
          }

          @if (error()) {
            <div
              class="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#eef0f3] p-4 dark:bg-[#0a0e15]"
            >
              <div
                class="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
              >
                <app-status-panel
                  variant="error"
                  icon="alert"
                  title="Could not open this EPUB"
                  [message]="error() ?? undefined"
                >
                  <button
                    type="button"
                    class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    (click)="retry()"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    (click)="goBack()"
                  >
                    Back to library
                  </button>
                </app-status-panel>
              </div>
            </div>
          }

          @if (notice(); as noticeText) {
            <div
              class="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-start gap-3 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-5 text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
              role="status"
            >
              <span>{{ noticeText }}</span>
              <button
                type="button"
                class="shrink-0 font-semibold underline underline-offset-2"
                (click)="notice.set(null)"
              >
                Dismiss
              </button>
            </div>
          }
        </main>
      </div>

      <app-reading-settings [(open)]="settingsOpen" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100dvh;
    }

    .epub-host {
      overflow: hidden;
    }

    :host ::ng-deep .epub-host .epub-container,
    :host ::ng-deep .epub-host .epub-view {
      width: 100% !important;
      height: 100% !important;
    }

    :host ::ng-deep .epub-host iframe {
      border: 0;
    }
  `,
})
export class EpubViewerComponent implements AfterViewInit {
  private static readonly SAVE_DELAY_MS = 900;
  private static readonly LOCATION_CHARS = 1600;
  private static readonly MAX_SEARCH_RESULTS = 60;
  private static readonly SEARCH_MIN_LENGTH = 2;
  private static readonly SIDEBAR_ID = 'reader-sidebar';

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documentService = inject(DocumentService);
  protected readonly preferences = inject(ReaderPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly readerRoot = viewChild.required<ElementRef<HTMLElement>>('readerRoot');
  private readonly viewerHost = viewChild.required<ElementRef<HTMLElement>>('viewerHost');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly document = signal<StoredDocument | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly toc = signal<FlatTocEntry[]>([]);
  readonly sidebarOpen = signal(false);
  readonly sidebarTab = signal<SidebarTab>('contents');
  readonly settingsOpen = signal(false);
  readonly currentChapter = signal('');
  readonly currentHref = signal('');
  readonly progressPercent = signal(0);
  readonly previousDisabled = signal(true);
  readonly nextDisabled = signal(true);
  readonly isFullscreen = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<EpubSearchMatch[]>([]);
  readonly searchPerformed = signal(false);
  readonly searchLoading = signal(false);

  readonly documentName = computed(() => {
    const document = this.document();
    return document ? this.documentService.getDisplayName(document) : 'Opening EPUB…';
  });

  readonly subtitle = computed(() => {
    const document = this.document();
    if (!document) {
      return undefined;
    }
    const author = this.documentService.getAuthor(document);
    const size = formatFileSize(document.size);
    return author ? `${author} · ${size}` : `EPUB · ${size}`;
  });

  readonly searchStatus = computed(() => {
    if (this.searchLoading()) {
      return 'Searching every chapter…';
    }
    if (!this.searchPerformed()) {
      return 'Search the full book';
    }
    const count = this.searchResults().length;
    return `${count} ${count === 1 ? 'match' : 'matches'}${
      count >= EpubViewerComponent.MAX_SEARCH_RESULTS ? ' (first results)' : ''
    }`;
  });

  readonly surfaceClass = computed(() => {
    const base = 'relative h-full w-full overflow-hidden rounded-lg border shadow-sm sm:rounded-xl';
    switch (this.preferences.readingTheme()) {
      case 'sepia':
        return `${base} border-[#e2d3b6] bg-[#f4ecd8] shadow-[#c9b892]/40`;
      case 'dark':
        return `${base} border-gray-800 bg-gray-900 shadow-black/30`;
      default:
        return `${base} border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900`;
    }
  });

  private readonly activeTocEntry = computed(() =>
    findActiveTocEntry(this.toc(), this.currentHref()),
  );

  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private hostElement: HTMLElement | null = null;
  private rootElement: HTMLElement | null = null;
  private currentDocumentId: string | null = null;
  private loadToken = 0;
  private searchToken = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadUrl: string | null = null;
  private pendingProgress: PendingProgress | null = null;
  private savesEnabled = false;
  private locationsReady = false;
  private locationsPromise: Promise<void> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private lastObservedWidth = 0;
  private lastObservedHeight = 0;

  constructor() {
    const onFullscreenChange = (): void => {
      this.isFullscreen.set(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    this.destroyRef.onDestroy(() => {
      this.loadToken += 1;
      this.searchToken += 1;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      this.saveReadingState();
      this.destroyReader();
      this.exitFullscreenIfNeeded();
    });

    effect(() => {
      // Track every reading preference so changes reach the live rendition.
      this.preferences.readingTheme();
      this.preferences.fontSize();
      this.preferences.lineHeight();
      this.preferences.fontFamily();
      this.preferences.zoom();

      if (!this.rendition) {
        return;
      }
      this.applyReadingPreferences();
      this.scheduleRelayout();
    });

    effect(() => {
      if (this.sidebarOpen() && this.sidebarTab() === 'search') {
        queueMicrotask(() => this.focusSearchInput());
      }
    });
  }

  ngAfterViewInit(): void {
    this.hostElement = this.viewerHost().nativeElement;
    this.rootElement = this.readerRoot().nativeElement;

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        void this.openDocument(id);
      } else {
        this.loading.set(false);
        this.error.set('No document ID was provided.');
      }
    });
  }

  goBack(): void {
    this.saveReadingState();
    void this.router.navigate(['/']);
  }

  retry(): void {
    if (this.currentDocumentId) {
      void this.openDocument(this.currentDocumentId);
    }
  }

  async previous(): Promise<void> {
    if (!this.rendition) {
      return;
    }
    this.savesEnabled = true;
    try {
      await this.rendition.prev();
    } catch (error) {
      console.warn('Could not turn to the previous page:', error);
    }
  }

  async next(): Promise<void> {
    if (!this.rendition) {
      return;
    }
    this.savesEnabled = true;
    try {
      await this.rendition.next();
    } catch (error) {
      console.warn('Could not turn to the next page:', error);
    }
  }

  toggleContents(): void {
    const isContentsOpen = this.sidebarOpen() && this.sidebarTab() === 'contents';
    this.sidebarTab.set('contents');
    this.sidebarOpen.set(!isContentsOpen);
  }

  toggleSearch(): void {
    const isSearchOpen = this.sidebarOpen() && this.sidebarTab() === 'search';
    if (isSearchOpen) {
      this.sidebarOpen.set(false);
      return;
    }
    this.sidebarTab.set('search');
    this.sidebarOpen.set(true);
    queueMicrotask(() => this.focusSearchInput());
  }

  selectTab(tab: SidebarTab): void {
    this.sidebarTab.set(tab);
    if (tab === 'search') {
      queueMicrotask(() => this.focusSearchInput());
    }
  }

  openSettings(): void {
    this.settingsOpen.set(true);
  }

  toggleSettings(): void {
    this.settingsOpen.update((open) => !open);
  }

  async goToTocEntry(entry: FlatTocEntry): Promise<void> {
    if (!this.rendition) {
      return;
    }

    this.savesEnabled = true;
    this.currentChapter.set(entry.label);
    this.currentHref.set(entry.href);

    try {
      await this.rendition.display(entry.href);
    } catch (error) {
      console.warn('Could not open the selected chapter:', error);
      this.showNotice('That chapter could not be opened.');
      return;
    }

    this.closeSidebarOnSmallScreen();
  }

  async goToSearchResult(result: EpubSearchMatch): Promise<void> {
    if (!this.rendition) {
      return;
    }

    this.savesEnabled = true;
    this.currentChapter.set(result.chapter);

    try {
      await this.rendition.display(result.cfi);
    } catch (error) {
      console.warn('Could not open the search result:', error);
      this.showNotice('That search result could not be opened.');
      return;
    }

    this.closeSidebarOnSmallScreen();
  }

  async runSearch(event?: Event): Promise<void> {
    event?.preventDefault();
    const query = this.searchQuery().trim();
    const book = this.book;

    if (!book || query.length < EpubViewerComponent.SEARCH_MIN_LENGTH) {
      this.searchPerformed.set(false);
      this.searchResults.set([]);
      this.searchLoading.set(false);
      return;
    }

    const loadToken = this.loadToken;
    const searchToken = ++this.searchToken;
    this.searchLoading.set(true);
    this.searchPerformed.set(true);
    this.searchResults.set([]);

    const results: EpubSearchMatch[] = [];
    const seen = new Set<string>();

    try {
      for (const section of book.spine.spineItems) {
        if (loadToken !== this.loadToken || searchToken !== this.searchToken) {
          return;
        }
        if (results.length >= EpubViewerComponent.MAX_SEARCH_RESULTS) {
          break;
        }

        try {
          await section.load(book.load.bind(book));
          const matches = section.find(query);
          const chapter =
            findChapterLabel(this.toc(), section.href) ||
            section.idref ||
            section.href?.split('/').pop() ||
            'Section';

          for (const match of matches) {
            const result = toSearchMatch(match, chapter, seen);
            if (result) {
              results.push(result);
            }
            if (results.length >= EpubViewerComponent.MAX_SEARCH_RESULTS) {
              break;
            }
          }
        } catch (error) {
          console.warn('Could not search a chapter:', error);
        }

        await this.yieldToUi();
      }

      if (loadToken === this.loadToken && searchToken === this.searchToken) {
        this.searchResults.set(results);
      }
    } finally {
      if (loadToken === this.loadToken && searchToken === this.searchToken) {
        this.searchLoading.set(false);
      }
    }
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchPerformed.set(false);
    this.searchToken += 1;
    this.focusSearchInput();
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await this.rootElement?.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen request failed:', error);
      this.showNotice('Fullscreen mode is not available in this browser.');
    }
  }

  downloadEpub(): void {
    const document = this.document();
    if (!document) {
      return;
    }

    this.revokeDownloadUrl();
    this.downloadUrl = URL.createObjectURL(new Blob([document.file], { type: 'application/epub+zip' }));

    const anchor = window.document.createElement('a');
    anchor.href = this.downloadUrl;
    anchor.download = document.name;
    anchor.rel = 'noopener';
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    this.downloadTimer = setTimeout(() => this.revokeDownloadUrl(), 10_000);
  }

  saveReadingState(): void {
    this.captureCurrentLocation();
    this.flushPendingProgress();
  }

  onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this.saveReadingState();
    }
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTypingTarget(event.target) || this.settingsOpen()) {
      return;
    }
    if (hasShortcutModifier(event)) {
      return;
    }

    if (event.key === 'Escape') {
      if (this.sidebarOpen()) {
        event.preventDefault();
        this.sidebarOpen.set(false);
      }
      return;
    }

    if (this.sidebarOpen() && this.isInsideSidebar(event.target)) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        void this.previous();
        break;
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        void this.next();
        break;
      case '/':
        event.preventDefault();
        this.toggleSearch();
        break;
      default:
        break;
    }
  }

  onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const nextTab: SidebarTab = this.sidebarTab() === 'contents' ? 'search' : 'contents';
    this.selectTab(nextTab);
    const targetId = nextTab === 'contents' ? 'epub-tab-contents' : 'epub-tab-search';
    window.document.getElementById(targetId)?.focus();
  }

  protected tabClass(selected: boolean): string {
    const base =
      'flex-1 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none';
    return selected
      ? `${base} border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300`
      : `${base} border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200`;
  }

  protected tocEntryClass(entry: FlatTocEntry): string {
    const base =
      'flex w-full items-center gap-1 rounded-md py-2 pr-3 text-left text-[13px] leading-5 transition-colors';
    return this.isActiveEntry(entry)
      ? `${base} bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300`
      : `${base} text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white`;
  }

  protected searchResultClass(): string {
    return 'block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-gray-100 focus-visible:outline-none dark:hover:bg-gray-800';
  }

  private async openDocument(id: string): Promise<void> {
    const token = ++this.loadToken;
    this.searchToken += 1;
    this.flushPendingProgress();
    this.savesEnabled = false;
    this.locationsReady = false;
    this.destroyReader();
    this.resetUi();
    this.document.set(null);
    this.currentDocumentId = id;

    try {
      const stored = await this.documentService.getDocumentById(id);
      if (token !== this.loadToken) {
        return;
      }
      if (!stored || stored.kind !== 'epub') {
        this.loading.set(false);
        this.error.set(
          stored
            ? 'This document is not an EPUB file.'
            : 'This EPUB was not found in the local library. It may have been deleted.',
        );
        return;
      }

      this.document.set(stored);
      this.currentChapter.set(stored.epubChapter ?? '');
      this.progressPercent.set(progressFractionToPercent(stored.epubProgress));

      const buffer = await stored.file.arrayBuffer();
      if (token !== this.loadToken) {
        return;
      }

      const book = ePub(buffer);
      this.book = book;
      await book.opened;
      if (token !== this.loadToken) {
        return;
      }

      await this.loadNavigation(book);
      if (token !== this.loadToken) {
        return;
      }

      this.createRendition(book, token);
      this.initializeLocations(token);

      const restored = await this.restoreSavedPosition(stored, token);
      if (token !== this.loadToken) {
        return;
      }

      const hadSavedPosition =
        Boolean(stored.epubCfi || stored.epubHref) || (stored.epubProgress ?? 0) > 0.005;
      this.savesEnabled = restored || !hadSavedPosition;

      if (!restored && hadSavedPosition) {
        this.showNotice(
          'Your saved reading place could not be found. The book opened at the beginning.',
        );
      }

      const current = this.rendition?.currentLocation();
      if (current) {
        this.handleRelocated(current);
      }

      this.loading.set(false);
    } catch (error) {
      console.error('Could not open EPUB:', error);
      if (token === this.loadToken) {
        this.savesEnabled = false;
        this.destroyReader();
        this.loading.set(false);
        this.error.set(
          'The file may be corrupt, encrypted, or use an unsupported EPUB layout. Try another copy of the book.',
        );
      }
    }
  }

  private async loadNavigation(book: Book): Promise<void> {
    try {
      const navigation = await book.loaded.navigation;
      this.toc.set(flattenToc(navigation.toc ?? []));
    } catch (error) {
      console.warn('Could not read the EPUB table of contents:', error);
      this.toc.set([]);
    }
  }

  private createRendition(book: Book, token: number): void {
    const host = this.hostElement;
    if (!host) {
      throw new Error('The EPUB reading area is not available.');
    }

    host.replaceChildren();
    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
      allowScriptedContent: false,
      allowPopups: false,
    });

    this.rendition = rendition;
    this.registerRenditionEvents(rendition, token);
    this.registerContentHooks(rendition, token);
    this.registerThemes(rendition);
    this.applyReadingPreferences();
    this.observeResize();
  }

  private registerRenditionEvents(rendition: Rendition, token: number): void {
    rendition.on('relocated', (location) => {
      if (token === this.loadToken) {
        this.handleRelocated(location);
      }
    });

    rendition.on('displayerror', (error) => {
      if (token !== this.loadToken) {
        return;
      }
      console.warn('EPUB display error:', error);
      this.showNotice('This chapter could not be displayed.');
    });
  }

  private registerContentHooks(rendition: Rendition, token: number): void {
    rendition.hooks.content.register((contents: Contents) => {
      if (token !== this.loadToken) {
        return;
      }
      this.decorateContents(contents, token);
    });
  }

  private decorateContents(contents: Contents, token: number): void {
    const contentDocument = contents.document;

    contentDocument.addEventListener('click', (event: MouseEvent) => {
      if (token !== this.loadToken) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href')?.trim() ?? '';
      if (/^(javascript|data|vbscript):/i.test(href)) {
        event.preventDefault();
        return;
      }
      if (/^(https?:|mailto:)/i.test(href)) {
        event.preventDefault();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    });

    contentDocument.addEventListener('keydown', (event: KeyboardEvent) => {
      if (token !== this.loadToken || isTypingTarget(event.target) || hasShortcutModifier(event)) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        void this.previous();
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        void this.next();
      }
    });
  }

  private registerThemes(rendition: Rendition): void {
    const rulesFor = (colors: {
      background: string;
      text: string;
      link: string;
      selectionBackground: string;
      selectionText: string;
    }): Record<string, Record<string, string>> => ({
      'p, li': {
        'max-width': '76ch !important',
        'margin-left': 'auto !important',
        'margin-right': 'auto !important',
      },
      'img, svg': { 'max-width': '100% !important', height: 'auto !important' },
      body: {
        color: `${colors.text} !important`,
        background: `${colors.background} !important`,
        'overflow-wrap': 'break-word !important',
        'padding-left': 'clamp(8px, 3vw, 40px) !important',
        'padding-right': 'clamp(8px, 3vw, 40px) !important',
      },
      a: { color: `${colors.link} !important` },
      '::selection': {
        background: `${colors.selectionBackground} !important`,
        color: `${colors.selectionText} !important`,
      },
    });

    rendition.themes.register({
      'reader-light': rulesFor({
        background: '#ffffff',
        text: '#1f2937',
        link: '#1d4ed8',
        selectionBackground: '#bfdbfe',
        selectionText: '#111827',
      }),
      'reader-sepia': rulesFor({
        background: '#f4ecd8',
        text: '#3f3222',
        link: '#92400e',
        selectionBackground: '#e2cfa5',
        selectionText: '#3f3222',
      }),
      'reader-dark': rulesFor({
        background: '#111827',
        text: '#e5e7eb',
        link: '#93c5fd',
        selectionBackground: '#1d4ed8',
        selectionText: '#ffffff',
      }),
    });
  }

  private applyReadingPreferences(): void {
    const rendition = this.rendition;
    if (!rendition) {
      return;
    }

    const theme = this.readingThemeName(this.preferences.readingTheme());
    rendition.themes.select(theme);

    const fontStack =
      this.preferences.fontFamily() === 'serif'
        ? 'Georgia, "Iowan Old Style", "Times New Roman", serif'
        : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    // Inline overrides with priority so publisher styles cannot win.
    rendition.themes.override('font-size', `${this.preferences.fontSize()}%`, true);
    rendition.themes.override('line-height', String(this.preferences.lineHeight()), true);
    rendition.themes.override('font-family', fontStack, true);
  }

  private readingThemeName(theme: ReadingTheme): string {
    return `reader-${theme}`;
  }

  private async restoreSavedPosition(stored: StoredDocument, token: number): Promise<boolean> {
    const rendition = this.rendition;
    const book = this.book;
    if (!rendition || !book) {
      return false;
    }

    const savedCfi = stored.epubCfi;
    if (isValidEpubCfi(savedCfi)) {
      try {
        // Validates that the CFI still points at a node in this edition.
        await book.getRange(savedCfi);
        if (token !== this.loadToken) {
          return false;
        }
        await rendition.display(savedCfi);
        return token === this.loadToken;
      } catch (error) {
        console.warn('Saved EPUB location is no longer valid:', error);
      }
    } else if (savedCfi) {
      console.warn('Ignoring malformed saved EPUB CFI:', savedCfi);
    }

    if (token !== this.loadToken) {
      return false;
    }

    if (stored.epubHref) {
      try {
        await rendition.display(stored.epubHref);
        if (token === this.loadToken) {
          this.showNotice('Your exact place was unavailable, so the saved chapter was opened.');
          return true;
        }
        return false;
      } catch (error) {
        console.warn('Saved EPUB chapter is no longer valid:', error);
      }
    }

    const savedProgress = stored.epubProgress ?? 0;
    if (savedProgress > 0.005) {
      await this.waitForLocations(2500);
      if (token !== this.loadToken) {
        return false;
      }
      if (this.locationsReady) {
        const target = book.locations.cfiFromPercentage(savedProgress);
        if (typeof target === 'string') {
          try {
            await rendition.display(target);
            return token === this.loadToken;
          } catch (error) {
            console.warn('Saved EPUB percentage is no longer valid:', error);
          }
        }
      }
    }

    if (token !== this.loadToken) {
      return false;
    }

    await rendition.display();
    return false;
  }

  private initializeLocations(token: number): void {
    const book = this.book;
    if (!book) {
      return;
    }

    this.locationsPromise = book.locations
      .generate(EpubViewerComponent.LOCATION_CHARS)
      .then(() => {
        if (token !== this.loadToken) {
          return;
        }
        this.locationsReady = true;
        const location = this.rendition?.currentLocation();
        if (!location) {
          return;
        }
        const progress = this.computeProgress(location.start.cfi, location);
        this.progressPercent.set(progress);
        if (this.savesEnabled) {
          this.updatePendingProgress(location, progress);
          this.scheduleProgressSave();
        }
      })
      .catch((error: unknown) => {
        console.warn('Could not generate precise EPUB locations:', error);
      })
      .finally(() => {
        if (token === this.loadToken) {
          this.locationsPromise = null;
        }
      });
  }

  private handleRelocated(location: Location): void {
    const cfi = location.start.cfi;
    if (!isValidEpubCfi(cfi)) {
      return;
    }

    const href = location.start.href;
    const chapter = findChapterLabel(this.toc(), href) || this.currentChapter();
    const progress = this.computeProgress(cfi, location);

    this.currentHref.set(href);
    if (chapter) {
      this.currentChapter.set(chapter);
    }
    this.progressPercent.set(progress);
    this.previousDisabled.set(location.atStart === true);
    this.nextDisabled.set(location.atEnd === true);

    if (this.savesEnabled) {
      this.updatePendingProgress(location, progress);
      this.scheduleProgressSave();
    }
  }

  private computeProgress(cfi: string, location: Location): number {
    if (this.locationsReady && this.book) {
      const percentage = this.book.locations.percentageFromCfi(cfi);
      if (typeof percentage === 'number' && Number.isFinite(percentage)) {
        return clampPercent(percentage * 100);
      }
    }

    const fallback = location.start.percentage;
    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
      return clampPercent(fallback * 100);
    }

    return clampPercent(this.progressPercent());
  }

  private updatePendingProgress(location: Location, progress: number): void {
    const document = this.document();
    if (!document) {
      return;
    }

    this.pendingProgress = {
      documentId: document.id,
      cfi: location.start.cfi,
      chapter: findChapterLabel(this.toc(), location.start.href) || this.currentChapter(),
      href: location.start.href,
      progress: progress / 100,
    };
  }

  private captureCurrentLocation(): void {
    if (!this.savesEnabled) {
      return;
    }

    const location = this.rendition?.currentLocation();
    if (!location || !isValidEpubCfi(location.start.cfi)) {
      return;
    }

    const progress = this.computeProgress(location.start.cfi, location);
    this.updatePendingProgress(location, progress);
  }

  private scheduleProgressSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushPendingProgress();
    }, EpubViewerComponent.SAVE_DELAY_MS);
  }

  private flushPendingProgress(): void {
    const pending = this.pendingProgress;
    if (!pending || !pending.documentId) {
      return;
    }

    this.pendingProgress = null;
    void this.documentService
      .saveEpubProgress(pending.documentId, pending)
      .catch((error: unknown) => console.error('Could not save EPUB reading position:', error));
  }

  private observeResize(): void {
    this.resizeObserver?.disconnect();
    const host = this.hostElement;
    if (!host || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.lastObservedWidth = host.clientWidth;
    this.lastObservedHeight = host.clientHeight;

    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || !this.rendition) {
        return;
      }
      if (
        Math.abs(box.width - this.lastObservedWidth) < 1 &&
        Math.abs(box.height - this.lastObservedHeight) < 1
      ) {
        return;
      }

      this.lastObservedWidth = box.width;
      this.lastObservedHeight = box.height;
      this.scheduleRelayout();
    });
    this.resizeObserver.observe(host);
  }

  private scheduleRelayout(): void {
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
    }
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.rendition?.resize();
    });
  }

  private async waitForLocations(timeoutMs: number): Promise<void> {
    const promise = this.locationsPromise;
    if (!promise) {
      return;
    }

    await Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  private async yieldToUi(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  private resetUi(): void {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.toc.set([]);
    this.currentChapter.set('');
    this.currentHref.set('');
    this.progressPercent.set(0);
    this.previousDisabled.set(true);
    this.nextDisabled.set(true);
    this.sidebarOpen.set(false);
    this.sidebarTab.set('contents');
    this.settingsOpen.set(false);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchPerformed.set(false);
    this.searchLoading.set(false);
  }

  private destroyReader(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.revokeDownloadUrl();
    if (this.downloadTimer) {
      clearTimeout(this.downloadTimer);
      this.downloadTimer = null;
    }

    this.rendition?.destroy();
    this.book?.destroy();
    this.rendition = null;
    this.book = null;
    this.locationsPromise = null;
    this.locationsReady = false;
    this.hostElement?.replaceChildren();
  }

  private exitFullscreenIfNeeded(): void {
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement && this.rootElement?.contains(fullscreenElement)) {
      void document.exitFullscreen().catch(() => undefined);
    }
    this.rootElement = null;
    this.hostElement = null;
  }

  private revokeDownloadUrl(): void {
    if (this.downloadUrl) {
      URL.revokeObjectURL(this.downloadUrl);
      this.downloadUrl = null;
    }
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null;
      if (this.notice() === message) {
        this.notice.set(null);
      }
    }, 7000);
  }

  private focusSearchInput(): void {
    const input = this.searchInput()?.nativeElement;
    if (input) {
      input.focus();
      input.select();
    }
  }

  private closeSidebarOnSmallScreen(): void {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      this.sidebarOpen.set(false);
    }
  }

  private isInsideSidebar(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.closest) {
      return false;
    }
    return element.closest(`#${EpubViewerComponent.SIDEBAR_ID}`) !== null;
  }

  private isActiveEntry(entry: FlatTocEntry): boolean {
    return this.activeTocEntry() === entry;
  }
}
