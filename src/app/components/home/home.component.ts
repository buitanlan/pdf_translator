import { Component, OnInit } from '@angular/core';

import { Router } from '@angular/router';
import { PdfService } from '../../services/pdf.service';
import { PdfListItem } from '../../models/pdf.interface';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen bg-gray-50 py-4">
      <div class="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-16">
        <!-- Header with Action Buttons -->
        <div class="flex justify-between items-center mb-8">
          <h1 class="text-2xl font-bold text-gray-900">PDF Translator</h1>
          <div class="flex gap-3">
            <label class="cursor-pointer bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md" title="Upload PDF">
              <input type="file" (change)="onFileSelected($event)" accept=".pdf" class="hidden" />
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
              </svg>
            </label>
            @if (pdfs.length > 0) {
              <button 
                (click)="clearAllPdfs()" 
                class="bg-red-600 text-white p-3 rounded-lg hover:bg-red-700 transition-colors shadow-md"
                title="Clear All Books">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                </svg>
              </button>
            }
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-15 gap-6">
          @for (pdf of pdfs; track pdf) {
            <div class="flex flex-col">
              <!-- PDF Thumbnail with Title Overlay -->
              <div class="relative bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow aspect-[3/4]" (click)="openPdf(pdf.id)">
                <div class="w-full h-full flex items-center justify-center">
                  @if (pdf.coverImage) {
                    <img [src]="pdf.coverImage" [alt]="pdf.name" class="w-full h-full object-cover" />
                  }
                  @if (!pdf.coverImage) {
                    <div class="w-full h-full bg-red-600 flex items-center justify-center">
                      <span class="text-white font-bold text-lg">PDF</span>
                    </div>
                  }
                </div>
                <!-- Title Overlay -->
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent text-white p-2.5">
                  <h3 class="text-[10px] font-medium leading-tight truncate drop-shadow-sm" [title]="pdf.name">
                    {{ pdf.name }}
                  </h3>
                </div>
              </div>
              <!-- File Info -->
              <div class="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                <div class="flex items-center">
                  <svg class="w-2.5 h-2.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span>PDF {{ formatFileSize(pdf.size) }}</span>
                </div>
                <button (click)="deletePdf(pdf.id, $event)" class="text-gray-400 hover:text-red-600 transition-colors" title="Delete PDF">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
          }
        </div>

        @if (pdfs.length === 0) {
          <div class="text-center py-12">
            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">No PDFs uploaded</h3>
            <p class="mt-1 text-sm text-gray-500">Get started by uploading your first PDF.</p>
          </div>
        }
      </div>
    </div>
  `
})
export class HomeComponent implements OnInit {
  pdfs: PdfListItem[] = [];

  constructor(
    private pdfService: PdfService,
    private router: Router
  ) {
  }

  async ngOnInit() {
    await this.loadPdfs();
  }

  async loadPdfs() {
    try {
      this.pdfs = await this.pdfService.getAllPdfs();
    } catch (error) {
      console.error('Error loading PDFs:', error);
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validate the PDF file
      if (!this.pdfService.validatePdfFile(file)) {
        alert('Please select a valid PDF file (max 100MB).');
        return;
      }

      try {
        console.log('Uploading PDF:', file.name, 'Size:', file.size);
        const id = await this.pdfService.uploadPdf(file);
        await this.loadPdfs();
        console.log('PDF uploaded successfully with ID:', id);

        // Reset the input
        input.value = '';
      } catch (error) {
        console.error('Error uploading PDF:', error);
        alert('Failed to upload PDF. Please try again.');
      }
    }
  }

  openPdf(id: string) {
    this.router.navigate(['/viewer', id]);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }

  getShortName(name: string): string {
    const nameWithoutExtension = name.replace(/\.pdf$/i, '');
    if (nameWithoutExtension.length > 25) {
      return nameWithoutExtension.substring(0, 25) + '...';
    }
    return nameWithoutExtension;
  }

  async deletePdf(id: string, event: Event) {
    event.stopPropagation(); // Prevent the row click from triggering
    if (confirm('Are you sure you want to delete this PDF?')) {
      try {
        await this.pdfService.deletePdf(id);
        await this.loadPdfs();
        console.log('PDF deleted successfully with ID:', id);
      } catch (error) {
        console.error('Error deleting PDF:', error);
        alert('Failed to delete PDF. Please try again.');
      }
    }
  }

  async clearAllPdfs() {
    if (confirm(`Are you sure you want to delete all ${this.pdfs.length} PDFs? This action cannot be undone.`)) {
      try {
        // Delete all PDFs one by one
        for (const pdf of this.pdfs) {
          await this.pdfService.deletePdf(pdf.id);
        }
        await this.loadPdfs();
        console.log('All PDFs deleted successfully');
      } catch (error) {
        console.error('Error deleting all PDFs:', error);
        alert('Failed to delete some PDFs. Please try again.');
      }
    }
  }
}
