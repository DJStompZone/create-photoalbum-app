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

/* CSS Spinner for the loading phase */
.gallery-item.loading::before {
    content: "";
    position: absolute;
    top: calc(50% - 15px);
    left: calc(50% - 15px);
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    z-index: 0;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.gallery-item img {
    position: relative;
    z-index: 1;
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
        itemDiv.className = 'gallery-item loading'; // Initializes with CSS spinner
        
        const img = document.createElement('img');
        const lowResSrc = \`images/lowres/\${filename}\`;
        const highResSrc = \`images/\${filename}\`;
        
        img.dataset.hdSrc = highResSrc;
        img.alt = "Album Photo";
        img.loading = index < 4 ? 'eager' : 'lazy';
        
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

        const handleLowResLoad = () => {
            itemDiv.classList.remove('loading'); // Kills the spinner
            fetchHighRes();
        };

        // Fire request for low-res placeholder
        img.src = lowResSrc;

        // If the low-res is already in cache and complete, swap immediately
        if (img.complete) {
            handleLowResLoad();
        } else {
            img.addEventListener('load', handleLowResLoad, { once: true });
        }

        itemDiv.appendChild(img);
        gallery.appendChild(itemDiv);
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

  const faviconSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
  <circle cx="12" cy="13" r="4"></circle>
</svg>`;

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