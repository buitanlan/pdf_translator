import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  NgxExtendedPdfViewerModule,
  PdfLoadedEvent,
  PdfSidebarView,
} from 'ngx-extended-pdf-viewer';
import { PdfService } from '../../services/pdf.service';
import { PdfDocument } from '../../models/pdf.interface';
import { ThemeService } from '../../services/theme.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-pdf-viewer',
  imports: [NgxExtendedPdfViewerModule, ThemeToggleComponent],
  host: {
    '(window:beforeunload)': 'onBeforeUnload()',
  },
  template: `
    <div class="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header class="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-8">
            <div class="flex items-center min-w-0">
              <button
                type="button"
                (click)="goBack()"
                class="mr-4 p-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Go back to PDF list"
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 class="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {{ documentName() }}
              </h1>
            </div>
            <app-theme-toggle [compact]="true" />
          </div>
        </div>
      </header>

      <!-- PDF Viewer -->
      @if (pdfSrc() && !loading() && !error()) {
        <main class="flex-1">
          <ngx-extended-pdf-viewer
            [src]="pdfSrc()!"
            [height]="'calc(100vh - 96px)'"
            [showToolbar]="true"
            [theme]="pdfViewerTheme()"
            [showSidebarButton]="true"
            [activeSidebarView]="sidebarView.OUTLINE"
            [showFindButton]="true"
            [showPagingButtons]="true"
            [showZoomButtons]="true"
            [showPresentationModeButton]="true"
            [showOpenFileButton]="false"
            [showPrintButton]="true"
            [showDownloadButton]="true"
            [showSecondaryToolbarButton]="true"
            [showRotateButton]="true"
            [showHandToolButton]="true"
            [handTool]="false"
            [showPropertiesButton]="true"
            [zoom]="'auto'"
            [textLayer]="true"
            [showBorders]="false"
            (pdfLoaded)="onPdfLoaded($event)"
            (pdfLoadingFailed)="onPdfLoadingFailed($event)"
            (pageChange)="onPageChange($event)"
            [page]="currentPage()"
          />
        </main>
      }

      <!-- Error State -->
      @if (error() || (!pdfSrc() && !loading())) {
        <main class="flex items-center justify-center h-96" role="alert">
          <div class="text-center">
            <div class="text-red-500 text-6xl mb-4" aria-hidden="true">⚠️</div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {{ error() || 'PDF not found' }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{
                error()
                  ? 'There was an error loading the PDF file.'
                  : 'The requested PDF could not be loaded.'
              }}
            </p>
            <button
              type="button"
              (click)="goBack()"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              Go Back
            </button>
          </div>
        </main>
      }

      <!-- Loading State -->
      @if (loading()) {
        <main class="flex items-center justify-center h-96" role="status" aria-live="polite">
          <div class="text-center">
            <div
              class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"
              aria-hidden="true"
            ></div>
            <p class="text-gray-600 dark:text-gray-400">Loading PDF...</p>
          </div>
        </main>
      }
    </div>
  `,
})
export class PdfViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pdfService = inject(PdfService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly themeService = inject(ThemeService);

  // State signals
  readonly pdfDocument = signal<PdfDocument | null>(null);
  readonly pdfSrc = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currentPage = signal(1);

  // Computed signals
  readonly documentName = computed(() => this.pdfDocument()?.name ?? 'Loading...');
  readonly sidebarView = PdfSidebarView;
  readonly pdfViewerTheme = computed(() => (this.themeService.isDark() ? 'dark' : 'light'));

  constructor() {
    // Clean up blob URL when component is destroyed
    this.destroyRef.onDestroy(() => {
      void this.saveCurrentPage();
      const src = this.pdfSrc();
      if (src) {
        URL.revokeObjectURL(src);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadPdf(id);
    } else {
      this.loading.set(false);
      this.error.set('No PDF ID provided');
    }
  }

  private async loadPdf(id: string): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const pdfDoc = await this.pdfService.getPdfById(id);

      if (pdfDoc) {
        // Clean up previous blob URL if it exists
        const previousSrc = this.pdfSrc();
        if (previousSrc) {
          URL.revokeObjectURL(previousSrc);
        }

        this.pdfDocument.set(pdfDoc);
        this.pdfSrc.set(this.pdfService.createBlobUrl(pdfDoc.file));

        // Load saved current page
        const savedPage = await this.pdfService.getCurrentPage(id);
        if (savedPage) {
          this.currentPage.set(savedPage);
        }

        console.log('PDF loaded successfully:', pdfDoc.name);
      } else {
        this.error.set('PDF not found in database');
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      this.error.set('Failed to load PDF from database');
    } finally {
      this.loading.set(false);
    }
  }

  onPdfLoaded(event: PdfLoadedEvent): void {
    console.log('PDF loaded in viewer:', event);
  }

  onPdfLoadingFailed(event: Error): void {
    console.error('PDF loading failed:', event.message);
    this.error.set('Failed to render PDF in viewer');
  }

  onPageChange(page: number | undefined): void {
    if (page) {
      this.currentPage.set(page);
      void this.saveCurrentPage();
    }
  }

  onBeforeUnload(): void {
    void this.saveCurrentPage();
  }

  private async saveCurrentPage(): Promise<void> {
    const doc = this.pdfDocument();
    const page = this.currentPage();

    if (doc && page > 0) {
      try {
        await this.pdfService.saveCurrentPage(doc.id, page);
        console.log('Current page saved:', page);
      } catch (err) {
        console.error('Error saving current page:', err);
      }
    }
  }

  async goBack(): Promise<void> {
    await this.saveCurrentPage();
    void this.router.navigate(['/']);
  }
}
