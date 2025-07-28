import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { PdfService } from '../../services/pdf.service';
import { PdfDocument } from '../../models/pdf.interface';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule, NgxExtendedPdfViewerModule],
  template: `
    <div class="min-h-screen bg-gray-100">
      <div class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center">
              <button 
                (click)="goBack()" 
                class="mr-4 p-2 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
              </button>
              <h1 class="text-lg font-medium text-gray-900 truncate">
                {{ pdfDocument?.name || 'Loading...' }}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <!-- PDF Viewer -->
      <div class="flex-1" *ngIf="pdfSrc && !loading && !error">
        <ngx-extended-pdf-viewer
          [src]="pdfSrc"
          [height]="'calc(100vh - 64px)'"
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
          [showPropertiesButton]="true"
          [zoom]="'auto'"
          [textLayer]="true"
          [showBorders]="false"
          assetsFolder="assets"
          (pdfLoaded)="onPdfLoaded($event)"
          (pdfLoadingFailed)="onPdfLoadingFailed($event)">
        </ngx-extended-pdf-viewer>
      </div>

      <!-- Error State -->
      <div class="flex items-center justify-center h-96" *ngIf="error || (!pdfSrc && !loading)">
        <div class="text-center">
          <div class="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 class="text-xl font-semibold text-gray-900 mb-2">
            {{ error || 'PDF not found' }}
          </h2>
          <p class="text-gray-600 mb-4">
            {{ error ? 'There was an error loading the PDF file.' : 'The requested PDF could not be loaded.' }}
          </p>
          <button 
            (click)="goBack()" 
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div class="flex items-center justify-center h-96" *ngIf="loading">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p class="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    </div>
  `
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  pdfDocument: PdfDocument | null = null;
  pdfSrc: string | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pdfService: PdfService
  ) {}

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

  async deletePdf() {
    if (this.pdfDocument && confirm('Are you sure you want to delete this PDF?')) {
      try {
        await this.pdfService.deletePdf(this.pdfDocument.id);
        console.log('PDF deleted successfully');
        this.goBack();
      } catch (error) {
        console.error('Error deleting PDF:', error);
        alert('Failed to delete PDF. Please try again.');
      }
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  ngOnDestroy() {
    // Clean up blob URL to prevent memory leaks
    if (this.pdfSrc) {
      URL.revokeObjectURL(this.pdfSrc);
    }
  }
} 