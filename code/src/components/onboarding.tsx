"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSearch,
  Globe2,
  LoaderCircle,
} from "lucide-react";
import { workbenchApi } from "./workflow-panels";
type Row = Record<string, any>;
export default function Onboarding() {
  const [lang, setLang] = useState<"zh" | "en">("en"),
    [job, setJob] = useState<Row | null>(null),
    [project, setProject] = useState<Row | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [manual, setManual] = useState(false),
    [useModel, setUseModel] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  async function resume(id: string) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      while (current === generation.current) {
        const value = await workbenchApi(
          `/api/researches/${encodeURIComponent(id)}`,
        );
        if (current !== generation.current) return;
        setJob(value);
        if (value.input?.language === "zh") setLang("zh");
        if (!["queued", "running"].includes(value.status)) {
          if (value.projectId)
            setProject(await workbenchApi(`/api/projects/${value.projectId}`));
          else
            setSelected(
              value.result?.prompts?.map((prompt: Row) => prompt.id) || [],
            );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("lang") === "zh") setLang("zh");
    const projectId = params.get("project");
    if (projectId && /^[a-zA-Z0-9_-]+$/.test(projectId))
      void workbenchApi(`/api/projects/${projectId}`)
        .then(setProject)
        .catch((error) => setError(error.message));
    const id = params.get("research");
    if (id && /^research-[a-zA-Z0-9-]{1,80}$/.test(id)) void resume(id);
    return () => {
      generation.current++;
    };
  }, []);
  function reset() {
    generation.current++;
    setJob(null);
    setProject(null);
    setBusy(false);
    setError("");
    history.replaceState(null, "", `/create-workspace?lang=${lang}`);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (manual) {
        const created = await workbenchApi("/api/projects", "POST", values);
        setProject(created);
        history.replaceState(
          null,
          "",
          `/create-workspace?lang=${lang}&project=${encodeURIComponent(created.id)}`,
        );
        setBusy(false);
        return;
      }
      const value = await workbenchApi("/api/researches", "POST", {
        url: values.url,
        language: lang,
        country: values.country,
        requestId: `research-${crypto.randomUUID()}`,
        ...(useModel
          ? {
              modelConfig: {
                provider: values.modelProvider,
                model: values.modelId,
                apiKey: values.modelKey,
              },
            }
          : {}),
      });
      history.replaceState(
        null,
        "",
        `/create-workspace?research=${encodeURIComponent(value.id)}`,
      );
      setJob(value);
      await resume(value.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }
  const result = job?.result,
    reviewing =
      result?.profile && ["completed", "partial"].includes(job?.status),
    step = project ? 3 : reviewing ? 2 : job ? 1 : 0;
  const field =
    "flex min-w-0 flex-col gap-2 text-sm font-medium text-neutral-700";
  return (
    <main className="min-h-dvh bg-[#fafaf9] text-neutral-900">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-5 py-4 sm:px-10">
        <a
          href="/"
          className="flex items-center gap-3 text-lg font-semibold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
            O
          </span>
          OpenGEO
        </a>
        <a href="/" className="button">
          <ArrowLeft size={15} />
          {t("返回工作台", "Back to workspace")}
        </a>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-10 lg:py-16">
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
            LOCAL GEO WORKSPACE
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {t("从网站开始。", "Start with your website.")}
            <br />
            <span className="text-neutral-500">
              {t("用证据构建。", "Build from evidence.")}
            </span>
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-8 text-neutral-600">
            {t(
              "把公开页面整理成品牌资料和聚焦的问题，作为第一次 AI 可见性基线。",
              "Turn public pages into a brand profile and focused questions for your first AI visibility baseline.",
            )}
          </p>
          <ol className="mt-9 space-y-6">
            {[
              [
                t("研究你的网站", "Research your website"),
                t(
                  "采集公开页面，保留原文与来源。",
                  "Collect public pages with original text and sources.",
                ),
              ],
              [
                t("审核问题", "Review your questions"),
                t(
                  "确认买家会问什么，再开始测量。",
                  "Choose the questions you want to measure.",
                ),
              ],
              [
                t("先测量，再行动", "Measure, then act"),
                t(
                  "从真实回答得出可复核的结论。",
                  "Build reviewable conclusions from real answers.",
                ),
              ],
            ].map(([title, description], index) => (
              <li key={title} className="flex gap-4">
                <span className="pt-1 text-xs font-medium tabular-nums text-neutral-400">
                  0{index + 1}
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-7 text-neutral-500">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-xs text-neutral-500">
            {t(
              "本地运行 · 自己的账号 · 自己的数据",
              "Local first · Your accounts · Your data",
            )}
          </p>
        </aside>
        <section className="min-w-0">
          <ol className="mb-7 flex flex-wrap gap-x-6 gap-y-2 border-b border-neutral-200 pb-5 text-xs">
            {[
              t("信息", "Info"),
              t("研究", "Research"),
              t("问题", "Prompts"),
              t("完成", "Ready"),
            ].map((label, index) => (
              <li
                key={label}
                className={
                  index === step
                    ? "font-semibold text-neutral-950"
                    : "text-neutral-400"
                }
                aria-current={index === step ? "step" : undefined}
              >
                {index < step ? (
                  <Check size={13} className="mr-1 inline" />
                ) : (
                  `${index + 1} · `
                )}
                {label}
              </li>
            ))}
          </ol>
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800"
            >
              {error}
            </p>
          )}
          {project ? (
            <div className="panel space-y-5 p-6 sm:p-8">
              <Check
                className="rounded-full bg-emerald-50 p-2 text-emerald-700"
                size={42}
              />
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("工作区已就绪", "Your workspace is ready")}
              </h2>
              <p className="text-sm text-neutral-600">
                {project.brand} ·{" "}
                {
                  project.queries?.filter(
                    (query: Row) => !query.status || query.status === "active",
                  ).length
                }{" "}
                {t("个启用问题", "active prompts")}
              </p>
              <p className="text-sm leading-8 text-neutral-600">
                {t(
                  "资料已保存。AI 可见性尚未测量，打开工作台后配置服务商并收集第一批真实回答。",
                  "Sources are saved. AI visibility is still unmeasured. Open your workspace to configure a provider and collect real answers.",
                )}
              </p>
              <a
                className="button button-primary"
                href={`${lang === "zh" ? "/" : "/workspace"}?project=${encodeURIComponent(project.id)}`}
              >
                {t("打开工作区", "Open workspace")}
                <ArrowRight size={16} />
              </a>
            </div>
          ) : busy ? (
            <div className="panel space-y-5 p-6 sm:p-8">
              <LoaderCircle
                className="animate-spin text-neutral-500 motion-reduce:animate-none"
                size={30}
                aria-hidden
              />
              <h2 className="text-2xl font-semibold">
                {t("正在读取网站", "Reading your website")}
              </h2>
              <p className="text-sm leading-8 text-neutral-600" role="status">
                {t(
                  "正在采集公开页面、来源证据与建议问题。研究保存在本地，刷新后可恢复。",
                  "Collecting public pages, source evidence and suggested questions. Research is saved locally and survives a refresh.",
                )}
              </p>
            </div>
          ) : reviewing ? (
            <div className="panel space-y-5 p-6 sm:p-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t("审核你的第一批问题", "Review your first questions")}
                </h2>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  {t(
                    "保留想测量的问题。此时还没有采集任何 AI 回答。",
                    "Keep the questions you want to measure. No AI answers have been collected yet.",
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-neutral-50 p-4">
                <h3 className="font-semibold">{result.profile.brand}</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  {result.profile.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge">
                  {lang === "zh" ? "中文" : "English"} · {result.country}
                </span>
                <span className="badge">
                  {result.sources?.length} {t("个来源", "sources")}
                </span>
                <span className="badge">
                  {result.topics?.length} {t("个主题", "topics")}
                </span>
                {job?.status === "partial" && (
                  <span className="badge">
                    {t("部分完成", "Partial research")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  {t("建议问题", "Suggested prompts")}
                </h3>
                <button
                  className="button"
                  onClick={() =>
                    setSelected(result.prompts.map((prompt: Row) => prompt.id))
                  }
                >
                  {t("全选", "Select all")}
                </button>
              </div>
              <div className="divide-y divide-neutral-100">
                {result.prompts?.map((prompt: Row) => (
                  <label
                    key={prompt.id}
                    className="flex items-start gap-3 py-4 text-sm leading-7"
                  >
                    <input
                      type="checkbox"
                      data-prompt={prompt.id}
                      checked={selected.includes(prompt.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, prompt.id]
                            : selected.filter((id) => id !== prompt.id),
                        )
                      }
                      className="mt-2"
                    />
                    <span>
                      {prompt.text}
                      <small className="mt-1 block text-neutral-500">
                        {result.topics?.find(
                          (topic: Row) => topic.id === prompt.topicId,
                        )?.name || prompt.intent}{" "}
                        ·{" "}
                        {prompt.origin === "model-assisted"
                          ? t("模型提案", "Model-assisted proposal")
                          : t("网站模板", "Website-based template")}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <details>
                <summary className="text-sm font-medium">
                  {t("研究来源与限制", "Research sources & limitations")}
                </summary>
                <div className="mt-4 space-y-3">
                  {result.sources?.map((source: Row) => (
                    <a
                      key={source.id}
                      className="block break-all text-sm underline underline-offset-4"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title}
                    </a>
                  ))}
                  {result.warnings?.map((warning: string, index: number) => (
                    <p
                      key={index}
                      className="text-xs leading-6 text-neutral-600"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </details>
              <button
                className="button button-primary w-full"
                disabled={!selected.length}
                onClick={async () => {
                  setError("");
                  try {
                    setProject(
                      await workbenchApi(
                        `/api/researches/${job!.id}/accept`,
                        "POST",
                        { selectedPromptIds: selected },
                      ),
                    );
                  } catch (error) {
                    setError(
                      error instanceof Error ? error.message : String(error),
                    );
                  }
                }}
              >
                {t(
                  "用选中的问题创建工作区",
                  "Create workspace with selected prompts",
                )}
                <ArrowRight size={16} />
              </button>
              <button className="button" onClick={reset}>
                {t("换一个网站", "Use another website")}
              </button>
            </div>
          ) : job ? (
            <div className="panel space-y-5 p-6">
              <h2 className="text-2xl font-semibold">
                {t("研究没有完成", "We could not finish the research")}
              </h2>
              <p className="text-sm leading-8 text-neutral-600">
                {t(
                  "没有取得可用的网站证据。换一个公开网站或手动建档。",
                  "No usable website evidence was found. Try another public website or create a manual project.",
                )}
              </p>
              {result?.attempts
                ?.filter((attempt: Row) => attempt.status === "failed")
                .map((attempt: Row, index: number) => (
                  <p
                    key={index}
                    className="break-words text-xs leading-6 text-neutral-600"
                  >
                    {attempt.url} · {attempt.reason}
                  </p>
                ))}
              <button className="button" onClick={reset}>
                {t("换一个网站", "Try another website")}
              </button>
            </div>
          ) : (
            <div className="panel p-6 sm:p-8">
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  className={`button ${!manual ? "bg-neutral-100" : ""}`}
                  onClick={() => setManual(false)}
                  aria-pressed={!manual}
                >
                  <Globe2 size={16} />
                  {t("官网建档", "Website research")}
                </button>
                <button
                  className={`button ${manual ? "bg-neutral-100" : ""}`}
                  onClick={() => setManual(true)}
                  aria-pressed={manual}
                >
                  <FileSearch size={16} />
                  {t("手动建档", "Manual project")}
                </button>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {manual
                  ? t("新建一个自己的项目", "Create your own project")
                  : t("你的网站是？", "What's your website?")}
              </h2>
              <p className="mb-6 mt-3 text-sm leading-7 text-neutral-600">
                {t(
                  "用公开资料准备工作区，在真正采集前审核所有建议。",
                  "Prepare your workspace from public sources. Review suggestions before collecting answers.",
                )}
              </p>
              <form className="space-y-5" onSubmit={submit}>
                {manual ? (
                  <>
                    <label className={field}>
                      {t("品牌名称", "Brand name")}
                      <input
                        className="input"
                        name="brand"
                        required
                        maxLength={80}
                      />
                    </label>
                    <label className={field}>
                      {t("行业或产品", "Industry or product")}
                      <input
                        className="input"
                        name="industry"
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className={field}>
                      {t("官网域名", "Website domain")}
                      <input className="input" name="domain" />
                    </label>
                    <label className={field}>
                      {t("品牌别名", "Brand aliases")}
                      <input className="input" name="aliases" />
                    </label>
                    <label className={field}>
                      {t(
                        "品牌事实（每行一项，参数：内容）",
                        "Brand facts (one per line)",
                      )}
                      <textarea
                        className="input min-h-36 leading-7"
                        name="brief"
                        maxLength={12000}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className={field}>
                      {t("网站地址", "Website URL")}
                      <input
                        className="input"
                        name="url"
                        required
                        maxLength={2048}
                        autoComplete="url"
                        placeholder="yourbrand.com"
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className={field}>
                        {t("语言", "Language")}
                        <select
                          className="input"
                          name="language"
                          value={lang}
                          onChange={(event) =>
                            setLang(event.target.value as "zh" | "en")
                          }
                        >
                          <option value="en">English</option>
                          <option value="zh">中文</option>
                        </select>
                      </label>
                      <label className={field}>
                        {t("目标市场", "Target market")}
                        <select
                          className="input"
                          name="country"
                          key={lang}
                          defaultValue={lang === "zh" ? "CN" : "US"}
                        >
                          {["US", "GB", "CA", "AU", "CN"].map((country) => (
                            <option key={country}>{country}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <details className="rounded-lg bg-neutral-50 p-4">
                      <summary className="text-sm font-medium">
                        {t(
                          "模型辅助研究（可选）",
                          "Model-assisted research (optional)",
                        )}
                      </summary>
                      <div className="mt-4 space-y-4">
                        <label className="flex items-start gap-2 text-sm leading-7">
                          <input
                            type="checkbox"
                            className="mt-2"
                            checked={useModel}
                            onChange={(event) =>
                              setUseModel(event.target.checked)
                            }
                          />
                          {t(
                            "用一次模型调用研究主题与买家问题",
                            "Use one model call to research topics and buyer questions",
                          )}
                        </label>
                        <label className={field}>
                          {t("研究服务商", "Research provider")}
                          <select className="input" name="modelProvider">
                            {[
                              "openrouter",
                              "openai",
                              "deepseek",
                              "perplexity",
                              "gemini",
                              "anthropic",
                            ].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                        <label className={field}>
                          {t("研究模型 ID", "Research model ID")}
                          <input
                            className="input"
                            name="modelId"
                            maxLength={200}
                            required={useModel}
                          />
                        </label>
                        <label className={field}>
                          {t("研究 API Key", "Research API key")}
                          <input
                            className="input"
                            name="modelKey"
                            type="password"
                            autoComplete="off"
                            placeholder={t(
                              "留空使用本地配置",
                              "Leave blank to use local configuration",
                            )}
                          />
                        </label>
                        <p className="text-xs leading-6 text-neutral-500">
                          {t(
                            "最多 2,500 输出 token，服务商可能收费。不启用则仅使用来源模板。",
                            "Up to 2,500 output tokens. Your provider may charge. Without it, research uses source-based templates.",
                          )}
                        </p>
                      </div>
                    </details>
                  </>
                )}
                <button className="button button-primary w-full" type="submit">
                  {manual
                    ? t("创建项目", "Create project")
                    : t("研究我的网站", "Research my website")}
                  <ArrowRight size={16} />
                </button>
              </form>
              <p className="mt-5 text-xs leading-6 text-neutral-500">
                {t(
                  "建档不会生成可见性数字。只有收集真实回答后才开始测量。",
                  "Creating a project never generates visibility scores. Measurement begins with real collected answers.",
                )}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
