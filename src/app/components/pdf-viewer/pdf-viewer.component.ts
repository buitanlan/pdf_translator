import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  NgxExtendedPdfViewerModule,
  NgxExtendedPdfViewerService,
  PdfSidebarView,
  type ResponsiveVisibility,
} from 'ngx-extended-pdf-viewer';
import { StoredDocument } from '../../models/document.interface';
import { DocumentService } from '../../services/document.service';
import { ThemeService } from '../../services/theme.service';
import { formatFileSize } from '../../utils/reader.utils';
import { ReaderHeaderComponent } from '../shared/reader-header.component';
import { StatusPanelComponent } from '../shared/status-panel.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

/**
 * PDF reader. Rendering and the complete toolbar/sidebar behaviour are provided
 * by ngx-extended-pdf-viewer; this component only contributes the shared app
 * chrome, progress persistence and an offline cover thumbnail.
 */
@Component({
  selector: 'app-pdf-viewer',
  imports: [
    NgxExtendedPdfViewerModule,
    ReaderHeaderComponent,
    StatusPanelComponent,
    ThemeToggleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:beforeunload)': 'onBeforeUnload()',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
  template: `
    <div class="flex h-dvh flex-col overflow-hidden bg-[#eef0f3] dark:bg-[#0a0e15]">
      <app-reader-header
        [title]="documentName()"
        [subtitle]="subtitle()"
        format="PDF"
        backLabel="Back to document library"
        (back)="goBack()"
      >
        <app-theme-toggle [compact]="true" />
      </app-reader-header>

      <main class="relative min-h-0 flex-1">
        @if (pdfSrc(); as src) {
          <ngx-extended-pdf-viewer
            class="block h-full w-full"
            [src]="src"
            [height]="'100%'"
            [theme]="viewerTheme()"
            [backgroundColor]="viewerBackground()"
            [showToolbar]="true"
            [showSidebarButton]="true"
            [(sidebarVisible)]="sidebarVisible"
            [activeSidebarView]="sidebarView.OUTLINE"
            [showFindButton]="true"
            [showPagingButtons]="alwaysVisible"
            [showFirstAndLastPageButtons]="fromSmall"
            [showPreviousAndNextPageButtons]="alwaysVisible"
            [showPageNumber]="alwaysVisible"
            [showZoomButtons]="fromSmall"
            [showZoomDropdown]="fromSmall"
            [showPresentationModeButton]="fromMedium"
            [showRotateButton]="fromMedium"
            [showHandToolButton]="fromMedium"
            [handTool]="false"
            [showPrintButton]="fromMedium"
            [showDownloadButton]="fromMedium"
            [showSecondaryToolbarButton]="true"
            [showPropertiesButton]="secondaryMenuOnly"
            [showOpenFileButton]="false"
            [showEditorButtons]="false"
            [showBorders]="false"
            [textLayer]="true"
            [zoom]="'auto'"
            [filenameForDownload]="downloadFileName()"
            [page]="currentPage()"
            (pageChange)="onPageChange($event)"
            (pdfLoaded)="onPdfLoaded()"
            (pdfLoadingFailed)="onPdfLoadingFailed($event)"
          />
        }

        @if (loading()) {
          <div
            class="absolute inset-0 z-10 flex items-center justify-center bg-[#eef0f3]/95 dark:bg-[#0a0e15]/95"
            role="status"
            aria-live="polite"
          >
            <app-status-panel
              variant="loading"
              title="Opening PDF…"
              message="Loading the document from this device."
            />
          </div>
        }

        @if (error(); as errorMessage) {
          <div
            class="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#eef0f3] p-4 dark:bg-[#0a0e15]"
            role="alert"
          >
            <div
              class="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
            >
              <app-status-panel
                variant="error"
                icon="alert"
                title="Could not open this PDF"
                [message]="errorMessage"
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
      </main>
    </div>
  `,
})
export class PdfViewerComponent implements AfterViewInit {
  private static readonly SAVE_DELAY_MS = 600;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documentService = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly themeService = inject(ThemeService);
  private readonly pdfService = inject(NgxExtendedPdfViewerService);

  readonly pdfDocument = signal<StoredDocument | null>(null);
  readonly pdfSrc = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly sidebarVisible = signal(false);
  readonly sidebarView = PdfSidebarView;

  // Responsive toolbar composition: page navigation and search stay available on
  // phones, while zoom/rotate/print/download move up at larger breakpoints.
  readonly alwaysVisible: ResponsiveVisibility = 'always-visible';
  readonly fromSmall: ResponsiveVisibility = 'sm';
  readonly fromMedium: ResponsiveVisibility = 'md';
  readonly secondaryMenuOnly: ResponsiveVisibility = 'always-in-secondary-menu';

  readonly documentName = computed(() => {
    const document = this.pdfDocument();
    return document ? this.documentService.getDisplayName(document) : 'Opening PDF…';
  });

  readonly subtitle = computed(() => {
    const document = this.pdfDocument();
    if (!document) {
      return undefined;
    }
    return `${formatFileSize(document.size)} · stored on this device`;
  });

  readonly downloadFileName = computed(() => this.pdfDocument()?.name ?? 'document.pdf');
  readonly viewerTheme = computed(() => (this.themeService.isDark() ? 'dark' : 'light'));
  readonly viewerBackground = computed(() =>
    this.themeService.isDark() ? '#0b0f16' : '#e9ecf1',
  );

  private currentDocumentId: string | null = null;
  private loadToken = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTracking = false;
  private coverCaptureStarted = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.loadToken += 1;
      this.clearSaveTimer();
      void this.saveCurrentPageNow();
      this.revokePdfUrl();
    });
  }

  ngAfterViewInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        void this.loadPdf(id);
      } else {
        this.loading.set(false);
        this.error.set('No document ID was provided.');
      }
    });
  }

  onPageChange(page: number | undefined): void {
    if (!page || page < 1) {
      return;
    }
    this.currentPage.set(page);
    if (this.progressTracking) {
      this.schedulePageSave();
    }
  }

  onPdfLoaded(): void {
    this.progressTracking = true;
    void this.captureCover();
  }

  onPdfLoadingFailed(error: Error): void {
    console.error('PDF loading failed:', error);
    this.progressTracking = false;
    this.error.set(
      'The file could not be rendered. It may be corrupt, password-protected, or use an unsupported PDF feature.',
    );
  }

  onBeforeUnload(): void {
    void this.saveCurrentPageNow();
  }

  onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void this.saveCurrentPageNow();
    }
  }

  async goBack(): Promise<void> {
    this.clearSaveTimer();
    await this.saveCurrentPageNow();
    await this.router.navigate(['/']);
  }

  retry(): void {
    if (this.currentDocumentId) {
      void this.loadPdf(this.currentDocumentId);
    }
  }

  private async loadPdf(id: string): Promise<void> {
    const token = ++this.loadToken;
    const previousId = this.currentDocumentId;

    this.clearSaveTimer();
    if (previousId && previousId !== id) {
      await this.savePageFor(previousId, this.currentPage());
    }

    this.progressTracking = false;
    this.coverCaptureStarted = false;
    this.sidebarVisible.set(false);
    this.revokePdfUrl();
    this.pdfSrc.set(null);
    this.pdfDocument.set(null);
    this.loading.set(true);
    this.error.set(null);
    this.currentDocumentId = id;

    try {
      const document = await this.documentService.getDocumentById(id);
      if (token !== this.loadToken) {
        return;
      }
      if (!document || document.kind !== 'pdf') {
        throw new Error('This PDF was not found in the local library.');
      }

      const savedPage = await this.documentService.getCurrentPage(id);
      if (token !== this.loadToken) {
        return;
      }

      const src = this.documentService.createBlobUrl(document);
      if (!src) {
        throw new Error('The PDF data could not be opened.');
      }

      this.pdfDocument.set(document);
      this.currentPage.set(savedPage && savedPage > 0 ? savedPage : 1);
      this.pdfSrc.set(src);
      this.loading.set(false);
    } catch (error) {
      console.error('Error loading PDF:', error);
      if (token === this.loadToken) {
        this.loading.set(false);
        this.error.set(
          error instanceof Error
            ? error.message
            : 'The PDF could not be loaded from this device.',
        );
      }
    }
  }

  private schedulePageSave(): void {
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveCurrentPageNow();
    }, PdfViewerComponent.SAVE_DELAY_MS);
  }

  private clearSaveTimer(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private async saveCurrentPageNow(): Promise<void> {
    const document = this.pdfDocument();
    if (!document) {
      return;
    }
    await this.savePageFor(document.id, this.currentPage());
  }

  private async savePageFor(documentId: string, page: number): Promise<void> {
    if (!page || page < 1) {
      return;
    }
    try {
      await this.documentService.saveCurrentPage(documentId, page);
    } catch (error) {
      console.error('Could not save the current PDF page:', error);
    }
  }

  private async captureCover(): Promise<void> {
    if (this.coverCaptureStarted) {
      return;
    }

    const document = this.pdfDocument();
    if (!document || document.coverGenerated) {
      return;
    }

    this.coverCaptureStarted = true;
    const documentId = document.id;

    try {
      // Render the first page through the already-loaded PDF.js instance so
      // thumbnails work offline and never require a CDN.
      const canvas = await this.pdfService.getPageAsCanvas(1, { width: 400 });
      if (!canvas || this.pdfDocument()?.id !== documentId) {
        return;
      }

      const coverImage = canvas.toDataURL('image/jpeg', 0.82);
      await this.documentService.saveCover(documentId, coverImage);

      if (this.pdfDocument()?.id === documentId) {
        this.pdfDocument.update((current) =>
          current ? { ...current, coverImage, coverGenerated: true } : current,
        );
      }
    } catch (error) {
      console.warn('Could not render a PDF cover thumbnail:', error);
    }
  }

  private revokePdfUrl(): void {
    const src = this.pdfSrc();
    if (src) {
      URL.revokeObjectURL(src);
      this.pdfSrc.set(null);
    }
  }
}
