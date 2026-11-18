const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('file://' + process.cwd() + '/app/dist-artifact/index.html');
  await page.waitForSelector('#overview');
  const card = page.locator('#trends .card').first();
  await card.scrollIntoViewIfNeeded();
  const svg = card.locator('.recharts-surface');
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width * (2.5 / 7), box.y + box.height * 0.5);
  await page.waitForTimeout(400);
  const tip = await page.locator('.tip').first().innerText().catch(() => 'none');
  await page.screenshot({ path: 'shots/hover.png', clip: { x: box.x - 20, y: box.y - 60, width: box.width / 2 + 100, height: box.height + 120 } });
  await page.mouse.click(box.x + box.width * (5.5 / 7), box.y + box.height * 0.6);
  await page.waitForTimeout(400);
  const chips = await page.locator('.xf').innerText();
  const score = (await page.locator('.score').first().innerText()).replace(/\s+/g, ' ');
  const head = await page.locator('#overview .sec-head p').innerText();
  await page.screenshot({ path: 'shots/focus.png', clip: { x: box.x - 20, y: box.y - 60, width: box.width + 40, height: box.height + 140 } });
  // segment filtering removed: legend has no toggle
  const seg = String(await page.locator('details.segpick').count()) + ' segpick menus (Regions only)';
  const cloudCard = await page.locator('#segments .card').filter({ hasText: 'Google Cloud revenue' }).first().innerText();
  console.log(JSON.stringify({ tip: tip.replace(/\s+/g, ' '), chips, score, head, seg, cloudCard: cloudCard.slice(0, 90) }, null, 1));
  await browser.close();
})();
