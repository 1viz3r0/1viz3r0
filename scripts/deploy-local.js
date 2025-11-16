const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(...args) { console.log('[deploy-local]', ...args); }

(async () => {
  try {
    const root = path.resolve(__dirname, '..');
    const clientDir = path.join(root, 'client');
    const serverPublic = path.join(root, 'auth', 'server', 'public');
    
    log('1) Building client (Vite) — this may take a minute...');
    execSync('npm run build', { cwd: clientDir, stdio: 'inherit', env: { ...process.env, VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:5000' } });

    const distDir = path.join(clientDir, 'dist');
    if (!fs.existsSync(distDir)) {
      throw new Error('Client build output not found: ' + distDir);
    }

    log('2) Copying build to backend public folder:', serverPublic);
    // remove existing public folder then copy
    try {
      if (fs.existsSync(serverPublic)) {
        fs.rmSync(serverPublic, { recursive: true, force: true });
      }
    } catch (e) {
      log('Warning removing old public folder:', e.message);
    }
    fs.mkdirSync(serverPublic, { recursive: true });

    // fs.cp available in Node 16+, use recursive copy
    const copyRecursive = (src, dest) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    copyRecursive(distDir, serverPublic);

    log('3) Starting backend server (auth/server/server.js)');
    const serverProc = spawn('node', ['server.js'], { cwd: path.join(root, 'auth', 'server'), stdio: 'inherit' });

    serverProc.on('exit', (code) => {
      log('Server process exited with code', code);
      process.exit(code);
    });

    serverProc.on('error', (err) => {
      console.error('Failed to start server process:', err);
      process.exit(1);
    });

    log('Done — backend serving static build at http://localhost:5000');
  } catch (err) {
    console.error('Deploy failed:', err);
    process.exit(1);
  }
})();
