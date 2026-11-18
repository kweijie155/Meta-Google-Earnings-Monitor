const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL/.test(m.text())) errs.push(m.text()); });
  await page.goto('file://' + process.cwd() + '/app/dist-artifact/index.html');
  await page.waitForSelector('#overview');
  const R = {};
  const scoreText = async () => (await page.locator('.score').first().innerText()).replace(/\s+/g, ' ');
  R.score0 = await scoreText();
  // 1. click a bar in explorer (Q2 '26 band)
  const ex = page.locator('#trends .card').first().locator('.recharts-surface');
  const box = await ex.boundingBox();
  await page.mouse.click(box.x + box.width * (5.5 / 7), box.y + box.height * 0.6);
  await page.waitForTimeout(300);
  R.chips = await page.locator('.xf').innerText();
  R.scoreAfterClick = await scoreText();
  R.overviewHead = await page.locator('#overview .sec-head p').innerText();
  // tooltip on hover
  await page.mouse.move(box.x + box.width * (2.5 / 7), box.y + box.height * 0.5);
  await page.waitForTimeout(300);
  R.tooltip = (await page.locator('.recharts-tooltip-wrapper .tip').first().innerText().catch(() => 'none')).replace(/\s+/g, ' ');
  // 2. keyboard on chart
  await page.locator('#trends .chart-wrap').first().focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  R.afterKey = await page.locator('#trends .card').first().locator('.readout').innerText();
  // 3. YoY mode
  await page.getByRole('radio', { name: 'YoY' }).click();
  await page.waitForTimeout(300);
  R.explorerSubYoY = await page.locator('#trends .card').first().locator('.sub').innerText();
  R.readoutYoY = await page.locator('#trends .card').first().locator('.readout').innerText();
  // 4. YTD disables QoQ
  await page.getByRole('radio', { name: 'YTD' }).click();
  R.qoqDisabled = await page.getByRole('radio', { name: 'QoQ' }).isDisabled();
  R.ytdHead = await page.locator('#overview .sec-head p').innerText();
  // 5. TTM + margin
  await page.getByRole('radio', { name: 'TTM' }).click();
  await page.getByRole('radio', { name: 'Value' }).click();
  await page.getByRole('radio', { name: 'Margin / % of revenue' }).click();
  await page.waitForTimeout(300);
  R.opCardTitleMargin = await page.locator('#trends .card').nth(2).locator('h3').innerText();
  R.opCardReadout = await page.locator('#trends .card').nth(2).locator('.readout').innerText();
  // 6. LFL basis
  await page.getByRole('radio', { name: 'Like-for-like' }).click();
  await page.waitForTimeout(200);
  R.capexCard = await page.locator('#trends .card').filter({ hasText: 'Capex intensity' }).first().locator('.readout').innerText();
  // 7. company Meta only
  await page.getByRole('radio', { name: 'Meta' }).first().click();
  await page.waitForTimeout(300);
  R.metaOnlyScore = await scoreText();
  R.gapCard = await page.locator('#segments .card').filter({ hasText: 'Advertising growth gap' }).locator('.empty').innerText().catch(() => 'no empty');
  R.alphabetMix = await page.locator('#segments h3', { hasText: 'Alphabet revenue mix' }).count();
  // 8. segments: uncheck RL
  await page.locator('details.segpick summary').last().click();
  await page.locator('#seg-rl').uncheck();
  await page.locator('details.segpick summary').last().click();
  await page.waitForTimeout(200);
  R.segSummary = await page.locator('details.segpick summary').last().innerText();
  R.rlCard = await page.locator('#segments .card').filter({ hasText: 'Reality Labs revenue' }).first().innerText().then((t) => t.slice(0, 80)).catch(() => 'none');
  // 9. table toggle
  await page.locator('#trends .card').first().getByRole('button', { name: 'Table' }).click();
  R.tableRows = await page.locator('#trends .card').first().locator('table tbody tr').count();
  // 10. empty range
  await page.selectOption('#q-from', '2026Q3'); await page.selectOption('#q-to', '2025Q2');
  await page.waitForTimeout(200);
  R.emptyRange = await page.locator('main .empty').first().innerText();
  // 11. reset
  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await page.waitForTimeout(300);
  R.afterReset = await scoreText();
  R.chipsAfterReset = await page.locator('.xf').innerText();
  // 12. copy csv (clipboard denied in headless -> textarea fallback)
  await page.getByRole('button', { name: 'Copy CSV' }).first().click();
  await page.waitForTimeout(500);
  const csv = await page.locator('#csv-out').inputValue().catch(() => null);
  R.csvLines = csv ? csv.split('\n').length : 'clipboard';
  R.csvHead = csv ? csv.split('\n')[0] : '';
  R.csvSample = csv ? csv.split('\n').filter((l) => l.includes(',2026Q3,') && l.includes(',revenue,'))[0] : '';
  R.toast = await page.locator('.toast').innerText().catch(() => '');
  R.errs = errs;
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})();
