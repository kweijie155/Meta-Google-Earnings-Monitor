const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + process.cwd() + '/' + (process.argv[2] || 'app/dist-artifact/index.html'); const pre = process.argv[3] || '';
  const out = [];
  for (const [name, vp, scheme] of [['desktop-light', { width: 1440, height: 900 }, 'light'], ['desktop-dark', { width: 1440, height: 900 }, 'dark'], ['tablet', { width: 900, height: 1100 }, 'light'], ['mobile', { width: 390, height: 844 }, 'light'], ['mobile-dark', { width: 390, height: 844 }, 'dark']]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(url);
    await page.waitForSelector('#overview', { timeout: 15000 });
    await page.waitForTimeout(800);
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
    await page.screenshot({ path: `shots/${pre}${name}.png`, fullPage: true });
    out.push({ name, ...sw, errs: errs.slice(0, 8) });
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
