// node verify-v3.cjs [absolute path to an installed Playwright package]
const { chromium } = require(process.argv[2] || 'playwright');
const { createActivityModel, classifyTool } = require('./activity-model.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function payload(name, stepIdx = 1, extra = {}) {
  return { conversationId: 'test-session', stepIdx, toolCall: { name, args: { query: 'PRIVATE_SENTINEL' } }, ...extra };
}
function verifyReducer() {
  for (const [tool, kind] of Object.entries({ search_web: 'web', read_url_content: 'page', view_file: 'reading', grep_search: 'files', write_to_file: 'writing', replace_file_content: 'writing', run_command: 'terminal', invoke_subagent: 'agents', ask_question: 'question', ask_permission: 'question', generate_image: 'image', 'mcp:any': 'external', unknown: 'external', '__proto__': 'external' })) {
    assert.equal(classifyTool(tool), kind);
  }
  const model = createActivityModel('test-session');
  const receive = (event, name, index, extra) => model.receive(event, payload(name, index, extra));
  assert.equal(receive('PreToolUse', 'search_web', 1, { conversationId: 'another-session' }).kind, 'idle');
  assert.equal(receive('PreToolUse', 'search_web', -1).activeCount, 0);
  assert.equal(model.receive('unrecognized', payload('search_web')).kind, 'idle');
  assert.equal(receive('PreToolUse', 'search_web', 1).kind, 'web');
  assert.equal(receive('PreToolUse', 'search_web', 1).activeCount, 1);
  assert.equal(receive('PreToolUse', 'view_file', 2).activeCount, 2);
  assert.equal(receive('PostToolUse', 'search_web', 1).kind, 'reading');
  assert.equal(receive('PostToolUse', 'search_web', 1).activeCount, 1);
  assert.equal(receive('PostToolUse', 'view_file', 2).kind, 'waiting');
  assert.equal(receive('PreToolUse', 'search_web', 1).activeCount, 0);
  assert.equal(receive('PostToolUse', 'run_command', 3).kind, 'waiting');
  assert.equal(receive('PreToolUse', 'run_command', 3).activeCount, 0);
  assert.equal(receive('PostToolUse', 'run_command', 4, { error: 'PRIVATE_SENTINEL' }).kind, 'error');
  assert.equal(model.receive('Stop', { conversationId: 'test-session' }).kind, 'error');
  assert.equal(receive('PreToolUse', 'view_file', 5).activeCount, 0);
  assert.equal(model.receive('PreInvocation', { conversationId: 'test-session' }).kind, 'model');
  assert.equal(model.receive('PostInvocation', { conversationId: 'test-session' }).kind, 'waiting');
  assert.equal(model.receive('Stop', { conversationId: 'test-session' }).kind, 'ended');
  assert.ok(!JSON.stringify(model.snapshot()).includes('PRIVATE_SENTINEL'));
}

(async () => {
  verifyReducer();
  const source = fs.readFileSync(path.join(__dirname, 'v3.html'), 'utf8').replace(/\r\n/g, '\n');
  const embedded = source.match(/<script id="activity-model">\n([\s\S]*?)\n  <\/script>/)[1];
  assert.equal(embedded, fs.readFileSync(path.join(__dirname, 'activity-model.js'), 'utf8').replace(/\r\n/g, '\n'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const errors = [], external = [], layouts = [];
    await context.route(/^https?:/, route => { external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, 'v3.html')).href);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    const frame = page.locator('#hud-frame').contentFrame();
    await frame.locator('#companion-slot .mascot').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.direction').count(), 2);
    assert.equal(await page.locator('.reaction').count(), 8);
    assert.match(await page.locator('footer.footer').innerText(), /V2 marcada como favorita/);
    for (const version of ['v2', 'retro']) {
      await page.locator(`.direction[data-shape="${version}"]`).click();
      for (const action of ['web', 'page', 'reading', 'files', 'writing', 'terminal', 'agents', 'question']) {
        await page.locator(`.reaction[data-activity="${action}"]`).click();
        assert.equal(await frame.locator('#companion-slot .mascot').getAttribute('data-state'), action);
        assert.equal(await page.locator('#hero .mascot').getAttribute('data-state'), action);
        assert.equal(await page.locator('.mouth,.brow,.foot').count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.activity), action);
        await page.getByRole('button', { name: 'Simular retorno' }).click();
        assert.equal(await page.locator('#hero .mascot').getAttribute('data-state'), 'waiting');
        assert.equal(await page.locator('#active-count').textContent(), 'Nenhuma chamada em aberto');
      }
    }
    const pixelInfo = await page.evaluate(async () => {
      const image = new Image(); image.src = pixelAsset; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, 32, 32).data;
      return { width: image.naturalWidth, height: image.naturalHeight, alpha: [...new Set([...data].filter((_, i) => i % 4 === 3))].sort() };
    });
    assert.deepEqual(pixelInfo, { width: 32, height: 32, alpha: [0, 255] });
    for (const version of ['v2', 'retro']) {
      await page.locator(`.direction[data-shape="${version}"]`).click();
      for (const eye of ['dots', 'blocks']) {
        await page.locator(`[data-eye-style="${eye}"]`).click();
        assert.equal(await page.locator(`[data-eye-style="${eye}"]`).getAttribute('aria-pressed'), 'true');
      }
    }
    await page.locator('[data-eye-style="dots"]').click();
    await page.locator('.direction[data-shape="v2"]').click();
    await page.locator('.reaction[data-activity="web"]').click();
    await page.getByRole('button', { name: 'Pausar movimentos', exact: true }).click();
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Ativar tema claro' }).click();
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        await page.waitForTimeout(90);
        const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.equal(layout.width, layout.scroll, `Page overflow at ${width}`);
        const hud = await frame.locator('html').evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight, content: Math.ceil(document.querySelector('.dashboard').getBoundingClientRect().height) }));
        assert.equal(hud.width, hud.scroll); assert.equal(hud.height, hud.content);
        layouts.push({ theme, ...layout, hud });
        if (theme === 'dark' && width === 1440 || theme === 'light' && width === 390) await page.screenshot({ path: path.join(__dirname, `v3-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.locator('.reaction[data-activity="reading"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#hero .mascot').getAttribute('data-state'), 'reading');
    const lifecycle = await page.evaluate(() => {
      resetDemo();
      const states = demoEvents.map(([event, payload]) => receiveActivity(event, { ...payload, conversationId: demoSession }).kind);
      return { states, text: document.querySelector('#state-title').textContent };
    });
    assert.equal(lifecycle.states.at(-1), 'ended'); assert.match(lifecycle.text, /turno foi encerrado/);
    await page.getByRole('button', { name: 'Reproduzir exemplos' }).click();
    await page.getByRole('button', { name: 'Parar exemplos' }).click();
    assert.equal(await page.locator('#simulate').getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Retomar movimentos' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(80);
    assert.equal(await frame.locator('html').getAttribute('data-motion'), 'paused');
    const sheetHTML = await page.evaluate(() => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${document.getElementById('font-css').textContent}${document.getElementById('mascot-css').textContent}
      :root{--blue:#8bb4ff;--surface:#18191d;font-family:'Google Sans Flex',sans-serif;color:#f8f9fc;background:#18191d;}*{box-sizing:border-box;}body{margin:0;padding:27px 32px;}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #36383f;padding-bottom:17px;}h1{font-size:19px;font-weight:450;margin:0;letter-spacing:-.4px;}header span{font-size:11px;color:#a6a9b0;}main{display:grid;grid-template-columns:repeat(2,1fr);padding-top:18px;}article{text-align:center;border-right:1px solid #303238;}article:last-child{border:0;}.mascot{display:block;margin:auto;}h2{font-size:16px;font-weight:500;margin:8px 0 5px;}p{font-size:11px;color:#a6a9b0;margin:0;}.mini{display:flex;justify-content:center;gap:24px;margin-top:19px;padding-top:14px;border-top:1px solid #2b2d33;margin-inline:24px;}.mini span.label{display:block;font-size:10px;color:#a6a9b0;margin-top:4px;}.pixel-sprite .eye,.pixel-sprite .activity-glyph{shape-rendering:crispEdges;}</style></head><body data-still><header><h1>Gemini · a favorita e a variante retrô</h1><span>Atividades ligadas a chamadas de ferramenta</span></header><main>${Object.entries(versions).map(([key,v])=>`<article>${mascot(key,'idle',175,true)}<h2>${v.name}</h2><p>${v.short}</p><div class="mini">${['web','reading','writing','terminal'].map(action=>`<div>${mascot(key,action,56,true)}<span class="label">${{web:'Web',reading:'Leitura',writing:'Edição',terminal:'Terminal'}[action]}</span></div>`).join('')}</div></article>`).join('')}</main></body></html>`);
    const sheet = await context.newPage(); await sheet.setViewportSize({ width: 1000, height: 440 });
    await sheet.setContent(sheetHTML);
    await sheet.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('image')].map(async el => { const image = new Image(); image.src = el.getAttribute('href'); await image.decode(); })); });
    await sheet.screenshot({ path: path.join(__dirname, 'comparacao-v3.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(path.join(__dirname, 'verification-v3.json'), JSON.stringify({ checkedAt: new Date().toISOString(), reducer: 'passed', actionVersionCombinations: 16, layouts, pixelInfo, errors, externalRequests: external, checks: ['Official hook-shaped events', 'Concurrent tools, duplicates and out-of-order events', 'Conversation isolation and invalid payloads', 'Explicit errors and neutral Stop', 'No retained arguments or error details', 'V2 favorite marker', 'Tool return and keyboard interaction', 'Two versions, two eye styles, 32x32 sprite', 'Theme, offline and reduced motion'], limits: ['Examples only; hook collector and live event transport not installed', 'No Antigravity webview or physical-device test'] }, null, 2));
    console.log(JSON.stringify({ success: true, actionsAndVersions: 16, layouts: layouts.length, pixelInfo, errors, external }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
