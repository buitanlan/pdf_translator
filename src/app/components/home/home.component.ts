import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { PdfService } from '../../services/pdf.service';
import { PdfListItem } from '../../models/pdf.interface';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(dragover)': 'onGlobalDragOver($event)',
    '(dragenter)': 'onGlobalDragEnter($event)',
    '(dragleave)': 'onGlobalDragLeave($event)',
    '(drop)': 'onGlobalDrop($event)',
  },
  template: `
    <div class="min-h-screen bg-gray-50 py-4 relative">
      <!-- Drag Overlay -->
      @if (isDragOver()) {
        <div
          class="fixed inset-0 bg-blue-500 bg-opacity-20 border-4 border-dashed border-blue-500 z-50 flex items-center justify-center"
          role="region"
          aria-label="Drop zone active"
        >
          <div class="bg-white rounded-lg p-8 text-center shadow-xl">
            <svg
              class="mx-auto h-16 w-16 text-blue-500 mb-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                clip-rule="evenodd"
              />
            </svg>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Drop PDF files here</h3>
            <p class="text-gray-600">Release to upload your PDF files</p>
          </div>
        </div>
      }

      <div class="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-16">
        <!-- Header with Action Buttons -->
        <header class="flex justify-between items-center mb-8">
          <h1 class="text-2xl font-bold text-gray-900">PDF Translator</h1>
          <div class="flex gap-3" role="toolbar" aria-label="PDF actions">
            <!-- Upload Progress Bar -->
            @if (isUploading() && totalFiles() > 1) {
              <div
                class="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
                role="status"
                aria-live="polite"
              >
                <span class="text-sm text-blue-700 font-medium">
                  Uploading {{ uploadedFiles() }}/{{ totalFiles() }}
                </span>
                <div
                  class="w-32 bg-blue-200 rounded-full h-2"
                  role="progressbar"
                  [attr.aria-valuenow]="uploadProgress()"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  [attr.aria-label]="'Upload progress: ' + uploadProgressText()"
                >
                  <div
                    class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    [style.width.%]="uploadProgress()"
                  ></div>
                </div>
                <span class="text-sm text-blue-700 font-medium">{{ uploadProgressText() }}</span>
              </div>
            }

            @if (pdfs().length > 0) {
              <button
                type="button"
                (click)="clearAllPdfs()"
                class="bg-red-600 text-white p-3 rounded-lg hover:bg-red-700 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Clear all PDFs"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fill-rule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            }

            <label
              class="cursor-pointer bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2"
              [class.opacity-50]="isUploading()"
              [class.cursor-not-allowed]="isUploading()"
            >
              <span class="sr-only">{{
                isUploading() ? 'Uploading files...' : 'Upload PDF files'
              }}</span>
              <input
                type="file"
                (change)="onFileSelected($event)"
                accept=".pdf"
                multiple
                class="sr-only"
                [disabled]="isUploading()"
                aria-label="Select PDF files to upload"
              />
              @if (isUploading()) {
                <svg
                  class="w-5 h-5 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              } @else {
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fill-rule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              }
            </label>
          </div>
        </header>

        <!-- PDF Grid with Drag and Drop Reordering -->
        <main>
          @if (pdfs().length > 0) {
            <ul
              class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-15 gap-6 list-none p-0 m-0"
              role="list"
              aria-label="PDF documents"
            >
              @for (pdf of pdfs(); track pdf.id; let i = $index) {
                <li
                  class="flex flex-col relative group transition-transform"
                  [class.opacity-50]="draggedIndex() === i"
                  [class.scale-105]="draggedIndex() === i"
                  [class.z-10]="draggedIndex() === i"
                  draggable="true"
                  (dragstart)="onItemDragStart($event, i)"
                  (dragend)="onItemDragEnd()"
                  (dragover)="onItemDragOver($event, i)"
                  (dragenter)="onItemDragEnter($event, i)"
                  (dragleave)="onItemDragLeave($event, i)"
                  (drop)="onItemDrop($event, i)"
                  [attr.aria-label]="pdf.name + ', ' + formatFileSize(pdf.size)"
                >
                  <!-- Drag Handle -->
                  <div
                    class="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  >
                    <div class="bg-black bg-opacity-50 text-white p-1 rounded cursor-move">
                      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          d="M7 2a2 2 0 011 2v12a2 2 0 11-2 0V4a2 2 0 011-2zM11 2a2 2 0 011 2v12a2 2 0 11-2 0V4a2 2 0 011-2z"
                        />
                      </svg>
                    </div>
                  </div>

                  <!-- PDF Thumbnail with Title Overlay -->
                  <button
                    type="button"
                    class="relative bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 aspect-[3/4] w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    [class.shadow-xl]="draggedIndex() === i"
                    [class.ring-2]="draggedIndex() === i"
                    [class.ring-blue-500]="draggedIndex() === i"
                    (click)="openPdf(pdf.id)"
                    [attr.aria-label]="'Open ' + pdf.name"
                  >
                    <div class="w-full h-full flex items-center justify-center">
                      @if (pdf.coverImage) {
                        <img
                          [src]="pdf.coverImage"
                          [alt]="'Cover of ' + pdf.name"
                          class="w-full h-full object-cover"
                        />
                      } @else {
                        <div class="w-full h-full bg-red-600 flex items-center justify-center">
                          <span class="text-white font-bold text-lg" aria-hidden="true">PDF</span>
                        </div>
                      }
                    </div>
                    <!-- Title Overlay -->
                    <div
                      class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent text-white p-2.5"
                    >
                      <h2
                        class="text-[10px] font-medium leading-tight truncate drop-shadow-sm"
                        [title]="pdf.name"
                      >
                        {{ pdf.name }}
                      </h2>
                    </div>
                  </button>
                  <!-- File Info -->
                  <div class="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                    <div class="flex items-center">
                      <svg
                        class="w-2.5 h-2.5 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      <span>PDF {{ formatFileSize(pdf.size) }}</span>
                    </div>
                    <button
                      type="button"
                      (click)="deletePdf(pdf.id, $event)"
                      class="text-gray-400 hover:text-red-600 transition-colors focus:outline-none focus:text-red-600"
                      [attr.aria-label]="'Delete ' + pdf.name"
                    >
                      <svg
                        class="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <div class="text-center py-12" role="status">
              <svg
                class="mx-auto h-12 w-12 text-gray-400"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <h2 class="mt-2 text-sm font-medium text-gray-900">No PDFs uploaded</h2>
              <p class="mt-1 text-sm text-gray-500">
                Get started by uploading your first PDF. You can select multiple files at once!
              </p>
              <p class="mt-1 text-xs text-gray-400">
                Drag and drop PDF files here or click the upload button above.
              </p>
            </div>
          }
        </main>
      </div>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  private readonly pdfService = inject(PdfService);
  private readonly router = inject(Router);

  // State signals
  readonly pdfs = signal<PdfListItem[]>([]);
  readonly draggedIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);
  readonly isDragOver = signal(false);
  readonly isUploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly totalFiles = signal(0);
  readonly uploadedFiles = signal(0);

  // Computed signals
  readonly uploadProgressText = computed(() => `${this.uploadProgress().toFixed(0)}%`);

  async ngOnInit(): Promise<void> {
    await this.loadPdfs();
  }

  // Global drag and drop handlers (bound via host object)
  onGlobalDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer?.types.includes('Files')) {
      event.dataTransfer.dropEffect = 'copy';
      this.isDragOver.set(true);
    }
  }

  onGlobalDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer?.types.includes('Files')) {
      this.isDragOver.set(true);
    }
  }

  onGlobalDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const currentTarget = event.currentTarget as Element | null;
    if (!currentTarget?.contains(event.relatedTarget as Node)) {
      this.isDragOver.set(false);
    }
  }

  onGlobalDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files);
      void this.uploadMultipleFiles(files);
    }
  }

  // Item reordering drag and drop handlers
  onItemDragStart(event: DragEvent, index: number): void {
    this.draggedIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onItemDragEnd(): void {
    this.draggedIndex.set(null);
    this.dragOverIndex.set(null);
  }

  onItemDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.draggedIndex() !== null && this.draggedIndex() !== index && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onItemDragEnter(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.draggedIndex() !== null && this.draggedIndex() !== index) {
      this.dragOverIndex.set(index);
    }
  }

  onItemDragLeave(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragOverIndex() === index) {
      this.dragOverIndex.set(null);
    }
  }

  onItemDrop(event: DragEvent, dropIndex: number): void {
    event.preventDefault();
    event.stopPropagation();

    const currentDraggedIndex = this.draggedIndex();
    if (currentDraggedIndex !== null && currentDraggedIndex !== dropIndex) {
      this.reorderPdfs(currentDraggedIndex, dropIndex);
    }

    this.draggedIndex.set(null);
    this.dragOverIndex.set(null);
  }

  private reorderPdfs(fromIndex: number, toIndex: number): void {
    this.pdfs.update((currentPdfs) => {
      const reordered = [...currentPdfs];
      const [movedItem] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, movedItem);
      return reordered;
    });

    this.savePdfOrder();
  }

  private savePdfOrder(): void {
    try {
      const pdfOrder = this.pdfs().map((pdf) => pdf.id);
      localStorage.setItem('pdfOrder', JSON.stringify(pdfOrder));
    } catch (error) {
      console.error('Error saving PDF order:', error);
    }
  }

  private loadPdfOrder(): void {
    try {
      const savedOrder = localStorage.getItem('pdfOrder');
      if (savedOrder) {
        const orderIds: string[] = JSON.parse(savedOrder);

        this.pdfs.update((currentPdfs) => {
          const orderedPdfs: PdfListItem[] = [];
          const unorderedPdfs: PdfListItem[] = [];

          currentPdfs.forEach((pdf) => {
            const orderIndex = orderIds.indexOf(pdf.id);
            if (orderIndex !== -1) {
              orderedPdfs[orderIndex] = pdf;
            } else {
              unorderedPdfs.push(pdf);
            }
          });

          return [...orderedPdfs.filter(Boolean), ...unorderedPdfs];
        });
      }
    } catch (error) {
      console.error('Error loading PDF order:', error);
    }
  }

  private async uploadFile(file: File): Promise<void> {
    if (!this.pdfService.validatePdfFile(file)) {
      alert(`Please select a valid PDF file (max 100MB): ${file.name}`);
      return;
    }

    try {
      console.log('Uploading PDF:', file.name, 'Size:', file.size);
      const id = await this.pdfService.uploadPdf(file);
      await this.loadPdfs();
      this.loadPdfOrder();
      console.log('PDF uploaded successfully with ID:', id);
    } catch (error) {
      console.error('Error uploading PDF:', error);
      alert(`Failed to upload PDF: ${file.name}. Please try again.`);
    }
  }

  private async loadPdfs(): Promise<void> {
    try {
      const loadedPdfs = await this.pdfService.getAllPdfs();
      this.pdfs.set(loadedPdfs);
      this.loadPdfOrder();
    } catch (error) {
      console.error('Error loading PDFs:', error);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      await this.uploadMultipleFiles(files);
      input.value = '';
    }
  }

  private async uploadMultipleFiles(files: File[]): Promise<void> {
    const validFiles = files.filter((file) => this.pdfService.validatePdfFile(file));
    const invalidFiles = files.filter((file) => !this.pdfService.validatePdfFile(file));

    if (invalidFiles.length > 0) {
      const invalidFileNames = invalidFiles.map((f) => f.name).join(', ');
      alert(`The following files are not valid PDFs or exceed 100MB: ${invalidFileNames}`);
    }

    if (validFiles.length === 0) {
      return;
    }

    if (validFiles.length === 1) {
      await this.uploadFile(validFiles[0]);
      return;
    }

    console.log(`Starting batch upload of ${validFiles.length} PDFs`);
    this.isUploading.set(true);
    this.totalFiles.set(validFiles.length);
    this.uploadedFiles.set(0);
    this.uploadProgress.set(0);

    const uploadPromises = validFiles.map(async (file, index) => {
      try {
        console.log(
          `Uploading PDF ${index + 1}/${validFiles.length}:`,
          file.name,
          'Size:',
          file.size,
        );
        const id = await this.pdfService.uploadPdf(file);
        console.log(`PDF ${index + 1} uploaded successfully with ID:`, id);

        this.uploadedFiles.update((count) => count + 1);
        this.uploadProgress.set((this.uploadedFiles() / this.totalFiles()) * 100);

        return { success: true, file: file.name, id };
      } catch (error) {
        console.error(`Error uploading PDF ${index + 1}:`, error);

        this.uploadedFiles.update((count) => count + 1);
        this.uploadProgress.set((this.uploadedFiles() / this.totalFiles()) * 100);

        return { success: false, file: file.name, error };
      }
    });

    try {
      const results = await Promise.all(uploadPromises);
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length > 0) {
        await this.loadPdfs();
        this.loadPdfOrder();
        console.log(
          `Batch upload completed: ${successful.length} successful, ${failed.length} failed`,
        );
      }

      if (failed.length > 0) {
        const failedFileNames = failed.map((f) => f.file).join(', ');
        alert(
          `Failed to upload some files: ${failedFileNames}. Please try uploading them individually.`,
        );
      }
    } catch (error) {
      console.error('Error during batch upload:', error);
      alert('An error occurred during batch upload. Please try again.');
    } finally {
      this.isUploading.set(false);
      this.uploadProgress.set(0);
      this.totalFiles.set(0);
      this.uploadedFiles.set(0);
    }
  }

  openPdf(id: string): void {
    void this.router.navigate(['/viewer', id]);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async deletePdf(id: string, event: Event): Promise<void> {
    event.stopPropagation();
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

  async clearAllPdfs(): Promise<void> {
    const pdfCount = this.pdfs().length;
    if (
      confirm(`Are you sure you want to delete all ${pdfCount} PDFs? This action cannot be undone.`)
    ) {
      try {
        for (const pdf of this.pdfs()) {
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
