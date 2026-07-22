import { effect, inject, Injectable, signal } from '@angular/core';
import { IndexedDbService } from './indexeddb.service';
import { PdfDocument, PdfListItem } from '../models/pdf.interface';

// PDF.js types
interface PdfJsDocument {
  getPage(pageNumber: number): Promise<PdfJsPage>;
}

interface PdfJsPage {
  getViewport(options: { scale: number }): PdfJsViewport;
  render(options: { canvasContext: CanvasRenderingContext2D | null; viewport: PdfJsViewport }): {
    promise: Promise<void>;
  };
}

interface PdfJsViewport {
  width: number;
  height: number;
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

interface MutationOptions {
  refresh?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  private readonly indexedDbService = inject(IndexedDbService);

  private readonly orderedPdfsState = signal<PdfListItem[]>([]);
  readonly pdfs = this.orderedPdfsState.asReadonly();
  readonly loading = this.indexedDbService.loading;

  constructor() {
    effect(() => {
      const items = this.indexedDbService.pdfs();
      this.orderedPdfsState.set(this.applySavedOrder([...items]));
    });
  }

  async refresh(): Promise<void> {
    await this.indexedDbService.refresh();
  }

  reorderPdfs(fromIndex: number, toIndex: number): void {
    this.orderedPdfsState.update((current) => {
      const reordered = [...current];
      const [movedItem] = reordered.splice(fromIndex, 1);
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      reordered.splice(insertIndex, 0, movedItem);
      this.savePdfOrder(reordered);
      return reordered;
    });
  }

  async uploadPdf(file: File, options: MutationOptions = {}): Promise<string> {
    const id = this.generateId();
    const coverImage = await this.generateCoverFromFirstPage(file);

    const arrayBuffer = await file.arrayBuffer();

    const pdfDocument: PdfDocument = {
      id,
      name: file.name,
      file: new File([arrayBuffer], file.name, { type: file.type }),
      uploadDate: new Date(),
      size: file.size,
      coverImage,
    };

    await this.indexedDbService.savePdf(pdfDocument, options);
    return id;
  }

  async getPdfById(id: string): Promise<PdfDocument | null> {
    const pdfDoc = await this.indexedDbService.getPdfById(id);
    if (pdfDoc?.file) {
      if (!(pdfDoc.file instanceof File)) {
        pdfDoc.file = new File([pdfDoc.file as Blob], pdfDoc.name, { type: 'application/pdf' });
      }
    }
    return pdfDoc;
  }

  async deletePdf(id: string, options: MutationOptions = {}): Promise<void> {
    await this.indexedDbService.deletePdf(id, options);

    if (options.refresh === false) {
      this.orderedPdfsState.update((pdfs) => {
        const filtered = pdfs.filter((pdf) => pdf.id !== id);
        this.savePdfOrder(filtered);
        return filtered;
      });
    }
  }

  async deleteAllPdfs(): Promise<void> {
    await this.indexedDbService.deleteAllPdfs();
    localStorage.removeItem('pdfOrder');
  }

  async saveCurrentPage(pdfId: string, currentPage: number): Promise<void> {
    return this.indexedDbService.saveCurrentPage(pdfId, currentPage);
  }

  async getCurrentPage(pdfId: string): Promise<number | null> {
    return this.indexedDbService.getCurrentPage(pdfId);
  }

  private savePdfOrder(pdfs: PdfListItem[]): void {
    try {
      localStorage.setItem('pdfOrder', JSON.stringify(pdfs.map((pdf) => pdf.id)));
    } catch (error) {
      console.error('Error saving PDF order:', error);
    }
  }

  private applySavedOrder(pdfs: PdfListItem[]): PdfListItem[] {
    try {
      const savedOrder = localStorage.getItem('pdfOrder');
      if (!savedOrder) {
        return pdfs;
      }

      const orderIds: string[] = JSON.parse(savedOrder);
      const orderedPdfs: PdfListItem[] = [];
      const unorderedPdfs: PdfListItem[] = [];

      pdfs.forEach((pdf) => {
        const orderIndex = orderIds.indexOf(pdf.id);
        if (orderIndex !== -1) {
          orderedPdfs[orderIndex] = pdf;
        } else {
          unorderedPdfs.push(pdf);
        }
      });

      return [...orderedPdfs.filter(Boolean), ...unorderedPdfs];
    } catch (error) {
      console.error('Error loading PDF order:', error);
      return pdfs;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private async generateCoverFromFirstPage(file: File): Promise<string> {
    try {
      if (typeof window.pdfjsLib === 'undefined') {
        await this.loadPdfJs();
      }

      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) {
        throw new Error('PDF.js not loaded');
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(200 / viewport.width, 280 / viewport.height);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;

      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      console.error('Error generating cover from PDF:', error);
      return this.createPlaceholderImage(file.name);
    }
  }

  private async loadPdfJs(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window.pdfjsLib !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        const pdfjsLib = window.pdfjsLib;
        if (pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        } else {
          reject(new Error('PDF.js not available after script load'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js'));
      document.head.appendChild(script);
    });
  }

  private createPlaceholderImage(fileName: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return '';
    }

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PDF', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px Arial';
    ctx.fillText(fileName.substring(0, 15), canvas.width / 2, canvas.height / 2 + 20);

    return canvas.toDataURL();
  }

  createBlobUrl(file: File): string {
    if (!file || !(file instanceof File)) {
      console.error('Invalid file object for blob URL creation:', file);
      return '';
    }

    try {
      const blob = new Blob([file], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error creating blob URL:', error);
      return '';
    }
  }

  validatePdfFile(file: File): boolean {
    if (!file) return false;
    if (file.type !== 'application/pdf') return false;
    if (file.size === 0) return false;
    if (file.size > 100 * 1024 * 1024) {
      console.warn('PDF file is very large:', file.size);
    }
    return true;
  }
}
