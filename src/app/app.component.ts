import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  template: ` <router-outlet></router-outlet> `,
  styles: []
})
export class AppComponent {
  title = 'pdf-translator';
}
