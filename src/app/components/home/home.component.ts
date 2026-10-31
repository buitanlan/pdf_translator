import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentListItem } from '../../models/document.interface';
import { DocumentService } from '../../services/document.service';
import {
  formatEpubPosition,
  formatFileSize,
  formatPdfPosition,
  progressFractionToPercent,
  truncate,
} from '../../utils/reader.utils';
import { IconComponent } from '../shared/icon.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

type NoticeTone = 'error' | 'success' | 'info';

interface LibraryNotice {
  tone: NoticeTone;
  message: string;
}

/**
 * Offline document library. Upload, validation, ordering and reading positions
 * all stay local in IndexedDB and localStorage.
 */
@Component({
  selector: 'app-home',
  imports: [IconComponent, ThemeToggleComponent],
  host: {
    '(dragover)': 'onGlobalDragOver($event)',
    '(dragenter)': 'onGlobalDragEnter($event)',
    '(dragleave)': 'onGlobalDragLeave($event)',
    '(drop)': 'onGlobalDrop($event)',
  },
  template: `
    <div class="relative min-h-dvh bg-[#f6f7f9] dark:bg-[#080b12]">
      @if (isDragOver()) {
        <div
          class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-600/10 p-4 backdrop-blur-[1px]"
          role="region"
          aria-label="Drop zone active"
        >
          <div
            class="rounded-2xl border-2 border-dashed border-blue-500 bg-white p-8 text-center shadow-xl dark:bg-gray-900"
          >
            <span
              class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
              aria-hidden="true"
            >
              <app-icon name="upload" size="lg" />
            </span>
            <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
              Drop PDF or EPUB files to add them
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Release anywhere on this page. Files stay on this device.
            </p>
          </div>
        </div>
      }

      <header
        class="sticky top-0 z-30 border-b border-gray-200 bg-white/85 backdrop-blur dark:border-gray-800 dark:bg-gray-950/85"
      >
        <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"
            aria-hidden="true"
          >
            <app-icon name="library" size="sm" />
          </span>

          <div class="min-w-0 flex-1">
            <h1 class="truncate text-sm font-semibold text-gray-900 sm:text-base dark:text-gray-100">
              Document Library
            </h1>
            <p class="truncate text-[11px] text-gray-500 dark:text-gray-400">
              @if (loading() && documents().length === 0) {
                Loading your library…
              } @else {
                {{ documentCountLabel() }}
              }
            </p>
          </div>

          <app-theme-toggle [compact]="true" />

          <label [class]="uploadButtonClass()">
            <span class="sr-only">Add PDF or EPUB documents</span>
            <input
              type="file"
              class="sr-only"
              accept=".pdf,.epub,application/pdf,application/epub+zip"
              multiple
              [disabled]="isUploading()"
              (change)="onFileSelected($event)"
            />
            @if (isUploading()) {
              <span
                class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              ></span>
            } @else {
              <app-icon name="upload" size="sm" />
            }
            <span class="sm:hidden">{{ isUploading() ? 'Adding' : 'Add' }}</span>
            <span class="hidden sm:inline">{{ isUploading() ? 'Adding…' : 'Add documents' }}</span>
          </label>
        </div>
      </header>

      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        @if (notice(); as currentNotice) {
          <div
            [class]="noticeClass(currentNotice.tone)"
            role="status"
            aria-live="polite"
          >
            <app-icon
              [name]="currentNotice.tone === 'error' ? 'alert' : 'info'"
              size="sm"
            />
            <p class="min-w-0 flex-1 leading-6">{{ currentNotice.message }}</p>
            <button
              type="button"
              class="shrink-0 rounded-md p-1 text-current/70 transition-colors hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
              aria-label="Dismiss message"
              (click)="notice.set(null)"
            >
              <app-icon name="x" size="sm" />
            </button>
          </div>
        }

        @if (isUploading()) {
          <div
            class="mb-5 rounded-xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/40"
            role="status"
            aria-live="polite"
          >
            <div class="flex items-center justify-between gap-3 text-xs font-medium">
              <span class="text-blue-800 dark:text-blue-200">
                Adding {{ uploadedFiles() }} of {{ totalFiles() }} documents…
              </span>
              <span class="tabular-nums text-blue-700 dark:text-blue-300">
                {{ uploadProgressText() }}
              </span>
            </div>
            <div
              class="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900"
              role="progressbar"
              aria-label="Upload progress"
              [attr.aria-valuenow]="uploadProgress()"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full rounded-full bg-blue-600 transition-[width] duration-300 dark:bg-blue-400"
                [style.width.%]="uploadProgress()"
              ></div>
            </div>
          </div>
        }

        @if (libraryError(); as errorMessage) {
          <div
            class="mb-5 rounded-xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900 dark:bg-red-950/50"
            role="alert"
          >
            <div class="flex items-start gap-3">
              <span class="mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true">
                <app-icon name="alert" size="sm" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-red-800 dark:text-red-200">
                  The library could not be read
                </p>
                <p class="mt-0.5 text-xs leading-5 text-red-700 dark:text-red-300">
                  {{ errorMessage }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/60"
                (click)="refreshLibrary()"
              >
                Retry
              </button>
            </div>
          </div>
        }

        @if (loading() && documents().length === 0) {
          <div role="status" aria-live="polite">
            <span class="sr-only">Loading documents</span>
            <div
              class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5"
            >
              @for (placeholder of skeletonItems; track placeholder) {
                <div class="animate-pulse">
                  <div class="aspect-[3/4] w-full rounded-xl bg-gray-200 dark:bg-gray-800"></div>
                  <div class="mt-3 h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800"></div>
                  <div class="mt-2 h-2.5 w-1/2 rounded bg-gray-200 dark:bg-gray-800"></div>
                </div>
              }
            </div>
          </div>
        } @else if (documents().length === 0) {
          <section
            class="mx-auto max-w-2xl rounded-2xl border-2 border-dashed border-gray-300 bg-white/70 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900/50"
            [class.border-blue-400]="isDragOver()"
            aria-label="Empty library"
          >
            <span
              class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300"
              aria-hidden="true"
            >
              <app-icon name="upload" size="lg" />
            </span>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Build your offline library
            </h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
              Drop PDF or EPUB files anywhere on this page, or choose files below. Documents, covers
              and reading positions are stored only on this device.
            </p>
            <label [class]="primaryButtonClass()">
              <app-icon name="upload" size="sm" />
              Choose files
              <input
                type="file"
                class="sr-only"
                accept=".pdf,.epub,application/pdf,application/epub+zip"
                multiple
                [disabled]="isUploading()"
                (change)="onFileSelected($event)"
              />
            </label>
            <p class="mt-4 text-[11px] text-gray-400 dark:text-gray-500">
              PDF and EPUB · up to 100 MB each · works offline
            </p>
          </section>
        } @else {
          <div
            class="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400"
            [class.border-blue-400]="isDragOver()"
            [class.bg-blue-50]="isDragOver()"
          >
            <span class="flex min-w-0 items-center gap-2">
              <app-icon name="upload" size="sm" />
              <span class="truncate">Drag &amp; drop PDF or EPUB files here to add them</span>
            </span>
            <label class="shrink-0 font-semibold text-blue-700 hover:underline dark:text-blue-300">
              Browse
              <input
                type="file"
                class="sr-only"
                accept=".pdf,.epub,application/pdf,application/epub+zip"
                multiple
                [disabled]="isUploading()"
                (change)="onFileSelected($event)"
              />
            </label>
          </div>

          <div class="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Your documents
              </h2>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                Drag a cover to reorder. With a card focused, press Alt + arrow keys to move it.
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-red-950/60 dark:hover:text-red-300"
              [disabled]="isUploading()"
              (click)="clearAllDocuments()"
            >
              Clear library
            </button>
          </div>

          <ul
            class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5"
            role="list"
            aria-label="Documents"
          >
            @for (document of documents(); track document.id; let i = $index) {
              <li
                class="group relative flex min-w-0 flex-col"
                [class.opacity-50]="draggedIndex() === i"
                [class.ring-2]="dragOverIndex() === i && draggedIndex() !== i"
                [class.ring-blue-500]="dragOverIndex() === i && draggedIndex() !== i"
                [class.rounded-xl]="dragOverIndex() === i && draggedIndex() !== i"
                draggable="true"
                (dragstart)="onItemDragStart($event, i)"
                (dragend)="onItemDragEnd()"
                (dragover)="onItemDragOver($event, i)"
                (dragenter)="onItemDragEnter($event, i)"
                (dragleave)="onItemDragLeave($event, i)"
                (drop)="onItemDrop($event, i)"
              >
                <div class="relative">
                  <button
                    type="button"
                    draggable="false"
                    class="block w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-gray-800 dark:bg-gray-900"
                    [attr.aria-label]="'Open ' + getDisplayName(document) + ', ' + document.kind.toUpperCase()"
                    (click)="openDocument(document)"
                    (dragover)="onItemDragOver($event, i)"
                    (drop)="onItemDrop($event, i)"
                  >
                    <span class="relative block aspect-[3/4] w-full bg-gray-100 dark:bg-gray-800">
                      @if (document.coverImage) {
                        <img
                          [src]="document.coverImage"
                          [alt]="'Cover of ' + getDisplayName(document)"
                          class="h-full w-full object-cover"
                          loading="lazy"
                          draggable="false"
                        />
                      } @else {
                        <span
                          class="flex h-full w-full items-center justify-center"
                          [class.bg-emerald-800]="document.kind === 'epub'"
                          [class.bg-red-800]="document.kind === 'pdf'"
                        >
                          <span class="text-xs font-bold tracking-wider text-white/90">
                            {{ document.kind.toUpperCase() }}
                          </span>
                        </span>
                      }

                      <span
                        class="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white shadow-sm"
                        [class.bg-emerald-700]="document.kind === 'epub'"
                        [class.bg-red-700]="document.kind === 'pdf'"
                      >
                        {{ document.kind.toUpperCase() }}
                      </span>

                      <span
                        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950/85 to-transparent px-2.5 pb-2 pt-6 text-left text-[11px] font-semibold text-white"
                        [attr.title]="progressTitle(document)"
                      >
                        @if (hasProgress(document)) {
                          {{ positionLabel(document) }}
                        }
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    class="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-950/55 text-white opacity-0 backdrop-blur transition-opacity hover:bg-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                    [attr.aria-label]="'Delete ' + getDisplayName(document)"
                    (click)="deleteDocument(document, $event)"
                  >
                    <app-icon name="trash" size="xs" />
                  </button>

                  <button
                    type="button"
                    class="absolute left-2 top-2 z-10 inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md bg-gray-950/55 text-white opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    [attr.aria-label]="'Reorder ' + getDisplayName(document)"
                    [attr.title]="'Drag to reorder, or press Alt + arrow keys'"
                    [attr.data-reorder-id]="document.id"
                    (keydown)="onReorderKeydown($event, i)"
                  >
                    <app-icon name="more" size="xs" />
                  </button>
                </div>

                <div class="mt-2 min-w-0">
                  <h3
                    class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                    [attr.title]="getDisplayName(document)"
                  >
                    {{ getDisplayName(document) }}
                  </h3>
                  @if (authorOf(document); as author) {
                    <p class="truncate text-xs text-gray-500 dark:text-gray-400">{{ author }}</p>
                  }
                  <div class="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
                    <span class="truncate text-gray-500 dark:text-gray-400">
                      {{ document.kind.toUpperCase() }} · {{ formatFileSize(document.size) }}
                    </span>
                    <span class="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                      {{ positionLabel(document) }}
                    </span>
                  </div>
                  @if (document.kind === 'epub' && (document.epubProgress ?? 0) > 0) {
                    <div
                      class="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
                      role="progressbar"
                      aria-label="Saved reading progress"
                      [attr.aria-valuenow]="epubPercent(document)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div
                        class="h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
                        [style.width.%]="epubPercent(document)"
                      ></div>
                    </div>
                  }
                </div>
              </li>
            }
          </ul>
        }

        <p class="sr-only" aria-live="polite">{{ reorderAnnouncement() }}</p>
      </main>
    </div>
  `,
})
export class HomeComponent {
  private readonly documentService = inject(DocumentService);
  private readonly router = inject(Router);

  readonly documents = this.documentService.documents;
  readonly loading = this.documentService.loading;
  readonly libraryError = this.documentService.libraryError;

  readonly draggedIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);
  readonly isDragOver = signal(false);
  readonly isUploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly totalFiles = signal(0);
  readonly uploadedFiles = signal(0);
  readonly notice = signal<LibraryNotice | null>(null);
  readonly reorderAnnouncement = signal('');

  readonly uploadProgressText = computed(() => `${Math.round(this.uploadProgress())}%`);
  readonly documentCountLabel = computed(() => {
    const count = this.documents().length;
    return `${count} ${count === 1 ? 'document' : 'documents'} · stored on this device`;
  });
  readonly skeletonItems = Array.from({ length: 8 }, (_, index) => index);

  onGlobalDragOver(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isDragOver.set(true);
  }

  onGlobalDragEnter(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onGlobalDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const currentTarget = event.currentTarget as Element | null;
    if (!currentTarget?.contains(event.relatedTarget as Node | null)) {
      this.isDragOver.set(false);
    }
  }

  onGlobalDrop(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      void this.uploadFiles(files);
    }
  }

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
    } else if (this.isFileDrag(event)) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      this.isDragOver.set(true);
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
    if (currentDraggedIndex === null) {
      const files = Array.from(event.dataTransfer?.files ?? []);
      this.isDragOver.set(false);
      if (files.length > 0) {
        void this.uploadFiles(files);
      }
      return;
    }

    if (currentDraggedIndex !== dropIndex) {
      this.documentService.reorderDocuments(currentDraggedIndex, dropIndex);
      this.announceReorder(currentDraggedIndex, dropIndex);
    }

    this.draggedIndex.set(null);
    this.dragOverIndex.set(null);
  }

  onReorderKeydown(event: KeyboardEvent, index: number): void {
    if (!event.altKey) {
      return;
    }

    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    const target = index + delta;
    if (target < 0 || target >= this.documents().length) {
      return;
    }

    const id = this.documents()[index]?.id;
    this.documentService.moveDocument(index, target);
    this.announceReorder(index, target);

    if (id) {
      queueMicrotask(() => {
        window.document
          .querySelector<HTMLElement>(`[data-reorder-id="${CSS.escape(id)}"]`)
          ?.focus();
      });
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) {
      await this.uploadFiles(files);
    }
  }

  openDocument(document: DocumentListItem): void {
    const route = document.kind === 'epub' ? '/epub-viewer' : '/viewer';
    void this.router.navigate([route, document.id]);
  }

  getDisplayName(document: DocumentListItem): string {
    return this.documentService.getDisplayName(document);
  }

  authorOf(document: DocumentListItem): string | undefined {
    return this.documentService.getAuthor(document);
  }

  formatFileSize = formatFileSize;

  positionLabel(document: DocumentListItem): string {
    return document.kind === 'epub'
      ? formatEpubPosition(document.epubProgress)
      : formatPdfPosition(document.currentPage);
  }

  progressTitle(document: DocumentListItem): string {
    if (document.kind === 'epub') {
      return document.epubChapter
        ? `Saved place: ${document.epubChapter} (${formatEpubPosition(document.epubProgress)})`
        : formatEpubPosition(document.epubProgress);
    }
    return formatPdfPosition(document.currentPage);
  }

  epubPercent(document: DocumentListItem): number {
    return progressFractionToPercent(document.epubProgress);
  }

  hasProgress(document: DocumentListItem): boolean {
    return document.kind === 'epub'
      ? (document.epubProgress ?? 0) > 0
      : (document.currentPage ?? 0) > 0;
  }

  async deleteDocument(document: DocumentListItem, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!confirm(`Delete “${this.getDisplayName(document)}” from this device?`)) {
      return;
    }

    try {
      await this.documentService.deleteDocument(document.id);
      this.notice.set({ tone: 'success', message: `Deleted “${this.getDisplayName(document)}”.` });
    } catch (error) {
      console.error('Error deleting document:', error);
      this.notice.set({
        tone: 'error',
        message: 'The document could not be deleted. Please try again.',
      });
    }
  }

  async clearAllDocuments(): Promise<void> {
    const count = this.documents().length;
    if (!confirm(`Delete all ${count} documents from this device? This cannot be undone.`)) {
      return;
    }

    try {
      await this.documentService.deleteAllDocuments();
      this.notice.set({ tone: 'success', message: 'The library is now empty.' });
    } catch (error) {
      console.error('Error clearing the library:', error);
      this.notice.set({
        tone: 'error',
        message: 'Some documents could not be deleted. Please try again.',
      });
    }
  }

  async refreshLibrary(): Promise<void> {
    await this.documentService.refresh();
  }

  protected uploadButtonClass(): string {
    const base =
      'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-3.5 sm:text-sm';
    return this.isUploading() ? `${base} pointer-events-none opacity-60` : base;
  }

  protected primaryButtonClass(): string {
    const base =
      'mt-5 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700';
    return this.isUploading() ? `${base} pointer-events-none opacity-60` : base;
  }

  protected noticeClass(tone: NoticeTone): string {
    const base = 'mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm';
    switch (tone) {
      case 'error':
        return `${base} border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200`;
      case 'success':
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200`;
      default:
        return `${base} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200`;
    }
  }

  private async uploadFiles(files: File[]): Promise<void> {
    if (this.isUploading() || files.length === 0) {
      return;
    }

    this.notice.set(null);

    const validation = await Promise.all(
      files.map(async (file) => ({
        file,
        valid: await this.documentService.validateDocumentFile(file),
      })),
    );
    const validFiles = validation.filter((entry) => entry.valid).map((entry) => entry.file);
    const invalidFiles = validation.filter((entry) => !entry.valid).map((entry) => entry.file);

    if (invalidFiles.length > 0) {
      const names = invalidFiles.map((file) => truncate(file.name, 40)).join(', ');
      this.notice.set({
        tone: 'error',
        message: `Skipped ${invalidFiles.length} ${
          invalidFiles.length === 1 ? 'file' : 'files'
        } (${names}). Only unencrypted PDF and EPUB files up to 100 MB are supported.`,
      });
    }

    if (validFiles.length === 0) {
      return;
    }

    this.isUploading.set(true);
    this.totalFiles.set(validFiles.length);
    this.uploadedFiles.set(0);
    this.uploadProgress.set(0);

    const failures: string[] = [];
    let completed = 0;

    try {
      await Promise.all(
        validFiles.map(async (file) => {
          try {
            await this.documentService.uploadDocument(file, { refresh: false });
          } catch (error) {
            console.error('Could not add document:', file.name, error);
            failures.push(file.name);
          } finally {
            completed += 1;
            this.uploadedFiles.set(completed);
            this.uploadProgress.set((completed / validFiles.length) * 100);
          }
        }),
      );

      await this.documentService.refresh();

      if (failures.length > 0) {
        const names = failures.map((name) => truncate(name, 40)).join(', ');
        const skipped = invalidFiles.length
          ? ` ${invalidFiles.length} more ${
              invalidFiles.length === 1 ? 'file was' : 'files were'
            } skipped before upload.`
          : '';
        this.notice.set({
          tone: 'error',
          message: `Could not add ${names}. The ${
            failures.length === 1 ? 'file may be' : 'files may be'
          } corrupt, encrypted, or unsupported.${skipped}`,
        });
      } else if (invalidFiles.length > 0) {
        const names = invalidFiles.map((file) => truncate(file.name, 40)).join(', ');
        this.notice.set({
          tone: 'info',
          message: `Added ${validFiles.length} ${
            validFiles.length === 1 ? 'document' : 'documents'
          }. Skipped ${invalidFiles.length} ${
            invalidFiles.length === 1 ? 'file' : 'files'
          } (${names}) because only unencrypted PDF and EPUB files up to 100 MB are supported.`,
        });
      } else {
        this.notice.set({
          tone: 'success',
          message: `Added ${validFiles.length} ${
            validFiles.length === 1 ? 'document' : 'documents'
          } to your library.`,
        });
      }
    } catch (error) {
      console.error('Error during upload:', error);
      this.notice.set({
        tone: 'error',
        message: 'The upload could not be completed. Please try again.',
      });
    } finally {
      this.isUploading.set(false);
      this.uploadProgress.set(0);
      this.totalFiles.set(0);
      this.uploadedFiles.set(0);
    }
  }

  private isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  private announceReorder(fromIndex: number, toIndex: number): void {
    const document = this.documents()[fromIndex];
    if (!document) {
      return;
    }
    this.reorderAnnouncement.set(
      `${this.getDisplayName(document)} moved to position ${toIndex + 1} of ${
        this.documents().length
      }.`,
    );
  }
}
