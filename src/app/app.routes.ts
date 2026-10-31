import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'viewer/:id',
    loadComponent: () =>
      import('./components/pdf-viewer/pdf-viewer.component').then((m) => m.PdfViewerComponent),
  },
  {
    path: 'epub-viewer/:id',
    loadComponent: () =>
      import('./components/epub-viewer/epub-viewer.component').then((m) => m.EpubViewerComponent),
  },
  { path: '**', redirectTo: '' },
];
