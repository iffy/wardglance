const electron = require('electron');
// Module to control application life.
const {app} = electron;
// Module to create native browser window.
const {BrowserWindow} = electron;

const {ipcMain} = electron;

const {exec} = require('child_process');

var request = require('request');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let client;


function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
  });

  // and load the index.html of the app.
  win.loadURL(`file://${__dirname}/index.html`);

  // Open the DevTools.
  win.webContents.openDevTools();

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});


ipcMain.on('getdata', function(ev, username, password) {
  client.setCredentials(username, password);
  client.authenticateThen(function(session) {
    client.getUnitNumber(session, function(unit_number) {
      ev.sender.send('unit_number', unit_number);
      client.getCallings(session, function(callings) {
        ev.sender.send('callings', callings);
      });
    })  
  });
});

class LDSClient {
  constructor() {
    this.username = '';
    this.password = '';
    this.unit_number = '';
    this.callings = null;
  }
  setCredentials(username, password) {
    this.username = username;
    this.password = password;
  }
  authenticateThen(callback) {
    var j = request.jar()
    var session = request.defaults({jar:j});
    session.get('https://ident.lds.org/sso/UI/Login', {
      qs: {
        'service': 'credentials',
        'goto': 'https://www.lds.org/signinout/',
        'lang': 'eng',
      }
    }, function() {
      session.post('https://ident.lds.org/sso/UI/Login', {
        form: {
          'IDToken1': this.username,
          'IDToken2': this.password,
          'IDButton': 'Log In',
        }
      }, function() {
        callback(session);
      });
    }.bind(this));
  }
  getUnitNumber(session, cb) {
    session.get('https://www.lds.org/mls/mbr/records/member-list?lang=eng', function(e, r, body) {
      var regexp = /window.unitNumber\s=\s'(.*?)';/;
      var match = regexp.exec(body);
      this.unit_number = match[1];
      cb(this.unit_number);
    }.bind(this));
  }
  getCallings(session, cb) {
    session.get('https://www.lds.org/mls/mbr/services/report/members-with-callings', {
      qs: {
        'lang': 'eng',
        'unitNumber': this.unit_number,
      },
      headers: {
        'Accept': 'application/json',
      }
    }, function(err, r, body) {
      this.callings = JSON.parse(body);
      cb(this.callings);
    }.bind(this));
  }
}

client = new LDSClient();