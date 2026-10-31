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
- Two reading layouts, switchable without losing the reading position:
  - **Pages**: real viewport pages via CSS columns. Previous/Next moves one rendered page and
    crosses into the next chapter only at the chapter's last page.
  - **Continuous scroll**: vertical scrolling across consecutive chapters with native wheel,
    trackpad, touch and keyboard scrolling.
- Nested table of contents, fragment links, chapter navigation, previous/next page navigation,
  and recalculation of pagination after typography/viewport changes.
- Full-book search with chapter labels, excerpts and CFI navigation to each match.
- Reading settings: layout, text size, line spacing, serif/sans typeface, text zoom and
  light/sepia/dark reading themes.
- Fullscreen, download, and CFI-based position saving/restoration with chapter and
  percentage progress, plus a page counter inside the current chapter.
- Book text is rendered as sanitized, selectable HTML in the main document's light DOM (not an
  iframe or canvas). Embedded scripts, frames, event handlers and `javascript:` URLs are removed;
  EPUB scripts are disabled and never executed.
- Publisher styles are loaded into scoped `@scope` layers so they cannot leak into the app shell.
- Keyboard shortcuts: `←`/`PageUp`, `→`/`PageDown`, `/` to search, `Esc` to close panels. In
  continuous mode, arrow keys, `PageUp`/`PageDown`, `Space`, `Home` and `End` scroll the reading
  area. Shortcuts never fire while typing in an input or inside editable content.

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
| EPUB pages | `←` / `PageUp` | Previous page |
| EPUB pages | `→` / `PageDown` / `Space` | Next page |
| EPUB continuous | `↑` / `↓` | Scroll a line |
| EPUB continuous | `PageUp` / `PageDown`, `Space` | Scroll one viewport |
| EPUB continuous | `Home` / `End` | Jump to start/end |
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

- `Book`, `Section`, `EpubCFI`, `Location`, `NavItem` and `SearchResult` types come from the
  package — there are no `any` casts and strict mode remains enabled.
- `book.opened`, `book.loaded.navigation`, `book.locations.percentageFromCfi()`,
  `Section.load()`, `Section.find()` and `EpubCFI.toRange()` / `fromRange()` were checked against
  the installed version.
- Metadata and cover extraction in `DocumentService` use the same package.
- EPUB sections, manifest resources, navigation and CFI maths are provided by `epub-ts`. The
  reading surface itself is light DOM so browser page translation can access the text (an iframe
  or canvas would hide it from translation tools). Page turns move the rendered viewport (CSS
  columns); they do not jump the spine, and chapter changes happen only at page boundaries.
- CSS from the book is injected under `@scope (.epub-content)` inside a low-priority cascade
  layer. JavaScript is removed, other active content is neutralised, and images/fonts are resolved
  to local blob URLs from the EPUB archive.
- Books, resource URLs, content observers, scroll/resize listeners, timers, style sheets,
  fullscreen listeners and object URLs are torn down on navigation; stale async operations are
  ignored through load/search tokens.
- Invalid saved CFIs are validated before use. If a saved CFI is stale, the reader falls back to
  the saved chapter or percentage; if no safe fallback exists it opens at the start and **does not
  overwrite** the saved position until the reader navigates. A corrupt archive cannot surface as
  an unhandled rejection.

## Browser translation

The EPUB surface is designed so browser page translation can detect and translate the book text:

- Book HTML is rendered into the **main document light DOM**, not an iframe, canvas or image.
- The document language is set from EPUB metadata while a book is open (for example `lang="fr"`)
  and restored when leaving the reader. The content container carries the same `lang` and `dir`.
- Publisher `translate="no"` attributes and `notranslate` classes are stripped, and the app does
  not add any.
- Browser translation mutations are observed without re-rendering the book. Pagination and layout
  are recalculated, so translated text remains scrollable and navigable.
- No Google Translate API is used and no book text is sent to a translation service by the app.

**Verification status:** Chrome's real “Translate this page” UI/service could not be exercised in
the headless test environment. This is reported as unverified rather than claimed. What was
verified automatically: a non-French/English EPUB opened with the correct language metadata, all
book text present as selectable light-DOM text with no iframe/canvas/translate blockers, and a
DOM-mutation simulation of translator-style text replacement that remained page-navigable,
scrollable, theme/typography-safe and position-restorable.

## Development

```bash
pnpm start          # dev server
pnpm build          # production build (dist/pdf-translator)
pnpm test           # Vitest unit tests (Angular unit-test builder)
pnpm run watch      # development build in watch mode
```

The test target uses `@angular/build:unit-test` with Vitest and jsdom. Regression tests cover
progress formatting, file sizes, shortcut guards, CFI validation, TOC flattening/active entry
resolution, href/fragment normalisation, language tags, translation-guard removal, search excerpt
cleanup and deduplication.

## Browser support

Modern Chromium, Firefox and Safari versions that support ES2022, IndexedDB, Canvas, File API
and ArrayBuffer. Service workers and installability use the Angular PWA setup.

## Known limitations

- Password-protected/encrypted PDFs and DRM/encrypted EPUBs are rejected or fail with an error
  state; there is no password prompt beyond the native PDF viewer dialog.
- PDF covers are placeholders until the PDF is opened once, because thumbnails are generated by
  the local PDF.js viewer instance rather than a separate PDF engine.
- Fixed-layout EPUB support depends on `epub-ts`; complex/quirky publisher CSS may render
  differently from a dedicated e-reader. All spine sections are prepared when a book opens, so
  unusually large illustrated books can take longer to open and use more memory.
- Browser page translation depends on the browser (and, for Chrome, its translation service).
  Actual “Translate this page” detection is **unverified** in this environment; see the Browser
  translation section for what was checked.
- `pdfviewer.net` could not be fully inspected from this environment (the site returned only its
  shell/title). The implementation follows the explicit design direction in the task: compact
  toolbar, collapsible navigation, grouped controls, neutral document canvas, and document-first
  layout. It is not claimed to be pixel-identical to that site.
- Automated checks cover the reading flows in desktop and mobile Chromium runs (upload, PDF/EPUB
  rendering, paginated and continuous reading, navigation, search, restore, themes, translation
  mutation simulation). Other browsers, real screen readers and Chrome's translation UI were not
  available for automated testing.

## License

This project is open source and available under the MIT License.
