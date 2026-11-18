const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [ed, path] of [['apac', 'app/dist-artifact-apac/index.html'], ['global', 'app/dist-artifact/index.html']]) {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL/.test(m.text())) errs.push(m.text()); });
    await page.goto('file://' + process.cwd() + '/' + path); await page.waitForSelector('#ads');
    const R = { title: await page.title(), toc: await page.locator('.toc').innerText(), adsCards: await page.locator('#ads .card').count() };
    R.firstTile = (await page.locator('.score').first().innerText()).replace(/\s+/g, ' ');
    // regions: APAC only
    await page.locator('details.segpick').filter({ hasText: 'All regions' }).locator('summary').click();
    await page.getByRole('button', { name: 'APAC only' }).click();
    await page.waitForTimeout(200);
    R.regionChip = await page.locator('.xf').innerText();
    R.metaRegLegend = await page.locator('#ads .card').filter({ hasText: 'Meta ad revenue by user region' }).locator('.legend').innerText().catch(() => 'none');
    R.vpReadout = await page.locator('#ads .card').filter({ hasText: 'Meta volume vs price by region' }).locator('.readout').innerText().catch(() => 'none');
    // share mode
    await page.locator('details.segpick').filter({ hasText: 'selected' }).locator('summary').click();
    const shareLabel = ed === 'apac' ? 'Share of total' : 'Margin / % of revenue';
    await page.getByRole('radio', { name: shareLabel }).click();
    await page.waitForTimeout(200);
    R.metaRegShareReadout = await page.locator('#ads .card').filter({ hasText: 'Meta ad revenue by user region' }).locator('.readout').innerText().catch(() => 'none');
    // YoY mode
    await page.getByRole('radio', { name: 'Absolute' }).click();
    await page.getByRole('radio', { name: 'YoY' }).click(); await page.waitForTimeout(200);
    R.googRegYoY = await page.locator('#ads .card').filter({ hasText: 'Alphabet revenue by billing region' }).locator('.readout').innerText().catch(() => 'none');
    // YTD warn on decomposition
    await page.getByRole('radio', { name: 'YTD' }).click(); await page.waitForTimeout(200);
    R.decompWarn = await page.locator('#ads .card').filter({ hasText: 'what drives ad growth' }).locator('.warn').innerText().catch(() => 'none');
    // Meta only
    await page.getByRole('radio', { name: 'Meta' }).first().click(); await page.waitForTimeout(200);
    R.metaOnlyGoogCards = await page.locator('#ads h3', { hasText: 'Google' }).count();
    // click cross-filter on a quarter chart in ads section
    await page.getByRole('button', { name: 'Reset filters' }).first().click(); await page.waitForTimeout(200);
    const card = page.locator('#ads .card').filter({ hasText: 'what drives ad growth' });
    await card.scrollIntoViewIfNeeded();
    const box = await card.locator('.recharts-surface').boundingBox();
    await page.mouse.move(box.x + box.width * (2.5 / 7), box.y + box.height * 0.5); await page.waitForTimeout(150);
    await page.mouse.click(box.x + box.width * (2.5 / 7), box.y + box.height * 0.5); await page.waitForTimeout(300);
    R.chipsAfterClick = await page.locator('.xf').innerText();
    R.vpTitle = await page.locator('#ads .card h3', { hasText: 'volume vs price by region' }).innerText().catch(() => 'none');
    // CSV
    await page.getByRole('button', { name: 'Copy CSV' }).first().click(); await page.waitForTimeout(400);
    const csv = await page.locator('#csv-out').inputValue().catch(() => '');
    R.csvLines = csv.split('\n').length; R.csvApRows = csv.split('\n').filter((l) => /,ad_ap,|,geo_apac,|,imp_ap,/.test(l)).length;
    R.csvSample = csv.split('\n').find((l) => l.includes(',2026Q3,') && l.includes(',imp_ap,')) || '';
    R.errs = errs; out[ed] = R;
  }
  console.log(JSON.stringify(out, null, 1)); await browser.close();
})();
