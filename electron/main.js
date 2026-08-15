const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;
const VITE_DEV_PORT = 3000;

let mainWindow = null;
let backendProcess = null;
let viteProcess = null;

function startBackend() {
  return new Promise((resolve, reject) => {
    const apiDir = path.join(__dirname, '..');
    const env = { ...process.env, PORT: String(BACKEND_PORT) };

    if (isDev) {
      backendProcess = spawn('npx', ['tsx', 'watch', 'api/index.js'], {
        cwd: apiDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });
    } else {
      backendProcess = spawn('node', ['api/index.js'], {
        cwd: apiDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });
    }

    let started = false;
    const onData = (data) => {
      const text = data.toString();
      console.log('[backend]', text.trim());
      if (!started && text.includes('running on port')) {
        started = true;
        resolve();
      }
    };

    backendProcess.stdout.on('data', onData);
    backendProcess.stderr.on('data', onData);

    backendProcess.on('error', (err) => {
      if (!started) reject(err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`[backend] exited with code ${code}`);
      if (!started && code !== 0) reject(new Error(`Backend exited with code ${code}`));
    });

    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 8000);
  });
}

function startViteDev() {
  return new Promise((resolve, reject) => {
    viteProcess = spawn('npx', ['vite', '--host'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let started = false;
    const onData = (data) => {
      const text = data.toString();
      console.log('[vite]', text.trim());
      if (!started && (text.includes('Local:') || text.includes('ready in'))) {
        started = true;
        resolve();
      }
    };

    viteProcess.stdout.on('data', onData);
    viteProcess.stderr.on('data', onData);

    viteProcess.on('error', reject);

    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 10000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LinguaLeap 语言学习平台',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#FAF8F5',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${VITE_DEV_PORT}`);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startApp() {
  console.log('[electron] starting backend server...');
  await startBackend();
  console.log('[electron] backend ready');

  if (isDev) {
    console.log('[electron] starting Vite dev server...');
    await startViteDev();
    console.log('[electron] Vite dev server ready');
  }

  createWindow();
}

function cleanup() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (viteProcess) {
    viteProcess.kill();
    viteProcess = null;
  }
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', cleanup);

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});