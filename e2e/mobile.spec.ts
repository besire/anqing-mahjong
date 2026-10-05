import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: '开始对局', exact: true }).click();
  await expect(page.locator('.my-turn')).toBeVisible();
}

async function settings(page: Page) {
  await page.getByRole('button', { name: '☰ 菜单' }).click();
  await page.locator('.menu-list').getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.modal')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('anqing-mj-settings-v1', JSON.stringify({ speed: 'fast', sound: false, hintEnabled: true }));
    // 固定庄家与初始牌墙，让触控与布局断言可复现。
    Math.random = () => 0.01;
  });
});

test('touch selection, second tap, swipe, and undo preserve the hand', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await start(page);
  const tiles = page.locator('.my-hand .tile');
  const box = await tiles.first().boundingBox();
  expect(box!.width).toBeGreaterThan(40);
  expect(box!.height).toBeGreaterThan(55);
  const names = await tiles.locator('img').evaluateAll(imgs => imgs.map(img => img.getAttribute('alt')));
  await tiles.first().tap();
  await expect(page.locator('.my-hand .is-selected')).toHaveCount(1);
  await expect(tiles).toHaveCount(14);
  await expect(page.locator('.hint-strip')).toContainText('打');
  await page.locator('.my-hand .is-selected').tap();
  await expect(tiles).toHaveCount(13);
  await page.getByRole('button', { name: '↶ 悔牌' }).click();
  await expect(tiles).toHaveCount(14);
  await expect(tiles.locator('img')).toHaveCount(names.length);
  expect(await tiles.locator('img').evaluateAll(imgs => imgs.map(img => img.getAttribute('alt')))).toEqual(names);

  // Chromium 可以直接注入原生触摸输入；WebKit 上单独检查选牌/再次点击。
  if (browserName === 'chromium') {
    const b = (await tiles.first().boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(tiles).toHaveCount(13);
    await page.getByRole('button', { name: '↶ 悔牌' }).click();
    await expect(tiles).toHaveCount(14);
  }
  expect(errors).toEqual([]);
});

test('mobile hints and settings remain readable and scroll within the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await start(page);
  await page.locator('.hint-strip').tap();
  await expect(page.locator('.drawer')).toBeVisible();
  expect(await page.locator('.drawer .hl').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('14px');
  const body = page.locator('.drawer .hp-body');
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBeTruthy();
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('.drawer .remain-grid')).toBeInViewport();
  await page.locator('.drawer .hp-close').tap();
  await settings(page);
  const b = (await page.locator('.modal').boundingBox())!;
  expect(b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const modalBody = page.locator('.modal-body');
  await modalBody.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByText('局数', { exact: true })).toBeInViewport();
  await page.locator('.modal .hp-close').tap();
  await page.locator('.hint-toggle').tap();
  await expect(page.locator('.hint-strip')).toHaveCount(0);
  await expect(page.locator('.tile-badge')).toHaveCount(0);
  // 抽屉开关不改变牌桌尺寸。
  expect((await page.locator('.my-hand .tile').first().boundingBox())!.width).toBeGreaterThan(40);
});

test('portrait home and drill fit the screen, and rotating reveals the landscape table', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('./');
  await expect(page.getByRole('button', { name: '开始对局', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '何切练习', exact: true }).tap();
  const tiles = page.locator('.drill-hand .tile');
  await expect(tiles).toHaveCount(14);
  const first = (await tiles.nth(0).boundingBox())!, eighth = (await tiles.nth(7).boundingBox())!;
  expect(eighth.y).toBeGreaterThan(first.y + first.height);
  expect(first.width).toBeGreaterThan(44);
  await tiles.nth(3).tap();
  await expect(page.locator('.drill-grade')).toBeVisible();
  const next = page.getByRole('button', { name: '下一题', exact: true });
  await expect(next).toBeInViewport();
  await next.tap();
  await expect(page.locator('.drill-grade')).toHaveCount(0);
  expect(await page.locator('.drill-page').evaluate(el => el.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: '← 返回', exact: true }).tap();
  await page.getByRole('button', { name: '开始对局', exact: true }).tap();
  await expect(page.locator('.rotate-overlay')).toBeVisible();
  await page.setViewportSize({ width: 750, height: 342 });
  await expect(page.locator('.rotate-overlay')).toHaveCount(0);
  await expect(page.locator('.table-mobile')).toBeVisible();
});

test('desktop keeps the sidebar and normal mouse discard', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await start(page);
  await expect(page.locator('.hint-panel')).toBeVisible();
  await expect(page.locator('.hint-strip')).toHaveCount(0);
  await page.locator('.my-hand .tile').first().click();
  await expect(page.locator('.my-hand .tile')).toHaveCount(13);
  await settings(page);
  await expect(page.locator('.modal')).toBeInViewport();
});

test('a complete round supports calls, settlement, and replay on mobile and desktop', async ({ page }) => {
  await start(page);
  await expect(async () => {
    if (await page.locator('.result').count()) return;
    const action = page.locator('.action-bar .act-btn.recommended').first();
    if (await action.count()) {
      await action.click();
    } else if (await page.locator('.act-pass').count()) {
      await page.locator('.act-pass').click();
    } else if (await page.locator('.my-turn').count()) {
      const selected = page.locator('.my-hand .is-selected');
      const tile = page.locator('.my-hand .tile.mk-best').first();
      if (await selected.count()) await selected.click();
      else if (await tile.count()) await tile.click();
    }
    await expect(page.locator('.result')).toBeVisible({ timeout: 300 });
  }).toPass({ timeout: 35_000, intervals: [200] });
  await expect(page.locator('.res-deltas .rd')).toHaveCount(4);
  const deltas = await page.locator('.rd-delta').allTextContents();
  expect(deltas.reduce((sum, d) => sum + Number(d), 0)).toBe(0);
  const result = (await page.locator('.result').boundingBox())!;
  expect(result.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // 长结算内容可以滚动，下一局按钮始终可达。
  const next = page.getByRole('button', { name: '下一局', exact: true });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.locator('.result')).toHaveCount(0);
  await expect(page.locator('.cb-round')).toContainText('第 2 局');
});

test('manifest and home screen icons are available', async ({ page, request }) => {
  await page.goto('./');
  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate(el => (el as HTMLLinkElement).href);
  const manifestResponse = await request.get(manifestUrl);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.orientation).toBe('landscape');
  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }
});
