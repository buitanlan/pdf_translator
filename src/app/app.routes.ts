import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { PdfViewerComponent } from './components/pdf-viewer/pdf-viewer.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'viewer/:id', component: PdfViewerComponent },
  { path: '**', redirectTo: '' }
];
