// Run: node verify.cjs [absolute path to an installed Playwright package]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], requests = [], layouts = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    const frame = page.locator('#hud-frame').contentFrame();
    await frame.locator('#companion-slot .mascot').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await frame.locator('body').evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.fonts.check('450 16px "Google Sans Flex"')));
    assert.ok(await frame.locator('body').evaluate(() => document.fonts.check('450 16px "Google Sans Flex"')));
    assert.equal(await frame.locator('script,button').count(), 0);
    assert.equal((await frame.locator('#time-h').textContent()).trim(), '04h');
    assert.equal((await frame.locator('#time-m').textContent()).trim(), '26m');
    assert.equal((await frame.locator('#time-s').textContent()).trim(), '35s');
    assert.equal((await frame.locator('#usage-value').textContent()).trim(), '5');
    assert.equal((await frame.locator('#effort-label').textContent()).trim(), 'MEDIUM');
    assert.equal((await frame.locator('#context-num').textContent()).trim(), '207,5k');
    assert.equal((await frame.locator('#tok-output-val').textContent()).trim(), '1528');
    assert.equal((await frame.locator('#total-tokens-label').textContent()).trim(), '11,4M');
    assert.equal(await frame.locator('.usage-ring').getAttribute('aria-valuenow'), '5');
    const sourceStyle = await frame.locator('body').evaluate(el => getComputedStyle(el).fontFamily);
    assert.match(sourceStyle, /Google Sans Flex/);
    assert.equal(await page.locator('.direction').count(), 4);
    assert.equal(await page.locator('.reaction').count(), 8);
    const combinations = [];
    for (const shape of ['soft', 'classic', 'google', 'pixel']) {
      await page.locator(`.direction[data-shape="${shape}"]`).click();
      for (const state of ['idle', 'thinking', 'reading', 'writing', 'terminal', 'done', 'attention', 'sleep']) {
        await page.locator(`.reaction[data-state="${state}"]`).click();
        assert.equal(await page.locator('#hero .mascot').getAttribute('data-shape'), shape);
        assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-shape'), shape);
        assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), state);
        assert.equal(await page.locator('.reaction[aria-pressed="true"]').count(), 1);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.state), state);
        combinations.push(`${shape}/${state}`);
      }
    }
    await page.locator('.direction[data-shape="soft"]').click();
    await page.locator('.reaction[data-state="thinking"]').click();
    // Fixed geometry for screenshots; pause animation without changing the selected expression.
    await page.getByRole('button', { name: 'Pausar movimentos', exact: true }).click();
    assert.equal(await frame.locator('html').getAttribute('data-motion'), 'paused');
    assert.equal(await page.locator('.thought-dot').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Ativar tema claro' }).click();
      assert.equal(await frame.locator('html').getAttribute('data-theme'), theme);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        await page.waitForTimeout(80);
        const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.equal(layout.width, layout.scroll, `${theme}: page overflow at ${width}`);
        const child = await frame.locator('body').evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, content: Math.ceil(document.querySelector('.dashboard').getBoundingClientRect().height), height: innerHeight }));
        assert.equal(child.width, child.scroll, `${theme}: HUD overflow at ${width}`);
        assert.equal(child.content, child.height, `${theme}: HUD clipped or left blank at ${width}`);
        layouts.push({ theme, ...layout, hud: child });
        if (width === 1440 || width === 390) await page.screenshot({ path: path.join(__dirname, `preview-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
    await page.getByRole('button', { name: 'Retomar movimentos' }).click();
    await page.locator('.reaction[data-state="idle"]').click();
    await page.locator('#hero').click();
    await page.waitForTimeout(280);
    assert.equal(await page.locator('#hero .eyes').evaluate(el => el.style.transform), '');
    await page.locator('.reaction[data-state="reading"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#hero .mascot').getAttribute('data-state'), 'reading');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.state), 'reading');
    await page.getByRole('button', { name: 'Simular uma tarefa' }).click();
    await page.waitForFunction(() => document.querySelector('#hero .mascot').dataset.state === 'done', null, { timeout: 15000 });
    assert.equal(await page.locator('#simulate').getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Simular uma tarefa' }).click();
    await page.getByRole('button', { name: 'Parar simulação' }).click();
    const stopped = await page.locator('#hero .mascot').getAttribute('data-state');
    await page.waitForTimeout(2600);
    assert.equal(await page.locator('#hero .mascot').getAttribute('data-state'), stopped);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('html').getAttribute('data-motion'), 'paused');
    assert.equal(await page.locator('.thought-dot').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await frame.locator('html').getAttribute('data-motion'), 'paused');
    // Image alternatives: verify the two embedded original symbols decode offline.
    for (const shape of ['classic', 'google']) {
      await page.locator(`.direction[data-shape="${shape}"]`).click();
      const loaded = await page.locator('#hero image').evaluate(async node => {
        const image = new Image(); image.src = node.getAttribute('href'); await image.decode();
        return image.naturalWidth > 0;
      });
      assert.ok(loaded, shape);
    }
    const sheetHTML = await page.evaluate(() => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${document.getElementById('font-css').textContent}${document.getElementById('mascot-css').textContent}
      :root{--blue:#8bb4ff;--surface:#18191d;font-family:'Google Sans Flex',sans-serif;color:#f8f9fc;background:#18191d;}*{box-sizing:border-box;}body{margin:0;padding:28px 34px;}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #36383f;padding-bottom:18px;}h1{font-size:19px;letter-spacing:-.4px;font-weight:450;margin:0;}header span{font-size:11px;color:#a6a9b0;}main{display:grid;grid-template-columns:repeat(4,1fr);padding-top:22px;}article{text-align:center;min-width:0;border-right:1px solid #2b2d33;}article:last-child{border:0;}.top{height:18px;font-size:10px;color:#8bb4ff;margin-bottom:8px;}.mascot{display:block;margin:auto;}h2{font-size:15px;font-weight:500;margin:13px 0 5px;}p{font-size:11px;color:#a6a9b0;margin:0;}</style></head><body data-still><header><h1>Um companheiro para o AGY UsageHUD</h1><span>Proposta · quatro direções</span></header><main>${Object.entries(shapes).map(([key,shape])=>`<article><div class="top">${key==='soft'?'Minha recomendação':shape.number}</div>${mascot(key,'idle',155,true)}<h2>${shape.name}</h2><p>${shape.short}</p></article>`).join('')}</main></body></html>`);
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 1120, height: 350 });
    await sheet.setContent(sheetHTML);
    await sheet.evaluate(() => document.fonts.ready);
    await sheet.locator('image').evaluateAll(async nodes => {
      await Promise.all(nodes.map(async node => { const image = new Image(); image.src = node.getAttribute('href'); await image.decode(); }));
    });
    await sheet.screenshot({ path: path.join(__dirname, 'mascotes.png'), fullPage: true });
    await sheet.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const report = { checkedAt: new Date().toISOString(), browser: 'Chrome headless', offline: true, javascriptErrors: errors, externalRequests: requests, shapesAndStates: combinations.length, layouts, checks: ['Original HUD snapshot values', 'Embedded Google Sans Flex in page and HUD', '32 combinations reflected in HUD', 'Keyboard activation and focus', 'Theme toggle', 'Pause and reduced motion', 'Simulation through completion and cancellation', 'Embedded original assets decode offline'], limits: ['Proposal only; no live session integration', 'No physical phone or Antigravity webview test'] };
    fs.writeFileSync(path.join(__dirname, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ success: true, combinations: combinations.length, layouts: layouts.length, errors, externalRequests: requests }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
