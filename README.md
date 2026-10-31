# Document Library — PDF & EPUB Reader

An offline-first Angular 22 reader for PDF and EPUB documents. Files, covers and reading
positions never leave the browser: everything is stored locally in IndexedDB and
`localStorage`. There are no accounts, no analytics and no backend.

The reader UI follows the compact, document-first direction of
[pdfviewer.net](https://pdfviewer.net/): a slim header, grouped reading controls, a collapsible
navigation sidebar, neutral reading canvas and restrained surfaces. PDF rendering stays with
`ngx-extended-pdf-viewer`; EPUB rendering now uses
[`@likecoin/epub-ts`](https://likecoin.github.io/epub.ts/).

## Features

### Library (`/`)

- Mixed PDF and EPUB uploads through a file picker or drag and drop, with progress feedback.
- Local validation of file signatures, size (100 MB limit), and EPUB archive parsing.
- Cover thumbnails, metadata, format badge, author and saved progress on responsive cards.
- Drag-and-drop reordering plus keyboard reordering (`Alt` + arrow keys) with an
  `aria-live` announcement.
- Delete a single document or clear the whole library.
- Empty, loading and error states; actionable inline messages instead of blocking alerts.

### PDF reader (`/viewer/:id`)

- Native `ngx-extended-pdf-viewer` toolbar, findbar, outline/thumbnail sidebar, zoom,
  rotation, hand tool, text layer, presentation mode, print and download.
- Page navigation restored from IndexedDB and saved with a debounce.
- A first-page thumbnail is rendered offline through the loaded PDF.js instance the first time
  a PDF is opened; until then a generated placeholder cover is shown.
- No duplicate custom toolbar and no DOM manipulation of the viewer.

### EPUB reader (`/epub-viewer/:id`)

- `@likecoin/epub-ts` browser build with bundled typings and EPUB 2/3 navigation.
- Nested table of contents, fragment links and previous/next page navigation.
- Full-book search with chapter labels, excerpts and CFI navigation to each match.
- Reading settings: text size, line spacing, serif/sans typeface, page zoom and
  light/sepia/dark reading themes.
- Fullscreen, download, and CFI-based position saving/restoration with chapter and
  percentage progress (no fake "page numbers" for reflowable books).
- EPUB content is rendered in a sandboxed iframe with scripts disabled
  (`allowScriptedContent: false`).
- Keyboard shortcuts: `←`/`PageUp`, `→`/`PageDown`, `/` to search, `Esc` to close panels.
  Shortcuts never fire while typing in an input or inside editable content.

### Shared

- Compact reader header with library navigation, document title, format badge, theme control
  and a mobile overflow menu.
- Collapsible desktop sidebar / mobile drawer with focus restoration, a focus trap,
  Escape handling and `inert` when closed.
- Complete light and dark app themes plus independent EPUB page themes.
- Visible keyboard focus, accessible labels, keyboard-operable menus and dialogs.

## Prerequisites

- Node.js 22 or newer (the project currently builds with Node 26)
- `pnpm` (lockfile is committed)

## Installation

```bash
git clone <repository-url>
cd pdf-translator
pnpm install
pnpm start
```

Open `http://localhost:4200`.

## Usage

1. Add PDF and EPUB files with **Add documents**, **Choose files**, or by dropping them onto
   the library.
2. Open a card to launch the matching reader.
3. In the EPUB reader, use the contents button or `/` to search, the sliders button for reading
   settings, and the overflow menu on small screens for secondary actions.
4. Progress is saved automatically. Reopening a document — including after a reload — restores
   the saved page or CFI position.

## Keyboard shortcuts

| Context | Keys | Action |
| --- | --- | --- |
| EPUB | `←` / `PageUp` | Previous page |
| EPUB | `→` / `PageDown` | Next page |
| EPUB | `/` | Open in-book search |
| EPUB | `Esc` | Close search/contents/settings |
| Library | `Alt` + arrow keys | Move the focused card |
| Menus/dialogs | `Esc`, arrow keys, `Tab` | Close, navigate, cycle focus |

## Storage and privacy

- `PdfTranslatorDB` (`pdfs` object store) holds files, metadata, covers and reading positions.
- `documentOrder` and `readerPreferences.v1` are small `localStorage` entries.
- File parsing and thumbnail generation happen in the browser. EPUB metadata and covers are
  read with `@likecoin/epub-ts`; PDF thumbnails use the locally bundled PDF.js instance rather
  than a CDN.
- Nothing is uploaded to a server.

## Project structure

```
src/
├── app/
│   ├── components/
│   │   ├── shared/                    # Header, sidebar, icons, menus, settings, states
│   │   ├── home/                      # Mixed-format library
│   │   ├── pdf-viewer/                # ngx-extended-pdf-viewer shell
│   │   ├── epub-viewer/               # @likecoin/epub-ts reader
│   │   └── theme-toggle/
│   ├── models/document.interface.ts   # Stored document + list item contracts
│   ├── services/
│   │   ├── document.service.ts        # Upload, validation, covers, progress
│   │   ├── indexeddb.service.ts       # Local database access
│   │   ├── reader-preferences.service.ts
│   │   └── theme.service.ts
│   ├── utils/                         # Pure helpers + Vitest regression tests
│   ├── app.config.ts
│   └── app.routes.ts
├── assets/icons/                      # PWA icons
├── styles.css                         # Tailwind 4 + shared base/menu styles
└── manifest.webmanifest
```

## EPUB engine migration

`epubjs` has been removed. The only EPUB dependency is `@likecoin/epub-ts@0.7.3`, used through
its browser ESM entry point and generated TypeScript declarations:

- `Book`, `Rendition`, `Contents`, `Location`, `NavItem` and `SearchResult` types come from the
  package — there are no `any` casts and strict mode remains enabled.
- `book.opened`, `book.loaded.metadata`, `book.loaded.navigation`, `rendition.relocated`,
  `rendition.currentLocation()` and `book.locations.percentageFromCfi()` were checked against
  the installed version.
- Metadata and cover extraction in `DocumentService` use the same package.
- Books, renditions, content hooks, timers, resize observers, fullscreen listeners and object
  URLs are torn down on navigation; stale async operations are ignored through load/search
  tokens.
- Malformed CFIs are validated before use. If a saved CFI is stale, the reader falls back to the
  saved chapter or percentage; if no safe fallback exists it opens at the start and **does not
  overwrite** the saved position until the reader navigates. A corrupt archive cannot surface as
  an unhandled rejection.

## Development

```bash
pnpm start          # dev server
pnpm build          # production build (dist/pdf-translator)
pnpm test           # Vitest unit tests (Angular unit-test builder)
pnpm run watch      # development build in watch mode
```

The test target uses `@angular/build:unit-test` with Vitest and jsdom. Regression tests cover
progress formatting, file sizes, shortcut guards, CFI validation, TOC flattening/active entry
resolution, href normalisation, search excerpt cleanup and deduplication.

## Browser support

Modern Chromium, Firefox and Safari versions that support ES2022, IndexedDB, Canvas, File API
and ArrayBuffer. Service workers and installability use the Angular PWA setup.

## Known limitations

- Password-protected/encrypted PDFs and DRM/encrypted EPUBs are rejected or fail with an error
  state; there is no password prompt beyond the native PDF viewer dialog.
- PDF covers are placeholders until the PDF is opened once, because thumbnails are generated by
  the local PDF.js viewer instance rather than a separate PDF engine.
- Fixed-layout EPUB support depends on `epub-ts`; complex/quirky publisher CSS may render
  differently from a dedicated e-reader.
- `pdfviewer.net` could not be fully inspected from this environment (the site returned only its
  shell/title). The implementation follows the explicit design direction in the task: compact
  toolbar, collapsible navigation, grouped controls, neutral document canvas, and document-first
  layout. It is not claimed to be pixel-identical to that site.
- Automated checks cover the reading flows in a desktop Chromium run (upload, PDF/EPUB rendering,
  navigation, search, restore, mobile layout, both themes). Other browsers and screen readers
  were not available for automated testing.

## License

This project is open source and available under the MIT License.
