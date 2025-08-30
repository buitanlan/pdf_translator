import { Injectable } from '@angular/core';
import { PdfDocument, PdfListItem } from '../models/pdf.interface';

@Injectable({
  providedIn: 'root'
})
export class IndexedDbService {
  private dbName = 'PdfTranslatorDB';
  private dbVersion = 1;
  private storeName = 'pdfs';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<void> {
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

  async savePdf(pdf: PdfDocument): Promise<void> {
    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(pdf);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllPdfs(): Promise<PdfListItem[]> {
    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const pdfs = request.result.map((pdf: PdfDocument) => ({
          id: pdf.id,
          name: pdf.name,
          uploadDate: pdf.uploadDate,
          size: pdf.size,
          coverImage: pdf.coverImage
        }));
        resolve(pdfs);
      };
    });
  }

  async getPdfById(id: string): Promise<PdfDocument | null> {
    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async deletePdf(id: string): Promise<void> {
    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveCurrentPage(pdfId: string, currentPage: number): Promise<void> {
    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // First get the current PDF document
      const getRequest = store.get(pdfId);

      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const pdf = getRequest.result;
        if (pdf) {
          // Update the current page
          pdf.currentPage = currentPage;

          // Save the updated PDF
          const putRequest = store.put(pdf);
          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
        } else {
          reject(new Error('PDF not found'));
        }
      };
    });
  }

  async getCurrentPage(pdfId: string): Promise<number | null> {
    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(pdfId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const pdf = request.result;
        resolve(pdf?.currentPage || null);
      };
    });
  }
}
