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
import ePub, { EpubCFI, type Book, type Section } from '@likecoin/epub-ts';
import { StoredDocument } from '../../models/document.interface';
import { DocumentService } from '../../services/document.service';
import {
  ReaderPreferencesService,
  type EpubFlow,
  type ReadingTheme,
} from '../../services/reader-preferences.service';
import {
  findActiveTocEntry,
  findChapterLabel,
  flattenToc,
  isValidEpubCfi,
  removeTranslationGuards,
  sanitizeLanguageTag,
  splitEpubHref,
  toSearchMatch,
  type EpubSearchMatch,
  type FlatTocEntry,
} from '../../utils/epub.utils';
import {
  clamp,
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

interface ChapterView {
  index: number;
  href: string;
  label: string;
  section: Section;
  element: HTMLElement;
  body?: HTMLElement;
  sourceDocument?: Document;
  liveToSource: Map<Node, Node>;
  sourceToLive: Map<Node, Node>;
  rendered: boolean;
  rendering: Promise<void> | null;
  pageCount: number;
  pageWidth: number;
  pageGap: number;
}

interface PendingProgress {
  documentId: string;
  cfi: string;
  chapter: string;
  href: string;
  progress: number;
}

interface LiveAnchor {
  view: ChapterView;
  node: Node;
  offset: number;
}

interface ResourceJob {
  element: Element;
  attribute: string;
  value: string;
  section: Section;
}

/**
 * EPUB reader built on @likecoin/epub-ts.
 *
 * Book text is rendered into the main document's light DOM as sanitized,
 * selectable HTML so browser page translation (Google Translate, Edge, Safari)
 * can see it. epub.ts remains responsible for archive parsing, metadata,
 * navigation, locations and CFI maths; pagination and scrolling are handled by
 * this component because an iframe or canvas surface would hide the text from
 * translation engines.
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
          <button type="button" role="menuitem" class="menu-item" (click)="toggleFlow()">
            <app-icon [name]="modeToggleIcon()" size="sm" />
            {{ modeToggleLabel() }}
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
            [tooltip]="isPaginated() ? 'Previous page (←)' : 'Scroll up one page (Page Up)'"
            [disabled]="previousDisabled()"
            (pressed)="previous()"
          >
            <app-icon name="chevron-left" />
          </app-toolbar-button>
          <app-toolbar-button
            label="Next page"
            [tooltip]="isPaginated() ? 'Next page (→)' : 'Scroll down one page (Page Down)'"
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
              @if (isPaginated()) {
                <span
                  class="text-[10px] font-semibold tabular-nums text-gray-500 dark:text-gray-400"
                  aria-live="polite"
                  [attr.aria-label]="'Page ' + pageNumber() + ' of ' + pageCount() + ' in this chapter'"
                >
                  {{ pageNumber() }} / {{ pageCount() }}
                </span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500" aria-hidden="true">·</span>
              } @else {
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
              }
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
          <app-toolbar-button
            [label]="modeToggleLabel()"
            [tooltip]="modeToggleLabel()"
            (pressed)="toggleFlow()"
          >
            <app-icon [name]="modeToggleIcon()" />
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
              aria-controls="epub-panel-contents"
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
              aria-controls="epub-panel-search"
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
          <div
            #scroller
            class="epub-scroller"
            [class.epub-scroller--paginated]="isPaginated()"
            tabindex="0"
            role="region"
            aria-label="EPUB reading area"
            (scroll)="onScrollerScroll()"
            (wheel)="onUserScrollIntent()"
            (touchstart)="onUserScrollIntent()"
            (pointerdown)="onUserScrollIntent()"
          >
            <div class="epub-surface-wrap" [class.epub-surface-wrap--paginated]="isPaginated()">
              <div [class]="surfaceClass()">
                <div #styleHost class="epub-styles" aria-hidden="true"></div>
                <div
                  #contentRoot
                  class="epub-content"
                  [class.epub-content--paginated]="isPaginated()"
                  [style]="readerStyles()"
                  [attr.lang]="bookLanguage() ?? null"
                  [attr.dir]="bookDirection()"
                  (click)="onContentClick($event)"
                ></div>
              </div>
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
                <p class="text-sm text-gray-600 dark:text-gray-300">Preparing EPUB…</p>
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
})
export class EpubViewerComponent implements AfterViewInit {
  private static readonly SAVE_DELAY_MS = 900;
  private static readonly LOCATION_CHARS = 1600;
  private static readonly MAX_SEARCH_RESULTS = 60;
  private static readonly SEARCH_MIN_LENGTH = 2;
  private static readonly SIDE_BY_SIDE_GAP = 40;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documentService = inject(DocumentService);
  protected readonly preferences = inject(ReaderPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly readerRoot = viewChild.required<ElementRef<HTMLElement>>('readerRoot');
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly contentRoot = viewChild.required<ElementRef<HTMLElement>>('contentRoot');
  private readonly styleHost = viewChild.required<ElementRef<HTMLElement>>('styleHost');
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
  readonly nextDisabled = signal(false);
  readonly isFullscreen = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<EpubSearchMatch[]>([]);
  readonly searchPerformed = signal(false);
  readonly searchLoading = signal(false);
  readonly pageNumber = signal(1);
  readonly pageCount = signal(1);
  readonly bookLanguage = signal<string | undefined>(undefined);
  readonly bookDirection = signal<'ltr' | 'rtl'>('ltr');

  readonly isPaginated = computed(() => this.preferences.flow() === 'paginated');
  readonly modeToggleIcon = computed(() => (this.isPaginated() ? 'scroll' : 'columns'));
  readonly modeToggleLabel = computed(() =>
    this.isPaginated() ? 'Switch to continuous scrolling' : 'Switch to paged reading',
  );
  readonly fontStack = computed(() =>
    this.preferences.fontFamily() === 'serif'
      ? 'Georgia, "Iowan Old Style", "Times New Roman", serif'
      : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  );

  readonly readerStyles = computed<Record<string, string>>(() => ({
    '--epub-font-scale': String(this.preferences.fontSize() / 100),
    '--epub-line-height': String(this.preferences.lineHeight()),
    '--epub-font-family': this.fontStack(),
    '--epub-zoom': String(this.preferences.zoom() / 100),
  }));

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
    const theme = this.preferences.readingTheme();
    const classes = ['epub-surface', `epub-theme-${theme}`];
    if (this.isPaginated()) {
      classes.push('epub-surface--paginated');
    }
    return classes.join(' ');
  });

  private readonly activeTocEntry = computed(() =>
    findActiveTocEntry(this.toc(), this.currentHref()),
  );

  private book: Book | null = null;
  private views: ChapterView[] = [];
  private activeChapterIndex = 0;
  private currentDocumentId: string | null = null;
  private loadToken = 0;
  private searchToken = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadUrl: string | null = null;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private reflowTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private contentObserver: MutationObserver | null = null;
  private pendingProgress: PendingProgress | null = null;
  private savesEnabled = false;
  private initializing = false;
  private restoring = false;
  private suppressScrollRefresh = false;
  private currentCfi: string | null = null;
  private locationsReady = false;
  private locationsPromise: Promise<void> | null = null;
  private rootElement: HTMLElement | null = null;
  private scrollerElement: HTMLElement | null = null;
  private contentElement: HTMLElement | null = null;
  private styleElement: HTMLElement | null = null;
  private previousDocumentLang: string | null = null;
  private readonly styleKeys = new Set<string>();

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
      // These preferences change layout, so capture the CFI first and restore
      // the exact location after the DOM/CSS has reflowed.
      this.preferences.flow();
      this.preferences.fontSize();
      this.preferences.lineHeight();
      this.preferences.fontFamily();
      this.preferences.zoom();

      if (!this.book || this.initializing) {
        return;
      }
      // Use the last known CFI: Angular may already have applied the new layout
      // classes by the time this effect runs, so re-measuring the viewport here
      // would capture a browser scroll-anchoring artefact instead of the place
      // the reader was actually at.
      this.scheduleReflow(this.currentCfi ?? this.captureCfi());
    });

    effect(() => {
      if (this.sidebarOpen() && this.sidebarTab() === 'search') {
        queueMicrotask(() => this.focusSearchInput());
      }
    });
  }

  ngAfterViewInit(): void {
    this.rootElement = this.readerRoot().nativeElement;
    this.scrollerElement = this.scroller().nativeElement;
    this.contentElement = this.contentRoot().nativeElement;
    this.styleElement = this.styleHost().nativeElement;

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
    if (this.isPaginated()) {
      await this.previousPage();
      return;
    }
    this.scrollByViewport(-1);
  }

  async next(): Promise<void> {
    if (this.isPaginated()) {
      await this.nextPage();
      return;
    }
    this.scrollByViewport(1);
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

  toggleFlow(): void {
    this.savesEnabled = true;
    this.preferences.toggleFlow();
  }

  openSettings(): void {
    this.settingsOpen.set(true);
  }

  toggleSettings(): void {
    this.settingsOpen.update((open) => !open);
  }

  async goToTocEntry(entry: FlatTocEntry): Promise<void> {
    try {
      await this.goToHref(entry.href);
    } catch (error) {
      console.warn('Could not open the selected chapter:', error);
      this.showNotice('That chapter could not be opened.');
      return;
    }

    this.closeSidebarOnSmallScreen();
  }

  async goToSearchResult(result: EpubSearchMatch): Promise<void> {
    try {
      await this.goToCfi(result.cfi);
    } catch (error) {
      console.warn('Could not open the search result:', error);
      this.showNotice('That search result could not be opened.');
      return;
    }

    this.currentChapter.set(result.chapter);
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
        await this.readerRoot().nativeElement.requestFullscreen();
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

  onScrollerScroll(): void {
    if (!this.scrollerElement || this.isPaginated() || this.restoring) {
      return;
    }
    if (this.suppressScrollRefresh) {
      return;
    }

    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = null;
      this.refreshLocation(this.savesEnabled);
      this.updateVisibleChapterLabel();
    }, 110);
  }

  onUserScrollIntent(): void {
    this.suppressScrollRefresh = false;
  }

  onContentClick(event: MouseEvent): void {
    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor) {
      return;
    }

    const rawHref = anchor.getAttribute('href')?.trim() ?? '';
    if (!rawHref) {
      return;
    }

    if (/^(javascript|data|vbscript):/i.test(rawHref)) {
      event.preventDefault();
      return;
    }

    if (/^(https?:|mailto:|tel:)/i.test(rawHref)) {
      event.preventDefault();
      window.open(anchor.href, '_blank', 'noopener,noreferrer');
      return;
    }

    event.preventDefault();
    const linkView = this.findViewForLiveNode(anchor);
    const baseHref = linkView?.href || this.currentHref();
    const target = rawHref.startsWith('#')
      ? `${baseHref}${rawHref}`
      : this.resolveRelativeHref(rawHref, baseHref);

    if (!target) {
      return;
    }

    if (!this.findViewForHref(target)) {
      void this.openResourceLink(rawHref, baseHref);
      return;
    }

    void this.goToHref(target).catch((error: unknown) => {
      console.warn('Could not follow the EPUB link:', error);
      this.showNotice('That link could not be opened.');
    });
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

    if (this.isPaginated()) {
      switch (event.key) {
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          this.suppressScrollRefresh = false;
          void this.previous();
          break;
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          this.suppressScrollRefresh = false;
          void this.next();
          break;
        case ' ':
          if (!this.isInteractiveTarget(event.target)) {
            event.preventDefault();
            this.suppressScrollRefresh = false;
            void this.next();
          }
          break;
        case '/':
          event.preventDefault();
          this.toggleSearch();
          break;
        default:
          break;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.suppressScrollRefresh = false;
        this.scrollBy(72);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.suppressScrollRefresh = false;
        this.scrollBy(-72);
        break;
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        this.suppressScrollRefresh = false;
        this.scrollByViewport(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        this.suppressScrollRefresh = false;
        this.scrollByViewport(-1);
        break;
      case ' ':
        if (!this.isInteractiveTarget(event.target)) {
          event.preventDefault();
          this.suppressScrollRefresh = false;
          this.scrollByViewport(event.shiftKey ? -1 : 1);
        }
        break;
      case 'Home':
        event.preventDefault();
        this.suppressScrollRefresh = false;
        this.scrollerElement?.scrollTo({ top: 0, behavior: 'auto' });
        break;
      case 'End':
        event.preventDefault();
        this.suppressScrollRefresh = false;
        this.scrollerElement?.scrollTo({
          top: this.scrollerElement.scrollHeight,
          behavior: 'auto',
        });
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
    this.initializing = true;
    this.restoring = true;
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
        this.initializing = false;
        this.restoring = false;
        return;
      }

      this.document.set(stored);
      this.currentChapter.set(stored.epubChapter ?? '');
      this.progressPercent.set(progressFractionToPercent(stored.epubProgress));

      const buffer = await stored.file.arrayBuffer();
      if (token !== this.loadToken) {
        return;
      }

      const book = ePub(buffer, { replacements: 'blobUrl' });
      this.book = book;
      this.attachBookErrorHandlers(book);

      await book.opened;
      if (token !== this.loadToken) {
        return;
      }

      if (book.replacementsReady) {
        await book.replacementsReady.catch((error: unknown) => {
          console.warn('Some EPUB resources could not be prepared:', error);
        });
      }
      if (token !== this.loadToken) {
        return;
      }

      await this.loadNavigation(book);
      this.applyBookLanguage(book);
      this.buildChapterViews(book);
      await this.renderAllChapters(token);
      if (token !== this.loadToken) {
        return;
      }

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

      this.initializing = false;
      this.restoring = false;
      this.suppressScrollRefresh = true;
      this.loading.set(false);
      this.observeResize();
      this.observeContentChanges();
      this.updateNavigationState();
    } catch (error) {
      console.error('Could not open EPUB:', error);
      if (token === this.loadToken) {
        this.savesEnabled = false;
        this.initializing = false;
        this.restoring = false;
        this.destroyReader();
        this.loading.set(false);
        this.error.set(
          'The file may be corrupt, encrypted, or use an unsupported EPUB layout. Try another copy of the book.',
        );
      }
    }
  }

  private attachBookErrorHandlers(book: Book): void {
    // epub.ts rejects several internal promises for a corrupt archive. Mark them
    // handled so the upload/open flow cannot raise unhandled rejections.
    book.opened.catch(() => undefined);
    book.ready.catch(() => undefined);
    book.opening.promise.catch(() => undefined);
    Object.values(book.loaded).forEach((promise) => promise.catch(() => undefined));
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

  private applyBookLanguage(book: Book): void {
    const language = sanitizeLanguageTag(book.packaging.metadata.language);
    this.bookLanguage.set(language);
    this.bookDirection.set(
      book.packaging.metadata.direction?.toLowerCase() === 'rtl' ? 'rtl' : 'ltr',
    );

    if (this.previousDocumentLang === null) {
      this.previousDocumentLang = document.documentElement.lang || null;
    }
    if (language) {
      document.documentElement.lang = language;
    }
  }

  private buildChapterViews(book: Book): void {
    const content = this.contentElement;
    if (!content) {
      throw new Error('The EPUB reading area is not available.');
    }

    this.views = book.spine.spineItems.map((section, index) => {
      const href = section.href ?? '';
      const label =
        findChapterLabel(this.toc(), href) ||
        section.idref ||
        href.split('/').pop()?.replace(/\.x?html?$/i, '') ||
        `Chapter ${index + 1}`;

      const element = document.createElement('section');
      element.className = 'epub-chapter';
      element.dataset['chapterIndex'] = String(index);
      element.setAttribute('aria-label', label);

      content.appendChild(element);

      return {
        index,
        href,
        label,
        section,
        element,
        liveToSource: new Map<Node, Node>(),
        sourceToLive: new Map<Node, Node>(),
        rendered: false,
        rendering: null,
        pageCount: 1,
        pageWidth: 0,
        pageGap: 40,
      };
    });

    if (this.views.length === 0) {
      throw new Error('This EPUB has no readable spine items.');
    }
  }

  private async renderAllChapters(token: number): Promise<void> {
    for (const view of this.views) {
      if (token !== this.loadToken) {
        return;
      }
      try {
        await this.ensureChapterRendered(view);
      } catch (error) {
        console.error('Could not render EPUB chapter:', view.href, error);
        view.element.replaceChildren(
          this.createMessage(`This chapter could not be displayed: ${view.label}`),
        );
      }
      await this.yieldToUi();
    }
  }

  private ensureChapterRendered(view: ChapterView): Promise<void> {
    if (view.rendered) {
      return Promise.resolve();
    }
    if (view.rendering) {
      return view.rendering;
    }

    view.rendering = this.renderChapter(view).finally(() => {
      view.rendering = null;
    });
    return view.rendering;
  }

  private async renderChapter(view: ChapterView): Promise<void> {
    const book = this.book;
    if (!book) {
      throw new Error('Book is not loaded');
    }

    await view.section.load(book.load.bind(book));
    if (this.book !== book) {
      return;
    }
    const sourceDocument = view.section.document;
    const sourceBody = sourceDocument?.body;
    if (!sourceDocument || !sourceBody) {
      throw new Error('Chapter has no document body');
    }

    const body = document.createElement('div');
    body.className = 'epub-chapter-body';
    this.copyBodyAttributes(sourceBody, body);
    view.body = body;
    view.sourceDocument = sourceDocument;
    view.element.replaceChildren(body);

    view.liveToSource.set(body, sourceBody);
    view.sourceToLive.set(sourceBody, body);

    const resourceJobs: ResourceJob[] = [];
    for (const child of Array.from(sourceBody.childNodes)) {
      body.appendChild(this.sanitizeNode(child, view, resourceJobs));
    }

    await this.resolveResources(resourceJobs, view);
    if (this.book !== book) {
      return;
    }
    await this.loadChapterStyles(view);
    view.rendered = true;
  }

  private copyBodyAttributes(source: HTMLElement, target: HTMLElement): void {
    for (const attribute of Array.from(source.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name === 'style' || name === 'class' || name === 'lang' || name === 'dir') {
        continue;
      }
      if (name.startsWith('on') || name === 'translate' || name === 'data-notranslate') {
        continue;
      }
      try {
        target.setAttribute(attribute.name, attribute.value);
      } catch {
        // ignore malformed attributes
      }
    }

    const sourceClass = this.sanitizeClass(source.getAttribute('class'));
    if (sourceClass) {
      target.className = sourceClass;
    }
    const lang = source.getAttribute('lang') ?? source.getAttribute('xml:lang');
    if (lang) {
      target.setAttribute('lang', lang);
    }
    const dir = source.getAttribute('dir');
    if (dir === 'rtl' || dir === 'ltr') {
      target.setAttribute('dir', dir);
    }
  }

  private sanitizeNode(source: Node, view: ChapterView, resourceJobs: ResourceJob[]): Node {
    if (source.nodeType === Node.TEXT_NODE) {
      const clone = document.createTextNode(source.textContent ?? '');
      this.mapNode(view, source, clone);
      return clone;
    }

    if (source.nodeType === Node.COMMENT_NODE) {
      const clone = document.createComment(source.textContent ?? '');
      this.mapNode(view, source, clone);
      return clone;
    }

    if (source.nodeType !== Node.ELEMENT_NODE) {
      const clone = document.createTextNode(source.textContent ?? '');
      this.mapNode(view, source, clone);
      return clone;
    }

    const element = source as Element;
    const tag = element.tagName.toLowerCase();
    const namespace = element.namespaceURI;

    if (tag === 'script') {
      const clone = document.createElement('script');
      clone.setAttribute('type', 'text/plain');
      clone.setAttribute('data-epub-disabled', 'true');
      this.mapNode(view, source, clone);
      return clone;
    }

    if (tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'applet' || tag === 'base') {
      const clone = document.createElement(tag);
      clone.setAttribute('hidden', '');
      clone.setAttribute('data-epub-disabled', 'true');
      this.mapNode(view, source, clone);
      return clone;
    }

    const clone =
      namespace && namespace !== 'http://www.w3.org/1999/xhtml'
        ? document.createElementNS(namespace, element.nodeName)
        : document.createElement(tag);

    this.mapNode(view, source, clone);

    for (const attribute of Array.from(element.attributes)) {
      this.copyAttribute(element, clone, attribute, tag, view, resourceJobs);
    }

    removeTranslationGuards(clone as Element);
    if (clone instanceof Element && clone.classList.contains('notranslate')) {
      clone.classList.remove('notranslate');
    }

    if (
      clone instanceof HTMLElement &&
      (tag === 'input' || tag === 'button' || tag === 'select' || tag === 'textarea')
    ) {
      clone.setAttribute('disabled', '');
    }
    if (tag === 'audio' || tag === 'video') {
      clone.removeAttribute('autoplay');
    }

    for (const child of Array.from(element.childNodes)) {
      if (tag === 'style') {
        continue;
      }
      clone.appendChild(this.sanitizeNode(child, view, resourceJobs));
    }

    if (tag === 'style') {
      const css = element.textContent ?? '';
      if (css.trim()) {
        void this.addInlineStyles(css, view);
      }
    }

    return clone;
  }

  private copyAttribute(
    source: Element,
    target: Element,
    attribute: Attr,
    tag: string,
    view: ChapterView,
    resourceJobs: ResourceJob[],
  ): void {
    const name = attribute.name;
    const lowerName = name.toLowerCase();
    const value = attribute.value;

    if (
      lowerName.startsWith('on') ||
      lowerName === 'srcdoc' ||
      lowerName === 'formaction' ||
      lowerName === 'action' ||
      lowerName === 'method' ||
      lowerName === 'http-equiv' ||
      lowerName === 'integrity' ||
      lowerName === 'ping' ||
      lowerName === 'translate' ||
      lowerName === 'data-notranslate'
    ) {
      return;
    }

    if (lowerName === 'class') {
      const sanitized = this.sanitizeClass(value);
      if (sanitized) {
        target.setAttribute('class', sanitized);
      }
      return;
    }

    if (lowerName === 'style') {
      const sanitized = this.sanitizeInlineStyle(value);
      if (sanitized) {
        target.setAttribute('style', sanitized);
      }
      return;
    }

    if (lowerName === 'href' && (tag === 'a' || tag === 'area')) {
      if (/^\s*(javascript|vbscript|data:text\/html)/i.test(value)) {
        return;
      }
      target.setAttribute('href', value);
      return;
    }

    if (lowerName === 'href' && tag === 'link') {
      // Stylesheet links are loaded and scoped separately.
      return;
    }

    if (lowerName === 'src' || lowerName === 'poster' || lowerName === 'data') {
      if (tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'applet') {
        return;
      }
      resourceJobs.push({ element: target, attribute: name, value, section: view.section });
      return;
    }

    if (lowerName === 'xlink:href' || (lowerName === 'href' && tag === 'image')) {
      resourceJobs.push({ element: target, attribute: name, value, section: view.section });
      return;
    }

    if (lowerName === 'srcset') {
      resourceJobs.push({ element: target, attribute: name, value, section: view.section });
      return;
    }

    try {
      if (attribute.namespaceURI) {
        target.setAttributeNS(attribute.namespaceURI, name, value);
      } else {
        target.setAttribute(name, value);
      }
    } catch {
      // ignore malformed attributes
    }
  }

  private sanitizeClass(value: string | null): string {
    if (!value) {
      return '';
    }
    const tokens = value
      .split(/\s+/)
      .filter((token) => token && token !== 'notranslate' && !token.startsWith('translated-'));
    return tokens.join(' ');
  }

  /**
   * Inline colours/font sizes would fight the reading themes and typography
   * controls, so keep inline layout/styling but drop those declarations.
   */
  private sanitizeInlineStyle(value: string): string {
    const blocked = new Set([
      'color',
      'background',
      'background-color',
      'font',
      'font-size',
      'font-family',
      'line-height',
    ]);

    return value
      .split(';')
      .map((declaration) => declaration.trim())
      .filter((declaration) => {
        if (!declaration) {
          return false;
        }
        const property = declaration.split(':', 1)[0]?.trim().toLowerCase() ?? '';
        return property !== '' && !blocked.has(property) && !property.startsWith('--');
      })
      .join('; ');
  }

  private mapNode(view: ChapterView, source: Node, live: Node): void {
    view.liveToSource.set(live, source);
    view.sourceToLive.set(source, live);
  }

  private async resolveResources(jobs: ResourceJob[], view: ChapterView): Promise<void> {
    await Promise.all(
      jobs.map(async (job) => {
        if (job.attribute.toLowerCase() === 'srcset') {
          const resolved = await this.resolveSrcset(job.value, job.section);
          if (resolved) {
            job.element.setAttribute(job.attribute, resolved);
          } else {
            job.element.removeAttribute(job.attribute);
          }
          return;
        }

        const resolved = await this.resolveResource(job.value, job.section);
        if (!resolved) {
          if (job.element.tagName.toLowerCase() === 'img') {
            job.element.setAttribute('data-epub-missing-image', 'true');
          } else {
            job.element.removeAttribute(job.attribute);
          }
          return;
        }

        if (job.attribute.includes(':')) {
          job.element.setAttributeNS('http://www.w3.org/1999/xlink', job.attribute, resolved);
        } else {
          job.element.setAttribute(job.attribute, resolved);
        }
      }),
    );

    // Rewrite inline CSS url() references on cloned elements once resources exist.
    const styled = view.element.querySelectorAll<HTMLElement>('[style*="url("]');
    await Promise.all(
      Array.from(styled).map(async (element) => {
        const style = element.getAttribute('style');
        if (!style) {
          return;
        }
        const rewritten = await this.rewriteCssUrls(style, view.section);
        element.setAttribute('style', rewritten);
      }),
    );
  }

  private async resolveSrcset(value: string, section: Section): Promise<string | null> {
    const parts = value.split(',');
    const resolved: string[] = [];
    for (const part of parts) {
      const [url, descriptor] = part.trim().split(/\s+/, 2);
      if (!url) {
        continue;
      }
      const resolvedUrl = await this.resolveResource(url, section);
      if (resolvedUrl) {
        resolved.push(descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl);
      }
    }
    return resolved.length > 0 ? resolved.join(', ') : null;
  }

  private async resolveResource(raw: string, section: Section): Promise<string | null> {
    const value = raw.trim();
    if (!value || value.startsWith('#')) {
      return null;
    }
    if (/^(data:|blob:)/i.test(value)) {
      return value;
    }
    if (/^https?:/i.test(value)) {
      return value;
    }
    if (/^(javascript:|vbscript:)/i.test(value)) {
      return null;
    }

    const book = this.book;
    if (!book) {
      return null;
    }

    const path = this.resolveResourcePath(value, section);
    if (!path) {
      return null;
    }

    try {
      const resource = book.resources.get(path);
      if (resource) {
        return await resource;
      }
      if (book.archive) {
        return await book.archive.createUrl(path);
      }
    } catch (error) {
      console.warn('Could not load an EPUB resource:', path, error);
    }
    return null;
  }

  private resolveResourcePath(value: string, section: Section): string | null {
    try {
      const base = `https://epub.local/${section.url ?? ''}`;
      const url = new URL(value, base);
      if (url.origin !== 'https://epub.local') {
        return null;
      }
      return decodeURIComponent(url.pathname.replace(/^\//, ''));
    } catch {
      return null;
    }
  }

  private async rewriteCssUrls(css: string, section: Section): Promise<string> {
    const matches = Array.from(css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi));
    let output = css;
    for (const match of matches) {
      const raw = match[2];
      if (!raw || /^(data:|blob:|https?:|#)/i.test(raw)) {
        continue;
      }
      const resolved = await this.resolveResource(raw, section);
      if (resolved) {
        output = output.replace(match[0], `url("${resolved}")`);
      }
    }
    return output;
  }

  private async loadChapterStyles(view: ChapterView): Promise<void> {
    const book = this.book;
    const sourceDocument = view.sourceDocument;
    if (!book || !sourceDocument) {
      return;
    }

    const styles = Array.from(sourceDocument.head.querySelectorAll('style'));
    const links = Array.from(
      sourceDocument.head.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'),
    );

    for (const [index, style] of styles.entries()) {
      const css = style.textContent ?? '';
      if (!css.trim()) {
        continue;
      }
      await this.addScopedCss(css, view, `${view.href}:inline:${index}`);
    }

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) {
        continue;
      }
      const path = this.resolveResourcePath(href, view.section);
      if (!path) {
        continue;
      }
      const key = `${view.href}:${path}`;
      if (this.styleKeys.has(key)) {
        continue;
      }
      this.styleKeys.add(key);

      try {
        const loaded = await book.load(path, 'css');
        if (typeof loaded !== 'string' || !loaded.trim()) {
          continue;
        }
        const substituted = book.resources?.substitute(loaded, path) ?? loaded;
        this.appendScopedStyle(substituted, key);
      } catch (error) {
        console.warn('Could not load an EPUB stylesheet:', path, error);
      }
    }
  }

  private async addInlineStyles(css: string, view: ChapterView): Promise<void> {
    if (!css.trim()) {
      return;
    }
    await this.addScopedCss(css, view, `${view.href}:body-inline:${css.length}`);
  }

  private async addScopedCss(css: string, view: ChapterView, key: string): Promise<void> {
    if (this.styleKeys.has(key)) {
      return;
    }
    this.styleKeys.add(key);
    const substituted = this.book?.resources?.substitute(css, view.section.url) ?? css;
    this.appendScopedStyle(substituted, key);
  }

  private appendScopedStyle(css: string, key: string): void {
    if (!this.styleElement) {
      return;
    }
    const sanitized = css
      .replace(/@charset[^;]+;/gi, '')
      .replace(/@import[^;]+;/gi, '')
      .replace(/<\/style/gi, '<\\/style');
    const style = document.createElement('style');
    style.dataset['epubStyleKey'] = key;
    // @layer keeps publisher styles below the reader's own typography rules;
    // @scope prevents the book CSS from leaking into the app shell.
    style.textContent = `@layer epub { @scope (.epub-content) { ${sanitized} } }`;
    this.styleElement.appendChild(style);
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
        const cfi = this.captureCfi();
        if (!cfi) {
          return;
        }
        const progress = this.progressForCfi(cfi);
        this.progressPercent.set(progress);
        if (this.savesEnabled) {
          this.setPendingProgress(cfi, progress);
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

  private async restoreSavedPosition(stored: StoredDocument, token: number): Promise<boolean> {
    const savedCfi = stored.epubCfi;
    if (isValidEpubCfi(savedCfi)) {
      try {
        await this.goToCfi(savedCfi, false);
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
        await this.goToHref(stored.epubHref, false);
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
      if (this.locationsReady && this.book) {
        const target = this.book.locations.cfiFromPercentage(savedProgress);
        if (typeof target === 'string') {
          try {
            await this.goToCfi(target, false);
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

    await this.goToChapter(0, false);
    return false;
  }

  private async goToChapter(index: number, save = true): Promise<void> {
    const view = this.views[clamp(index, 0, this.views.length - 1)];
    if (!view) {
      return;
    }
    await this.ensureChapterRendered(view);
    const range = view.sourceDocument
      ? view.sourceDocument.createRange()
      : null;
    if (range && view.sourceDocument?.body) {
      range.setStart(view.sourceDocument.body, 0);
      range.collapse(true);
    }
    await this.showSourceRange(view, range, save);
    const cfi = range ? this.cfiFromSourceRange(view, range) : null;
    if (cfi) {
      this.applyCfi(cfi, save);
    }
  }

  private async goToCfi(cfi: string, save = true): Promise<void> {
    const book = this.book;
    if (!book) {
      throw new Error('Book is not loaded');
    }

    const parsed = new EpubCFI(cfi);
    const section = book.spine.get(parsed.spinePos);
    if (!section) {
      throw new Error('CFI section not found');
    }

    const view = this.views[this.spineIndex(section)];
    if (!view) {
      throw new Error('CFI chapter not found');
    }
    await this.ensureChapterRendered(view);
    const range = parsed.toRange(view.sourceDocument);
    if (!range) {
      await this.goToChapter(view.index, save);
      return;
    }
    await this.showSourceRange(view, range, save);
    this.applyCfi(cfi, save);
  }

  private async goToHref(href: string, save = true): Promise<void> {
    const view = this.findViewForHref(href);
    if (!view) {
      throw new Error('Chapter not found');
    }
    await this.ensureChapterRendered(view);

    const { fragment } = splitEpubHref(href);
    const sourceDocument = view.sourceDocument;
    if (!sourceDocument?.body) {
      throw new Error('Chapter has no document body');
    }

    let sourceRange: Range | null = null;
    if (fragment) {
      const sourceElement = sourceDocument.getElementById(fragment);
      if (sourceElement) {
        const range = sourceDocument.createRange();
        range.setStart(sourceElement, 0);
        range.collapse(true);
        sourceRange = range;
      }
    }
    if (!sourceRange) {
      const range = sourceDocument.createRange();
      range.setStart(sourceDocument.body, 0);
      range.collapse(true);
      sourceRange = range;
    }

    await this.showSourceRange(view, sourceRange, save);
    const cfi = this.cfiFromSourceRange(view, sourceRange);
    if (cfi) {
      this.applyCfi(cfi, save);
    }
  }

  private async showSourceRange(
    view: ChapterView,
    sourceRange: Range | null,
    save: boolean,
  ): Promise<void> {
    const live = sourceRange ? this.mapSourceRangeToLive(view, sourceRange) : null;

    if (this.isPaginated()) {
      await this.activateChapter(view.index);
      await this.waitForChapterAssets(view);
      if (live) {
        this.setPage(this.pageForLiveNode(view, live.node), false);
      }
      this.activeChapterIndex = view.index;
    } else {
      this.activeChapterIndex = view.index;
      await this.waitForChapterAssets(view);
      if (live) {
        this.scrollToLiveNode(live.node, live.offset);
      }
    }

    if (save && this.savesEnabled) {
      const cfi = sourceRange ? this.cfiFromSourceRange(view, sourceRange) : null;
      if (cfi) {
        this.applyCfi(cfi, true);
      }
    }
  }

  private async activateChapter(index: number): Promise<void> {
    const view = this.views[index];
    if (!view) {
      return;
    }
    await this.ensureChapterRendered(view);
    this.activeChapterIndex = index;

    for (const candidate of this.views) {
      candidate.element.classList.toggle('is-active', candidate.index === index);
    }

    if (!this.isPaginated()) {
      return;
    }

    this.pageCount.set(1);
    this.pageNumber.set(1);
    view.pageCount = 1;
    await this.nextFrame();
    await this.waitForChapterAssets(view);
    this.measurePagination(view);
    this.setPage(0, false);
    this.updateNavigationState();
  }

  private measurePagination(view: ChapterView): void {
    const element = view.element;
    const width = element.clientWidth;
    if (width <= 0) {
      view.pageCount = 1;
      this.pageCount.set(1);
      return;
    }

    element.style.setProperty('--epub-column-width', `${width}px`);
    const styles = getComputedStyle(element);
    const gap = Number.parseFloat(styles.columnGap) || EpubViewerComponent.SIDE_BY_SIDE_GAP;
    const totalWidth = element.scrollWidth;
    const stride = width + gap;
    const pages = Math.max(1, Math.round((totalWidth + gap) / stride));

    view.pageWidth = width;
    view.pageGap = gap;
    view.pageCount = pages;
    this.pageCount.set(pages);
  }

  private setPage(page: number, save: boolean): void {
    const view = this.views[this.activeChapterIndex];
    if (!view || !this.isPaginated()) {
      return;
    }
    const target = clamp(Math.round(page), 0, Math.max(0, view.pageCount - 1));
    const stride = view.pageWidth + view.pageGap;
    view.element.scrollLeft = target * stride;
    this.pageNumber.set(target + 1);
    this.pageCount.set(view.pageCount);
    this.updateNavigationState();
    if (save) {
      this.refreshLocation(this.savesEnabled);
    }
  }

  private async nextPage(): Promise<void> {
    if (!this.isPaginated() || this.restoring) {
      return;
    }
    this.savesEnabled = true;
    const view = this.views[this.activeChapterIndex];
    if (!view) {
      return;
    }

    if (this.pageNumber() < view.pageCount) {
      this.setPage(this.pageNumber(), true);
      return;
    }

    const nextView = this.views[view.index + 1];
    if (!nextView) {
      return;
    }

    await this.activateChapter(nextView.index);
    this.setPage(0, true);
  }

  private async previousPage(): Promise<void> {
    if (!this.isPaginated() || this.restoring) {
      return;
    }
    this.savesEnabled = true;
    const view = this.views[this.activeChapterIndex];
    if (!view) {
      return;
    }

    if (this.pageNumber() > 1) {
      this.setPage(this.pageNumber() - 2, true);
      return;
    }

    const previousView = this.views[view.index - 1];
    if (!previousView) {
      return;
    }

    await this.activateChapter(previousView.index);
    this.setPage(previousView.pageCount - 1, true);
  }

  private scrollByViewport(direction: number): void {
    this.savesEnabled = true;
    this.suppressScrollRefresh = false;
    const scroller = this.scrollerElement;
    if (!scroller) {
      return;
    }
    scroller.scrollBy({ top: direction * scroller.clientHeight * 0.9, behavior: 'auto' });
    this.updateNavigationState();
    window.setTimeout(() => this.refreshLocation(this.savesEnabled), 80);
  }

  private scrollBy(amount: number): void {
    this.suppressScrollRefresh = false;
    this.scrollerElement?.scrollBy({ top: amount, behavior: 'auto' });
    this.updateNavigationState();
  }

  private updateNavigationState(): void {
    if (this.isPaginated()) {
      const view = this.views[this.activeChapterIndex];
      const page = Math.max(0, this.pageNumber() - 1);
      this.previousDisabled.set(!view || (view.index === 0 && page === 0));
      this.nextDisabled.set(
        !view ||
          (view.index === this.views.length - 1 && page >= Math.max(0, view.pageCount - 1)),
      );
      return;
    }

    const scroller = this.scrollerElement;
    if (!scroller) {
      this.previousDisabled.set(true);
      this.nextDisabled.set(false);
      return;
    }
    this.previousDisabled.set(scroller.scrollTop <= 1);
    this.nextDisabled.set(
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
    );
  }

  private refreshLocation(save: boolean): void {
    const cfi = this.captureCfi();
    if (!cfi) {
      this.updateNavigationState();
      return;
    }
    this.applyCfi(cfi, save);
  }

  private applyCfi(cfi: string, save: boolean): void {
    const parsed = new EpubCFI(cfi);
    const section = this.book?.spine.get(parsed.spinePos);
    if (!section) {
      return;
    }
    const view = this.views[this.spineIndex(section)];
    if (!view) {
      return;
    }

    this.activeChapterIndex = view.index;
    this.currentCfi = cfi;
    this.currentChapter.set(view.label);
    this.currentHref.set(view.href);

    const progress = this.progressForCfi(cfi);
    this.progressPercent.set(progress);

    if (save && this.savesEnabled) {
      this.setPendingProgress(cfi, progress);
      this.scheduleProgressSave();
    }
    if (!this.isPaginated()) {
      this.updateVisibleChapterLabel();
    }
    this.updateNavigationState();
  }

  private progressForCfi(cfi: string): number {
    const book = this.book;
    if (this.locationsReady && book) {
      const percentage = book.locations.percentageFromCfi(cfi);
      if (typeof percentage === 'number' && Number.isFinite(percentage)) {
        return clampPercent(percentage * 100);
      }
    }

    const parsed = new EpubCFI(cfi);
    const section = book?.spine.get(parsed.spinePos);
    const index = section ? this.spineIndex(section) : this.activeChapterIndex;
    const view = this.views[index];
    let localFraction = 0;

    if (this.isPaginated() && view) {
      localFraction = view.pageCount > 0 ? (this.pageNumber() - 1) / view.pageCount : 0;
    } else {
      const scroller = this.scrollerElement;
      if (scroller) {
        const range = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        localFraction = scroller.scrollTop / range;
      }
    }

    return clampPercent(((index + localFraction) / Math.max(1, this.views.length)) * 100);
  }

  private setPendingProgress(cfi: string, progress: number): void {
    const document = this.document();
    const parsed = new EpubCFI(cfi);
    const section = this.book?.spine.get(parsed.spinePos);
    const view = section ? this.views[this.spineIndex(section)] : undefined;
    if (!document || !view) {
      return;
    }

    this.pendingProgress = {
      documentId: document.id,
      cfi,
      chapter: view.label,
      href: view.href,
      progress: progress / 100,
    };
  }

  private captureCurrentLocation(): void {
    if (!this.savesEnabled || this.restoring) {
      return;
    }
    if (this.suppressScrollRefresh && this.currentCfi) {
      this.applyCfi(this.currentCfi, true);
      return;
    }
    const cfi = this.captureCfi();
    if (!cfi) {
      return;
    }
    this.applyCfi(cfi, true);
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

  private captureCfi(): string | null {
    if (!this.book || this.views.length === 0) {
      return null;
    }

    const anchor = this.findVisibleAnchor();
    const dominant = this.isPaginated() ? null : this.dominantVisibleChapter();

    if (dominant && (!anchor || anchor.view !== dominant)) {
      // At the end of a chapter/book the target cannot always be flushed to the
      // top. Prefer the chapter that occupies most of the viewport so the saved
      // position, toolbar label and reload target agree.
      return this.chapterStartCfi(dominant);
    }

    if (!anchor) {
      return this.chapterStartCfi(dominant ?? this.views[this.activeChapterIndex]);
    }

    const sourceNode = this.mapLiveNodeToSource(anchor.node, anchor.view);
    if (!sourceNode || !anchor.view.sourceDocument) {
      return this.chapterStartCfi(anchor.view);
    }

    try {
      const range = anchor.view.sourceDocument.createRange();
      const offset =
        sourceNode.nodeType === Node.TEXT_NODE
          ? clamp(anchor.offset, 0, sourceNode.textContent?.length ?? 0)
          : sourceNode.nodeType === Node.ELEMENT_NODE
            ? clamp(anchor.offset, 0, sourceNode.childNodes.length)
            : 0;
      range.setStart(sourceNode, offset);
      range.collapse(true);
      return this.cfiFromSourceRange(anchor.view, range);
    } catch (error) {
      console.warn('Could not create a CFI for the current position:', error);
      return this.chapterStartCfi(anchor.view);
    }
  }

  private findVisibleAnchor(): LiveAnchor | null {
    const root = this.contentElement;
    const scroller = this.scrollerElement;
    if (!root || !scroller) {
      return null;
    }

    const active = this.views[this.activeChapterIndex];
    const reference =
      this.isPaginated() && active ? active.element.getBoundingClientRect() : null;
    const scrollerRect = scroller.getBoundingClientRect();
    const contentRect = root.getBoundingClientRect();

    const x = (reference?.left ?? Math.max(contentRect.left, scrollerRect.left)) + 12;
    const y = (reference?.top ?? scrollerRect.top) + 12;

    const caretDocument = document as Document;
    let node: Node | null = null;
    let offset = 0;

    if (typeof caretDocument.caretRangeFromPoint === 'function') {
      const range = caretDocument.caretRangeFromPoint(x, y);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    } else if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        node = position.offsetNode;
        offset = position.offset;
      }
    }

    if (!node || !root.contains(node)) {
      const element = document.elementFromPoint(x, y);
      node = element && root.contains(element) ? this.firstTextNode(element) : null;
      offset = 0;
    }

    if (!node || !root.contains(node)) {
      node = active?.body ?? null;
      offset = 0;
    }

    if (!node) {
      return null;
    }

    const view = this.findViewForLiveNode(node) ?? active;
    if (!view) {
      return null;
    }
    return { view, node, offset };
  }

  private firstTextNode(element: Element): Node {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let current: Node | null;
    while ((current = walker.nextNode())) {
      if ((current.textContent ?? '').trim()) {
        return current;
      }
    }
    return element;
  }

  private findViewForLiveNode(node: Node): ChapterView | null {
    for (const view of this.views) {
      if (view.body?.contains(node)) {
        return view;
      }
    }
    return null;
  }

  private mapLiveNodeToSource(node: Node, view: ChapterView): Node | null {
    let current: Node | null = node;
    while (current) {
      const source = view.liveToSource.get(current);
      if (source) {
        return source;
      }
      current = current.parentNode;
    }
    return null;
  }

  private mapSourceRangeToLive(
    view: ChapterView,
    range: Range,
  ): { node: Node; offset: number } | null {
    let sourceNode: Node | null = range.startContainer;
    let exact = true;

    while (sourceNode) {
      const live = view.sourceToLive.get(sourceNode);
      if (live && live.isConnected && view.element.contains(live)) {
        let offset = exact ? range.startOffset : 0;
        if (live.nodeType === Node.TEXT_NODE) {
          offset = clamp(offset, 0, live.textContent?.length ?? 0);
        } else if (live.nodeType === Node.ELEMENT_NODE) {
          offset = clamp(offset, 0, live.childNodes.length);
        }
        return { node: live, offset };
      }
      sourceNode = sourceNode.parentNode;
      exact = false;
    }

    return null;
  }

  private cfiFromSourceRange(view: ChapterView, range: Range): string | null {
    const base = view.section.cfiBase;
    if (!base) {
      return null;
    }
    try {
      return new EpubCFI(range, base).toString();
    } catch (error) {
      console.warn('Could not serialise the EPUB location:', error);
      return null;
    }
  }

  private chapterStartCfi(view: ChapterView | undefined): string | null {
    if (!view?.sourceDocument?.body) {
      return null;
    }
    const range = view.sourceDocument.createRange();
    range.setStart(view.sourceDocument.body, 0);
    range.collapse(true);
    return this.cfiFromSourceRange(view, range);
  }

  private scrollToLiveNode(node: Node, _offset: number): void {
    const scroller = this.scrollerElement;
    if (!scroller) {
      return;
    }

    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!element) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const top = elementRect.top - scrollerRect.top + scroller.scrollTop - 16;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    this.updateNavigationState();
  }

  private pageForLiveNode(view: ChapterView, node: Node): number {
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!element || view.pageWidth <= 0) {
      return 0;
    }

    const rootRect = view.element.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const stride = view.pageWidth + view.pageGap;
    const page = Math.round((elementRect.left - rootRect.left) / stride);
    return clamp(page, 0, Math.max(0, view.pageCount - 1));
  }

  private updateNavigationStateAfterReflow(): void {
    this.updateNavigationState();
  }

  private scheduleReflow(cfi: string | null = this.currentCfi ?? this.captureCfi()): void {
    if (this.reflowTimer) {
      clearTimeout(this.reflowTimer);
    }
    this.reflowTimer = setTimeout(() => {
      this.reflowTimer = null;
      void this.applyReflow(cfi);
    }, 120);
  }

  private async applyReflow(cfi: string | null): Promise<void> {
    if (!this.book || !this.views.length) {
      return;
    }

    this.restoring = true;
    try {
      await this.nextFrame();
      if (this.isPaginated()) {
        const index = cfi ? this.sectionIndexForCfi(cfi) : this.activeChapterIndex;
        await this.activateChapter(index);
        if (cfi) {
          await this.positionAtCfiWithoutSaving(cfi);
        } else {
          this.setPage(0, false);
        }
      } else {
        this.resetPagination();
        await this.nextFrame();
        if (cfi) {
          await this.positionAtCfiWithoutSaving(cfi);
        }
      }

      if (cfi) {
        // Keep the target CFI rather than re-reading the viewport top: at the
        // end of a book the target cannot always be scrolled flush to the top,
        // and the viewport may legitimately show the previous chapter's tail.
        this.applyCfi(cfi, false);
        this.suppressScrollRefresh = true;
      }
      this.updateNavigationStateAfterReflow();
    } finally {
      this.restoring = false;
    }
  }

  private async positionAtCfiWithoutSaving(cfi: string): Promise<void> {
    const book = this.book;
    if (!book) {
      return;
    }
    const parsed = new EpubCFI(cfi);
    const section = book.spine.get(parsed.spinePos);
    if (!section) {
      return;
    }
    const view = this.views[this.spineIndex(section)];
    if (!view) {
      return;
    }
    await this.ensureChapterRendered(view);
    const range = parsed.toRange(view.sourceDocument);
    if (range) {
      await this.showSourceRange(view, range, false);
    }
  }

  private sectionIndexForCfi(cfi: string): number {
    try {
      const parsed = new EpubCFI(cfi);
      const section = this.book?.spine.get(parsed.spinePos);
      return section ? this.spineIndex(section) : this.activeChapterIndex;
    } catch {
      return this.activeChapterIndex;
    }
  }

  private resetPagination(): void {
    for (const view of this.views) {
      view.element.style.removeProperty('--epub-column-width');
      view.element.scrollLeft = 0;
    }
    this.pageNumber.set(1);
    this.pageCount.set(1);
  }

  private observeResize(): void {
    this.resizeObserver?.disconnect();
    const scroller = this.scrollerElement;
    if (!scroller || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) {
        clearTimeout(this.resizeTimer);
      }
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        this.scheduleReflow(this.currentCfi ?? this.captureCfi());
      }, 180);
    });
    this.resizeObserver.observe(scroller);
  }

  /**
   * Browser translation rewrites text nodes in place. Recalculate pagination
   * without re-rendering the book markup so translated text is never replaced.
   */
  private observeContentChanges(): void {
    this.contentObserver?.disconnect();
    const content = this.contentElement;
    if (!content || typeof MutationObserver === 'undefined') {
      return;
    }

    this.contentObserver = new MutationObserver(() => {
      if (this.initializing || this.restoring || !this.book) {
        return;
      }
      if (this.resizeTimer) {
        clearTimeout(this.resizeTimer);
      }
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        this.scheduleReflow(this.currentCfi ?? this.captureCfi());
      }, 320);
    });
    this.contentObserver.observe(content, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  private async waitForChapterAssets(view: ChapterView): Promise<void> {
    if (typeof document.fonts?.ready?.then === 'function') {
      await document.fonts.ready.catch(() => undefined);
    }

    const images = Array.from(view.element.querySelectorAll('img'));
    if (images.length === 0) {
      return;
    }

    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            const done = (): void => resolve();
            image.addEventListener('load', done, { once: true });
            image.addEventListener('error', done, { once: true });
            setTimeout(done, 3000);
          }),
      ),
    );
  }

  private findViewForHref(href: string): ChapterView | null {
    const { path } = splitEpubHref(href);
    if (!path) {
      return null;
    }
    const direct = this.views.find((view) => this.normalizeHref(view.href) === path);
    if (direct) {
      return direct;
    }

    const section = this.book?.spine.get(path);
    if (section) {
      return this.views[this.spineIndex(section)] ?? null;
    }
    return null;
  }

  private spineIndex(section: Section): number {
    return this.book?.spine.spineItems.indexOf(section) ?? -1;
  }

  private normalizeHref(href: string | undefined): string {
    return splitEpubHref(href).path;
  }

  private resolveRelativeHref(raw: string, baseHref: string): string | null {
    try {
      const base = `https://epub.local/${baseHref}`;
      const url = new URL(raw, base);
      if (url.origin !== 'https://epub.local') {
        return null;
      }
      const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const fragment = decodeURIComponent(url.hash.replace(/^#/, ''));
      return fragment ? `${path}#${fragment}` : path;
    } catch {
      return null;
    }
  }

  private async openResourceLink(raw: string, baseHref: string): Promise<void> {
    const view = this.findViewForHref(baseHref) ?? this.views[this.activeChapterIndex];
    if (!view) {
      return;
    }
    const path = this.resolveResourcePath(raw, view.section);
    if (!path || !this.book) {
      return;
    }
    try {
      const resource = this.book.resources.get(path);
      const url = resource ? await resource : await this.book.archive?.createUrl(path);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.warn('Could not open an EPUB resource link:', error);
    }
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

  private nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
    this.nextDisabled.set(false);
    this.sidebarOpen.set(false);
    this.sidebarTab.set('contents');
    this.settingsOpen.set(false);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchPerformed.set(false);
    this.searchLoading.set(false);
    this.pageNumber.set(1);
    this.pageCount.set(1);
    this.bookLanguage.set(undefined);
    this.bookDirection.set('ltr');
    this.views = [];
    this.activeChapterIndex = 0;
    this.styleKeys.clear();
    this.locationsReady = false;
    this.locationsPromise = null;
    this.suppressScrollRefresh = false;
    this.currentCfi = null;
    this.scrollerElement?.scrollTo({ top: 0, behavior: 'auto' });
  }

  private destroyReader(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.contentObserver?.disconnect();
    this.contentObserver = null;

    if (this.reflowTimer) {
      clearTimeout(this.reflowTimer);
      this.reflowTimer = null;
    }
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
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

    this.contentElement?.replaceChildren();
    this.styleElement?.replaceChildren();
    this.views = [];
    this.book?.destroy();
    this.book = null;
    this.locationsPromise = null;
    this.locationsReady = false;

    if (this.previousDocumentLang !== null) {
      document.documentElement.lang = this.previousDocumentLang;
      this.previousDocumentLang = null;
    }
  }

  private exitFullscreenIfNeeded(): void {
    const fullscreenElement = document.fullscreenElement;
    const rootElement = this.rootElement;
    if (fullscreenElement && rootElement?.contains(fullscreenElement)) {
      void document.exitFullscreen().catch(() => undefined);
    }
    this.rootElement = null;
    this.scrollerElement = null;
    this.contentElement = null;
    this.styleElement = null;
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
    return element.closest('#reader-sidebar') !== null;
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.closest) {
      return false;
    }
    return (
      element.closest('button, a, input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"]') !==
      null
    );
  }

  private isActiveEntry(entry: FlatTocEntry): boolean {
    return this.activeTocEntry() === entry;
  }

  /**
   * In a continuous flow the CFI is saved from the top edge, but the chapter
   * occupying most of the viewport is the better label for the toolbar. This
   * keeps the header honest at chapter boundaries and at the end of the book,
   * where the target cannot be scrolled flush to the top edge.
   */
  private updateVisibleChapterLabel(): void {
    if (this.isPaginated() || !this.scrollerElement) {
      return;
    }
    const best = this.dominantVisibleChapter();
    if (best) {
      this.currentChapter.set(best.label);
      this.currentHref.set(best.href);
    }
  }

  private dominantVisibleChapter(): ChapterView | null {
    if (this.isPaginated() || !this.scrollerElement) {
      return null;
    }

    const viewport = this.scrollerElement.getBoundingClientRect();
    let best: ChapterView | null = null;
    let bestArea = 0;

    for (const view of this.views) {
      const rect = view.element.getBoundingClientRect();
      const visible = Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top);
      if (visible > bestArea) {
        bestArea = visible;
        best = view;
      }
    }

    return best;
  }

  private createMessage(message: string): HTMLElement {
    const element = document.createElement('p');
    element.className = 'epub-missing';
    element.textContent = message;
    return element;
  }
}
