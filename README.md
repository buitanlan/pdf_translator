# PDF Translator - Angular 20 PDF Viewer

A modern Angular 20 application that uses PDF.js to display and interact with PDF files in the browser.

## Features

- 📄 **PDF File Upload**: Drag and drop or browse to select PDF files
- 🔍 **Zoom Controls**: Zoom in, zoom out, and reset zoom functionality
- 📖 **Page Navigation**: Navigate between pages with previous/next buttons
- 🎨 **Modern UI**: Clean, responsive design with smooth animations
- ⚡ **Fast Rendering**: Uses PDF.js for efficient PDF rendering
- 🔧 **Angular 20**: Built with the latest Angular framework using standalone components

## Prerequisites

- Node.js (version 18 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pdf-translator
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:4200`

## Usage

1. **Upload a PDF**: Click the "Browse Files" button or drag and drop a PDF file
2. **Navigate Pages**: Use the "Previous" and "Next" buttons to move between pages
3. **Zoom Controls**: 
   - Click "Zoom In" to increase the scale
   - Click "Zoom Out" to decrease the scale
   - Click "Reset Zoom" to return to the original size
4. **View Page Info**: The current page number and total pages are displayed in the top right

## Project Structure

```
src/
├── app/
│   ├── pdf-viewer/
│   │   └── pdf-viewer.component.ts    # Main PDF viewer component
│   ├── app.component.ts               # Root application component
│   ├── app.config.ts                  # Application configuration
│   └── app.routes.ts                  # Routing configuration
├── assets/                            # Static assets
├── index.html                         # Main HTML file
├── main.ts                           # Application entry point
└── styles.css                        # Global styles
```

## Technologies Used

- **Angular 20**: Modern web framework with standalone components
- **PDF.js**: Mozilla's PDF rendering library
- **TypeScript**: Type-safe JavaScript
- **CSS3**: Modern styling with flexbox and grid

## Building for Production

To build the application for production:

```bash
npm run build
```

The built files will be in the `dist/pdf-translator` directory.

## Development

- **Development server**: `npm start`
- **Build**: `npm run build`
- **Watch mode**: `npm run watch`
- **Tests**: `npm test`

## Browser Support

This application works in all modern browsers that support:
- ES2022 features
- Canvas API
- File API
- ArrayBuffer

## License

This project is open source and available under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Troubleshooting

### PDF.js Worker Issues
If you encounter issues with PDF.js workers, ensure that:
1. The PDF.js worker files are properly copied to the assets folder
2. The worker path in the component is correct
3. Your server is configured to serve static assets

### File Upload Issues
- Ensure the file is a valid PDF
- Check that the file size is reasonable (large files may take time to load)
- Verify that your browser supports the File API

### Performance Issues
- Large PDF files may take time to load and render
- Consider implementing lazy loading for multi-page documents
- Use appropriate zoom levels for better performance 