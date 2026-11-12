const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
  });
  const errors = [];
  const url = pathToFileURL(path.join(__dirname, '..', 'Квантовая лаборатория.html')).href;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => { if (req.url().startsWith('http')) errors.push(`External dependency: ${req.url()}`); });
  try {
    await page.goto(url);
    const message = page.locator('#plot-message');
    await page.locator('[data-state="5"]').waitFor();
    assert.match(await page.locator('#well-count').textContent(), /^5 состояний$/);
    assert.match(await page.locator('[data-state="1"]').textContent(), /0,35158/);
    await page.locator('[data-state="5"]').click();
    await page.locator('[data-view="wave"]').click();
    assert.match(await page.locator('#chart-title').textContent(), /Нормированные/);
    assert.equal(await page.locator('#chart-legend .legend-item').count(), 1);
    await page.locator('#potential').selectOption('rectangular');
    assert.match(await page.locator('[data-state="1"]').textContent(), /0,05119/);
    await page.locator('#potential').selectOption('expression');
    await page.locator('#expression').fill('0/0');
    await message.waitFor({ state: 'visible' });
    assert.match(await message.textContent(), /не определён/);
    await page.locator('#expression').fill('x<a/2 ? 0 : .1');
    await message.waitFor({ state: 'hidden' });
    await page.locator('#expression').fill('2');
    await page.getByText('При этих параметрах связанных состояний нет.').waitFor();
    await page.locator('#potential').selectOption('table');
    await page.locator('#table').fill('0;0\n1,2;0,1\n2,4;0');
    const tableEnergy = await page.evaluate(() => {
      const potential = QuantumPhysics.makePotential({ kind: 'well', preset: 'table', width: 2.4, table: '0;0\n1,2;0,1\n2,4;0' });
      return QuantumPhysics.solveWell({ width: 2.4, mass: 1, exterior: 1.6, potential }).states[0].energy.toFixed(5).replace('.', ',');
    });
    await page.waitForFunction((expected) => document.querySelector('[data-state="1"]')?.textContent.includes(expected), tableEnergy, { timeout: 3000 });
    await page.locator('#tab-well').focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('#transmission').waitFor();
    assert.match(await page.locator('#transmission').textContent(), /11,86865/);
    await page.locator('#potential').selectOption('rectangular');
    assert.match(await page.locator('#transmission').textContent(), /0,27259/);
    await page.locator('[data-view="log"]').click();
    const plot = await page.locator('#main-plot').boundingBox();
    await page.mouse.move(plot.x + plot.width / 2, plot.y + plot.height / 2);
    await page.locator('#plot-tooltip').waitFor({ state: 'visible' });
    await page.locator('#energy-number').fill('0.8');
    await page.locator('#energy-number').press('Tab');
    assert.match(await page.locator('#transmission').textContent(), /11,68348/);
    await page.locator('#energy-number').fill('0.1234');
    await page.locator('#energy-number').press('Tab');
    assert.match(await page.locator('#current-energy').textContent(), /0,1234/);
    await page.locator('#potential').selectOption('table');
    await page.locator('#table').fill('0;0.4\n0.01;-0.01\n1.2;0.4');
    await message.waitFor({ state: 'visible' });
    assert.match(await message.textContent(), /больше нуля/);
    await page.locator('#reset').click();
    await message.waitFor({ state: 'hidden' });
    assert.match(await page.locator('#transmission').textContent(), /11,86865/);
    await page.locator('#tab-well').click();
    assert.equal(await page.locator('#potential').inputValue(), 'table');
    await page.locator('#reset').click();
    for (const width of [390, 320, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth
        ? [...document.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > innerWidth).map((element) => element.className || element.tagName)
        : []);
      assert.deepEqual(overflow, [], `Overflow at ${width}px`);
      if (width === 320) {
        await page.locator('#tab-barrier').click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('#tab-well').click();
      }
    }
    assert.deepEqual(errors, []);
    console.log('OK: offline browser, initial values, both modes, analytic and tabular inputs, invalid inputs, selection, log and tooltip, reset, responsive width');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
