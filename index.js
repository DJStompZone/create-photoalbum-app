#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Creates a sleek, mobile-first, auto-building photo album template with blur-up lazy loading via sharp.
 * @param {string} targetDirectory The directory where the photo album will be generated.
 * @param {string} title The title of the album.
 * @param {string} description The description of the album.
 * @param {string} url The base URL for the album.
 * @returns {void}
 */
function generatePhotoAlbum(targetDirectory, title, description, url) {
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true });
  }
  
  const publicDir = path.join(targetDirectory, 'public');
  const imagesDir = path.join(publicDir, 'images');
  
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const packageJsonContent = `{
  "name": "${path.basename(targetDirectory).toLowerCase().replace(/\s+/g, '-')}",
  "version": "1.0.0",
  "description": ${JSON.stringify(description)},
  "type": "module",
  "scripts": {
    "build": "node build.js"
  },
  "dependencies": {
    "sharp": "^0.33.5"
  }
}`;

  const configJsonContent = `{
  "title": ${JSON.stringify(title)},
  "description": ${JSON.stringify(description)},
  "url": ${JSON.stringify(url)},
  "ogImage": "images/default-og.jpg"
}`;

  const buildJsContent = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public');
const imagesDir = path.join(publicDir, 'images');
const lowresDir = path.join(imagesDir, 'lowres');
const photosJsFile = path.join(publicDir, 'photos.js');
const indexHtmlFile = path.join(publicDir, 'index.html');
const manifestFile = path.join(publicDir, 'site.webmanifest');
const configFile = path.join(__dirname, 'album.config.json');

/**
 * Scans the images directory, generates low-res placeholders via sharp, and builds the static site.
 * @returns {Promise<void>}
 */
async function build() {
    const validExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
    
    if (!fs.existsSync(imagesDir)) {
        console.error(\`Error: Directory not found - \${imagesDir}\`);
        process.exit(1);
    }
    
    if (!fs.existsSync(lowresDir)) {
        fs.mkdirSync(lowresDir, { recursive: true });
    }

    const allFiles = fs.readdirSync(imagesDir);
    const imageFiles = allFiles.filter(file => {
        const fullPath = path.join(imagesDir, file);
        return fs.statSync(fullPath).isFile() && validExtensions.has(path.extname(file).toLowerCase());
    });

    console.log(\`Found \${imageFiles.length} photos. Blasting low-res placeholders via sharp...\`);

    // Process images with sharp
    for (const file of imageFiles) {
        const inputPath = path.join(imagesDir, file);
        const destPath = path.join(lowresDir, file);
        
        if (!fs.existsSync(destPath)) {
            try {
                console.log(\`  -> Processing \${file}\`);
                await sharp(inputPath)
                    .resize({ width: 20 })
                    .withMetadata(false) // strip EXIF for tiny size
                    .jpeg({ quality: 60, force: false })
                    .webp({ quality: 60, force: false })
                    .png({ quality: 60, force: false })
                    .toFile(destPath);
            } catch (err) {
                console.error(\`Failed to process \${file}:\`, err.message);
            }
        }
    }

    // 1. Generate the JS data source
    const jsContent = \`/**
 * Auto-generated photo data. Do not edit manually.
 * Run 'npm run build' to regenerate this file.
 * @type {string[]}
 */
const albumPhotos = \${JSON.stringify(imageFiles, null, 4)};\`;
    fs.writeFileSync(photosJsFile, jsContent, 'utf8');

    // 2. Read the user configuration
    let config = {
        title: "My Photo Album",
        description: "A sleek, mobile-first photo gallery.",
        url: "https://example.com",
        ogImage: "images/default-og.jpg"
    };

    if (fs.existsSync(configFile)) {
        try {
            config = { ...config, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };
        } catch (e) {
            console.error("Error reading album.config.json, falling back to default configuration.");
        }
    }

    let ogImage = config.ogImage;
    if (ogImage === "images/default-og.jpg" && imageFiles.length > 0) {
        ogImage = \`images/\${imageFiles[0]}\`;
    }

    const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
    const finalOgImage = ogImage.startsWith('http') 
        ? ogImage 
        : \`\${baseUrl}/\${ogImage.startsWith('/') ? ogImage.slice(1) : ogImage}\`;

    // 3. Generate the Web Manifest
    const manifestContent = {
        name: config.title,
        short_name: "Album",
        description: config.description,
        start_url: "./index.html",
        display: "standalone",
        background_color: "#121212",
        theme_color: "#121212",
        icons: [
            {
                src: "favicon.svg",
                sizes: "any",
                type: "image/svg+xml"
            }
        ]
    };
    fs.writeFileSync(manifestFile, JSON.stringify(manifestContent, null, 4), 'utf8');

    const preloadTags = imageFiles.slice(0, 4).map(function(file) {
        return '    <link rel="preload" as="image" href="images/lowres/' + file + '">';
    }).join('\\n');

    // 4. Generate the HTML file
    const htmlContent = \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <title>\${config.title}</title>
    <meta name="title" content="\${config.title}">
    <meta name="description" content="\${config.description}">
    <meta name="theme-color" content="#121212">

    <link rel="preload" as="style" href="style.css">
\${preloadTags}

    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <link rel="apple-touch-icon" href="favicon.svg">
    <link rel="manifest" href="site.webmanifest">

    <meta property="og:type" content="website">
    <meta property="og:url" content="\${baseUrl}">
    <meta property="og:title" content="\${config.title}">
    <meta property="og:description" content="\${config.description}">
    <meta property="og:image" content="\${finalOgImage}">

    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="\${baseUrl}">
    <meta property="twitter:title" content="\${config.title}">
    <meta property="twitter:description" content="\${config.description}">
    <meta property="twitter:image" content="\${finalOgImage}">

    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <h1>\${config.title}</h1>
        \${config.description ? \`<p style="text-align: center; color: #aaa; margin-top: 0.5rem; max-width: 600px; margin-inline: auto;">\${config.description}</p>\` : ''}
    </header>
    
    <main class="gallery" id="gallery"></main>
    
    <div id="lightbox" class="lightbox">
        <span class="close" id="lightbox-close">&times;</span>
        <img class="lightbox-content" id="lightbox-img" alt="Enlarged view">
    </div>
    
    <script src="photos.js"></script>
    <script src="script.js"></script>
</body>
</html>\`;

    fs.writeFileSync(indexHtmlFile, htmlContent, 'utf8');
    
    console.log(\`Successfully built '\${config.title}' with \${imageFiles.length} photos.\`);
}

build();`;

  const cssContent = `* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #121212;
    color: #ffffff;
    line-height: 1.6;
}

header {
    text-align: center;
    padding: 2rem 1rem;
}

h1 {
    font-weight: 300;
    letter-spacing: 2px;
}

.gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
    padding: 10px;
    grid-auto-rows: 200px;
    grid-auto-flow: dense;
}

.gallery-item {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    cursor: pointer;
    background-color: #1e1e1e;
    transition: transform 0.3s ease;
}

.gallery-item:hover {
    transform: scale(1.02);
}

.gallery-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    /* Setup for blur-up effect */
    filter: blur(15px);
    transform: scale(1.1); /* Prevents blurred edges from showing background */
    transition: filter 0.5s ease-out, transform 0.5s ease-out;
}

.gallery-item img.loaded {
    filter: blur(0);
    transform: scale(1);
}

@media (min-width: 600px) {
    .gallery {
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        grid-auto-rows: 250px;
        gap: 15px;
        padding: 15px;
    }
}

.lightbox {
    display: none;
    position: fixed;
    z-index: 999;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
    align-items: center;
    justify-content: center;
}

.lightbox-content {
    max-width: 90%;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
}

.close {
    position: absolute;
    top: 20px;
    right: 30px;
    color: #f1f1f1;
    font-size: 40px;
    font-weight: bold;
    cursor: pointer;
    z-index: 1000;
}`;

  const scriptJsContent = `/**
 * Renders the photo gallery DOM elements with advanced blur-up lazy loading.
 * @returns {void}
 */
function renderGallery() {
    const gallery = document.getElementById('gallery');
    
    if (!gallery || typeof albumPhotos === 'undefined') {
        console.error('Gallery container or albumPhotos array is missing.');
        return;
    }

    if (albumPhotos.length === 0) {
        gallery.innerHTML = '<p style="text-align:center; grid-column: 1 / -1; color: #888;">No photos found. Add images to public/images/ and run the build script.</p>';
        return;
    }

    albumPhotos.forEach((filename, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'gallery-item';
        
        const img = document.createElement('img');
        const lowResSrc = \`images/lowres/\${filename}\`;
        const highResSrc = \`images/\${filename}\`;
        
        img.src = lowResSrc;
        img.dataset.hdSrc = highResSrc;
        img.alt = "Album Photo";
        img.loading = index < 4 ? 'eager' : 'lazy';
        
        itemDiv.appendChild(img);
        gallery.appendChild(itemDiv);

        const fetchHighRes = () => {
            const hdImage = new Image();
            hdImage.src = highResSrc;
            hdImage.onload = () => {
                img.src = highResSrc;
                // Double requestAnimationFrame ensures the browser paints the new src 
                // before we trigger the CSS transition removing the blur
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        img.classList.add('loaded');
                    });
                });
            };
        };

        // If the low-res is already in cache and complete, swap immediately
        if (img.complete) {
            fetchHighRes();
        } else {
            img.addEventListener('load', fetchHighRes, { once: true });
        }
    });
}

/**
 * Initializes the lightbox functionality for the photo gallery.
 * @returns {void}
 */
function initLightbox() {
    const gallery = document.getElementById('gallery');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.getElementById('lightbox-close');

    if (!gallery || !lightbox || !lightboxImg || !closeBtn) {
        return;
    }

    gallery.addEventListener('click', (event) => {
        if (event.target.tagName === 'IMG') {
            lightboxImg.src = event.target.dataset.hdSrc || event.target.src;
            lightbox.style.display = 'flex';
        }
    });

    closeBtn.addEventListener('click', () => {
        lightbox.style.display = 'none';
        lightboxImg.src = '';
    });

    lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) {
            lightbox.style.display = 'none';
            lightboxImg.src = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderGallery();
    initLightbox();
});`;

  const faviconSvgContent = `<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="m48.01 72h351.99v368h-351.99v-31.75c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.58c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.58c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.58c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.58c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.58c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.58c4.01-0.78 8.37 0.67 12.09-1.43 5.11-2.88 5.18-10.76 0.01-13.64-3.58-2.01-8.18-0.97-12.1-1.35v-31.83zm65.04 284.08c0.4 0.81 0.8 1.61 1.2 2.42 0.41 0 0.82-0.01 1.23-0.01 1.76 1.77 4.96 1.51 7.27 1.51h16 65.5 92.5 24c3.83 0 8.26 0.73 11.66-1.37 4.56-2.82 3.59-8.31 3.59-12.88v-32.5-117.5-29c0-4.05 0.88-9.1-2.15-12.33-3.21-3.43-8.36-2.5-12.6-2.5h-31.5-127.5-34.5c-4.67 0-10.45-1.11-13.85 2.81-3.08 3.54-1.9 9.71-1.9 14.02v35 103.5 31c0 5.94-0.66 12.19 1.05 17.83z" fill="#ffe76c" fill-rule="evenodd" stroke="#ffe76c" stroke-linejoin="round" stroke-width=".25"/><path d="m448.5 104.25c4.33-0.96 11.87-0.91 14.32 3.63 1.82 3.37 1.18 7.68 1.18 11.37v23c0 3.06-0.71 7.18 0.5 10 2.32-0.52 4.87-0.25 7.25-0.25 5.73 0 19.87-2.06 23.07 3.88 2.44 4.53 1.18 11.39 1.18 16.37v36.5 134 45c0 5.14 1.64 13.34-2.04 17.51-3.25 3.7-8.81 2.74-13.21 2.74-10.66 0-21.92-1.02-32.5 0.17-0.73 3.31-0.25 7.17-0.25 10.58v22.5c0 4.63 0.93 10.85-3.89 13.56-2.97 1.68-6.58 1.19-9.86 1.19h-19.5-73.5-210-64c-6.6 0-24.21 1.2-29.55-0.39-5.09-1.51-5.7-6.32-5.7-10.86v-24.5c0-3.77-0.57-8.07 0.25-11.75-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.2-0.03 5.76 0.8 6.3-0.51 0.75-1.82-0.05-5.72-0.05-7.74 0-6.97-1.23-16.6 0.25-23.25-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.2-0.03 5.76 0.8 6.3-0.51 0.75-1.82-0.05-5.72-0.05-7.74 0-6.97-1.23-16.6 0.25-23.25-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.2-0.03 5.76 0.8 6.3-0.51 0.75-1.82-0.05-5.72-0.05-7.74 0-6.97-1.23-16.6 0.25-23.25-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.2-0.03 5.76 0.8 6.3-0.51 0.75-1.82-0.05-5.72-0.05-7.74 0-6.97-1.23-16.6 0.25-23.25-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.2-0.03 5.76 0.8 6.3-0.51 0.75-1.82-0.05-5.72-0.05-7.74 0-6.97-1.23-16.6 0.25-23.25-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.2-0.03 5.76 0.8 6.3-0.51 0.75-1.82-0.05-5.72-0.05-7.74 0-6.97-1.23-16.6 0.25-23.25-5.36-2.31-12.21 1.7-15.43-5.19-0.65-1.39-0.96-3.1-0.64-4.64 1.03-4.93 4.97-6.57 9.57-6.67 1.23-0.03 6.07 0.86 6.36-0.75 0.5-2.7-0.11-6.22-0.11-9v-24.5c0-4.99-0.48-11.12 5.23-13.15 5.44-1.93 21.92-0.6 28.52-0.6h63.5 213.5 72 19c3.38 0 7.29-0.48 10.37 1.18 4.66 2.51 3.88 8.67 3.88 13.07v23.5c0 3.2-0.76 7.57 0.5 10.5zm-400.49-32.25v31.83c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.58c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.58c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.58c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.58c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.58c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.58c3.92 0.38 8.52-0.66 12.1 1.35 5.17 2.88 5.1 10.76-0.01 13.64-3.72 2.1-8.08 0.65-12.09 1.43v31.75h351.99v-368h-351.99zm383.98 0.02h-15.98v31.96h15.98v-31.96zm16.01 47.99h-32v223.98h32v-223.98zm-332.52 238.48c0.21-0.25 0.41-0.49 0.62-0.74-0.62-0.61-1.23-1.23-1.85-1.84-0.4 0.06-0.8 0.12-1.2 0.17-1.71-5.64-1.05-11.89-1.05-17.83v-31-103.5-35c0-4.31-1.18-10.48 1.9-14.02 3.4-3.92 9.18-2.81 13.85-2.81h34.5 127.5 31.5c4.24 0 9.39-0.93 12.6 2.5 3.03 3.23 2.15 8.28 2.15 12.33v29 117.5 32.5c0 4.57 0.97 10.06-3.59 12.88-3.4 2.1-7.83 1.37-11.66 1.37h-24-92.5-65.5-16c-2.31 0-5.51 0.26-7.27-1.51zm18.5-35.26c0.22 0.02 0.44 0.04 0.66 0.05 0.27-0.17 0.54-0.35 0.81-0.53-0.27-0.22-0.55-0.45-0.82-0.67 0.29-0.3 0.58-0.61 0.87-0.91 0.08 0.37 0.17 0.75 0.25 1.12 0.12-0.45 0.23-0.89 0.35-1.34 2.91-3.65 5.82-7.3 8.73-10.95 0.09-0.1 0.18-0.2 0.27-0.3 2.37-2.93 4.74-5.86 7.12-8.78 0.13-0.07 0.27-0.14 0.4-0.2 3.21-3.9 12.64-16.38 16.4-18.97 1.27-0.88 4.02-2.22 5.62-1.61 0.36 0.13 0.34 0.62 0.72 0.71 1.43 0.35 2.28-0.22 3.44 1.08 0.24 0.07 0.47 0.15 0.7 0.23 1.45 1.26 2.89 2.53 4.34 3.79 0.17 0.23 0.35 0.45 0.52 0.68 0.24 0.12 0.49 0.25 0.74 0.37 1.49 1.28 2.98 2.56 4.48 3.84 0.12 0.25 0.25 0.5 0.37 0.75 0.18-0.13 0.37-0.26 0.55-0.39 3.95 3.39 7.89 6.77 11.84 10.16-0.03 0.24-0.05 0.48-0.07 0.72 0.26-0.01 0.52-0.02 0.79-0.03 0.42 0.31 0.85 0.62 1.27 0.94 0.22 0.18 0.45 0.37 0.67 0.55 0.06-0.01 0.13-0.03 0.19-0.04 1.23 1.11 4.32 4.5 6.06 4.3 1.07-0.13 2.49-2.9 3.11-3.71 3.01-3.99 5.98-8.02 9-12.02 1.79-2.35 3.52-5.77 5.76-7.68 0.25-0.22 1.04-0.45 1.18-0.68 0.15-0.27-0.28-0.96-0.11-1.33 0.53-1.18 2.47-3.16 3.24-4.36 1.13-1.75 3.23-3.44 4.55-5.13 2.48-3.18 5.13-6.61 7.44-9.95 3.21-4.63 6.83-11.19 10.96-14.93 1.51-1.38 1.78-3.25 3.38-4.51 0.1-0.11 0.2-0.22 0.31-0.33 8.09-8.7 13.2 1.1 16.92 7.33 0.53 0.89 1.6 1.8 1.84 2.83 0.73 3.06 9.48 15.98 11.96 20.11 1.2 2 3.1 4.38 3.86 6.55 0.1 0.29-0.02 1.08 0.06 1.22 0.71 1.24 2.25 2.84 3.15 4.17 4.34 6.42 7.62 13.55 11.84 20.01 3.36 5.15 5.72 11.88 10.05 16.24v-153.51h-191.5v161.04c1.91-1.97 3.82-3.95 5.73-5.93zm346.02-155.21h-15.75c-0.76 5.26-0.25 10.91-0.25 16.23v30.5 93.5 35.5c0 4.55 1.14 10.51-2.49 14.02-3.39 3.27-8.98 2.23-13.26 2.23-10.54 0-21.79-1.11-32.24 0.17v31.82h63.99v-223.97zm-308.62 68.11c-0.11-0.16-0.22-0.32-0.34-0.47-1.63-3.21-2.89-6.8-3-10.41-0.04-1.19-0.57-3.6 0.96-3.5-3.32-6.01 7.63-16.94 12.63-19.34 12.38-5.95 29.31 0.3 33.25 14.37 7.71 27.5-29.64 43.58-43.5 19.35zm18.91-19.99c-10.3 2.08-6.41 18.52 3.81 15.64 9.66-2.72 6.1-17.64-3.81-15.64zm-36.34 108.23c-0.7 0.85-1.4 1.69-2.1 2.53-4.62 5.62-9.25 11.23-13.88 16.85h175.44c-1.4-5.43-8.06-14.1-11.08-19.33-7.9-13.68-16.03-27.26-24.18-40.8-3.01-5-5.91-10.06-8.92-15.06-1.15-1.91-2.05-4.44-3.98-5.55-4.47 5.23-8.33 11.04-12.47 16.54-7.51 9.98-15.08 19.92-22.51 29.96-3.43 4.63-10.4 16.66-15.75 18.23-4.33 1.27-7.55-1.91-10.58-4.42-7.02-5.82-13.99-11.71-21.05-17.49-1.33-1.09-6.25-5.91-7.64-5.96-1.92-0.07-4.39 4.21-5.53 5.6-4.39 5.32-12.7 13.24-15.77 18.9zm278.04 83.65h-15.98v31.96h15.98v-31.96z" fill-rule="evenodd" stroke="#000" stroke-linejoin="round" stroke-width=".25"/><path d="m448 120.01v223.98h-32v-223.98h32zm-187.93 123.16c-0.11 0.11-0.21 0.22-0.31 0.33-1.6 1.26-1.87 3.13-3.38 4.51-4.13 3.74-7.75 10.3-10.96 14.93-2.31 3.34-4.96 6.77-7.44 9.95-1.32 1.69-3.42 3.38-4.55 5.13-0.77 1.2-2.71 3.18-3.24 4.36-0.17 0.37 0.26 1.06 0.11 1.33-0.14 0.23-0.93 0.46-1.18 0.68-2.24 1.91-3.97 5.33-5.76 7.68-3.02 4-5.99 8.03-9 12.02-0.62 0.81-2.04 3.58-3.11 3.71-1.74 0.2-4.83-3.19-6.06-4.3-0.06-0.09-0.13-0.18-0.19-0.28-0.22-0.08-0.45-0.15-0.67-0.23-0.42-0.32-0.85-0.63-1.27-0.94l-0.72-0.69c-3.95-3.39-7.89-6.77-11.84-10.16-0.18-0.11-0.37-0.22-0.55-0.33-0.12-0.01-0.25-0.02-0.37-0.03-1.5-1.28-2.99-2.56-4.48-3.84-0.02-0.15-0.05-0.3-0.07-0.45-0.2-0.17-0.4-0.35-0.6-0.53-0.2-0.02-0.39-0.04-0.59-0.07-1.45-1.26-2.89-2.53-4.34-3.79-0.23-0.08-0.46-0.16-0.7-0.23-1.16-1.3-2.01-0.73-3.44-1.08-0.38-0.09-0.36-0.58-0.72-0.71-1.6-0.61-4.35 0.73-5.62 1.61-3.76 2.59-13.19 15.07-16.4 18.97-0.13 0.06-0.27 0.13-0.4 0.2-2.38 2.92-4.75 5.85-7.12 8.78-0.09 0.1-0.18 0.2-0.27 0.3-2.91 3.65-5.82 7.3-8.73 10.95-0.2 0.08-0.4 0.15-0.6 0.22-0.29 0.3-0.58 0.61-0.87 0.91-0.22 0.38-0.43 0.77-0.65 1.15-1.91 1.98-3.82 3.96-5.73 5.93v-161.04h191.5v153.51c-4.33-4.36-6.69-11.09-10.05-16.24-4.22-6.46-7.5-13.59-11.84-20.01-0.9-1.33-2.44-2.93-3.15-4.17-0.08-0.14 0.04-0.93-0.06-1.22-0.76-2.17-2.66-4.55-3.86-6.55-2.48-4.13-11.23-17.05-11.96-20.11-0.24-1.03-1.31-1.94-1.84-2.83-3.72-6.23-8.83-16.03-16.92-7.33zm-89.03-7.51c0.12 0.15 0.23 0.31 0.34 0.47 13.86 24.23 51.21 8.15 43.5-19.35-3.94-14.07-20.87-20.32-33.25-14.37-5 2.4-15.95 13.33-12.63 19.34-1.53-0.1-1 2.31-0.96 3.5 0.11 3.61 1.37 7.2 3 10.41z" fill="#6ed2f0" fill-rule="evenodd" stroke="#6ed2f0" stroke-linejoin="round" stroke-width=".25"/>
<path d="m151.85 326.9c0.7-0.84 1.4-1.68 2.1-2.53 3.07-5.66 11.38-13.58 15.77-18.9 1.14-1.39 3.61-5.67 5.53-5.6 1.39 0.05 6.31 4.87 7.64 5.96 7.06 5.78 14.03 11.67 21.05 17.49 3.03 2.51 6.25 5.69 10.58 4.42 5.35-1.57 12.32-13.6 15.75-18.23 7.43-10.04 15-19.98 22.51-29.96 4.14-5.5 8-11.31 12.47-16.54 1.93 1.11 2.83 3.64 3.98 5.55 3.01 5 5.91 10.06 8.92 15.06 8.15 13.54 16.28 27.12 24.18 40.8 3.02 5.23 9.68 13.9 11.08 19.33h-175.44c4.63-5.62 9.26-11.23 13.88-16.85z" fill="#35a872" fill-rule="evenodd" stroke="#35a872" stroke-linejoin="round" stroke-width=".25"/><path d="m480 168.02v223.97h-63.99v-31.82c10.45-1.28 21.7-0.17 32.24-0.17 4.28 0 9.87 1.04 13.26-2.23 3.63-3.51 2.49-9.47 2.49-14.02v-35.5-93.5-30.5c0-5.32-0.51-10.97 0.25-16.23h15.75z" fill="#5098ad" fill-rule="evenodd" stroke="#5098ad" stroke-linejoin="round" stroke-width=".25"/>
<path d="m431.99 72.02v31.96h-15.98v-31.96h15.98zm0 336v31.96h-15.98v-31.96h15.98z" fill="#f2c837" fill-rule="evenodd" stroke="#f2c837" stroke-linejoin="round" stroke-width=".25"/><path d="m190.29 216.14c9.91-2 13.47 12.92 3.81 15.64-10.22 2.88-14.11-13.56-3.81-15.64z" fill="#e13f3c" fill-rule="evenodd" stroke="#e13f3c" stroke-linejoin="round" stroke-width=".25"/><path d="m260.07 243.17c-0.11 0.11-0.21 0.22-0.31 0.33 0.1-0.11 0.2-0.22 0.31-0.33zm-107.45 57.55c-0.13 0.06-0.27 0.13-0.4 0.2 0.13-0.07 0.27-0.14 0.4-0.2zm49.65 1.36c0.26-0.01 0.52-0.02 0.79-0.03-0.27 0.01-0.53 0.02-0.79 0.03zm-66.77 19.09c0.2-0.07 0.4-0.14 0.6-0.22-0.12 0.45-0.23 0.89-0.35 1.34-0.08-0.37-0.17-0.75-0.25-1.12zm-0.87 0.91c0.27 0.22 0.55 0.45 0.82 0.67-0.27 0.18-0.54 0.36-0.81 0.53 0-0.4 0-0.8-0.01-1.2zm-21.58 34c0.4-0.05 0.8-0.11 1.2-0.17 0.62 0.61 1.23 1.23 1.85 1.84-0.21 0.25-0.41 0.49-0.62 0.74-0.41 0-0.82 0.01-1.23 0.01-0.4-0.81-0.8-1.61-1.2-2.42z" fill="#0e1312" fill-rule="evenodd" stroke="#0e1312" stroke-linejoin="round" stroke-width=".25"/><path d="m153.95 324.37c-0.7 0.85-1.4 1.69-2.1 2.53 0.7-0.84 1.4-1.68 2.1-2.53z" fill="#287f56" fill-rule="evenodd" stroke="#287f56" stroke-linejoin="round" stroke-width=".25"/><path d="m178.8 281.93c0.24 0.07 0.47 0.15 0.7 0.23-0.23-0.08-0.46-0.16-0.7-0.23zm23.54 19.43 0.72 0.69c-0.27 0.01-0.53 0.02-0.79 0.03 0.02-0.24 0.04-0.48 0.07-0.72zm-67.71 20.72c0.01 0.4 0.01 0.8 0.01 1.2-0.22-0.01-0.44-0.03-0.66-0.05 0.22-0.38 0.43-0.77 0.65-1.15z" fill="#1b373b" fill-rule="evenodd" stroke="#1b373b" stroke-linejoin="round" stroke-width=".25"/><path d="m183.84 285.95c0.2 0.03 0.39 0.05 0.59 0.07-0.02 0.2-0.05 0.41-0.07 0.61-0.17-0.23-0.35-0.45-0.52-0.68zm0.52 0.68c0.22-0.03 0.45-0.05 0.67-0.08 0.02 0.15 0.05 0.3 0.07 0.45-0.25-0.12-0.5-0.25-0.74-0.37zm5.59 4.24c0.18 0.11 0.37 0.22 0.55 0.33-0.18 0.13-0.37 0.26-0.55 0.39v-0.72zm14.38 12.12c0.22 0.08 0.45 0.15 0.67 0.23v0.32c-0.22-0.18-0.45-0.37-0.67-0.55z" fill="#244c4e" fill-rule="evenodd" stroke="#244c4e" stroke-linejoin="round" stroke-width=".25"/><path d="m205 303.22c0.06 0.1 0.13 0.19 0.19 0.28-0.06 0.01-0.13 0.03-0.19 0.04v-0.32zm-59.9 6.48c-0.09 0.1-0.18 0.2-0.27 0.3 0.09-0.1 0.18-0.2 0.27-0.3z" fill="#0f251b" fill-rule="evenodd" stroke="#0f251b" stroke-linejoin="round" stroke-width=".25"/><path d="m171.04 235.66c0.12 0.15 0.23 0.31 0.34 0.47-0.11-0.16-0.22-0.32-0.34-0.47z" fill="#62bcd7" fill-rule="evenodd" stroke="#62bcd7" stroke-linejoin="round" stroke-width=".25"/><path d="m184.43 286.02c0.2 0.18 0.4 0.36 0.6 0.53-0.22 0.03-0.45 0.05-0.67 0.08 0.02-0.2 0.05-0.41 0.07-0.61z" fill="#3c7181" fill-rule="evenodd" stroke="#3c7181" stroke-linejoin="round" stroke-width=".25"/><path d="m189.58 290.84c0.12 0.01 0.25 0.02 0.37 0.03v0.72c-0.12-0.25-0.25-0.5-0.37-0.75z" fill="#14272a" fill-rule="evenodd" stroke="#14272a" stroke-linejoin="round" stroke-width=".25"/></svg>`;

  fs.writeFileSync(path.join(targetDirectory, 'package.json'), packageJsonContent, 'utf8');
  fs.writeFileSync(path.join(targetDirectory, 'album.config.json'), configJsonContent, 'utf8');
  fs.writeFileSync(path.join(targetDirectory, 'build.js'), buildJsContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'style.css'), cssContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'script.js'), scriptJsContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvgContent, 'utf8');
  
  fs.writeFileSync(
      path.join(imagesDir, 'README.txt'), 
      'Drop your HD image files here. The build script will generate low-res thumbnails automatically.', 
      'utf8'
  );

  console.log(`Success! Photo album generated in ${targetDirectory}`);
  console.log('---');
  console.log('To build your album:');
  console.log(`1. cd ${targetDirectory}`);
  console.log('2. Run "npm install" (Compiles native C++ bindings for the sharp image engine)');
  console.log('3. Drop your HD images into public/images/');
  console.log('4. Run "npm run build"');
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    title: { type: 'string' },
    description: { type: 'string' },
    url: { type: 'string' },
    help: { type: 'boolean', short: 'h' }
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Usage: create-photoalbum-app <directory> [options]

Options:
  --title <string>        Set the album title
  --description <string>  Set the album description
  --url <string>          Set the base URL for Open Graph tags
  -h, --help              Show this help message
  `.trim());
  process.exit(0);
}

const targetDir = positionals[0] || 'my-photo-album';
const albumTitle = values.title || 'My Awesome Photo Album';
const albumDescription = values.description || 'A sleek, mobile-first photo gallery.';
const albumUrl = values.url || 'https://example.com';

generatePhotoAlbum(targetDir, albumTitle, albumDescription, albumUrl);
