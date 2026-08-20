const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

let whatsappClient = null;
let isReady = false;
let currentQR = null;      // raw QR string
let currentQRImage = null; // base64 data URL for browser display
let status = 'disconnected'; // disconnected | qr_ready | connected

async function initWhatsApp() {
  console.log('🚀 Starting WhatsApp bot...');

  // Remove stale Chrome lock from nodemon restarts
  const sessionPath = process.env.WHATSAPP_SESSION_PATH || './session_data';
  const lockFile = path.join(sessionPath, 'session', 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); console.log('🔓 Removed stale browser lock'); } catch (_) {}
  }

  // Destroy previous client on retry
  if (whatsappClient) {
    try { await whatsappClient.destroy(); } catch (_) {}
    whatsappClient = null;
    isReady = false;
    currentQR = null;
    currentQRImage = null;
    status = 'disconnected';
  }

  whatsappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: {
      headless: true,
      // On Railway we install the OS's own Chromium via apt (see nixpacks.toml)
      // and point Puppeteer at it — apt resolves its full shared-lib dependency
      // tree automatically, unlike Puppeteer's own bundled Chrome download.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  whatsappClient.on('qr', async (qr) => {
    status = 'qr_ready';
    currentQR = qr;
    // Print to terminal as fallback
    console.log('📱 QR Code ready — scan in browser UI or below:');
    qrcode.generate(qr, { small: true });
    // Generate data URL for browser
    try {
      currentQRImage = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      console.log('✅ QR image ready at /api/v1/auth/whatsapp-qr');
    } catch (e) {
      console.error('QR image error:', e.message);
    }
  });

  whatsappClient.on('ready', () => {
    isReady = true;
    status = 'connected';
    currentQR = null;
    currentQRImage = null;
    console.log('✅ WhatsApp bot is ready to send OTPs!');
  });

  whatsappClient.on('authenticated', () => {
    console.log('🔐 WhatsApp authenticated — loading session...');
    status = 'connected';
    currentQR = null;
    currentQRImage = null;
  });

  whatsappClient.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failed:', msg);
    status = 'disconnected';
    setTimeout(initWhatsApp, 10000);
  });

  whatsappClient.on('disconnected', (reason) => {
    isReady = false;
    status = 'disconnected';
    console.log('⚠️ WhatsApp disconnected:', reason);
    setTimeout(initWhatsApp, 10000);
  });

  try {
    await whatsappClient.initialize();
  } catch (err) {
    console.error('⚠️ WhatsApp init error:', err.message);
    status = 'disconnected';
    setTimeout(initWhatsApp, 15000);
  }
}

async function sendWhatsAppMessage(phoneNumber, message) {
  if (!isReady || !whatsappClient) {
    throw new Error('WhatsApp bot is not ready yet');
  }
  let formatted = phoneNumber.replace(/\D/g, '');
  if (formatted.startsWith('0')) formatted = '92' + formatted.slice(1);

  // Blindly building `${number}@c.us` and calling sendMessage can resolve
  // "successfully" even when the number isn't actually on WhatsApp — the
  // message silently never delivers. getNumberId verifies the number is a
  // real WhatsApp account and gives us the real WID to send to.
  const numberId = await whatsappClient.getNumberId(formatted);
  if (!numberId) {
    throw new Error(`${phoneNumber} is not registered on WhatsApp`);
  }

  await whatsappClient.sendMessage(numberId._serialized, message);
  console.log('📨 WhatsApp OTP sent to', phoneNumber);
}

function getWhatsAppStatus() {
  return { isReady, status, hasQR: !!currentQRImage };
}

function getWhatsAppQR() {
  return currentQRImage;
}

module.exports = { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus, getWhatsAppQR };
