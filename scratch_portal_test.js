const playwright = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

async function testPortal() {
  console.log("Starting local server...");
  const server = spawn('node', ['server.js'], { cwd: __dirname });

  await new Promise(r => setTimeout(r, 4500));

  try {
    console.log("Launching headless browser...");
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });

    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('response', resp => {
      if (resp.url().includes('/api/')) {
        console.log(`API RESPONSE [${resp.status()}]: ${resp.url()}`);
      }
    });

    console.log("Navigating to public client portal link http://localhost:8080/portal?token=c_1_t_1784283098735...");
    await page.goto('http://localhost:8080/portal?token=c_1_t_1784283098735', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const screenshotPath = path.resolve('C:/Users/vaibh/.gemini/antigravity/brain/13cf6473-e9cd-4787-ab5c-0b6c472a8fa6/client_portal_verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`SUCCESS: Client portal screenshot saved to ${screenshotPath}`);

    await browser.close();
  } catch (err) {
    console.error("Portal test script error:", err);
  } finally {
    server.kill();
    process.exit(0);
  }
}

testPortal();
