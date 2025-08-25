export interface PdfDocument {
  id: string;
  name: string;
  file: File;
  uploadDate: Date;
  size: number;
  coverImage?: string; // base64 encoded first page image
  currentPage?: number; // current page number (1-based)
}

export interface PdfListItem {
  id: string;
  name: string;
  uploadDate: Date;
  size: number;
  coverImage?: string;
}
