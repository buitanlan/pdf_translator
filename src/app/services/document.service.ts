import { computed, effect, inject, Injectable, signal } from '@angular/core';
import ePub from '@likecoin/epub-ts';
import { DocumentKind, DocumentListItem, StoredDocument } from '../models/document.interface';
import { cleanTocLabel } from '../utils/epub.utils';
import { clamp } from '../utils/reader.utils';
import { IndexedDbService } from './indexeddb.service';

interface EpubDetails {
  title?: string;
  author?: string;
  coverImage?: string;
}

interface MutationOptions {
  refresh?: boolean;
}

export interface SavedEpubProgress {
  cfi: string;
  chapter: string;
  href: string;
  /** Fraction between 0 and 1. */
  progress: number;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 560;

@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  private readonly indexedDbService = inject(IndexedDbService);

  private readonly orderedDocumentsState = signal<DocumentListItem[]>([]);
  readonly documents = this.orderedDocumentsState.asReadonly();
  readonly loading = this.indexedDbService.loading;
  readonly libraryError = this.indexedDbService.error;
  readonly hasDocuments = computed(() => this.orderedDocumentsState().length > 0);

  constructor() {
    effect(() => {
      const items = this.indexedDbService.documents();
      this.orderedDocumentsState.set(this.applySavedOrder([...items]));
    });
  }

  async refresh(): Promise<void> {
    await this.indexedDbService.refresh();
  }

  reorderDocuments(fromIndex: number, toIndex: number): void {
    this.orderedDocumentsState.update((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex > current.length
      ) {
        return current;
      }

      const reordered = [...current];
      const [movedItem] = reordered.splice(fromIndex, 1);
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      reordered.splice(insertIndex, 0, movedItem);
      this.saveDocumentOrder(reordered);
      return reordered;
    });
  }

  /** Moves a document to an exact index (used by keyboard reordering). */
  moveDocument(fromIndex: number, toIndex: number): void {
    this.orderedDocumentsState.update((current) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return current;
      }

      const reordered = [...current];
      const [movedItem] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, movedItem);
      this.saveDocumentOrder(reordered);
      return reordered;
    });
  }

  async uploadDocument(file: File, options: MutationOptions = {}): Promise<string> {
    const kind = this.getDocumentKind(file);
    if (!kind) {
      throw new Error('The selected file is not a PDF or EPUB');
    }

    const id = this.generateId();
    const arrayBuffer = await file.arrayBuffer();
    const storedFile = new File([arrayBuffer], file.name, {
      type: kind === 'epub' ? 'application/epub+zip' : 'application/pdf',
    });

    let title: string | undefined;
    let author: string | undefined;
    let coverImage: string;
    let coverGenerated = false;

    if (kind === 'epub') {
      const details = await this.inspectEpub(storedFile);
      title = details.title;
      author = details.author;
      coverImage = details.coverImage ?? this.createPlaceholderImage('EPUB', title ?? file.name);
      coverGenerated = Boolean(details.coverImage);
    } else {
      // PDF covers are rendered by the viewer after the first open, entirely offline.
      coverImage = this.createPlaceholderImage('PDF', file.name);
    }

    const document: StoredDocument = {
      id,
      name: file.name,
      title,
      author,
      kind,
      file: storedFile,
      uploadDate: new Date(),
      size: file.size,
      coverImage,
      coverGenerated,
    };

    await this.indexedDbService.saveDocument(document, options);
    return id;
  }

  async getDocumentById(id: string): Promise<StoredDocument | null> {
    const document = await this.indexedDbService.getDocumentById(id);
    if (!document?.file) {
      return null;
    }

    if (!(document.file instanceof File)) {
      document.file = new File([document.file], document.name, {
        type: document.kind === 'epub' ? 'application/epub+zip' : 'application/pdf',
      });
    }

    return document;
  }

  async deleteDocument(id: string, options: MutationOptions = {}): Promise<void> {
    await this.indexedDbService.deleteDocument(id, options);

    if (options.refresh === false) {
      this.orderedDocumentsState.update((documents) => {
        const filtered = documents.filter((document) => document.id !== id);
        this.saveDocumentOrder(filtered);
        return filtered;
      });
    }
  }

  async deleteAllDocuments(): Promise<void> {
    await this.indexedDbService.deleteAllDocuments();
    localStorage.removeItem('documentOrder');
    localStorage.removeItem('pdfOrder');
  }

  async saveCurrentPage(documentId: string, currentPage: number): Promise<void> {
    if (!Number.isFinite(currentPage) || currentPage < 1) {
      return;
    }
    const page = Math.floor(currentPage);
    await this.indexedDbService.updateDocument(documentId, { currentPage: page });
    this.updateListItem(documentId, { currentPage: page });
  }

  async getCurrentPage(documentId: string): Promise<number | null> {
    const document = await this.indexedDbService.getDocumentById(documentId);
    return document?.currentPage ?? null;
  }

  async saveEpubProgress(documentId: string, progress: SavedEpubProgress): Promise<void> {
    const epubProgress = clamp(progress.progress, 0, 1);
    await this.indexedDbService.updateDocument(documentId, {
      epubCfi: progress.cfi,
      epubChapter: progress.chapter,
      epubHref: progress.href,
      epubProgress,
    });
    this.updateListItem(documentId, {
      epubCfi: progress.cfi,
      epubChapter: progress.chapter,
      epubHref: progress.href,
      epubProgress,
    });
  }

  /** Persists a thumbnail rendered by the PDF viewer on first open. */
  async saveCover(documentId: string, coverImage: string): Promise<void> {
    await this.indexedDbService.updateDocument(documentId, {
      coverImage,
      coverGenerated: true,
    });
    this.updateListItem(documentId, { coverImage, coverGenerated: true });
  }

  createBlobUrl(document: StoredDocument): string {
    try {
      return URL.createObjectURL(
        new Blob([document.file], {
          type: document.kind === 'epub' ? 'application/epub+zip' : 'application/pdf',
        }),
      );
    } catch (error) {
      console.error('Error creating blob URL:', error);
      return '';
    }
  }

  getDocumentKind(file: File): DocumentKind | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return 'pdf';
    }
    if (name.endsWith('.epub') || file.type === 'application/epub+zip') {
      return 'epub';
    }
    return null;
  }

  async validateDocumentFile(file: File): Promise<boolean> {
    const kind = this.getDocumentKind(file);
    if (!kind || file.size === 0 || file.size > MAX_FILE_SIZE) {
      return false;
    }

    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (kind === 'pdf') {
      return new TextDecoder().decode(bytes).startsWith('%PDF-');
    }

    // Every EPUB is a ZIP container; reject renamed images and empty files early.
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
    );
  }

  getDisplayName(document: DocumentListItem | StoredDocument): string {
    return document.title?.trim() || document.name;
  }

  getAuthor(document: DocumentListItem | StoredDocument): string | undefined {
    const author = document.author?.replace(/\s+/g, ' ').trim();
    return author || undefined;
  }

  private async inspectEpub(file: Blob): Promise<EpubDetails> {
    const book = ePub(file);
    // epub.ts rejects more than one internal promise for a corrupt archive.
    // Mark them handled so a malformed upload cannot surface as an unhandled
    // rejection while the caller still receives the thrown error.
    book.opened.catch(() => undefined);
    book.ready.catch(() => undefined);
    book.opening.promise.catch(() => undefined);
    // `pageList` is not part of `ready`; corrupted archives reject it too.
    Object.values(book.loaded).forEach((promise) => promise.catch(() => undefined));

    try {
      await book.opened;
      const metadata = await book.loaded.metadata;
      const title = this.cleanMetadataText(metadata.title);
      const author = this.cleanMetadataText(metadata.creator);

      let coverImage: string | undefined;
      let coverUrl: string | null = null;
      try {
        coverUrl = await book.coverUrl();
        if (coverUrl) {
          coverImage = await this.imageUrlToThumbnail(coverUrl);
        }
      } catch (error) {
        console.warn('Could not extract the EPUB cover:', error);
      } finally {
        if (coverUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(coverUrl);
        }
      }

      return { title, author, coverImage };
    } finally {
      book.destroy();
    }
  }

  private async imageUrlToThumbnail(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Cover request failed with status ${response.status}`);
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const image = await this.loadImage(objectUrl);
      return this.renderThumbnail(image, image.naturalWidth, image.naturalHeight);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode EPUB cover'));
      image.src = url;
    });
  }

  private renderThumbnail(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
  ): string {
    const canvas = document.createElement('canvas');
    const scale = Math.min(
      THUMBNAIL_WIDTH / Math.max(1, sourceWidth),
      THUMBNAIL_HEIGHT / Math.max(1, sourceHeight),
      1,
    );
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is unavailable');
    }

    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  private cleanMetadataText(value?: string): string | undefined {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    return cleaned ? cleaned.slice(0, 240) : undefined;
  }

  private updateListItem(
    documentId: string,
    changes: Partial<Omit<DocumentListItem, 'id'>>,
  ): void {
    this.orderedDocumentsState.update((items) =>
      items.map((item) => (item.id === documentId ? { ...item, ...changes } : item)),
    );
  }

  private saveDocumentOrder(documents: DocumentListItem[]): void {
    try {
      localStorage.setItem(
        'documentOrder',
        JSON.stringify(documents.map((document) => document.id)),
      );
    } catch (error) {
      console.error('Error saving document order:', error);
    }
  }

  private applySavedOrder(documents: DocumentListItem[]): DocumentListItem[] {
    try {
      const savedOrder = localStorage.getItem('documentOrder') ?? localStorage.getItem('pdfOrder');
      if (!savedOrder) {
        return documents;
      }

      const orderIds: unknown = JSON.parse(savedOrder);
      if (!Array.isArray(orderIds)) {
        return documents;
      }

      const orderedDocuments: DocumentListItem[] = [];
      const unorderedDocuments: DocumentListItem[] = [];

      documents.forEach((document) => {
        const orderIndex = orderIds.indexOf(document.id);
        if (orderIndex !== -1) {
          orderedDocuments[orderIndex] = document;
        } else {
          unorderedDocuments.push(document);
        }
      });

      return [...orderedDocuments.filter(Boolean), ...unorderedDocuments];
    } catch (error) {
      console.error('Error loading document order:', error);
      return documents;
    }
  }

  private idSequence = 0;

  private generateId(): string {
    // Keep ids lexicographically ordered by upload time, even when several files
    // are added in the same millisecond. User-defined order is stored separately.
    this.idSequence = (this.idSequence + 1) % 1296;
    return `${Date.now().toString(36).padStart(9, '0')}${this.idSequence
      .toString(36)
      .padStart(2, '0')}${Math.random().toString(36).substring(2, 8)}`;
  }

  private createPlaceholderImage(label: string, fileName: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }

    const isEpub = label === 'EPUB';
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, isEpub ? '#065f46' : '#991b1b');
    gradient.addColorStop(1, isEpub ? '#022c22' : '#450a0a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = isEpub ? 'rgba(167, 243, 208, 0.35)' : 'rgba(254, 202, 202, 0.3)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(48, 0);
    context.lineTo(48, canvas.height);
    context.stroke();

    context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    context.font = 'bold 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.fillText(label, canvas.width / 2 + 12, 96);

    const title = cleanTocLabel(fileName.replace(/\.(pdf|epub)$/i, '')) || fileName;
    const words = title.split(' ').slice(0, 6);
    context.font = '600 20px Georgia, "Times New Roman", serif';
    let y = canvas.height / 2;
    for (const word of words) {
      context.fillText(word.length > 24 ? `${word.slice(0, 23)}…` : word, canvas.width / 2 + 12, y);
      y += 28;
    }

    context.fillStyle = 'rgba(255, 255, 255, 0.6)';
    context.font = '14px system-ui, -apple-system, "Segoe UI", sans-serif';
    context.fillText('Stored on this device', canvas.width / 2 + 12, canvas.height - 48);

    return canvas.toDataURL('image/jpeg', 0.82);
  }
}
