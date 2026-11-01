import { test, expect } from '@playwright/test';

test('replays public archive, opens original evidence and exports a report', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?project=posthog');
  await expect(page.getByRole('heading', { name: '把观察变成下一步行动' })).toBeVisible();
  await page.getByRole('button', { name: '▷ 运行 Agent', exact: true }).click();
  await expect(page.getByText('本轮已完成，结果与执行记录已保存在本地')).toBeVisible();
  await page.getByRole('button', { name: '回答与信源', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.locator('[data-sample]').first().click();
  await expect(page.getByRole('heading', { name: '原始回答', exact: true })).toBeVisible();
  await expect(page.locator('.answer')).not.toBeEmpty();
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: '导出报告 ↗' }).click();
  expect((await download).suggestedFilename()).toContain('citekeel');
  expect(errors).toEqual([]);
});

test('creates a real user project and confirms a fact without creating fake answers', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '＋ 新建项目' }).click();
  await page.getByLabel('品牌名称', { exact: true }).fill('测试用岚石仪表');
  await page.getByLabel('行业或产品', { exact: true }).fill('工业温度仪表');
  await page.getByLabel('品牌事实（每行一项，参数：内容）').fill('产品：工业温度探头');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByText('工业温度探头', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我已核对，确认此项' }).click();
  await expect(page.getByText('已确认', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重新运行', exact: true }).click();
  await expect(page.getByText('本轮已完成，结果与执行记录已保存在本地')).toBeVisible();
  const runId = await page.locator('[data-export]').count(); expect(runId).toBe(1);
  await page.getByRole('button', { name: '回答与信源', exact: true }).click();
  await expect(page.getByText('当前没有匹配的回答。可以导入原文，或用模型执行新测量。')).toBeVisible();
});

test('mobile navigation remains usable without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/?project=sensor');
  await expect(page.getByRole('heading', { name: '把观察变成下一步行动' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '品牌事实', exact: true }).click();
  await expect(page.getByRole('heading', { name: '品牌事实与来源' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('resolves a fact, generates a draft, saves review and records a link without claiming publication verification', async ({ page }) => {
  await page.goto('/?project=sensor');
  await page.getByRole('button', { name: '品牌事实', exact: true }).click();
  const resolution = page.getByRole('button', { name: '采用：每月 2400 件额定产能', exact: true });
  if (await resolution.count()) await resolution.click();
  await page.getByRole('button', { name: '重新运行', exact: true }).click();
  await expect(page.getByText('本轮已完成，结果与执行记录已保存在本地')).toBeVisible();
  await page.getByRole('button', { name: '内容与交付', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '内容草稿', exact: true })).toContainText('〔c-capacity〕');
  await page.getByLabel('我已核对事实与引用', { exact: true }).check();
  await page.getByRole('button', { name: '保存内容与审核状态' }).click();
  await expect(page.getByText('已审核', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '发布链接', exact: true }).fill('https://sensor-demo.example/guide');
  await page.getByRole('button', { name: '登记发布链接', exact: true }).click();
  await expect(page.getByText('已登记，访问状态未验证', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('dashboard filters real observations, switches metrics, and opens source evidence', async ({ page }) => {
  await page.goto('/?project=posthog');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('heading', { name: '品牌趋势' })).toBeVisible();
  await expect(page.locator('.comparison-table tbody tr')).toHaveCount(3);
  const model = await page.locator('#dashboard-model option').nth(1).getAttribute('value');
  await page.getByLabel('筛选模型', { exact: true }).selectOption(model!);
  await expect(page.locator('.comparison-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '引用覆盖', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '引用覆盖率' })).toBeVisible();
  await page.getByLabel('观察时间范围').selectOption('7');
  await expect(page.getByText('暂无符合筛选条件的观察')).toBeVisible();
  await page.getByRole('button', { name: '切换侧边栏' }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: '切换侧边栏' }).click();
  await page.getByRole('button', { name: '信源分析', exact: true }).click();
  await expect(page.locator('tbody tr')).not.toHaveCount(0);
  await page.locator('[data-sample]').first().click();
  await expect(page.getByRole('heading', { name: '原始回答', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
