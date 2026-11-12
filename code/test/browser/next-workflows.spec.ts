import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Store } from "../../src/workbench/storage.js";
import { researchWebsite } from "../../src/workbench/onboarding.js";
import type { ResearchJob } from "../../src/workbench/research-service.js";
import { textPdf } from "../fixtures/pdf.js";
import { createRun } from "../../src/workbench/engine.js";
import { initializeSamplingQueue } from "../../src/workbench/sampling-queue.js";

test("Next onboarding resumes research and creates a workspace using selected source prompts", async ({
  page,
}) => {
  const result = await researchWebsite(
    { url: "https://example.com", language: "en", country: "GB" },
    {
      fetchPage: async (url) => ({
        url,
        contentType: "text/html",
        text: '<title>Northstar | Product analytics</title><meta name="description" content="Understand how people use your software."><h1>Product analytics</h1>',
      }),
    },
  );
  const job: ResearchJob = {
    id: `research-${randomUUID()}`,
    status: result.status,
    input: { url: result.submittedUrl, language: "en", country: "GB" },
    result,
    createdAt: new Date().toISOString(),
  };
  await page.route("**/api/researches", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    expect(route.request().postDataJSON()).toMatchObject({
      language: "en",
      country: "GB",
    });
    await new Store(process.env.OPENGEO_DATA_DIR || "data/browser-tests").save("researches", job);
    await route.fulfill({ status: 202, json: job });
  });
  await page.goto("/create-workspace");
  await page.getByLabel("Website URL", { exact: true }).fill("example.com");
  await page.getByLabel("Target market").selectOption("GB");
  await page.getByRole("button", { name: "Research my website" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your first questions" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review your first questions" }),
  ).toBeVisible();
  const checks = page.locator("[data-prompt]"),
    count = await checks.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 1; i < count; i++) await checks.nth(i).uncheck();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Create workspace with selected prompts" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready" }),
  ).toBeVisible();
  await expect(
    page.getByText("Northstar · 1 active prompts", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready" }),
  ).toBeVisible();
});

test("Next manual creation, source review, replay, draft and publication remain connected", async ({
  page,
  request,
}) => {
  await page.goto("/create-workspace?lang=zh");
  await page.getByRole("button", { name: "手动建档", exact: true }).click();
  await page
    .getByLabel("品牌名称", { exact: true })
    .fill(`React 来源验收 ${randomUUID().slice(0, 6)}`);
  await page.getByLabel("行业或产品", { exact: true }).fill("精密温度仪表");
  await page
    .getByLabel("品牌事实（每行一项，参数：内容）")
    .fill("主营产品：工业温度探头");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  const href = await page
    .getByRole("link", { name: "打开工作区", exact: true })
    .getAttribute("href");
  const id = new URL(href!, "http://localhost").searchParams.get("project")!;
  await page.goto(`/?project=${id}&view=facts`);
  await page.getByRole("button", { name: "我已核对，确认此项" }).click();
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();
  const source = page.locator("[data-brand-source]");
  await source.getByLabel("资料类型").selectOption("text");
  await source.getByLabel("资料标题").fill("工业探头原文");
  await source
    .getByLabel("资料原文")
    .fill("额定温度范围为 -20 至 120 摄氏度。");
  await source.getByRole("button", { name: "导入来源", exact: true }).click();
  await expect(source.getByRole("status")).toContainText("资料已保存");
  await page.getByText("从来源录入一项事实", { exact: true }).click();
  const claim = page.locator("[data-brand-claim]");
  await claim
    .getByLabel("原文来源／页码")
    .selectOption({ label: "工业探头原文" });
  await claim.getByLabel("事实名称（建议包含型号与属性）").fill("额定温度范围");
  await claim.getByLabel("复制一段原文（不能改写）").fill("达到 1000 摄氏度");
  await claim.getByRole("button", { name: "录入待确认事实" }).click();
  await expect(claim.getByRole("alert")).toContainText("原文片段");
  await claim
    .getByLabel("复制一段原文（不能改写）")
    .fill("额定温度范围为 -20 至 120 摄氏度。");
  await claim.getByRole("button", { name: "录入待确认事实" }).click();
  await expect(
    page.getByRole("heading", { name: "额定温度范围", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已核对，确认此项" }).click();
  await page.getByRole("link", { name: "执行记录", exact: true }).click();
  await page.getByRole("button", { name: "仅回放", exact: true }).click();
  await expect
    .poll(async () => {
      const rows = await (
        await request.get(`/api/runs?projectId=${id}`)
      ).json();
      return rows[0]?.status;
    })
    .toMatch(/completed|needs_review/);
  await page.getByRole("link", { name: "内容与报告", exact: true }).click();
  await expect(page.getByLabel("内容草稿", { exact: true })).toContainText(
    "120",
  );
  await page.getByLabel("我已核对事实与引用", { exact: true }).check();
  await page.getByRole("button", { name: "保存内容与审核状态" }).click();
  await expect(page.getByText("已审核", { exact: true })).toBeVisible();
  await page
    .getByLabel("发布链接", { exact: true })
    .fill("https://temperature.example/guide");
  await page.getByRole("button", { name: "登记发布链接", exact: true }).click();
  await expect(page.getByText("已登记，访问状态未验证").first()).toBeVisible();
  expect(
    (await (await request.get(`/api/projects/${id}`)).json()).samples,
  ).toEqual([]);
});

test("Next prompts retain revisions, topics, status and recording source inputs", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { brand: "Question fixture", industry: "Product analytics" },
    })
  ).json();
  await page.goto(`/workspace?project=${project.id}&view=prompts`);
  await page.getByText("New topic", { exact: true }).click();
  await page
    .getByLabel("Topic name", { exact: true })
    .fill("Selection evidence");
  await page.getByRole("button", { name: "Create topic", exact: true }).click();
  await expect(page.getByText("Topic created.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add prompts", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Prompts (one per line)")
    .fill("Which analytics tools have verifiable documentation?");
  await dialog
    .getByLabel("Topic", { exact: true })
    .selectOption({ label: "Selection evidence" });
  await dialog
    .getByRole("button", { name: "Add prompts", exact: true })
    .click();
  const row = page.locator(".prompt-table tr").filter({
    hasText: "Which analytics tools have verifiable documentation?",
  });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Prompt", { exact: true })
    .fill("Which analytics tools have public technical documentation?");
  await page.getByRole("button", { name: "Save prompt", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const current = await (
    await request.get(`/api/projects/${project.id}`)
  ).json();
  expect(
    current.queries.find(
      (q: any) =>
        q.text === "Which analytics tools have verifiable documentation?",
    ).status,
  ).toBe("inactive");
  expect(
    current.queries.find(
      (q: any) =>
        q.text === "Which analytics tools have public technical documentation?",
    ).previousVersionId,
  ).toBeTruthy();
  const revised = page.locator(".prompt-table tr").filter({
    hasText: "Which analytics tools have public technical documentation?",
  });
  await revised.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Untrack selected", exact: true })
    .click();
  await expect(revised).toHaveCount(0);
  await page.getByRole("button", { name: /^inactive / }).click();
  await expect(revised).toBeVisible();
  await revised.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Track selected", exact: true })
    .click();
  await page.getByRole("button", { name: /^active / }).click();
  await expect(revised).toBeVisible();
  await page.getByText("Columns", { exact: true }).click();
  await page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save columns", exact: true }),
    })
    .getByLabel("Intent", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save columns", exact: true }).click();
  await expect(
    page
      .locator(".prompt-table")
      .getByRole("columnheader", { name: "Intent", exact: true }),
  ).toHaveCount(0);
  await page.getByText("Columns", { exact: true }).click();
  const tableTop = (await page.locator(".prompt-table").boundingBox())!.y;
  const toast = page.locator("[data-feedback-toast]");
  await expect(toast).toHaveText("Columns saved.");
  await expect(toast).toHaveAttribute("aria-live", "polite");
  expect(await toast.evaluate((el) => getComputedStyle(el).position)).toBe(
    "fixed",
  );
  await expect(page.getByLabel("Bulk prompt actions")).toHaveCount(0);
  await page
    .getByLabel("Search prompts", { exact: true })
    .fill("unmatched-keyword");
  await expect(
    page.getByText("No prompts match these filters", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(revised).toBeVisible();
  await expect(toast).toHaveCount(0, { timeout: 6500 });
  expect((await page.locator(".prompt-table").boundingBox())!.y).toBe(tableTop);
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByText("Columns", { exact: true }).click();
    const popup = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save columns", exact: true }),
    });
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.getByText("Columns", { exact: true }).click();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Recording", exact: true }).click();
  await page
    .getByLabel("Public URL", { exact: true })
    .fill("https://docs.example.com/guide");
  await page.getByRole("button", { name: "Add URL", exact: true }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(
    page.getByText("No URLs recorded yet", { exact: false }),
  ).toBeVisible();
});

test("Next PDF imports keep page provenance and reject broken files without losing sources", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { brand: "PDF fixture", industry: "Sensors" },
    })
  ).json();
  await page.goto(`/workspace?project=${project.id}&view=project`);
  const form = page.locator("[data-brand-source]");
  await form
    .getByLabel("Local brand file (PDF / TXT / MD, up to 1MB)")
    .setInputFiles({
      name: "fixture-manual.pdf",
      mimeType: "application/pdf",
      buffer: textPdf(),
    });
  await form
    .getByRole("button", { name: "Import source", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "fixture-manual.pdf · 第 1 页",
      exact: true,
    }),
  ).toBeVisible();
  await form
    .getByLabel("Local brand file (PDF / TXT / MD, up to 1MB)")
    .setInputFiles({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("broken"),
    });
  await form
    .getByRole("button", { name: "Import source", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("PDF");
  await page.setViewportSize({ width: 320, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Next queue requires charge acknowledgement for redrive and queries an existing remote task separately", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { brand: "Queue fixture", industry: "Sensors" },
    })
  ).json();
  const run = createRun(project, "live");
  run.id = `next-queue-${randomUUID()}`;
  run.status = "needs_review";
  run.steps = [];
  run.queries = project.queries.slice(0, 1);
  run.measurementTargets = [
    {
      id: "chatgpt",
      platform: "ChatGPT",
      preferredChannel: "api",
      provider: "cloro",
      model: "chatgpt",
    },
  ];
  run.measurementUnits = [
    {
      id: `${run.queries[0]!.id}--chatgpt`,
      queryId: run.queries[0]!.id,
      question: run.queries[0]!.text,
      targetId: "chatgpt",
      platform: "ChatGPT",
      preferredChannel: "api",
      status: "failed",
      attempts: [],
    },
  ];
  initializeSamplingQueue(run, true);
  const job = run.samplingQueue!.jobs[0]!;
  job.state = "review_required";
  job.reason = "Request timeout; cost unknown.";
  let redrives = 0,
    reconciles = 0;
  await page.route(`**/api/runs?projectId=${project.id}`, (route) =>
    route.fulfill({
      json: [
        {
          id: run.id,
          projectId: project.id,
          status: run.status,
          createdAt: run.createdAt,
        },
      ],
    }),
  );
  await page.route(`**/api/runs/${run.id}**`, (route) =>
    route.request().url().includes("/analytics")
      ? route.fulfill({ json: project.analytics })
      : route.fulfill({ json: run }),
  );
  await page.route(`**/api/runs/${run.id}/redrive`, (route) => {
    expect(route.request().postDataJSON().acknowledgeCost).toBe(true);
    redrives++;
    return route.fulfill({ status: 202, json: { id: run.id } });
  });
  await page.route(`**/api/runs/${run.id}/reconcile`, (route) => {
    expect(route.request().postDataJSON().jobId).toBe(job.id);
    reconciles++;
    return route.fulfill({ status: 202, json: { id: run.id } });
  });
  await page.goto(`/workspace?project=${project.id}&run=${run.id}&view=agent`);
  await page.getByText("Jobs and recovery", { exact: false }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("[data-queue-action=redrive]").click();
  expect(redrives).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-queue-action=redrive]").click();
  await expect.poll(() => redrives).toBe(1);
  job.remote = {
    taskId: "existing-task-id",
    idempotencyKey: "existing-key",
    status: "PROCESSING",
    createdAt: run.createdAt,
    deadlineAt: new Date(Date.now() + 60000).toISOString(),
    pollCount: 2,
    submissionAttempts: 1,
  };
  await page.reload();
  await page.getByText("Jobs and recovery", { exact: false }).click();
  await expect(page.locator("[data-queue-action=redrive]")).toHaveCount(0);
  await expect(page.locator(".queue-job")).toContainText("existing-task-id");
  await page.locator("[data-queue-action=reconcile]").click();
  await expect.poll(() => reconciles).toBe(1);
});

test("Next diagnosis freezes selected questions and managed platforms without saving submitted keys", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { brand: "Diagnosis fixture", industry: "Sensors" },
    })
  ).json();
  const space = await (
    await request.post(`/api/projects/${project.id}/diagnosis-spaces`, {
      data: {},
    })
  ).json();
  await page.goto(
    `/workspace?project=${project.id}&view=agent&space=${space.id}`,
  );
  const queries = page.locator("input[name=queryIds]");
  await queries.nth(1).uncheck();
  await page.locator("input[name=targetIds][value=gemini]").uncheck();
  await page.locator("input[name=targetIds][value=qwen]").uncheck();
  await page
    .getByRole("button", { name: "Save selection for later", exact: true })
    .click();
  await expect(
    page.getByText("Selection saved. Return to this space later to measure.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = await (
    await request.get(`/api/projects/${project.id}/diagnosis-spaces`)
  ).json();
  expect(saved[0].selectedQueryIds).toHaveLength(3);
  expect(saved[0].targetIds).toEqual(["chatgpt", "deepseek", "seed"]);
  await page
    .locator("details")
    .filter({ has: page.locator("input[name=key-openrouter]") })
    .locator("summary")
    .click();
  await page
    .locator("input[name=key-openrouter]")
    .fill("fixture-memory-only-key");
  let payload: any;
  const returned = createRun(project, "replay");
  returned.id = `diagnosis-preview-${randomUUID()}`;
  returned.status = "completed";
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { id: returned.id } });
  });
  await page.route(`**/api/runs/${returned.id}**`, (route) =>
    route.fulfill({ json: returned }),
  );
  await page
    .getByRole("button", { name: "Start brand diagnosis", exact: true })
    .click();
  await expect.poll(() => payload?.diagnosis).toBe(true);
  expect(payload.queryIds).toHaveLength(3);
  expect(payload.targetIds).toEqual(["chatgpt", "deepseek", "seed"]);
  expect(payload.spaceId).toBe(space.id);
  expect(payload.model).toBeUndefined();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("fixture-memory-only-key");
});

test("Next actions board saves todo, done, skip and restore states in the same run", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const project = await (
    await request.post("/api/projects", {
      data: { brand: "Action fixture", industry: "Sensors" },
    })
  ).json();
  const run = createRun(project, "replay");
  run.id = `next-actions-${randomUUID()}`;
  run.status = "completed";
  run.steps = [];
  run.samples = [
    {
      id: "action-answer",
      queryId: project.queries[0].id,
      question: project.queries[0].text,
      answer: "Action fixture provides sensors.",
      intent: project.queries[0].intent,
      branded: true,
      origin: "manual",
      model: "fixture",
      protocolId: "manual/v1",
      runGroup: run.id,
      observedAt: run.createdAt,
      collectionStatus: "completed",
      analysisStatus: "completed",
      citations: [],
    },
  ];
  run.actions = [
    {
      id: "action-fixture",
      title: "Review the documented sensor selection guide",
      rationale:
        "Review the saved answer against brand sources. Compare each specification with its original documentation before preparing the guide. The final paragraph must remain available in the expanded brief without making every board card equally tall.",
      kind: "content",
      priority: "P2",
      status: "proposed",
      queryIds: [project.queries[0].id],
      sampleIds: ["action-answer"],
      claimIds: [],
      acceptance: "Confirm sources and repeat the same protocol.",
    },
  ];
  for (let i = 1; i < 12; i++)
    run.actions.push({
      ...run.actions[0]!,
      id: `action-fixture-${i}`,
      title: `Review guide section ${i}`,
    });
  await new Store(process.env.OPENGEO_DATA_DIR || "data/browser-tests").save("runs", run);
  await page.goto(
    `/workspace?project=${project.id}&run=${run.id}&view=actions`,
  );
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Review the documented sensor selection guide",
      exact: true,
    }),
  });
  await expect(
    page.getByRole("button", { name: "Board", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const boardColumns = await Promise.all(
    ["Suggestions", "Todo", "Done", "Skipped"].map((name) =>
      page.getByRole("region", { name, exact: true }).boundingBox(),
    ),
  );
  expect(boardColumns.every((box) => box && box.width > 150)).toBe(true);
  expect(new Set(boardColumns.map((box) => Math.round(box!.y))).size).toBe(1);
  const suggestions = page.getByRole("region", {
    name: "Suggestions",
    exact: true,
  });
  await expect(suggestions).toHaveAttribute("tabindex", "0");
  expect(
    await suggestions.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThan(1600);
  await suggestions.focus();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => suggestions.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await suggestions.evaluate((el) => {
    el.scrollTop = 0;
  });
  const summary = card.locator("[data-action-summary]");
  expect(
    await summary.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await expect(
    card.getByRole("button", { name: "1 answer", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "1 answer", exact: true }).click();
  await expect(page.locator(".answer-text")).toContainText(
    "Action fixture provides sensors.",
  );
  await page.keyboard.press("Escape");
  await card.getByText("Brief and evidence", { exact: true }).click();
  await expect(card.getByText("Full rationale", { exact: true })).toBeVisible();
  await expect(card.locator("details")).toContainText(
    "The final paragraph must remain available",
  );
  await expect(card.locator("details")).toContainText(
    "Confirm sources and repeat the same protocol.",
  );
  await card.getByText("Brief and evidence", { exact: true }).click();
  let rejectUpdate = true;
  await page.route(`**/api/runs/${run.id}/actions`, async (route) => {
    if (rejectUpdate) {
      rejectUpdate = false;
      return route.fulfill({
        status: 500,
        json: { error: "Action update unavailable" },
      });
    }
    return route.continue();
  });
  await card.getByRole("button", { name: "Add to Todo", exact: true }).click();
  const actionError = page
    .getByRole("alert")
    .filter({ hasText: "Action update unavailable" });
  await expect(actionError).toBeVisible();
  expect(
    await actionError.evaluate((el) => getComputedStyle(el).position),
  ).not.toBe("fixed");
  await expect(page.locator("[data-feedback-toast]")).toHaveCount(0);
  expect(
    (await (await request.get(`/api/runs/${run.id}`)).json()).actionStates?.[
      "action-fixture"
    ],
  ).toBeUndefined();
  await card.getByRole("button", { name: "Add to Todo", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Mark done", exact: true }),
  ).toBeVisible();
  await expect(actionError).toHaveCount(0);
  await expect(page.locator("[data-feedback-toast]")).toContainText(
    "Action status saved.",
  );
  await expect(
    page
      .getByRole("region", { name: "Todo", exact: true })
      .locator("[data-action-card=action-fixture]"),
  ).toBeVisible();
  await card.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Restore suggestion", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    card.getByRole("button", { name: "Restore suggestion", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Restore suggestion", exact: true })
    .click();
  const skippedResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/runs/${run.id}/actions`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200,
  );
  await card.getByRole("button", { name: "Skip", exact: true }).click();
  await skippedResponse;
  await expect(page.locator("[data-feedback-toast]")).toContainText(
    "Action status saved.",
  );
  expect(
    (await (await request.get(`/api/runs/${run.id}`)).json()).actionStates[
      "action-fixture"
    ],
  ).toBe("skipped");
  const restoredResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/runs/${run.id}/actions`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200,
  );
  await card
    .getByRole("button", { name: "Restore suggestion", exact: true })
    .click();
  await restoredResponse;
  await expect(page.locator("[data-feedback-toast]")).toContainText(
    "Action status saved.",
  );
  expect(
    (await (await request.get(`/api/runs/${run.id}`)).json()).actionStates[
      "action-fixture"
    ],
  ).toBe("proposed");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await suggestions.evaluate((el) => getComputedStyle(el).overflowY),
  ).toBe("visible");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Next provider memory settings, answer imports and project recycle preserve local boundaries", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: {
        brand: `Local tools ${randomUUID().slice(0, 6)}`,
        industry: "Product analytics",
      },
    })
  ).json();
  let providerBody: any;
  await page.route("**/api/provider-session", (route) => {
    providerBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/workspace?project=${project.id}&view=evidence`);
  await page
    .getByRole("button", { name: "Provider settings", exact: true })
    .click();
  const settings = page.getByRole("dialog");
  await settings
    .getByLabel("openrouter API Key", { exact: true })
    .fill("test-only-memory-secret");
  await settings
    .getByRole("button", { name: "Save provider settings", exact: true })
    .click();
  await expect(
    settings.getByText("Provider settings are active in the local process.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(providerBody.openrouter).toBe("test-only-memory-secret");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("test-only-memory-secret");
  await page.keyboard.press("Escape");
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({
      name: "real-saved-answer.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([
          {
            question: "Which tools have documentation?",
            answer:
              "A saved answer includes https://docs.example.com/evidence.",
            model: "manual-entry",
            observedAt: "2026-11-10T00:00:00Z",
          },
        ]),
      ),
    });
  await expect(
    page.getByText(
      "Answers imported. Replay to generate an updated analysis snapshot.",
      { exact: true },
    ),
  ).toBeVisible();
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  expect(saved.samples).toHaveLength(1);
  expect(saved.samples[0].origin).toBe("manual");
  expect(saved.samples[0].citations[0].kind).toBe("answer_url");
  await page
    .getByRole("button", { name: "Manage projects", exact: true })
    .click();
  const manager = page.getByRole("dialog"),
    row = manager.getByText(project.name, { exact: true }).locator("../..");
  page.once("dialog", (dialog) => dialog.accept());
  await row
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  const removedRow = manager
    .getByText(project.name, { exact: true })
    .locator("..");
  await expect(
    removedRow.getByRole("button", { name: "Restore project", exact: true }),
  ).toBeVisible();
  const removed = await (await request.get("/api/deleted-projects")).json();
  expect(removed.some((value: any) => value.id === project.id)).toBe(true);
  await removedRow
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  expect(
    (await (await request.get("/api/projects")).json()).some(
      (value: any) => value.id === project.id,
    ),
  ).toBe(true);
});

test("question recommendations preserve source review, CN market, dismissed items and separate sampling", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: {
        brand: "Recommendation fixture",
        industry: "AI community",
        brief: "定位：AI 产品共学与黑客松社区",
      },
    })
  ).json();
  const store = new Store(process.env.OPENGEO_DATA_DIR || "data/browser-tests");
  await store.updateProject(project.id, (current) => {
    current.language = "zh";
    current.country = "CN";
    current.topics = [
      { id: "community", name: "AI 产品共学", sourceIds: ["user-brief"] },
    ];
  });
  let paidCalls = 0;
  await page.route(
    `**/api/projects/${project.id}/prompt-recommendations/generate`,
    async (route) => {
      if (route.request().postDataJSON().source === "model-assisted") {
        paidCalls++;
        const rec = {
          id: "model-community",
          text: "初学者如何选择有真实项目实践的 AI 共学社区？",
          intent: "commercial",
          branded: false,
          source: "model-assisted" as const,
          topicName: "AI 共学实践",
          sourceLabel: "OpenRouter · fixture-model",
          sourceIds: ["user-brief"],
          reason: "由已有品牌原文提出的待审核问题。",
          status: "candidate" as const,
          generatedAt: new Date().toISOString(),
        };
        await store.updateProject(project.id, (current) => {
          current.promptRecommendations = [rec];
        });
        await route.fulfill({
          json: {
            items: [rec],
            job: {
              id: "fixture-generation",
              status: "completed",
              call: {
                provider: "openrouter",
                model: "fixture-model",
                costStatus: "unknown",
              },
            },
          },
        });
      } else await route.continue();
    },
  );
  await page.goto(`/?project=${project.id}&view=queries`);
  await page.getByRole("button", { name: "智能推荐", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "生成问题集", exact: true }).click();
  await expect(
    dialog.getByText("初学者如何选择有真实项目实践的 AI 共学社区？", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByText("查看依据", { exact: true }).click();
  await expect(dialog.getByText("用户输入资料", { exact: true })).toBeVisible();
  await dialog.getByLabel("全选候选", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "加入建议库（1）", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page
    .locator(".prompt-table tr")
    .filter({ hasText: "初学者如何选择有真实项目实践的 AI 共学社区？" });
  await expect(row).toContainText("CN");
  await expect(row).toContainText("建议");
  const value = await (await request.get(`/api/projects/${project.id}`)).json();
  const query = value.queries.find((query: any) =>
    query.text.includes("初学者如何选择"),
  );
  expect(query).toMatchObject({
    status: "suggested",
    country: "CN",
    sourceIds: ["user-brief"],
  });
  expect(value.samples).toEqual([]);
  expect(paidCalls).toBe(1);
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("市场", { exact: true }),
  ).toHaveValue("CN");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "智能推荐", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByText("其他来源：模板与 OpenSEO", { exact: true }).click();
  await dialog
    .getByLabel("候选 JSON（text、intent）", { exact: true })
    .fill(
      '[{"text":"Which AI communities offer hands-on projects?","intent":"commercial"}]',
    );
  await dialog
    .getByRole("button", { name: "预览导入候选", exact: true })
    .click();
  await dialog.getByLabel("全选候选", { exact: true }).check();
  await dialog.getByRole("button", { name: "忽略所选", exact: true }).click();
  await expect(
    dialog.getByText("还没有新候选。", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "智能推荐", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByText("其他来源：模板与 OpenSEO", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "生成基础模板", exact: true })
    .click();
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await expect(
    dialog.getByText("Which AI communities offer hands-on projects?", {
      exact: true,
    }),
  ).toHaveCount(0);
});
