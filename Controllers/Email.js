import {google} from 'googleapis';
import {authenticate} from '@google-cloud/local-auth';
import path from 'path';
import process from 'process';
import { promises } from 'fs';
import mammoth from 'mammoth';
import { PdfReader } from 'pdfreader';
import { console } from 'inspector';
import Tessaract from 'tesseract.js';
const pdfreader= new PdfReader();
const fs = promises;
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
let attachmentMails = []
  let normalMails = []

const EmailData = {
    attachmentMails:[],
    normalMails:[]
}

async function extractTextFromPDF(binaryData) {
  let fullText = '';
  await new Promise((resolve, reject) => {
    pdfreader.parseBuffer(binaryData, (err, item) => {
      if (err) {
        reject(err);
        return;
      }
      if (!item) {
        resolve();
        return;
      }
      if (item.text) {
        fullText += item.text+'\n';
      }
    });
  });
  return fullText;

}

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

export async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}
async function listMessages(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'coverage OR insurance OR "premium amount"',
      maxResults: 3
    });
    const messages = res.data.messages;
    if (!messages || messages.length === 0) {
      console.log('No Emails found.');
      return;
    }
  
    await Promise.all(
      messages.map(async (message) => {
        const id = message.id;
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: id
        });
        const payload = messageDetails.data.payload;
        const headers = payload.headers;
        const subjectHeader = headers.find((header) => header.name === 'Subject');
        const subject = subjectHeader ? subjectHeader.value : 'No Subject';
        console.log(`Processing message: ${subject}`);
        if (payload.parts) {
          await processParts(payload.parts,auth,subject,id);
        }
      })
    );
    EmailData.attachmentMails = attachmentMails;
    EmailData.normalMails = normalMails;
    return EmailData;
  }
  

async function getAttachmentData(auth,attachmentId,msgId) {
    const gmail = google.gmail({version: 'v1', auth});
    const res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId:msgId,
        id: attachmentId
    });
    const data = res.data.data;
    return data;
}



async function processParts(parts,auth,subject,id) {
  console.log('Processing parts');
  if(parts[0].filename =='' && parts[1].filename == ''){
    console.log('attachment not found');
    const text = parts[1].body.data;
    const body = Buffer.from(text, 'base64').toString('utf-8');
    normalMails.push({
      id: id,
      body,
      subject: subject
    });
  }
  else {
    let obj = { id: id, subject: subject };
    for (const part of parts) {
        if (part.filename) {
            const attachmentId = part.body.attachmentId;
            const data = await getAttachmentData(auth, attachmentId, id);
            const binaryData = Buffer.from(data, 'base64');
            let attachmentContent = null;
            let attachmentType = null;
            console.log(`Processing attachment: ${part.mimeType}`);
            if (part.mimeType === 'application/pdf') {
              try {
                console.log('Extracting text from PDF');
                attachmentContent = await extractTextFromPDF(binaryData);
                attachmentType = 'pdf';
              } catch (err) {
                console.error(`Failed to parse PDF: ${err.message}`);
                attachmentContent = 'Failed to extract text from PDF';
              }
            } else if (part.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const docText = await mammoth.extractRawText({ buffer: binaryData });
              attachmentContent = docText.value;
              attachmentType = 'docx';
            } else if (part.mimeType === 'text/plain') {
              attachmentContent = binaryData.toString('utf-8');
              attachmentType = 'text';
            }
            else if (part.mimeType === 'image/jpeg'||part.mimeType === 'image/png'||part.mimeType === 'image/jpg') {
              try {
              const worker = await Tessaract.createWorker('eng');
              const { data: { text } } = await worker.recognize(binaryData);
              console.log(text);
              await worker.terminate(); 
              attachmentContent = text
              attachmentType = 'image';
                
              } catch (error) {
                throw new Error(`error parsing image data:" ${error.message}`);

              }
            } 
            else {
              console.log(`Unsupported attachment type: ${part.mimeType}`);
              attachmentContent = 'Unsupported attachment type';
              attachmentType = 'unsupported';
            }
            if (!obj.attachments) {
                obj.attachments = [];
            }
            obj.attachments.push({
                attachmentId: attachmentId,
                filename: part.filename,
                attachmentType: attachmentType,
                body: attachmentContent


            });
        } else if (part.parts && part.parts[0] && part.parts[0].body && part.parts[0].body.data) {
            const text = part.parts[1].body.data;
            const body = Buffer.from(text, 'base64').toString('utf-8');
            obj.body = body;
        }
    }
    console.log('Attachment Mails:', obj);
    attachmentMails.push(obj);
}
}
export default listMessages