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
const nojekyllPath = path.join(docsDir, '.nojekyll');

// Set environment variables
process.env.VITE_DISABLE_AUTH = 'true';

try {
  // Build with Vite
  console.log('🔨 Running Vite build to docs/...');
  execSync(
    `cd "${clientDir}" && npm run build`,
    { stdio: 'inherit' }
  );

  // Create .nojekyll
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  fs.writeFileSync(nojekyllPath, '');
  console.log('\n✅ Created .nojekyll');

  console.log('\n✅ Build complete! docs/ folder ready for GitHub Pages.\n');
  console.log('📝 Next steps:');
  console.log('   1. git add docs/ .nojekyll');
  console.log('   2. git commit -m "Build for GitHub Pages"');
  console.log('   3. git push');
  console.log('   4. Go to repo Settings > Pages');
  console.log('   5. Set Source: Deploy from a branch > main > /docs\n');
  
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}

