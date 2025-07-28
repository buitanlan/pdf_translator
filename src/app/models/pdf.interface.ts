export interface PdfDocument {
  id: string;
  name: string;
  file: File;
  uploadDate: Date;
  size: number;
  coverImage?: string; // base64 encoded first page image
}

export interface PdfListItem {
  id: string;
  name: string;
  uploadDate: Date;
  size: number;
  coverImage?: string;
} 