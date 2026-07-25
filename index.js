const { app, BrowserWindow, Menu, shell } = require('electron');
const electrify = require('@theqrl/electrify-qrl')(__dirname);
const { version: APP_VERSION } = require('./package.json');

let window;
let loading;
const WINDOW_TITLE = `QRL Wallet v${APP_VERSION}`;
const MAX_MAIN_LOAD_RETRIES = 60;
const MAX_BLANK_RECOVERY_ATTEMPTS = 3;
const FORCE_SHOW_DELAY_MS = 12000;
const CALLBACK_FALLBACK_DELAY_MS = 15000;
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const APP_ICON_PATH = `${__dirname}/assets/${process.platform === 'darwin' ? 'qrl-mac.png' : 'qrl.png'}`;
const ELECTRON_INSECURE_CSP_WARNING = 'Electron Security Warning (Insecure Content-Security-Policy)';
let hasLoggedSuppressedCspWarning = false;

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (error) {
    return null;
  }
}

function isAllowedOrigin(url, allowedOrigin) {
  const parsed = parseUrl(url);
  return Boolean(parsed && parsed.origin === allowedOrigin);
}

function openInSystemBrowser(url) {
  const parsed = parseUrl(url);
  if (!parsed || !EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return;
  }

  shell.openExternal(parsed.toString()).catch((error) => {
    console.error('[electron] failed to open external URL', {
      url,
      error: error && error.message ? error.message : error,
    });
  });
}

function isKnownCspConsoleWarning(message) {
  return typeof message === 'string' && message.includes(ELECTRON_INSECURE_CSP_WARNING);
}

app.disableHardwareAcceleration();

app.on('ready', function() {

    if (process.platform === 'darwin' && app.dock && typeof app.dock.setIcon === 'function') {
      app.dock.setIcon(APP_ICON_PATH);
    }

    var template = [{
        label: "Application",
        submenu: [
            { label: "About QRL Wallet", selector: "orderFrontStandardAboutPanel:" },
            { type: "separator" },
            { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
        ]}, {
        label: "Edit",
        submenu: [
            { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
            { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
            { type: "separator" },
            { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
            { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
            { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
            { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
        ]}
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  
  // Create the loading screen
  loading = new BrowserWindow({
    width: 425, height: 170,
    title: WINDOW_TITLE,
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
    },
  });
    loading.removeMenu();
    loading.setMenuBarVisibility(false);
    loading.setMinimizable(false);
    loading.setMaximizable(false);
    loading.setResizable(false);
    loading.webContents.on('contextmenu', () => {
        menu.popup(window);
    });
  loading.webContents.on('did-fail-load', (event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error('[loading] did-fail-load', { code, description, validatedURL });
    }
  });
  loading.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    if (loading && !loading.isDestroyed()) {
      loading.setTitle(WINDOW_TITLE);
    }
  });
  loading.loadURL(`file://${__dirname}/loading.html`);

  let bootstrapped = false;
  function bootstrapMainWindow(meteor_root_url, trigger) {
    if (bootstrapped) {
      return;
    }
    bootstrapped = true;
    console.log('[electron] bootstrapping main window via', trigger, meteor_root_url);

    const allowedOrigin = new URL(meteor_root_url).origin;
    let retryCount = 0;
    let blankRecoveryCount = 0;

    function inspectRendererDom() {
      if (!window || window.isDestroyed()) {
        return Promise.resolve(null);
      }
      return window.webContents.executeJavaScript(`(() => {
        const body = document.body;
        const html = document.documentElement;
        const bodyStyle = body ? getComputedStyle(body) : null;
        const htmlStyle = html ? getComputedStyle(html) : null;
        const text = body ? body.innerText || '' : '';
        const firstVisible = Array.from(document.querySelectorAll('body *')).find((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (Number(style.opacity || '1') <= 0.01) return false;
          return rect.width > 2 && rect.height > 2;
        });

        return {
          title: document.title,
          readyState: document.readyState,
          bodyChildren: body ? body.children.length : -1,
          bodyTextLength: text.trim().length,
          bodyTextSample: text.trim().slice(0, 160),
          bodyDisplay: bodyStyle ? bodyStyle.display : null,
          bodyVisibility: bodyStyle ? bodyStyle.visibility : null,
          bodyOpacity: bodyStyle ? bodyStyle.opacity : null,
          bodyBackground: bodyStyle ? bodyStyle.backgroundColor : null,
          bodyColor: bodyStyle ? bodyStyle.color : null,
          htmlDisplay: htmlStyle ? htmlStyle.display : null,
          htmlVisibility: htmlStyle ? htmlStyle.visibility : null,
          htmlOpacity: htmlStyle ? htmlStyle.opacity : null,
          firstVisibleTag: firstVisible ? firstVisible.tagName : null,
          firstVisibleClass: firstVisible ? firstVisible.className : null,
        };
      })()`, true);
    }

    function recoverBlankRenderer(reason) {
      if (!window || window.isDestroyed()) {
        return;
      }
      if (blankRecoveryCount >= MAX_BLANK_RECOVERY_ATTEMPTS) {
        console.error('[electron] blank renderer recovery exhausted', { reason, blankRecoveryCount });
        if (!window.webContents.isDevToolsOpened()) {
          window.webContents.openDevTools({ mode: 'detach' });
        }
        return;
      }
      blankRecoveryCount += 1;
      console.warn('[electron] attempting blank renderer recovery', { reason, blankRecoveryCount });
      window.webContents.insertCSS('html, body { display: block !important; visibility: visible !important; opacity: 1 !important; }')
        .catch(() => {});
      setTimeout(() => {
        if (!window || window.isDestroyed()) {
          return;
        }
        window.reload();
      }, 300);
    }

    function retryLoad(reason) {
      if (retryCount >= MAX_MAIN_LOAD_RETRIES) {
        console.error('[electron] giving up reload retries for', meteor_root_url, 'last reason:', reason);
        return;
      }
      retryCount += 1;
      setTimeout(() => {
        if (!window || window.isDestroyed()) {
          return;
        }
        console.warn('[electron] retrying load', retryCount, 'for', meteor_root_url, 'reason:', reason);
        window.loadURL(meteor_root_url);
      }, 500);
    }

    // Show the main QRL Wallet Window
    window = new BrowserWindow({
      width: 1300, height: 840,
      show: false,
      title: WINDOW_TITLE,
      icon: APP_ICON_PATH,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        sandbox: false,
      },
    });

    const forcedShowTimer = setTimeout(() => {
      if (!window || window.isDestroyed() || window.isVisible()) {
        return;
      }
      console.warn('[electron] forcing main window show after timeout');
      window.show();
      window.focus();
    }, FORCE_SHOW_DELAY_MS);

    // Setup content menu and diagnostics before loading URL.
    window.webContents.on('contextmenu', () => {
      menu.popup(window);
    });

    window.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (isKnownCspConsoleWarning(message)) {
        if (!hasLoggedSuppressedCspWarning) {
          hasLoggedSuppressedCspWarning = true;
          console.log('[renderer] suppressed known Electron CSP warning (unsafe-eval currently required by qrllib/protobuf runtime)');
        }
        return;
      }
      const payload = { level, message, line, sourceId };
      if (level >= 2) {
        console.error('[renderer]', payload);
      } else {
        console.log('[renderer]', payload);
      }
    });

    window.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
      if (isMainFrame) {
        console.log('[electron] did-start-navigation', { url, isInPlace });
      }
    });
    window.webContents.on('page-title-updated', (event) => {
      event.preventDefault();
      if (window && !window.isDestroyed()) {
        window.setTitle(WINDOW_TITLE);
      }
    });

    window.webContents.on('dom-ready', () => {
      inspectRendererDom()
        .then((snapshot) => {
          if (snapshot) {
            console.log('[renderer] dom-ready-snapshot', snapshot);
          }
        })
        .catch((error) => {
          console.error('[renderer] dom-ready-snapshot-failed', error);
        });
    });

    // Destroy the loading page if still open
    if (loading && !loading.isDestroyed()) {
      loading.destroy();
    }

    // Load meteor site in new BrowserWindow
    window.loadURL(meteor_root_url);
    window.once('ready-to-show', () => {
      clearTimeout(forcedShowTimer);
      window.show();
      window.focus();
    });

    // Set About menu for MacOS
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({
        applicationName: "QRL Wallet",
        applicationVersion: APP_VERSION,
        version: `Electron ${process.versions.electron}`,
        copyright: "Die QRL Stiftung, Zug Switzerland",
        credits: "The QRL Developers"
      });
    }

    window.webContents.on('did-finish-load', () => {
      retryCount = 0;
      console.log('[electron] did-finish-load', window.webContents.getURL());
      inspectRendererDom().then((snapshot) => {
        if (!snapshot) {
          return;
        }
        console.log('[renderer] dom-snapshot', snapshot);

        const bodyHidden = snapshot.bodyDisplay === 'none'
          || snapshot.bodyVisibility === 'hidden'
          || Number(snapshot.bodyOpacity || '1') <= 0.01;
        const htmlHidden = snapshot.htmlDisplay === 'none'
          || snapshot.htmlVisibility === 'hidden'
          || Number(snapshot.htmlOpacity || '1') <= 0.01;
        const looksBlank = !snapshot.firstVisibleTag && snapshot.bodyTextLength > 0;

        if (bodyHidden || htmlHidden || looksBlank) {
          recoverBlankRenderer('hidden-or-no-visible-content');
        }
      }).catch((error) => {
        console.error('[renderer] dom-snapshot-failed', error);
      });
    });

    window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedURL });
      if (validatedURL && validatedURL.startsWith(allowedOrigin)) {
        retryLoad(`${errorCode}:${errorDescription}`);
      }
    });

    window.webContents.on('render-process-gone', (event, details) => {
      console.error('[electron] render-process-gone', details);
    });

    window.on('unresponsive', () => {
      console.error('[electron] main window became unresponsive');
    });

    // Ensure off-origin links always open in the system browser.
    window.webContents.on('will-navigate', (ev, url) => {
      if (isAllowedOrigin(url, allowedOrigin)) {
        return;
      }
      ev.preventDefault();
      openInSystemBrowser(url);
    });

    window.webContents.on('will-redirect', (ev, url) => {
      if (isAllowedOrigin(url, allowedOrigin)) {
        return;
      }
      ev.preventDefault();
      openInSystemBrowser(url);
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedOrigin(url, allowedOrigin)) {
        return { action: 'allow' };
      }
      openInSystemBrowser(url);
      return { action: 'deny' };
    });

    window.on('closed', () => {
      clearTimeout(forcedShowTimer);
    });
  }

  const callbackFallback = setTimeout(() => {
    if (bootstrapped) {
      return;
    }
    try {
      const nodejs = electrify.plugins.get('nodejs');
      const fallbackUrl = nodejs && nodejs.config && nodejs.config.ROOT_URL;
      if (fallbackUrl) {
        bootstrapMainWindow(fallbackUrl, 'fallback-timeout');
      } else {
        console.error('[electron] fallback-timeout fired but no nodejs ROOT_URL available');
      }
    } catch (error) {
      console.error('[electron] fallback-timeout failed', error);
    }
  }, CALLBACK_FALLBACK_DELAY_MS);

  // Electrify Start
  electrify.start(function(meteor_root_url) {
    clearTimeout(callbackFallback);
    bootstrapMainWindow(meteor_root_url, 'electrify-callback');
  });
});

app.on('will-quit', function terminate_and_quit(event) {
  if(electrify.isup() && event) {
    event.preventDefault();
    electrify.stop(function(){
      console.log('electrify stop done')
      app.quit();
    });
  }
})

app.on('window-all-closed', function terminate_and_quit(event) {
  console.log('window-all-closed')
  if(electrify.isup() && event) {
    event.preventDefault();
    electrify.stop(function(){
      console.log('electrify stop done')
      app.quit();
    });
  }
});
