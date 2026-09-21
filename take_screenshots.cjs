const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\navee\\.gemini\\antigravity-ide\\brain\\5d1279fc-a51e-4d6e-a4cd-a5b0d8c2d5a4';

const PORT = process.env.VITE_PORT || process.env.PORT || '5180';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 900 } });
  const page = await context.newPage();

  console.log(`Navigating to http://127.0.0.1:${PORT}...`);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Click on Block Planner tab
  console.log('Clicking on Block Planner tab in sidebar...');
  await page.locator('.nav-item:has-text("Block Planner"), button:has-text("Open Block Planner")').first().click();
  await page.waitForTimeout(2000);

  // Capture master timeline
  const timelinePath = path.join(ARTIFACT_DIR, 'operational_timeline.png');
  await page.screenshot({ path: timelinePath, fullPage: false });
  console.log('Saved timeline screenshot to:', timelinePath);

  // Click on a train to open inspector drawer
  console.log('Clicking on train 20627 Vande Bharat or 12635 Vaigai...');
  const trainElem = page.locator('div[title*="20627"], div[title*="12635"], div[title*="22671"]').first();
  await trainElem.click();
  await page.waitForTimeout(1500);

  const drawerPath = path.join(ARTIFACT_DIR, 'train_inspector_drawer.png');
  await page.screenshot({ path: drawerPath, fullPage: false });
  console.log('Saved train inspector screenshot to:', drawerPath);

  await browser.close();
  console.log('DONE');
}

capture().catch(console.error);
