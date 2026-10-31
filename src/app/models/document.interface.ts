export type DocumentKind = 'pdf' | 'epub';

export interface StoredDocument {
  id: string;
  name: string;
  title?: string;
  author?: string;
  kind: DocumentKind;
  file: File;
  uploadDate: Date;
  size: number;
  coverImage?: string;
  /** True once a real cover has been rendered (instead of a generated placeholder). */
  coverGenerated?: boolean;
  currentPage?: number;
  epubCfi?: string;
  epubChapter?: string;
  /** Section href of the saved EPUB position, used as a fallback when a CFI is stale. */
  epubHref?: string;
  /** Reading progress as a fraction between 0 and 1. */
  epubProgress?: number;
}

export interface DocumentListItem {
  id: string;
  name: string;
  title?: string;
  author?: string;
  kind: DocumentKind;
  uploadDate: Date;
  size: number;
  coverImage?: string;
  coverGenerated?: boolean;
  currentPage?: number;
  epubCfi?: string;
  epubChapter?: string;
  epubHref?: string;
  epubProgress?: number;
}
