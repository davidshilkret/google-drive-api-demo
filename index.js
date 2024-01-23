const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const process = require('process');
const localAuth = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

// Generate OAuth credentials in Google Console
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Refresh access tokens
async function refreshAccessToken(client) {
  return new Promise((resolve, reject) => {
    client.refreshAccessToken((err, credentials) => {
      if (err) {
        console.log('Could not refresh access tokens');
        reject(err);
      } else {
        console.log('Access tokens refreshed');
        saveCredentials(client);
        resolve(credentials);
      }
    });
  });
}

// Reads previously authorized credentials from the save file.
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fsp.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    const client = google.auth.fromJSON(credentials);

    // Check if the token is expired, refresh if necessary
    if (client.isTokenExpiring()) {
      await refreshAccessToken(client);
    }

    return client;
  } catch (err) {
    return null;
  }
}
//
// Serializes credentials to a file comptible with GoogleAUth.fromJSON.
async function saveCredentials(client) {
  const content = await fsp.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fsp.writeFile(TOKEN_PATH, payload);
}

// Load or request or authorization to call APIs.
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await localAuth.authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

// Lists the names and IDs of up to 10 files.
async function listFiles(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return authClient;
  }

  console.log('Files:');
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
  return authClient;
}

// Create a Folder
async function createFolder(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const fileMetadata = {
    name: 'Drive API Test 3',
    mimeType: 'application/vnd.google-apps.folder',
  };

  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });

  const folderId = folder.data.id;
  console.log('Folder Id:', folderId);
  return { authClient, folderId };
}

// Upload a file to a folder
async function uploadFile({ authClient, folderId }) {
  console.log(authClient, folderId);
  const drive = google.drive({ version: 'v3', auth: authClient });
  var fileMetaData = {
    name: 'test-file.txt',
    parents: [folderId], // A folder ID to which file will get uploaded
  };
  const res = await drive.files.create({
    resource: fileMetaData,
    media: {
      body: await fs.createReadStream('test-file.txt'), // files that will get uploaded
      mimeType: 'text/plain',
    },
    fields: 'id',
  });
  return authClient;
}

async function main() {
  try {
    // Authorize and get the client
    const authClient = await authorize();

    // List files
    await listFiles(authClient);

    // Create a folder and get its ID
    const folderInfo = await createFolder(authClient);
    const folderId = folderInfo.folderId;

    // Create a file in the folder
    await uploadFile({ authClient, folderId });

    // List files again
    await listFiles(authClient);
  } catch (error) {
    console.error(error);
  }
}

main();
