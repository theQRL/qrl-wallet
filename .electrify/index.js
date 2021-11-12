const { app, BrowserWindow, Menu } = require('electron');
const electrify = require('@theqrl/electrify-qrl')(__dirname);

let window;
let loading;

app.on('ready', function() {

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
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  
  // Create the loading screen
  loading = new BrowserWindow({
    width: 850, height: 340,
    nodeIntegration: false,
    icon: __dirname + '/assets/qrl.png',
  });
    loading.webContents.on('will-navigate', ev => {
      ev.preventDefault();
    });
    loading.removeMenu();
    loading.setMenuBarVisibility(false);
    loading.setMinimizable(false);
    loading.setMaximizable(false);
    loading.setResizable(false);
    loading.webContents.on('contextmenu', () => {
        menu.popup(window);
    });
  loading.loadURL(`file://${__dirname}/loading.html`)

  // Electrify Start
  electrify.start(function(meteor_root_url) {
    // Show the main QRL Wallet Window
    window = new BrowserWindow({
      width: 1300, height: 720,
      nodeIntegration: false,
      icon: __dirname + '/assets/qrl.png'
    });

    // Destroy the loading page
    loading.destroy();

    // Load meteor site in new BrowserWindow
    window.loadURL(meteor_root_url);

    // Set About menu for MacOS
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({
        applicationName: "QRL Wallet",
        applicationVersion: "1.8.0",
        version: "Electron 10.1.7",
        copyright: "Die QRL Stiftung, Zug Switzerland",
        credits: "The QRL Developers"
      });
    }

    // Setup content menu, and enable copy/paste actions
    window.webContents.on('contextmenu', () => {
        menu.popup(window);
    });

    // Prevent drag and drop links from opening in electron window
    window.webContents.on('will-navigate', ev => {
      ev.preventDefault()
    });
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
