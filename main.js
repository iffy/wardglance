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



ipcMain.on('set-creds', function(ev, username, password) {
  client.setCredentials(username, password);
  ev.sender.send('message', "Credentials set");
});

ipcMain.on('get-data', function(ev) {
  client.getCallings()
  .then(function(callings) {
    ev.sender.send('callings', callings);
  }.bind(this))
  .catch(function(err) {
    ev.sender.send('error', "Error getting callings", err);
  })
});

class LDSClient {
  constructor() {
    this.username = null;
    this.password = null;
    this.unit_number = null;
    this.callings = null;
    this.session = null;
  }
  setCredentials(username, password) {
    this.username = username;
    this.password = password;
    this.session = null;
    this.unit_number = null;
    this.callings = null;
  }
  authenticatedSession() {
    if (this.session) {
      return Promise.resolve(this.session);
    }

    if (!this.username || !this.password) {
      return Promise.reject("No username/password");
    }

    return new Promise(function(resolve, reject) {
      this.session = request.defaults({jar:request.jar()});
      setTimeout(function() {
        this.session = null;
      }.bind(this), 1000 * 60 * 10);
      console.log('GET ident.lds.org');
      this.session.get('https://ident.lds.org/sso/UI/Login', {
        qs: {
          'service': 'credentials',
          'goto': 'https://www.lds.org/signinout/',
          'lang': 'eng',
        }
      }, function(err, r, body) {
        console.log('response', r.statusCode);
        console.log('POST ident.lds.org', this.username);
        this.session.post('https://ident.lds.org/sso/UI/Login', {
          form: {
            'IDToken1': this.username,
            'IDToken2': this.password,
            'IDButton': 'Log In',
          }
        }, function(err, r, body) {
          if (err) {
            console.log('error', err);
            this.session = null;
            reject(err);
          } else {
            console.log('response', r.statusCode);
            resolve(this.session);
          }
        }.bind(this));
      }.bind(this));  
    }.bind(this));
  }
  getUnitNumber() {
    if (this.unit_number) {
      return Promise.resolve(this.unit_number);
    } else {
      return this.authenticatedSession()
      .then(function(session) {
        return new Promise(function(resolve, reject) {
          console.log('GET www.lds.org member-list');
          session.get('https://www.lds.org/mls/mbr/records/member-list?lang=eng', function(e, r, body) {
            console.log('response', r.statusCode);
            console.log('headers', r.headers);
            var regexp = /window.unitNumber\s=\s'(.*?)';/;
            var match = regexp.exec(body);
            if (match) {
              this.unit_number = match[1];
              resolve(this.unit_number);
            } else {
              console.log('body', body);
              reject("Could not get unit number");
            }
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }
  }
  getCallings() {
    if (this.callings) {
      return Promise.resolve(this.callings);
    } else {
      return this.authenticatedSession()
      .then(function(session) {
        return this.getUnitNumber()
        .then(function(unit_number) {
          return [session, unit_number];
        })
      }.bind(this))
      .then(data => {
        var session = data[0];
        var unit_number = data[1];
        console.log('GET members-with-callings');
        return new Promise(function(resolve, reject) {
          session.get('https://www.lds.org/mls/mbr/services/report/members-with-callings', {
            qs: {
              'lang': 'eng',
              'unitNumber': unit_number,
            },
            headers: {
              'Accept': 'application/json',
            }
          }, function(err, r, body) {
            if (err) {
              reject(err);
            } else {
              this.callings = JSON.parse(body);
              resolve(this.callings);
            }
            
          }.bind(this));
        }.bind(this));
      });
    }
  }
}

client = new LDSClient();