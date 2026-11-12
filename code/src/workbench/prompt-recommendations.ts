import { createHash, randomUUID } from "node:crypto";
import type { Project, PromptRecommendation, Query } from "./types.js";
import { Store } from "./storage.js";
import { WorkspaceError } from "./prompts.js";
import { enrichWebsiteResearch } from "./semantic-research.js";
import type { WebsiteResearch } from "./onboarding.js";
import { resolveProviderKey } from "../../vendor/niubigeo/src/config/env.js";

type ImportedPrompt = { text: unknown; intent?: unknown; topicId?: unknown };
const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const stableId = (projectId: string, text: string, source: string) =>
  `recommendation-${createHash("sha256").update(`${projectId}:${source}:${text.toLowerCase()}`).digest("hex").slice(0, 20)}`;
const clean = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new WorkspaceError(`Invalid ${label}.`);
  return value.trim().replace(/\s+/g, " ");
};
const isIntent = (value: string) =>
  [
    "informational",
    "commercial",
    "navigational",
    "transactional",
    "brand_awareness",
  ].includes(value);
const includesBrand = (text: string, project: Project) =>
  [project.brand, ...project.aliases].some(
    (value) =>
      value && text.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
  );

function localCandidates(project: Project): PromptRecommendation[] {
  const language =
    project.language?.startsWith("zh") || project.country === "CN"
      ? "zh"
      : "en";
  const brand = project.brand;
  const source =
    project.sources.find((item) => item.id === "user-brief") ||
    project.sources[0];
  const sourceIds = source ? [source.id] : [];
  const topics = (project.topics || []).slice(0, 4);
  const topicNames = topics.map((item) => item.name).filter(Boolean);
  const rows: Array<{
    text: string;
    intent: string;
    topicId?: string;
    reason: string;
  }> =
    language === "zh"
      ? [
          {
            text: `${brand} 是做什么的，适合谁？`,
            intent: "brand_awareness",
            reason: "品牌资料可直接支撑品牌定位与适用对象核验。",
          },
          {
            text: `选择 ${brand} 之前，应该核实哪些信息？`,
            intent: "commercial",
            reason: "把购买前的核验标准转成可测量的问题。",
          },
          {
            text: `${brand} 与同类方案相比，应该如何评估？`,
            intent: "commercial",
            reason: "覆盖品牌比较场景，避免只测点名问题。",
          },
          ...topicNames.map((name, index) => ({
            text: `评估「${name}」相关方案时，团队应该考虑什么？`,
            intent: index % 2 ? "commercial" : "informational",
            topicId: topics[index]?.id,
            reason: `问题主题来自已保存的品牌资料主题「${name}」。`,
          })),
        ]
      : [
          {
            text: `What does ${brand} offer, and who is it for?`,
            intent: "brand_awareness",
            reason:
              "The saved brand source can support a positioning and audience check.",
          },
          {
            text: `What should a buyer verify before choosing ${brand}?`,
            intent: "commercial",
            reason:
              "Turns pre-purchase verification into a measurable question.",
          },
          {
            text: `How should ${brand} be evaluated against comparable solutions?`,
            intent: "commercial",
            reason:
              "Covers comparison intent instead of only branded awareness.",
          },
          ...topicNames.map((name, index) => ({
            text: `What should teams consider when evaluating solutions for ${name}?`,
            intent: index % 2 ? "commercial" : "informational",
            topicId: topics[index]?.id,
            reason: `The topic comes from the saved brand evidence: ${name}.`,
          })),
        ];
  const now = new Date().toISOString();
  return rows.map((row) => ({
    id: stableId(project.id, row.text, "local-source-derived"),
    text: row.text,
    intent: row.intent,
    branded: includesBrand(row.text, project),
    topicId: row.topicId,
    source: "local-source-derived",
    sourceLabel: source ? `本地来源 · ${source.title}` : "本地品牌资料",
    sourceIds,
    reason: row.reason,
    status: "candidate",
    generatedAt: now,
  }));
}

function importedCandidates(
  project: Project,
  input: unknown,
): PromptRecommendation[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50)
    throw new WorkspaceError("OpenSEO import must contain 1–50 prompts.");
  const now = new Date().toISOString();
  return input.map((entry: ImportedPrompt) => {
    const text = clean(entry?.text, "prompt text", 800);
    const intent =
      entry.intent === undefined
        ? "informational"
        : clean(entry.intent, "intent", 40);
    if (!isIntent(intent))
      throw new WorkspaceError("OpenSEO prompt intent is not supported.");
    const topicId =
      entry.topicId === undefined || entry.topicId === ""
        ? undefined
        : clean(entry.topicId, "topic ID", 100);
    if (topicId && !project.topics?.some((topic) => topic.id === topicId))
      throw new WorkspaceError("OpenSEO prompt references an unknown topic.");
    return {
      id: stableId(project.id, text, "open-seo"),
      text,
      intent,
      branded: includesBrand(text, project),
      topicId,
      source: "open-seo",
      sourceLabel: "OpenSEO · imported US English research",
      sourceIds: [],
      reason:
        "OpenSEO 提供的候选问题；需在本地工作台审核，不能当作已测量需求。",
      status: "candidate",
      generatedAt: now,
    } satisfies PromptRecommendation;
  });
}

export class PromptRecommendationService {
  private active = 0;
  constructor(
    private store: Store,
    private enrich = enrichWebsiteResearch,
  ) {}
  async initialize() {
    for (const project of await this.store.list<Project>("projects")) {
      if (
        !project.promptRecommendationJobs?.some(
          (job) => job.status === "running",
        )
      )
        continue;
      await this.store.updateProject(project.id, (current) => {
        for (const job of current.promptRecommendationJobs || [])
          if (job.status === "running") {
            job.status = "interrupted";
            job.error =
              "Generation was interrupted. A provider request may have been charged. Review before starting again.";
          }
      });
    }
  }
  async list(projectId: string) {
    const project = await this.store.get<Project>("projects", projectId);
    if (!project)
      throw new WorkspaceError("Project not found.", "NOT_FOUND", 404);
    const jobs = project.promptRecommendationJobs || [];
    return {
      items: (project.promptRecommendations || []).filter(
        (item) => item.status === "candidate",
      ),
      job: jobs.at(-1) || null,
    };
  }
  async generate(
    projectId: string,
    input: { source?: unknown; prompts?: unknown; requestId?: unknown },
  ) {
    if (
      !["model-assisted", "local-source-derived", "open-seo"].includes(
        String(input.source),
      )
    )
      throw new WorkspaceError("Select a recommendation source.");
    const project = await this.store.get<Project>("projects", projectId);
    if (!project)
      throw new WorkspaceError("Project not found.", "NOT_FOUND", 404);
    if (input.source !== "model-assisted") {
      const { result } = await this.store.updateProject(
        projectId,
        (current) => {
          const candidates =
            input.source === "open-seo"
              ? importedCandidates(current, input.prompts)
              : localCandidates(current);
          this.merge(current, candidates);
          return current.promptRecommendations!.filter(
            (item) => item.status === "candidate",
          );
        },
      );
      return { items: result, job: null };
    }
    const id = clean(input.requestId, "request ID", 100);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id))
      throw new WorkspaceError("Invalid request ID.");
    const old = project.promptRecommendationJobs?.find((job) => job.id === id);
    if (old) return { ...(await this.list(projectId)), job: old };
    if (!project.sources.some((source) => source.text.trim()))
      throw new WorkspaceError(
        "Add brand source text before generating questions.",
      );
    const apiKey = resolveProviderKey("openrouter");
    const model = process.env.OPENGEO_CHATGPT_API_MODEL || "openai/gpt-6-luna";
    if ((project.promptRecommendationJobs?.length || 0) >= 100)
      throw new WorkspaceError(
        "This project has reached the 100-generation history limit.",
      );
    if (this.active >= 2)
      throw new WorkspaceError(
        "Two question-generation tasks are running. Try again shortly.",
        "BUSY",
        409,
      );
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          projectId,
          version: project.queryVersion,
          model,
          sources: project.sources,
        }),
      )
      .digest("hex");
    const job = {
      id,
      fingerprint,
      status: "running" as const,
      createdAt: new Date().toISOString(),
    };
    // Reserve before the first await so concurrent requests cannot both dispatch.
    this.active++;
    try {
      const { result: dispatch } = await this.store.updateProject(
        projectId,
        (current) => {
          const existing = current.promptRecommendationJobs?.find(
            (item) => item.id === id,
          );
          if (existing) return false;
          if (
            current.promptRecommendationJobs?.some(
              (item) => item.status === "running",
            )
          )
            throw new WorkspaceError(
              "Question generation is already running for this project.",
              "BUSY",
              409,
            );
          (current.promptRecommendationJobs ||= []).push(job);
          return true;
        },
      );
      if (!dispatch) {
        this.active--;
        return this.list(projectId);
      }
    } catch (error) {
      this.active--;
      throw error;
    }
    void this.execute(project, job.id, model, apiKey)
      .catch(() => {})
      .finally(() => {
        this.active--;
      });
    return { ...(await this.list(projectId)), job };
  }
  private merge(project: Project, candidates: PromptRecommendation[]) {
    const texts = new Set(
      project.queries.map((query) => normalized(query.text)),
    );
    const ids = new Set(
      (project.promptRecommendations || []).map((item) => item.id),
    );
    const pending = new Set(
      (project.promptRecommendations || []).map((item) =>
        normalized(item.text),
      ),
    );
    const recommendations = [...(project.promptRecommendations || [])];
    for (const candidate of candidates) {
      if (
        texts.has(normalized(candidate.text)) ||
        pending.has(normalized(candidate.text)) ||
        ids.has(candidate.id)
      )
        continue;
      recommendations.push(candidate);
      pending.add(normalized(candidate.text));
      ids.add(candidate.id);
    }
    project.promptRecommendations = recommendations.slice(-200);
  }
  private async execute(
    project: Project,
    jobId: string,
    model: string,
    apiKey: string,
  ) {
    const language = project.language?.startsWith("zh") ? "zh" : "en",
      country = project.country || (language === "zh" ? "CN" : "US");
    const research: WebsiteResearch = {
      id: jobId,
      status: "completed",
      submittedUrl: project.domain,
      domain: project.domain,
      language,
      country,
      market: country === "CN" ? "china" : "international",
      methodology: "source-derived-templates/v1",
      profile: {
        brand: project.brand,
        description: project.description,
        industry: project.industry,
      },
      // Only the existing evidence is used; no live browsing or private files are sent to OpenSEO.
      sources: project.sources
        .filter((source) => source.text.trim())
        .slice(0, 8)
        .map((source) => ({
          id: source.id,
          title: source.title,
          url: source.url || "",
          text: source.text.slice(0, 10000),
        })),
      claims: [],
      topics: [],
      prompts: [],
      competitors: [],
      attempts: [],
      warnings: [],
      createdAt: new Date().toISOString(),
    };
    try {
      const enriched = await this.enrich(
        research,
        {
          provider: "openrouter",
          model,
          apiKey,
          maxQuestions: 8,
          webSearch: false,
        },
        {
          excludePrompts: project.queries
            .map((query) => query.text)
            .concat(
              (project.promptRecommendations || []).map((item) => item.text),
            )
            .slice(0, 200),
        },
      );
      await this.store.updateProject(project.id, (current) => {
        const job = current.promptRecommendationJobs!.find(
          (item) => item.id === jobId,
        )!;
        job.call = enriched.enrichment;
        job.finishedAt = new Date().toISOString();
        if (enriched.enrichment.status !== "completed") {
          job.status = "failed";
          job.error =
            "Model output could not be validated. Existing questions are unchanged; no automatic retry was sent.";
          return;
        }
        const candidates: PromptRecommendation[] = enriched.prompts.map(
          (prompt) => ({
            id: stableId(current.id, prompt.text, "model-assisted"),
            text: prompt.text,
            intent: prompt.intent,
            branded: includesBrand(prompt.text, current),
            topicName: enriched.topics.find(
              (topic) => topic.id === prompt.topicId,
            )?.name,
            source: "model-assisted",
            sourceLabel: `OpenRouter · ${model}`,
            sourceIds: prompt.sourceIds,
            batchId: jobId,
            reason:
              language === "zh"
                ? "模型根据所列品牌来源提出的问题，尚未测量搜索需求。"
                : "Proposed by a model using the attached brand sources; demand has not been measured.",
            status: "candidate",
            generatedAt: new Date().toISOString(),
          }),
        );
        this.merge(current, candidates);
        job.status = "completed";
      });
    } catch {
      await this.store.updateProject(project.id, (current) => {
        const job = current.promptRecommendationJobs!.find(
          (item) => item.id === jobId,
        )!;
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        job.error =
          "Generation failed. Review provider usage before retrying; no automatic retry was sent.";
      });
    }
  }
  async accept(projectId: string, ids: unknown, expectedVersion: unknown) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== "string")
    )
      throw new WorkspaceError("Select 1–100 recommendations.");
    const { project, result } = await this.store.updateProject(
      projectId,
      (project) => {
        if (expectedVersion !== project.queryVersion)
          throw new WorkspaceError(
            "The question library changed. Refresh before saving.",
            "STALE_REVISION",
            409,
          );
        const selected = new Set(ids as string[]),
          recommendations = (project.promptRecommendations || []).filter(
            (item) => selected.has(item.id) && item.status === "candidate",
          );
        if (recommendations.length !== selected.size)
          throw new WorkspaceError(
            "Some recommendations are no longer available. Refresh first.",
          );
        const now = new Date().toISOString(),
          added: Query[] = [];
        for (const item of recommendations) {
          const country =
            item.source === "open-seo"
              ? "US"
              : project.country || (project.language === "zh" ? "CN" : "US");
          const exists = project.queries.find(
            (query) =>
              normalized(query.text) === normalized(item.text) &&
              (query.country || project.country || "US") === country,
          );
          if (!exists) {
            let topicId = item.topicId;
            if (!topicId && item.topicName) {
              project.topics ||= [];
              let topic = project.topics.find(
                (topic) =>
                  topic.name.toLocaleLowerCase() ===
                  item.topicName!.toLocaleLowerCase(),
              );
              if (!topic) {
                topic = {
                  id: `topic-${randomUUID()}`,
                  name: item.topicName,
                  sourceIds: item.sourceIds,
                };
                project.topics.push(topic);
              }
              topicId = topic.id;
            }
            const query: Query = {
              id: `prompt-${randomUUID()}`,
              text: item.text,
              intent: item.intent,
              branded: item.branded,
              origin: `${item.source}; locally reviewed; recommendation=${item.id}`,
              status: "suggested",
              topicId,
              sourceIds: item.sourceIds,
              recommendationId: item.id,
              country,
              language:
                item.source === "open-seo" ? "en" : project.language || "en",
              revision: 1,
              createdAt: now,
              updatedAt: now,
            };
            project.queries.push(query);
            added.push(query);
          }
          item.status = "accepted";
        }
        if (added.length) project.queryVersion++;
        return { added, recommendations };
      },
    );
    return { ...result, project };
  }
  async dismiss(projectId: string, ids: unknown) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== "string")
    )
      throw new WorkspaceError("Select recommendations.");
    const { result } = await this.store.updateProject(projectId, (project) => {
      const selected = new Set(ids as string[]);
      let changed = 0;
      for (const item of project.promptRecommendations || [])
        if (selected.has(item.id) && item.status === "candidate") {
          item.status = "dismissed";
          changed++;
        }
      return { changed };
    });
    return result;
  }
}
