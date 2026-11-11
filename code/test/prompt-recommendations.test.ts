import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/workbench/storage.js";
import { PromptRecommendationService } from "../src/workbench/prompt-recommendations.js";
import { PromptService } from "../src/workbench/prompts.js";
import { enrichWebsiteResearch } from "../src/workbench/semantic-research.js";
import { createApp } from "../src/workbench/server.js";
import type { Project } from "../src/workbench/types.js";

async function fixture() {
  const root = await mkdtemp(
    join(tmpdir(), "opengeo-question-recommendations-"),
  );
  const store = new Store(root),
    now = new Date().toISOString();
  const project: Project = {
    id: "recommendations-fixture",
    name: "Acme",
    brand: "Acme",
    aliases: ["艾克米"],
    domain: "acme.example",
    industry: "社区",
    description: "",
    origin: "manual",
    goal: "问题建议",
    language: "zh",
    country: "CN",
    sources: [
      {
        id: "source-one",
        title: "社区活动",
        text: "Acme 是连接 AI 产品实践者的社区，提供黑客松和产品共学活动。",
      },
    ],
    claims: [],
    queries: [
      {
        id: "original",
        text: "Acme 是做什么的，适合谁？",
        intent: "brand_awareness",
        branded: true,
        origin: "manual",
        status: "active",
        country: "CN",
      },
    ],
    topics: [
      { id: "topic-one", name: "AI 产品共学", sourceIds: ["source-one"] },
    ],
    queryVersion: 1,
    samples: [],
    createdAt: now,
    updatedAt: now,
  };
  await store.save("projects", project);
  return {
    store,
    project,
    cleanup: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
async function done(service: PromptRecommendationService, projectId: string) {
  for (let i = 0; i < 200; i++) {
    const value = await service.list(projectId);
    if (value.job?.status !== "running") return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Generation did not finish.");
}
const structured = {
  profile: {
    brand: "Acme",
    description: "连接 AI 产品实践者的社区。",
    industry: "AI 社区",
    sourceIds: ["source-one"],
  },
  topics: [{ id: "learn", name: "AI 产品实践", sourceIds: ["source-one"] }],
  prompts: [
    {
      text: "Acme 的产品共学活动适合哪些 AI 初学者？",
      intent: "brand_awareness",
      branded: true,
      topicId: "learn",
      sourceIds: ["source-one"],
    },
    {
      text: "如何选择有真实项目实践的 AI 产品共学社区？",
      intent: "commercial",
      branded: false,
      topicId: "learn",
      sourceIds: ["source-one"],
    },
  ],
};

test("templates deduplicate existing questions, persist dismissals, and require review before tracking", async () => {
  const { store, project, cleanup } = await fixture(),
    service = new PromptRecommendationService(store);
  try {
    const value = await service.generate(project.id, {
      source: "local-source-derived",
    });
    assert.equal(value.items.length, 3);
    assert.ok(
      value.items.every(
        (item) =>
          item.status === "candidate" && item.sourceIds.includes("source-one"),
      ),
    );
    assert.equal(
      (await store.get<Project>("projects", project.id))!.queries.length,
      1,
    );
    await service.dismiss(project.id, [value.items[0]!.id]);
    assert.equal(
      (await service.generate(project.id, { source: "local-source-derived" }))
        .items.length,
      2,
    );
    const ids = (await service.list(project.id)).items.map((item) => item.id);
    await assert.rejects(service.accept(project.id, ids, 0), /changed/);
    const result = await service.accept(project.id, ids, 1);
    assert.equal(result.added.length, 2);
    assert.ok(
      result.added.every(
        (query) =>
          query.status === "suggested" &&
          query.country === "CN" &&
          query.language === "zh",
      ),
    );
    assert.equal(result.project.queryVersion, 2);
    assert.equal(result.project.samples.length, 0);
    assert.equal(
      (await service.generate(project.id, { source: "local-source-derived" }))
        .items.length,
      0,
    );
    await new PromptService(store).edit(project.id, result.added[0]!.id, {
      text: result.added[0]!.text + " 应该注意什么？",
      country: "CN",
      expectedRevision: 1,
    });
    const edited = await store.get<Project>("projects", project.id);
    assert.ok(
      edited!.queries.some(
        (query) =>
          query.previousVersionId === result.added[0]!.id &&
          query.country === "CN",
      ),
    );
  } finally {
    await cleanup();
  }
});

test("one idempotent model call uses source evidence, retains receipt, and does not rewrite facts or activate questions", async () => {
  const { store, project, cleanup } = await fixture();
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "fixture-private-key";
  let calls = 0;
  const service = new PromptRecommendationService(
    store,
    (research, config, options) =>
      enrichWebsiteResearch(research, config, {
        ...options,
        generate: async (request) => {
          calls++;
          assert.ok(request.prompt.includes("existingQuestions"));
          assert.ok(request.prompt.includes("社区活动"));
          assert.ok(!request.prompt.includes("fixture-private-key"));
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            text: JSON.stringify(structured),
            costUsd: 0.001,
            rawResponse: { authorization: "fixture-private-key" },
          };
        },
      }),
  );
  try {
    const results = await Promise.all([
      service.generate(project.id, {
        source: "model-assisted",
        requestId: "same-request-123",
      }),
      service.generate(project.id, {
        source: "model-assisted",
        requestId: "same-request-123",
      }),
    ]);
    assert.equal(results[0]!.job!.id, results[1]!.job!.id);
    const value = await done(service, project.id);
    assert.equal(calls, 1);
    assert.equal(value.job!.status, "completed");
    assert.equal(value.job!.call!.costUsd, 0.001);
    assert.equal(value.items.length, 2);
    assert.ok(!JSON.stringify(value).includes("fixture-private-key"));
    await service.generate(project.id, {
      source: "model-assisted",
      requestId: "same-request-123",
    });
    assert.equal(calls, 1);
    const original = await store.get<Project>("projects", project.id);
    assert.equal(original!.queries.length, 1);
    assert.deepEqual(original!.claims, []);
    const saved = await service.accept(
      project.id,
      value.items.map((item) => item.id),
      1,
    );
    assert.equal(saved.added.length, 2);
    assert.ok(
      saved.project.topics!.some((topic) => topic.name === "AI 产品实践"),
    );
    assert.ok(
      saved.added.every(
        (query) =>
          query.status === "suggested" &&
          query.sourceIds!.includes("source-one"),
      ),
    );
  } finally {
    if (prior === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prior;
    await cleanup();
  }
});

test("invalid generation is explicit, never silently falls back as model research, and restart never repeats a paid call", async () => {
  const { store, project, cleanup } = await fixture();
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "fixture-only-key";
  let calls = 0;
  const service = new PromptRecommendationService(
    store,
    (research, config, options) =>
      enrichWebsiteResearch(research, config, {
        ...options,
        generate: async () => {
          calls++;
          return { text: "not JSON" };
        },
      }),
  );
  try {
    await service.generate(project.id, {
      source: "model-assisted",
      requestId: "failed-request-123",
    });
    const value = await done(service, project.id);
    assert.equal(calls, 1);
    assert.equal(value.job!.status, "failed");
    assert.equal(value.items.length, 0);
    assert.equal(value.job!.call!.status, "failed");
    await store.updateProject(project.id, (current) => {
      current.promptRecommendationJobs!.push({
        id: "interrupted-job",
        status: "running",
        createdAt: new Date().toISOString(),
        fingerprint: "fixture",
      });
    });
    await service.initialize();
    assert.equal((await service.list(project.id)).job!.status, "interrupted");
    assert.equal(calls, 1);
    await assert.rejects(
      service.generate(project.id, { source: "unsupported" }),
    );
  } finally {
    if (prior === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prior;
    await cleanup();
  }
});

test("OpenSEO imports remain user-supplied US English suggestions, reject invalid entries, and local routes enforce origin", async () => {
  const { store, project, cleanup } = await fixture();
  const { server } = await createApp(store);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const path = `/api/projects/${project.id}/prompt-recommendations`,
    post = (action: string, data: unknown, origin?: string) =>
      fetch(base + path + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify(data),
      });
  try {
    assert.equal(
      (await post("/generate", { source: "open-seo", prompts: [] })).status,
      400,
    );
    assert.equal(
      (await post("/generate", { source: "open-seo", prompts: [null] })).status,
      400,
    );
    assert.equal(
      (
        await post("/generate", {
          source: "open-seo",
          prompts: [{ text: "Question?", intent: "invented" }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/generate",
          { source: "local-source-derived" },
          "https://outside.example",
        )
      ).status,
      403,
    );
    const value = await (
      await post("/generate", {
        source: "open-seo",
        prompts: [
          {
            text: "Which AI communities support hands-on projects?",
            intent: "commercial",
            sourceLabel: "Pretend verified demand",
          },
        ],
      })
    ).json();
    assert.equal(value.items.length, 1);
    assert.ok(!value.items[0].sourceLabel.includes("Pretend"));
    const saved = await (
      await post("/accept", { ids: [value.items[0].id], expectedVersion: 1 })
    ).json();
    assert.equal(saved.added[0].status, "suggested");
    assert.equal(saved.added[0].country, "US");
    assert.equal(saved.added[0].language, "en");
    assert.equal(saved.project.samples.length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
  }
});
