import { test, expect } from '@playwright/test';

test('replays public archive, opens original evidence and exports a report', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?project=posthog');
  await expect(page.getByRole('heading', { name: '把观察变成下一步行动' })).toBeVisible();
  await page.getByRole('button', { name: '仅回放', exact: true }).click();
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

test('diagnosis entry submits a frozen question set and platform matrix without storing keys', async ({ page }) => {
  await page.goto('/?project=sensor');
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/runs', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    payload = route.request().postDataJSON(); await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'diagnosis-ui-test' }) });
  });
  await page.getByRole('button', { name: '⇶ 运行品牌诊断' }).click();
  await expect(page.getByRole('heading', { name: '运行一轮品牌诊断' })).toBeVisible();
  await page.getByRole('checkbox', { name: '千问 API 通道' }).check();
  await page.locator('input[name="key-openrouter"]').fill('page-memory-key-not-persisted');
  await page.getByRole('button', { name: '确认问题并运行' }).click();
  await expect.poll(() => payload?.diagnosis).toBe(true);
  expect((payload?.queryIds as string[]).length).toBe(5);
  expect(payload?.targets).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'chatgpt', preferredChannel: 'web' }),
    expect.objectContaining({ id: 'gemini', provider: 'openrouter', model: 'google/gemini-2.5-flash', preferredChannel: 'api' }),
    expect.objectContaining({ id: 'perplexity', provider: 'openrouter', model: 'perplexity/sonar', preferredChannel: 'api' }),
    expect.objectContaining({ id: 'deepseek', provider: 'openrouter', model: 'deepseek/deepseek-chat', preferredChannel: 'api' }),
    expect.objectContaining({ id: 'qwen', provider: 'openrouter', model: 'qwen/qwen3-32b', preferredChannel: 'api' }),
    expect.objectContaining({ id: 'seed', provider: 'openrouter', model: 'bytedance-seed/seed-2.0-lite', preferredChannel: 'api' }),
  ]));
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('page-memory-key-not-persisted');
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
  const initialRows = await page.locator('.cohort-table tbody tr').count(); expect(initialRows).toBeGreaterThan(1);
  const model = await page.locator('#dashboard-model option').nth(1).getAttribute('value');
  await page.getByLabel('筛选模型', { exact: true }).selectOption(model!);
  await expect.poll(async () => page.locator('.cohort-table tbody tr').count()).toBeLessThan(initialRows);
  await expect(page.locator('.cohort-table tbody')).toContainText(model!);
  await page.getByRole('button', { name: '引用覆盖', exact: true }).click();
  await expect(page.getByRole('button', { name: '引用覆盖', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('观察时间范围').selectOption('7');
  await expect(page.getByText('暂无符合筛选条件的观察').first()).toBeVisible();
  await page.getByRole('button', { name: '切换侧边栏' }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: '切换侧边栏' }).click();
  await page.getByLabel('观察时间范围').selectOption('all');
  await page.getByRole('button', { name: '信源分析', exact: true }).click();
  await expect(page.locator('.da-source').first()).toBeVisible();
  await page.locator('[data-sample]').first().click();
  await expect(page.getByRole('heading', { name: '原始回答', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '工作概览', exact: true }).click();
  await page.getByLabel('筛选模型', { exact: true }).selectOption('all');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'data/browser-tests/analytics-preview/dashboard-zh.png', fullPage: false });
  expect(errors).toEqual([]);
});

test('imports brand evidence, rejects unsupported claims and creates a reviewed draft without collecting answers', async ({ page, request }) => {
  const response = await request.post('/api/projects', { data: { brand: '资料验收机器人', industry: '机器人' } });
  const project = await response.json();
  await page.goto(`/?project=${project.id}`);
  await page.getByRole('button', { name: '品牌事实', exact: true }).click();
  const sourceForm = page.locator('[data-brand-source]');
  await sourceForm.getByLabel('资料标题').fill('PiPER 原文说明');
  await sourceForm.getByLabel('资料原文').fill('PiPER 的额定负载为 1.5 kg。');
  await sourceForm.getByRole('button', { name: '导入来源', exact: true }).click();
  await expect(page.getByText('资料已保存，请逐项核对事实；历史运行快照保持原样。')).toBeVisible();
  await page.getByText('从来源录入一项事实', { exact: true }).click();
  const claimForm = page.locator('[data-brand-claim]');
  await claimForm.getByLabel('原文来源／页码').selectOption({ label: 'PiPER 原文说明' });
  await claimForm.getByLabel('事实名称（建议包含型号与属性）').fill('PiPER 额定负载');
  await claimForm.getByLabel('复制一段原文（不能改写）').fill('负载 100 kg');
  await claimForm.getByRole('button', { name: '录入待确认事实' }).click();
  await expect(claimForm.getByRole('status')).toContainText('原文片段');
  await claimForm.getByLabel('复制一段原文（不能改写）').fill('PiPER 的额定负载为 1.5 kg。');
  await claimForm.getByRole('button', { name: '录入待确认事实' }).click();
  await expect(page.getByText('PiPER 额定负载', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我已核对，确认此项' }).click();
  await page.getByRole('button', { name: '重新运行', exact: true }).click();
  await expect(page.getByText('本轮已完成，结果与执行记录已保存在本地')).toBeVisible();
  await page.getByRole('button', { name: '内容与交付', exact: true }).click();
  expect(await page.getByRole('textbox', { name: '内容草稿' }).inputValue()).toContain('1.5 kg');
  const current = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(current.samples).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '品牌事实', exact: true }).click();
  await expect(sourceForm.getByRole('button', { name: '导入来源', exact: true })).toBeVisible();
  await page.screenshot({ path: 'data/browser-tests/brand-sources-mobile.png', fullPage: true });
});
