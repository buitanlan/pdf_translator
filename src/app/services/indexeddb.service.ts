import { Injectable, signal } from '@angular/core';
import { PdfDocument, PdfListItem } from '../models/pdf.interface';

interface MutationOptions {
  refresh?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {
  private readonly dbName = 'PdfTranslatorDB';
  private readonly dbVersion = 1;
  private readonly storeName = 'pdfs';

  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private readonly pdfsState = signal<PdfListItem[]>([]);
  readonly pdfs = this.pdfsState.asReadonly();

  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();

  private readonly readyState = signal(false);
  readonly ready = this.readyState.asReadonly();

  constructor() {
    void this.ensureReady().then(() => this.refresh());
  }

  async refresh(): Promise<void> {
    await this.ensureReady();
    this.loadingState.set(true);

    try {
      const pdfs = await this.fetchAllPdfs();
      this.pdfsState.set(pdfs);
    } catch (error) {
      console.error('Error loading PDFs from IndexedDB:', error);
    } finally {
      this.loadingState.set(false);
    }
  }

  async savePdf(pdf: PdfDocument, options: MutationOptions = {}): Promise<void> {
    await this.ensureReady();
    await this.putPdf(pdf);

    if (options.refresh !== false) {
      await this.refresh();
    }
  }

  async getPdfById(id: string): Promise<PdfDocument | null> {
    await this.ensureReady();
    return this.fetchPdfById(id);
  }

  async deletePdf(id: string, options: MutationOptions = {}): Promise<void> {
    await this.ensureReady();
    await this.removePdf(id);

    if (options.refresh === false) {
      this.pdfsState.update((pdfs) => pdfs.filter((pdf) => pdf.id !== id));
      return;
    }

    await this.refresh();
  }

  async deleteAllPdfs(): Promise<void> {
    await this.ensureReady();

    for (const pdf of this.pdfsState()) {
      await this.removePdf(pdf.id);
    }

    this.pdfsState.set([]);
  }

  async saveCurrentPage(pdfId: string, currentPage: number): Promise<void> {
    await this.ensureReady();

    const pdf = await this.fetchPdfById(pdfId);
    if (!pdf) {
      throw new Error('PDF not found');
    }

    pdf.currentPage = currentPage;
    await this.putPdf(pdf);
  }

  async getCurrentPage(pdfId: string): Promise<number | null> {
    await this.ensureReady();
    const pdf = await this.fetchPdfById(pdfId);
    return pdf?.currentPage ?? null;
  }

  private ensureReady(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initDB().then(() => this.readyState.set(true));
    }

    return this.initPromise;
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('uploadDate', 'uploadDate', { unique: false });
        }
      };
    });
  }

  private fetchAllPdfs(): Promise<PdfListItem[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const pdfs = request.result.map((pdf: PdfDocument) => this.toListItem(pdf));
        resolve(pdfs);
      };
    });
  }

  private fetchPdfById(id: string): Promise<PdfDocument | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private putPdf(pdf: PdfDocument): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(pdf);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private removePdf(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private toListItem(pdf: PdfDocument): PdfListItem {
    return {
      id: pdf.id,
      name: pdf.name,
      uploadDate: pdf.uploadDate,
      size: pdf.size,
      coverImage: pdf.coverImage,
    };
  }
}
