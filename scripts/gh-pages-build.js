#!/usr/bin/env node

/**
 * GitHub Pages Deploy Script
 * Builds the client with VITE_DISABLE_AUTH=true and outputs to docs/ folder
 * 
 * Usage:
 *   node scripts/gh-pages-build.js
 * 
 * After running:
 *   1. Commit docs/ folder
 *   2. Push to GitHub
 *   3. Go to repo Settings > Pages
 *   4. Set Source: "Deploy from a branch"
 *   5. Select branch: "main", folder: "/docs"
 *   6. GitHub will deploy to https://username.github.io/repo-name/
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('📦 Building for GitHub Pages...\n');

const clientDir = path.join(__dirname, '..', 'client');
const docsDir = path.join(__dirname, '..', 'docs');

// Set environment variables
process.env.VITE_DISABLE_AUTH = 'true';
process.env.VITE_BASE_PATH = '/'; // adjust if deploying to subdirectory

try {
  // Build with Vite, output to docs/
  console.log('🔨 Running Vite build...');
  execSync(
    `cd "${clientDir}" && vite build --outDir "${docsDir}"`,
    { stdio: 'inherit' }
  );

  // Create .nojekyll if it doesn't exist
  const nojekyllPath = path.join(docsDir, '.nojekyll');
  if (!fs.existsSync(nojekyllPath)) {
    fs.writeFileSync(nojekyllPath, '');
    console.log('✅ Created .nojekyll in docs/');
  }

  console.log('\n✅ Build complete! docs/ folder ready for GitHub Pages.\n');
  console.log('📝 Next steps:');
  console.log('   1. git add docs/');
  console.log('   2. git commit -m "Build for GitHub Pages"');
  console.log('   3. git push');
  console.log('   4. Go to repo Settings > Pages');
  console.log('   5. Set Source: Deploy from a branch > main > /docs\n');
  
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}
