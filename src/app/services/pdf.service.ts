import { inject, Injectable } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  private readonly indexedDbService = inject(IndexedDbService);

  async uploadPdf(file: File): Promise<string> {
    const id = this.generateId();
    const coverImage = await this.generateCoverFromFirstPage(file);

    // Convert File to ArrayBuffer for better IndexedDB storage
    const arrayBuffer = await file.arrayBuffer();

    const pdfDocument: PdfDocument = {
      id,
      name: file.name,
      file: new File([arrayBuffer], file.name, { type: file.type }),
      uploadDate: new Date(),
      size: file.size,
      coverImage,
    };

    await this.indexedDbService.savePdf(pdfDocument);
    return id;
  }

  async getAllPdfs(): Promise<PdfListItem[]> {
    return this.indexedDbService.getAllPdfs();
  }

  async getPdfById(id: string): Promise<PdfDocument | null> {
    const pdfDoc = await this.indexedDbService.getPdfById(id);
    if (pdfDoc?.file) {
      // Ensure the file is properly reconstructed
      if (!(pdfDoc.file instanceof File)) {
        // If it's stored as raw data, reconstruct the File object
        pdfDoc.file = new File([pdfDoc.file as Blob], pdfDoc.name, { type: 'application/pdf' });
      }
    }
    return pdfDoc;
  }

  async deletePdf(id: string): Promise<void> {
    return this.indexedDbService.deletePdf(id);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private async generateCoverFromFirstPage(file: File): Promise<string> {
    try {
      // Load PDF.js if not already loaded
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

      // Create canvas for rendering
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      // Set desired dimensions for thumbnail
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(200 / viewport.width, 280 / viewport.height);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;

      // Convert canvas to base64 image
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      console.error('Error generating cover from PDF:', error);
      // Fallback to placeholder if PDF rendering fails
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

    // Create a simple placeholder
    ctx.fillStyle = '#dc2626'; // Red background
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
      // 100MB limit
      console.warn('PDF file is very large:', file.size);
    }
    return true;
  }
}
