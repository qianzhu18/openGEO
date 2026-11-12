import { test, expect } from "@playwright/test";
import { Store } from "../../src/workbench/storage.js";
import { createRun } from "../../src/workbench/engine.js";
import type { AgentRun, Project, Sample } from "../../src/workbench/types.js";
const store = new Store(process.env.OPENGEO_DATA_DIR || "data/browser-tests"),
  id = "next-dashboard-fixture",
  r1 = "next-dashboard-run-1",
  r2 = "next-dashboard-run-2";
function fixture(): Project {
  return {
    id,
    name: "Alpine instruments",
    brand: "Alpine",
    aliases: [],
    industry: "Industrial measurement",
    domain: "alpine.example",
    description: "Industrial measurement documentation",
    goal: "Inspect saved evidence",
    origin: "manual",
    sources: [],
    claims: [],
    queries: [
      {
        id: "question-1",
        text: "Which instruments have documented calibration?",
        intent: "discovery",
        branded: false,
        origin: "fixture",
        status: "active",
      },
    ],
    queryVersion: 1,
    samples: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
function sample(
  sid: string,
  answer: string,
  protocol: string,
  day = "2026-11-09",
  failed = false,
): Sample {
  return {
    id: sid,
    queryId: "question-1",
    question: "Which instruments have documented calibration?",
    intent: "discovery",
    branded: false,
    origin: "api",
    model: "fixture/model",
    protocolId: protocol,
    runGroup: protocol,
    answer,
    observedAt: `${day}T12:00:00Z`,
    collectionStatus: failed ? "failed" : "completed",
    analysisStatus: failed ? "unknown" : "completed",
    citations: answer.includes("Alpine")
      ? [
          {
            url: "https://docs.example.com/calibration",
            kind: "provider_citation",
            source: "provider_annotation",
            integrity: "matched",
          },
        ]
      : [],
    ...(failed ? { error: "Fixture timeout, cost unknown" } : {}),
  };
}
test.beforeEach(async () => {
  const p = fixture();
  await store.save("projects", p);
  const a = createRun(p, "replay");
  Object.assign(a, {
    id: r1,
    status: "completed",
    steps: [],
    createdAt: "2026-11-09T13:00:00Z",
    samples: [
      sample("one", "Alpine documents calibration.", "first"),
      sample("two", "Other tools.", "second"),
      sample("failed", "", "third", "2026-11-09", true),
    ],
  });
  const b = createRun(p, "replay");
  Object.assign(b, {
    id: r2,
    status: "completed",
    steps: [],
    createdAt: "2026-11-10T13:00:00Z",
    samples: [
      sample(
        "trend-first",
        "Alpine documents calibration.",
        "trend",
        "2026-11-06",
      ),
      sample("trend-last", "Other tools.", "trend", "2026-11-09"),
    ],
  });
  await store.save("runs", a);
  await store.save("runs", b);
});
test("Next app hydrates with nonce CSP and keeps mixed cohorts, unknowns and answer evidence truthful", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(`/?project=${id}&run=${r1}`);
  expect(response!.headers()["content-security-policy"]).toContain("'nonce-");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "script-src 'self' 'unsafe-inline'",
  );
  await expect(
    page.getByRole("heading", { name: "AI 回答中的品牌表现" }),
  ).toBeVisible();
  await expect(page.locator(".da-metrics")).toContainText("按组查看");
  await expect(page.locator(".da-metrics")).toContainText("2/3");
  const bars = page.getByRole("button", { name: /model.*100.0%/ });
  await expect(bars).toHaveCount(1);
  await bars.click();
  await expect(
    page.getByRole("heading", { name: "原始回答", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".answer-text")).toContainText("Alpine documents");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "引用覆盖", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "引用覆盖", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("采集通道", { exact: true }).selectOption("web");
  await expect(page.locator(".da-metrics")).toContainText("UNKNOWN");
  await page.getByLabel("采集通道", { exact: true }).selectOption("all");
  await page.getByRole("link", { name: "信源分析", exact: true }).click();
  await expect(page.locator(".da-source")).toHaveCount(1);
  await page.getByRole("button", { name: "查看原文", exact: true }).click();
  await expect(page.locator(".answer-text")).toContainText("Alpine");
  await page.keyboard.press("Escape");
  const analysis = await (
    await request.get(`/api/runs/${r1}/analytics`)
  ).json();
  expect(analysis.quality.valid).toBe(2);
  expect(analysis.quality.excluded).toBe(1);
  expect(errors).toEqual([]);
});
test("run choice survives reload and late responses cannot replace a newer selection", async ({
  page,
}) => {
  await page.goto(`/?project=${id}&run=${r2}`);
  await expect(page.getByLabel("分析运行批次")).toHaveValue(r2);
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/runs/${r1}?projectId=*`, async (route) => {
    await gate;
    await route.continue();
  });
  const pending = page.waitForRequest((r) =>
    r.url().includes(`/api/runs/${r1}?projectId=`),
  );
  await page.getByLabel("分析运行批次").selectOption(r1);
  await pending;
  await page.getByLabel("分析运行批次").selectOption(r2);
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByLabel("分析运行批次")).toHaveValue(r2);
  await page.reload();
  await expect(page.getByLabel("分析运行批次")).toHaveValue(r2);
  await expect(
    page.getByRole("heading", { name: "实际观测趋势" }),
  ).toBeVisible();
});
test("chart points open the exact cohort answer when imported batches reuse local IDs", async ({
  page,
}) => {
  const run = (await store.get<AgentRun>("runs", r2))!;
  run.samples = [
    sample("reused", "Alpine first batch answer.", "batch-a", "2026-11-06"),
    sample("last-a", "Alpine later answer.", "batch-a", "2026-11-09"),
    sample(
      "reused",
      "Other tools, second batch evidence.",
      "batch-b",
      "2026-11-06",
    ),
    sample("last-b", "Other tools, later answer.", "batch-b", "2026-11-09"),
  ];
  await store.save("runs", run);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?project=${id}&run=${r2}`);
  const dot = page
    .locator(".recharts-line-dots")
    .nth(1)
    .locator("circle")
    .first();
  await dot.hover();
  await page.locator(".recharts-active-dot").nth(1).locator("circle").click();
  await expect(page.locator(".answer-text")).toContainText(
    "second batch evidence",
  );
  expect(errors).toEqual([]);
});
test("exports share filters and narrow layouts keep navigation and charts usable", async ({
  page,
}) => {
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace?project=${id}&run=${r1}`);
    await expect(
      page.getByRole("heading", { name: "Your brand, in AI answers" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("link", { name: "Brand facts", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Project" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/workspace?project=${id}&run=${r1}`);
  await page
    .getByLabel("Collection channel", { exact: true })
    .selectOption("api");
  await expect(
    page.getByRole("link", { name: "Business brief" }),
  ).toHaveAttribute("href", `/api/runs/${r1}/report?channel=api`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Business brief" }).click();
  expect((await download).suggestedFilename()).toContain("opengeo-");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".chart-enter")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
test("a failed run selection retains displayed run polling and hides exports while active", async ({
  page,
  request,
}) => {
  const original = await (await request.get(`/api/runs/${r2}`)).json();
  let reads = 0;
  await page.route(new RegExp(`/api/runs/${r2}(?:\\?.*)?$`), (route) => {
    reads++;
    return route.fulfill({ json: { ...original, status: "running" } });
  });
  await page.route(new RegExp(`/api/runs/${r1}(?:\\?.*)?$`), (route) =>
    route.fulfill({ status: 500, json: { error: "Fixture unavailable" } }),
  );
  await page.goto(`/?project=${id}&run=${r2}`);
  await expect(
    page.getByRole("heading", { name: "诊断进行中", exact: true }),
  ).toBeVisible();
  const before = reads;
  await page.getByLabel("分析运行批次").selectOption(r1);
  await expect(
    page.getByRole("alert").filter({ hasText: "Fixture unavailable" }),
  ).toContainText("Fixture unavailable");
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.getByRole("link", { name: "业务简报" })).toHaveCount(0);
});
test("background polling cannot overtake a slow explicit run selection", async ({
  page,
  request,
}) => {
  const running = await (await request.get(`/api/runs/${r2}`)).json();
  await page.route(new RegExp(`/api/runs/${r2}(?:\\?.*)?$`), (route) =>
    route.fulfill({ json: { ...running, status: "running" } }),
  );
  await page.route(`**/api/runs/${r1}?projectId=*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1900));
    await route.continue();
  });
  await page.goto(`/?project=${id}&run=${r2}`);
  await expect(
    page.getByRole("heading", { name: "诊断进行中", exact: true }),
  ).toBeVisible();
  await page.getByLabel("分析运行批次").selectOption(r1);
  await expect(page.getByLabel("分析运行批次")).toHaveValue(r1, {
    timeout: 6000,
  });
  await expect(
    page.getByRole("heading", { name: "AI 回答中的品牌表现" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "业务简报" })).toBeVisible();
});

test("filter updates expose pending scope, block stale exports, and recover without stale results", async ({
  page,
}) => {
  await page.goto(`/?project=${id}&run=${r1}`);
  await expect(
    page.getByRole("link", { name: "业务简报", exact: true }),
  ).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/runs/${r1}?channel=web`, async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByLabel("采集通道", { exact: true }).selectOption("web");
  await expect(page.getByText("正在更新分析…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "业务简报", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".da-metrics")).toHaveCount(0);
  release();
  await expect(page.locator(".da-metrics")).toContainText("UNKNOWN");
  await expect(
    page.getByRole("link", { name: "业务简报", exact: true }),
  ).toHaveAttribute("href", `/api/runs/${r1}/report?channel=web`);
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(page.locator(".da-metrics")).toContainText("2/3");
  await page.getByRole("button", { name: "首次出现序", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "首次出现序", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page
      .locator(".segmented-indicator")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("source tables sort, paginate, restore empty searches and retain exact evidence", async ({
  page,
}) => {
  const run = (await store.get<AgentRun>("runs", r1))!;
  run.samples = Array.from({ length: 13 }, (_, i) => ({
    ...sample(`source-${i}`, `Alpine documentation ${i}`, "sources"),
    citations: [
      {
        url: `https://source-${String(i).padStart(2, "0")}.example/page`,
        kind: "provider_citation",
        source: "provider_annotation",
        integrity: "matched",
      },
    ],
  }));
  await store.save("runs", run);
  await page.goto(`/workspace?project=${id}&run=${r1}&view=sources`);
  await expect(page.locator(".da-source")).toHaveCount(10);
  await expect(
    page.getByText("1–10 / 13 cohort source records", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".da-source")).toHaveCount(3);
  await expect(
    page.getByText("11–13 / 13 cohort source records", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Source", exact: true }),
  ).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator(".da-source").first()).toContainText(
    "source-00.example",
  );
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".da-source").first()).toContainText(
    "source-12.example",
  );
  await page
    .getByLabel("Search sources", { exact: true })
    .fill("not-a-saved-domain");
  await expect(
    page.getByText("No matching sources", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".da-source")).toHaveCount(10);
  await page.getByRole("button", { name: "URLs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "URLs", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".da-source")
    .first()
    .getByRole("button", { name: "Read answer", exact: true })
    .click();
  await expect(page.locator(".answer-text")).toContainText(
    "Alpine documentation 12",
  );
});

test("all topic questions stay reachable beyond twelve and grouped counts are coverage only", async ({
  page,
}) => {
  const run = (await store.get<AgentRun>("runs", r1))!;
  run.samples = Array.from({ length: 14 }, (_, i) => ({
    ...sample(`question-${i}`, "Alpine documentation", "topics"),
    queryId: `question-${i}`,
    question: `Calibration use case ${i}`,
  }));
  await store.save("runs", run);
  await page.goto(`/workspace?project=${id}&run=${r1}`);
  const group = page.locator(".topic-row").first();
  await expect(group).toContainText("14 prompts");
  await expect(group).not.toHaveAttribute("open");
  await group.locator("summary").click();
  await expect(group.getByRole("row")).toHaveCount(15);
  await group
    .getByRole("row")
    .last()
    .getByRole("button", { name: "Read answer", exact: true })
    .click();
  await expect(page.locator(".answer-text")).toContainText(
    "Alpine documentation",
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("Search covered prompts").fill("missing topic");
  await expect(
    page.getByText("No matching prompts", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".topic-row")).toHaveCount(1);
});

test("source protocols and dense prompt controls remain inside narrow viewports", async ({
  page,
}) => {
  const run = (await store.get<AgentRun>("runs", r1))!;
  run.samples = [
    sample(
      "long-protocol",
      "Alpine documentation",
      "protocol-with-a-long-unbroken-identity-".repeat(8),
    ),
  ];
  await store.save("runs", run);
  for (const width of [1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const language of ["/", "/workspace"]) {
      for (const view of ["queries", "sources"]) {
        await page.goto(`${language}?project=${id}&run=${r1}&view=${view}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
  }
});

test("saved project evidence retries the failed scope and clears its error", async ({
  page,
}) => {
  await page.goto(`/?project=${id}&run=project`);
  await expect(page.getByLabel("分析运行批次")).toHaveValue("");
  let scopedReads = 0;
  await page.route(
    `**/api/projects/${id}/analytics?channel=web`,
    async (route) => {
      scopedReads++;
      if (scopedReads === 1)
        await route.fulfill({
          status: 503,
          json: { error: "Scope temporarily unavailable" },
        });
      else await route.continue();
    },
  );
  await page.getByLabel("采集通道", { exact: true }).selectOption("web");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Scope temporarily unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".da-metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect.poll(() => scopedReads).toBe(2);
  await expect(page.locator(".da-metrics")).toContainText("UNKNOWN");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Scope temporarily unavailable" }),
  ).toHaveCount(0);
  await expect(page.getByText("正在更新分析…", { exact: true })).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
});
