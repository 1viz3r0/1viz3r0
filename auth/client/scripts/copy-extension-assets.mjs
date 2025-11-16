import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, 'dist');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

const filesToCopy = [
  'public/manifest.json',
  // background.js is now bundled by Vite, so we'll copy it from dist/extension/ instead
  // ad-blocker-content.js removed - using only API-based filter lists
].map((relativePath) => path.resolve(rootDir, relativePath));

// Copy files from public/ to dist/
for (const src of filesToCopy) {
  if (existsSync(src)) {
    const dest = path.resolve(distDir, path.basename(src));
    copyFileSync(src, dest);
    console.log(`📦 Copied ${path.basename(src)} -> ${dest}`);
  } else {
    console.warn(`⚠️  Missing file: ${src}`);
  }
}

// Copy bundled background.js from dist/extension/ to dist/
// This is the bundled version that includes Ghostery Adblocker
const extensionDir = path.resolve(distDir, 'extension');
const bundledBackground = path.resolve(extensionDir, 'background.js');
if (existsSync(bundledBackground)) {
  const dest = path.resolve(distDir, 'background.js');
  copyFileSync(bundledBackground, dest);
  console.log(`📦 Copied bundled background.js -> ${dest}`);
} else {
  console.warn(`⚠️  Missing bundled background.js: ${bundledBackground}`);
  console.warn(`   Make sure to run: npx vite build --config vite.config.extension.ts`);
}

// Handle logo.png separately - try multiple locations
const logoPaths = [
  path.resolve(rootDir, 'public/logo.png'),
  path.resolve(distDir, 'extension/logo.png'),
];
const logoDest = path.resolve(distDir, 'logo.png');
let logoCopied = false;

for (const logoPath of logoPaths) {
  if (existsSync(logoPath)) {
    copyFileSync(logoPath, logoDest);
    console.log(`📦 Copied logo.png from ${path.relative(rootDir, logoPath)} -> ${path.relative(rootDir, logoDest)}`);
    logoCopied = true;
    break;
  }
}

if (!logoCopied) {
  console.error('❌ ERROR: logo.png not found!');
  console.error('   Expected locations:');
  logoPaths.forEach(p => console.error(`   - ${path.relative(rootDir, p)}`));
  console.error('   Please add logo.png to client/public/ folder and rebuild.');
  process.exit(1);
}

// Copy built files from dist/extension/ to dist/
// Note: background.js is already copied above
const filesToCopyFromExtension = ['content.js', 'popup.js'];

for (const fileName of filesToCopyFromExtension) {
  const src = path.resolve(extensionDir, fileName);
  if (existsSync(src)) {
    const dest = path.resolve(distDir, fileName);
    copyFileSync(src, dest);
    console.log(`📦 Copied ${fileName} -> ${dest}`);
  } else {
    console.warn(`⚠️  Missing file: ${src}`);
  }
}

// Copy popup CSS assets to assets folder in dist root
const extensionAssetsDir = path.resolve(extensionDir, 'assets');
const distAssetsDir = path.resolve(distDir, 'assets');
if (existsSync(extensionAssetsDir)) {
  // Create assets directory if it doesn't exist
  if (!existsSync(distAssetsDir)) {
    mkdirSync(distAssetsDir, { recursive: true });
  }
  
  // Copy all CSS files from extension/assets to dist/assets
  const files = readdirSync(extensionAssetsDir);
  for (const file of files) {
    if (file.endsWith('.css')) {
      const src = path.resolve(extensionAssetsDir, file);
      const dest = path.resolve(distAssetsDir, file);
      copyFileSync(src, dest);
      console.log(`📦 Copied ${file} -> ${dest}`);
    }
  }
}

console.log('✅ Extension assets copied. Load client/dist/ in Chrome as the unpacked extension.');

