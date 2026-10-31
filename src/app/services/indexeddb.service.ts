import { Injectable, signal } from '@angular/core';
import { DocumentKind, DocumentListItem, StoredDocument } from '../models/document.interface';

interface MutationOptions {
  refresh?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {
  private readonly dbName = 'PdfTranslatorDB';
  private readonly dbVersion = 2;
  private readonly storeName = 'pdfs';

  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private readonly documentsState = signal<DocumentListItem[]>([]);
  readonly documents = this.documentsState.asReadonly();

  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();

  private readonly readyState = signal(false);
  readonly ready = this.readyState.asReadonly();

  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();

  constructor() {
    void this.ensureReady()
      .then(() => this.refresh())
      .catch((error: unknown) => {
        console.error('Could not open the local document database:', error);
        this.loadingState.set(false);
        this.errorState.set(
          'The local library database could not be opened. Private browsing or blocked storage may be the cause.',
        );
      });
  }

  async refresh(): Promise<void> {
    await this.ensureReady();
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      this.documentsState.set(await this.fetchAllDocuments());
    } catch (error) {
      console.error('Error loading documents from IndexedDB:', error);
      this.errorState.set('Your saved documents could not be read from this device.');
    } finally {
      this.loadingState.set(false);
    }
  }

  async saveDocument(document: StoredDocument, options: MutationOptions = {}): Promise<void> {
    await this.ensureReady();
    await this.putDocument(document);

    if (options.refresh !== false) {
      await this.refresh();
    }
  }

  async getDocumentById(id: string): Promise<StoredDocument | null> {
    await this.ensureReady();
    const document = await this.fetchDocumentById(id);
    return document ? this.normalizeDocument(document) : null;
  }

  async updateDocument(
    id: string,
    changes: Partial<Omit<StoredDocument, 'id' | 'file'>>,
  ): Promise<DocumentListItem | null> {
    await this.ensureReady();
    const document = await this.fetchDocumentById(id);
    if (!document) {
      throw new Error('Document not found');
    }

    const updated: StoredDocument = {
      ...this.normalizeDocument(document),
      ...changes,
    };
    await this.putDocument(updated);
    return this.toListItem(updated);
  }

  async deleteDocument(id: string, options: MutationOptions = {}): Promise<void> {
    await this.ensureReady();
    await this.removeDocument(id);

    if (options.refresh === false) {
      this.documentsState.update((documents) => documents.filter((document) => document.id !== id));
      return;
    }

    await this.refresh();
  }

  async deleteAllDocuments(): Promise<void> {
    await this.ensureReady();

    for (const document of this.documentsState()) {
      await this.removeDocument(document.id);
    }

    this.documentsState.set([]);
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
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) {
          return;
        }

        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(this.storeName)) {
          store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('uploadDate', 'uploadDate', { unique: false });
        } else {
          store = transaction.objectStore(this.storeName);
        }

        if (event.oldVersion > 0 && event.oldVersion < 2) {
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
              return;
            }

            const legacy = cursor.value as StoredDocument;
            cursor.update({
              ...legacy,
              kind: legacy.kind ?? this.inferDocumentKind(legacy.name, legacy.file?.type),
            });
            cursor.continue();
          };
        }
      };
    });
  }

  private fetchAllDocuments(): Promise<DocumentListItem[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const documents = request.result.map((document: StoredDocument) =>
          this.toListItem(this.normalizeDocument(document)),
        );
        resolve(documents);
      };
    });
  }

  private fetchDocumentById(id: string): Promise<StoredDocument | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private putDocument(document: StoredDocument): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const request = transaction.objectStore(this.storeName).put(document);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private removeDocument(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const request = transaction.objectStore(this.storeName).delete(id);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private normalizeDocument(document: StoredDocument): StoredDocument {
    return {
      ...document,
      kind: document.kind ?? this.inferDocumentKind(document.name, document.file?.type),
    };
  }

  private inferDocumentKind(name: string, mimeType?: string): DocumentKind {
    return name.toLowerCase().endsWith('.epub') || mimeType === 'application/epub+zip'
      ? 'epub'
      : 'pdf';
  }

  private toListItem(document: StoredDocument): DocumentListItem {
    return {
      id: document.id,
      name: document.name,
      title: document.title,
      author: document.author,
      kind: document.kind,
      uploadDate: document.uploadDate,
      size: document.size,
      coverImage: document.coverImage,
      coverGenerated: document.coverGenerated,
      currentPage: document.currentPage,
      epubCfi: document.epubCfi,
      epubChapter: document.epubChapter,
      epubHref: document.epubHref,
      epubProgress: document.epubProgress,
    };
  }
}
