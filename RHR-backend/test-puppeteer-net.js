const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: path.join(__dirname, 'session_data', 'session'),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  try {
    const resp = await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log('STATUS', resp.status());
  } catch (e) {
    console.error('NAV ERROR', e.message);
  }
  await browser.close();
})();
