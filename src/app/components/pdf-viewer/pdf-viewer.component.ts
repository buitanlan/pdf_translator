import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { PdfService } from '../../services/pdf.service';
import { IndexedDbService } from '../../services/indexeddb.service';
import { PdfDocument } from '../../models/pdf.interface';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [NgxExtendedPdfViewerModule],
  template: `
    <div class="min-h-screen bg-gray-100">
      <div class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-8">
            <div class="flex items-center">
              <button (click)="goBack()" class="mr-4 p-1 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
              </button>
              <h1 class="text-xs sm:text-sm font-medium text-gray-900 truncate">
                {{ pdfDocument?.name || 'Loading...' }}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <!-- PDF Viewer -->
      @if (pdfSrc && !loading && !error) {
        <div class="flex-1">
          <ngx-extended-pdf-viewer
            [src]="pdfSrc"
            [height]="'calc(100vh - 96px)'"
            [showToolbar]="true"
            [showSidebarButton]="true"
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
            [page]="currentPage"
          >
          </ngx-extended-pdf-viewer>
        </div>
      }

      <!-- Error State -->
      @if (error || (!pdfSrc && !loading)) {
        <div class="flex items-center justify-center h-96">
          <div class="text-center">
            <div class="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              {{ error || 'PDF not found' }}
            </h2>
            <p class="text-gray-600 mb-4">
              {{ error ? 'There was an error loading the PDF file.' : 'The requested PDF could not be loaded.' }}
            </p>
            <button (click)="goBack()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">Go Back</button>
          </div>
        </div>
      }

      <!-- Loading State -->
      @if (loading) {
        <div class="flex items-center justify-center h-96">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p class="text-gray-600">Loading PDF...</p>
          </div>
        </div>
      }
    </div>
  `
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  pdfDocument: PdfDocument | null = null;
  pdfSrc: string | null = null;
  loading = true;
  error: string | null = null;
  currentPage = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pdfService: PdfService,
    private indexedDbService: IndexedDbService
  ) {
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadPdf(id);
    } else {
      this.loading = false;
      this.error = 'No PDF ID provided';
    }
  }

  async loadPdf(id: string) {
    try {
      this.loading = true;
      this.error = null;

      this.pdfDocument = await this.pdfService.getPdfById(id);

      if (this.pdfDocument) {
        // Clean up previous blob URL if it exists
        if (this.pdfSrc) {
          URL.revokeObjectURL(this.pdfSrc);
        }

        this.pdfSrc = this.pdfService.createBlobUrl(this.pdfDocument.file);

        // Load saved current page
        const savedPage = await this.indexedDbService.getCurrentPage(id);
        if (savedPage) {
          this.currentPage = savedPage;
        }

        console.log('PDF loaded successfully:', this.pdfDocument.name);
      } else {
        this.error = 'PDF not found in database';
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      this.error = 'Failed to load PDF from database';
    } finally {
      this.loading = false;
    }
  }

  onPdfLoaded(event: any) {
    console.log('PDF loaded in viewer:', event);
  }

  onPdfLoadingFailed(event: any) {
    console.error('PDF loading failed:', event);
    this.error = 'Failed to render PDF in viewer';
  }

  onPageChange(event: any) {
    this.currentPage = event;
    this.saveCurrentPage();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    this.saveCurrentPage();
  }

  private async saveCurrentPage() {
    if (this.pdfDocument && this.currentPage > 0) {
      try {
        await this.indexedDbService.saveCurrentPage(this.pdfDocument.id, this.currentPage);
        console.log('Current page saved:', this.currentPage);
      } catch (error) {
        console.error('Error saving current page:', error);
      }
    }
  }



  async goBack() {
    await this.saveCurrentPage();
    this.router.navigate(['/']);
  }


  ngOnDestroy() {
    // Save current page before destroying component
    this.saveCurrentPage();

    // Clean up blob URL to prevent memory leaks
    if (this.pdfSrc) {
      URL.revokeObjectURL(this.pdfSrc);
    }
  }
}
