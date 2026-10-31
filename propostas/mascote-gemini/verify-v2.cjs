// node verify-v2.cjs [absolute path to an installed Playwright package]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const external = [], errors = [], layouts = [], combinations = [];
    await context.route(/^https?:/, route => { external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, 'v2.html')).href);
    const frame = page.locator('#hud-frame').contentFrame();
    await frame.locator('#companion-slot .mascot').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.direction').count(), 2);
    assert.equal(await page.locator('#hero .mascot').getAttribute('data-shape'), 'dots');
    let originalImage;
    for (const shape of ['dots', 'blocks']) {
      await page.locator(`.direction[data-shape="${shape}"]`).click();
      for (const state of ['idle', 'thinking', 'reading', 'writing', 'terminal', 'done', 'attention', 'sleep']) {
        await page.locator(`.reaction[data-state="${state}"]`).click();
        assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), state);
        assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-shape'), shape);
        assert.equal(await page.locator('.mouth,.brow,.foot,.visor-pupil').count(), 0);
        assert.equal(await frame.locator('.mouth,.brow,.foot').count(), 0);
        assert.equal(await page.locator('#hero .face [fill="#fff"]').count(), 0);
        assert.equal(await page.locator('#hero .face > .eyes').count(), 1);
        const image = await page.locator('#hero image').getAttribute('href');
        originalImage ??= image;
        assert.equal(image, originalImage);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.state), state);
        combinations.push(`${shape}/${state}`);
      }
    }
    await page.locator('.reaction[data-state="idle"]').click();
    await page.locator('.direction[data-shape="dots"]').click();
    assert.equal(await page.locator('#hero .eye').first().evaluate(el => el.tagName), 'circle');
    await page.locator('.direction[data-shape="blocks"]').click();
    assert.equal(await page.locator('#hero .eye').first().evaluate(el => el.tagName), 'rect');
    await page.locator('.direction[data-shape="dots"]').click();
    await page.getByRole('button', { name: 'Pausar movimentos', exact: true }).click();
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Ativar tema claro' }).click();
      assert.equal(await frame.locator('html').getAttribute('data-theme'), theme);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(90);
        const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        const hud = await frame.locator('html').evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.equal(layout.width, layout.scroll);
        assert.equal(hud.width, hud.scroll);
        layouts.push({ theme, ...layout, hud });
        if (width === 1440 && theme === 'dark' || width === 390 && theme === 'light') {
          await page.screenshot({ path: path.join(__dirname, `v2-${width}-${theme}.png`), fullPage: true });
        }
      }
    }
    await page.locator('.reaction[data-state="reading"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), 'reading');
    await page.getByRole('button', { name: 'Retomar movimentos' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(80);
    assert.equal(await frame.locator('html').getAttribute('data-motion'), 'paused');
    assert.equal(await page.locator('.thought-dot').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    const sheetHTML = await page.evaluate(() => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${document.getElementById('font-css').textContent}${document.getElementById('mascot-css').textContent}
      :root{--blue:#8bb4ff;--surface:#18191d;font-family:'Google Sans Flex',sans-serif;color:#f8f9fc;background:#18191d;}*{box-sizing:border-box;}body{margin:0;padding:27px 32px;}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #36383f;padding-bottom:17px;}h1{font-size:19px;font-weight:450;margin:0;letter-spacing:-.4px;}header span{font-size:11px;color:#a6a9b0;}main{display:grid;grid-template-columns:repeat(2,1fr);padding-top:20px;}article{text-align:center;border-right:1px solid #303238;}article:last-child{border:0;}.mascot{display:block;margin:auto;}h2{font-size:16px;font-weight:500;margin:8px 0 5px;}p{font-size:11px;color:#a6a9b0;margin:0;}.mini{display:flex;justify-content:center;gap:26px;margin-top:21px;padding-top:16px;border-top:1px solid #2b2d33;margin-inline:24px;}.mini span.label{display:block;font-size:10px;color:#a6a9b0;margin-top:4px;}</style></head><body data-still><header><h1>Gemini colorido · outro olhar</h1><span>Segunda proposta · sem boca</span></header><main>${Object.entries(shapes).map(([key,shape])=>`<article>${mascot(key,'idle',175,true)}<h2>${shape.number} / ${shape.name}</h2><p>${shape.short}</p><div class="mini">${['thinking','done','attention','sleep'].map(state=>`<div>${mascot(key,state,54,true)}<span class="label">${states[state].label}</span></div>`).join('')}</div></article>`).join('')}</main></body></html>`);
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 940, height: 440 });
    await sheet.setContent(sheetHTML);
    await sheet.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('image')].map(async el => { const image = new Image(); image.src = el.getAttribute('href'); await image.decode(); }));
    });
    await sheet.screenshot({ path: path.join(__dirname, 'olhares-v2.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    const report = { checkedAt: new Date().toISOString(), combinations: combinations.length, layouts, errors, externalRequests: external, checks: ['Gemini colorido only', 'No mouth, eyebrows, feet or eye highlights in all 16 combinations', 'Identical original image in both options', 'New circle and rectangle eye geometries', 'HUD synchronization', 'Keyboard and focus', 'Themes, reduced motion and offline'], limits: ['Visual proposal only; no live session integration'] };
    fs.writeFileSync(path.join(__dirname, 'verification-v2.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ success: true, combinations: combinations.length, layouts: layouts.length, errors, external }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
