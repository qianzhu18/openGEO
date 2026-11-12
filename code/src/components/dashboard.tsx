"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  FileText,
  FolderKanban,
  Globe2,
  Layers3,
  ListChecks,
  Menu,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { Overview, Sources } from "./analytics-panels";
import { DashboardSkeleton } from "./ui-controls";
import {
  Workflows,
  Settings,
  ProjectManager,
  QueuePanel,
  EvidenceDialog,
} from "./workflow-panels";
import type { Project, AgentRun } from "../workbench/types";
import type { DiagnosticAnalysis } from "../workbench/analytics";
type RunData = AgentRun & { analytics: DiagnosticAnalysis; diagnosis: any };
async function api(path: string, options?: RequestInit) {
  const r = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error || `HTTP ${r.status}`);
  return v;
}
const aliases: Record<string, string> = {
  prompts: "queries",
  project: "facts",
  agent: "flow",
  recordings: "recording",
  report: "content",
};
export function Dashboard({ language = "zh" }: { language?: "zh" | "en" }) {
  const [lang, setLang] = useState(language),
    [ready, setReady] = useState(false),
    [projects, setProjects] = useState<any[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [run, setRun] = useState<RunData | null>(null),
    [runs, setRuns] = useState<any[]>([]),
    [status, setStatus] = useState<any>(null),
    [analysis, setAnalysis] = useState<DiagnosticAnalysis | null>(null),
    [view, setView] = useState("overview"),
    [sidebar, setSidebar] = useState(true),
    [mobile, setMobile] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingRun, setLoadingRun] = useState(false),
    [scopeBusy, setScopeBusy] = useState(false),
    [dialog, setDialog] = useState(""),
    [sample, setSample] = useState<any>(null),
    [space, setSpace] = useState(""),
    [filters, setFilters] = useState({
      model: "all",
      channel: "all",
      days: "all",
    }),
    [examples, setExamples] = useState(false);
  const filterRef = useRef(filters);
  filterRef.current = filters;
  const selection = useRef(0),
    runRequest = useRef(0),
    pendingRunRequest = useRef(0),
    selectedProject = useRef(""),
    selectedRun = useRef("");
  const t = (zh: string, en: string) => (lang === "en" ? en : zh);
  const query = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== "all"),
    ).toString(),
    suffix = query ? "?" + query : "";
  const updateUrl = useCallback((changes: Record<string, string>) => {
    const u = new URL(location.href);
    Object.entries(changes).forEach(([k, v]) =>
      v ? u.searchParams.set(k, v) : u.searchParams.delete(k),
    );
    history.replaceState(null, "", u);
  }, []);
  const changeView = (next: string) => {
    setView(next);
    updateUrl({ view: next });
    setMobile(false);
    setError("");
  };
  const loadRun = useCallback(
    async (id: string, projectId = selectedProject.current): Promise<void> => {
      const n = ++runRequest.current;
      pendingRunRequest.current = n;
      setLoadingRun(true);
      setError("");
      if (!id) {
        selectedRun.current = "";
        setRun(null);
        pendingRunRequest.current = 0;
        setLoadingRun(false);
        updateUrl({ run: "project" });
        return;
      }
      try {
        const filterIdentity = JSON.stringify(filterRef.current);
        const scope = new URLSearchParams(
          Object.entries(filterRef.current).filter(([, v]) => v !== "all"),
        );
        scope.set("projectId", projectId);
        const result = await api(`/api/runs/${id}?${scope}`);
        if (n !== runRequest.current || selectedProject.current !== projectId)
          return;
        if (filterIdentity !== JSON.stringify(filterRef.current))
          return loadRun(id, projectId);
        selectedRun.current = id;
        setRun(result);
        setAnalysis(result.analytics);
        updateUrl({ run: id, space: result.spaceId || "" });
        setSpace(result.spaceId || "");
      } catch (e) {
        if (n === runRequest.current) setError((e as Error).message);
      } finally {
        if (pendingRunRequest.current === n) {
          pendingRunRequest.current = 0;
          setLoadingRun(false);
        }
      }
    },
    [updateUrl],
  );
  const loadProject = useCallback(
    async (id: string, runId?: string, spaceId?: string) => {
      const n = ++selection.current;
      ++runRequest.current;
      pendingRunRequest.current = 0;
      setLoadingRun(false);
      selectedProject.current = id;
      selectedRun.current = "";
      setBusy(true);
      setError("");
      setRun(null);
      setAnalysis(null);
      setProject(null);
      setSpace(spaceId || "");
      try {
        const [p, r] = await Promise.all([
          api(`/api/projects/${id}`),
          api(`/api/runs?projectId=${id}`),
        ]);
        if (n !== selection.current) return;
        setProject(p);
        setRuns(r);
        setAnalysis(p.analytics);
        localStorage.setItem("opengeo-project", id);
        updateUrl({
          project: id,
          run: runId === "project" ? "project" : "",
          space: spaceId || "",
        });
        const validRun = r.find((v: any) => v.id === runId);
        const chosen =
          validRun || r.find((v: any) => !spaceId || v.spaceId === spaceId);
        if (chosen && runId !== "project") await loadRun(chosen.id, id);
      } catch (e) {
        if (n === selection.current) setError((e as Error).message);
      } finally {
        if (n === selection.current) setBusy(false);
      }
    },
    [loadRun, updateUrl],
  );
  const refresh = useCallback(async () => {
    const [all, s] = await Promise.all([
      api("/api/projects"),
      api("/api/status"),
    ]);
    setProjects(all);
    setStatus(s);
    const id = selectedProject.current;
    if (!id) return;
    if (!all.some((p: any) => p.id === id)) {
      const next = all.find((p: any) => !p.example);
      if (next) {
        await loadProject(next.id);
        return;
      }
      selectedProject.current = "";
      selectedRun.current = "";
      ++selection.current;
      ++runRequest.current;
      setProject(null);
      setRun(null);
      setAnalysis(null);
      setRuns([]);
      setSpace("");
      localStorage.removeItem("opengeo-project");
      updateUrl({ project: "", run: "", space: "" });
      return;
    }
    const [p, r] = await Promise.all([
      api(`/api/projects/${id}`),
      api(`/api/runs?projectId=${id}`),
    ]);
    if (id !== selectedProject.current) return;
    setProject(p);
    setRuns(r);
    if (selectedRun.current) await loadRun(selectedRun.current, id);
    else {
      setScopeBusy(true);
      const scope = new URLSearchParams(
        Object.entries(filterRef.current).filter(
          ([, value]) => value !== "all",
        ),
      );
      const identity = scope.toString();
      try {
        const scoped = await api(
          `/api/projects/${id}/analytics${identity ? `?${identity}` : ""}`,
        );
        const current = new URLSearchParams(
          Object.entries(filterRef.current).filter(
            ([, value]) => value !== "all",
          ),
        ).toString();
        if (
          id === selectedProject.current &&
          !selectedRun.current &&
          identity === current
        ) {
          setAnalysis(scoped);
          setError("");
        }
      } finally {
        if (id === selectedProject.current) setScopeBusy(false);
      }
    }
  }, [loadRun, loadProject, updateUrl]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, all] = await Promise.all([
          api("/api/status"),
          api("/api/projects"),
        ]);
        if (cancelled) return;
        setStatus(s);
        setProjects(all);
        const p = new URLSearchParams(location.search);
        const initial = p.get("view") || "overview";
        setView(aliases[initial] || initial);
        const legacy = localStorage.getItem("citekeel-project");
        const id =
          p.get("project") || localStorage.getItem("opengeo-project") || legacy;
        const chosen =
          all.find((v: any) => v.id === id) || all.find((v: any) => !v.example);
        if (chosen)
          await loadProject(
            chosen.id,
            p.get("run") || undefined,
            p.get("space") || undefined,
          );
        else if (all.length) setExamples(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject]);
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const id = run.id,
      projectId = run.projectId;
    const timer = setInterval(() => {
      if (
        !pendingRunRequest.current &&
        selectedRun.current === id &&
        selectedProject.current === projectId
      )
        void loadRun(id, projectId);
    }, 1500);
    return () => clearInterval(timer);
  }, [run?.id, run?.status, loadRun]);
  useEffect(() => {
    if (!ready || !project) return;
    const p = project.id,
      id = selectedRun.current;
    let cancelled = false;
    setScopeBusy(true);
    (async () => {
      try {
        const a = await api(
          id
            ? `/api/runs/${id}${suffix}`
            : `/api/projects/${p}/analytics${suffix}`,
        );
        if (
          !cancelled &&
          p === selectedProject.current &&
          id === selectedRun.current
        ) {
          setAnalysis(id ? a.analytics : a);
          if (id) setRun(a);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setScopeBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [suffix, project?.id, run?.id, run?.status, ready]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  const openEvidence = (id: string, cohortKey?: string) => {
    const row = analysis?.rows.find(
      (r) => r.sampleId === id && (!cohortKey || r.cohortKey === cohortKey),
    );
    const matches = (s: any) =>
      s.id === id &&
      (!row?.sampleIdentity ||
        JSON.stringify([s.origin, s.runGroup, s.id]) === row.sampleIdentity);
    const found = run?.samples.find(matches) || project?.samples.find(matches);
    if (found) setSample(found);
  };
  const active = Boolean(run && ["queued", "running"].includes(run.status));
  const scopeMatches =
    !analysis ||
    Object.entries(filters).every(
      ([key, value]) =>
        String(
          analysis.filter[key as keyof typeof analysis.filter] ?? "all",
        ) === value,
    );
  const updating = loadingRun || scopeBusy || !scopeMatches;
  const base = run ? `/api/runs/${run.id}` : "";
  const nav = [
    ["overview", t("工作概览", "Overview"), ChartNoAxesCombined],
    ["queries", t("问题空间", "Prompts"), ListChecks],
    ["evidence", t("回答与信源", "Answers"), Search],
    ["sources", t("信源分析", "Sources"), Globe2],
    ["actions", t("行动中心", "Actions"), FolderKanban],
    ["content", t("内容与报告", "Content & reports"), FileText],
    ["facts", t("品牌事实", "Brand facts"), ShieldCheck],
    ["recording", t("资料链接", "Recording"), Layers3],
    ["flow", t("执行记录", "Workflow"), Workflow],
  ] as const;
  const current = nav.find((n) => n[0] === view) || nav[0];
  const switchSpace = async (id: string) => {
    setSpace(id);
    updateUrl({ space: id, run: "project" });
    const r = runs.find((r) => r.spaceId === id);
    if (r) await loadRun(r.id);
    else {
      selectedRun.current = "";
      ++runRequest.current;
      setRun(null);
      setAnalysis((project as any)?.analytics || null);
    }
  };
  return (
    <div className="min-h-screen md:flex">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
        href="#main"
      >
        {t("跳到内容", "Skip to content")}
      </a>
      {mobile && (
        <button
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          aria-label={t("关闭导航", "Close navigation")}
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`sidebar fixed inset-y-0 left-0 z-40 w-[232px] shrink-0 flex-col border-r border-stone-200 bg-[#f2f1ee] md:sticky md:top-0 md:h-screen ${sidebar ? "md:flex" : "md:hidden"} ${mobile ? "flex" : "hidden"}`}
      >
        <a
          href="/"
          className="flex h-[72px] items-center gap-2.5 px-6 text-lg font-semibold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-stone-900 text-white">
            <Activity size={19} />
          </span>
          OpenGEO
        </a>
        <div className="px-4">
          <label className="field text-xs text-stone-600">
            {t("当前项目", "Project")}
            <select
              aria-label={t("当前项目", "Current project")}
              className="input mt-1 font-medium"
              value={project?.id || ""}
              onChange={(e) => void loadProject(e.target.value)}
            >
              <option disabled value="">
                {t("选择项目", "Select a project")}
              </option>
              {projects
                .filter((p) => !p.example || examples || p.id === project?.id)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                    {p.example ? ` · ${t("示例", "Example")}` : ""}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <nav
          className="mt-6 flex-1 space-y-0.5 overflow-y-auto px-3"
          aria-label={t("工作台导航", "Workspace navigation")}
        >
          <p className="mb-2 px-3 text-[11px] text-stone-500">
            {t("分析与优化", "ANALYZE & IMPROVE")}
          </p>
          {nav.map(([id, label, Icon]) => (
            <a
              className="nav-link"
              key={id}
              href={`?project=${project?.id || ""}&view=${id}${run ? "&run=" + run.id : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                changeView(id);
              }}
            >
              <Icon size={17} strokeWidth={1.7} />
              {label}
              {id === "actions" && run?.diagnosis?.actions?.length > 0 && (
                <span className="number ml-auto text-xs text-stone-500">
                  {run?.diagnosis.actions.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="space-y-1 border-t border-stone-200 p-3">
          <button
            className="nav-link w-full"
            onClick={() => setDialog("projects")}
          >
            <Layers3 size={17} />
            {t("项目管理", "Manage projects")}
          </button>
          <button
            className="nav-link w-full"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={17} />
            {t("服务商设置", "Provider settings")}
          </button>
          <div className="flex items-center justify-between px-3 pt-3 text-xs text-stone-600">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
              {t("本地工作台", "Local workspace")}
            </span>
            <span>v{status?.version || "0.8.0"}</span>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="button button-quiet hidden p-2 md:inline-flex"
              aria-label={t("切换侧边栏", "Toggle sidebar")}
              onClick={() => setSidebar(!sidebar)}
            >
              <PanelLeftClose size={18} />
            </button>
            <button
              className="button button-quiet p-2 md:hidden"
              aria-label={t("打开导航", "Open navigation")}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="text-sm text-stone-500">
              {project?.brand || "OpenGEO"}
            </span>
            <span className="text-stone-300">/</span>
            <span className="font-medium">{current[1]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button button-quiet text-xs"
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              aria-label="Switch language"
            >
              <Globe2 size={14} />
              {lang === "zh" ? "English" : "中文"}
            </button>
            {run && !active && !updating && (
              <>
                <a className="button" href={`${base}/report${suffix}`} download>
                  {t("业务简报", "Business brief")}
                  <ArrowUpRight size={14} />
                </a>
                <details className="export-menu relative">
                  <summary
                    className="button list-none"
                    aria-label={t("更多导出", "More exports")}
                  >
                    <ArrowDownToLine size={16} />
                    <ChevronDown size={12} />
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 grid w-52 gap-1 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
                    {[
                      ["report-html", t("简报 HTML", "Brief HTML")],
                      [
                        "report-evidence",
                        t("完整证据 Markdown", "Evidence Markdown"),
                      ],
                      [
                        "report-evidence-html",
                        t("完整证据 HTML", "Evidence HTML"),
                      ],
                      ["export", t("证据 JSON", "Evidence JSON")],
                    ].map(([id, name]) => (
                      <a
                        className="button button-quiet justify-start text-xs"
                        key={id}
                        href={`${base}/${id}${suffix}`}
                        download
                      >
                        {name}
                      </a>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8 md:py-7"
          aria-busy={!ready || busy || (updating && !error)}
        >
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 p-4 text-rose-900"
            >
              <span>{error}</span>
              <button
                className="button"
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                {t("重试", "Retry")}
              </button>
            </div>
          )}
          {!ready || busy ? (
            <DashboardSkeleton language={lang} />
          ) : !project ? (
            <section className="mx-auto max-w-2xl py-16">
              <Activity className="mb-6 text-emerald-800" size={30} />
              <h1>{t("从一个品牌开始", "Start with a brand")}</h1>
              <p className="muted mt-3 text-base">
                {t(
                  "导入品牌资料，确认监测问题，用真实回答建立可回查的 GEO 基线。",
                  "Import brand sources, confirm questions, and build a reviewable GEO baseline from real answers.",
                )}
              </p>
              <a
                className="button button-primary mt-7"
                href="/create-workspace"
              >
                <Plus size={16} />
                {t("新建项目", "Create project")}
              </a>
              <details className="mt-8">
                <summary>
                  {t("查看内置示例", "Explore built-in examples")}
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {projects.map((p) => (
                    <button
                      className="button"
                      key={p.id}
                      onClick={() => void loadProject(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </details>
            </section>
          ) : (
            <>
              {["overview", "sources"].includes(view) && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h1>
                        {view === "overview"
                          ? t(
                              "AI 回答中的品牌表现",
                              "Your brand, in AI answers",
                            )
                          : t("信源分析", "Sources")}
                      </h1>
                      <p className="muted mt-1">
                        {view === "overview"
                          ? t(
                              "从提及、引用到行动，每项结论都能回到回答原文。",
                              "Follow mentions and citations back to the original answer, then choose the next action.",
                            )
                          : t(
                              "查看本轮回答引用的来源，核对完整性与协议。",
                              "Inspect references, integrity and protocols in this run.",
                            )}
                      </p>
                    </div>
                    <button
                      className="button button-primary"
                      onClick={() => changeView("flow")}
                    >
                      <Plus size={15} />
                      {t("新建诊断", "New diagnosis")}
                    </button>
                  </div>
                  <section
                    className="filter-bar grid grid-cols-2 items-end gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]"
                    aria-label={t("分析筛选", "Analysis filters")}
                  >
                    <label className="field min-w-0 flex-[2] text-xs">
                      {t("运行批次", "Analysis run")}
                      <select
                        className="input min-w-[140px]"
                        aria-label={t("分析运行批次", "Analysis run")}
                        value={run?.id || ""}
                        onChange={(e) => void loadRun(e.target.value)}
                        data-analysis-run
                        data-space-run
                      >
                        <option value="">
                          {t("项目已保存原文", "Saved project evidence")}
                        </option>
                        {runs.map((r) => (
                          <option value={r.id} key={r.id}>
                            {new Date(r.createdAt).toLocaleString(
                              lang === "zh" ? "zh-CN" : "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}{" "}
                            · {r.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field min-w-0 flex-1 text-xs">
                      {t("模型", "Model")}
                      <select
                        className="input min-w-[130px]"
                        id="dashboard-model"
                        aria-label={t("筛选模型", "Model filter")}
                        value={filters.model}
                        onChange={(e) =>
                          setFilters({ ...filters, model: e.target.value })
                        }
                      >
                        <option value="all">
                          {t("全部模型", "All models")}
                        </option>
                        {[
                          ...new Set([
                            ...((project as any)?.analytics?.models || []),
                            ...(run?.analytics?.models || []),
                          ]),
                        ].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field min-w-0 flex-1 text-xs">
                      {t("实际通道", "Channel")}
                      <select
                        className="input min-w-[100px]"
                        aria-label={t("采集通道", "Collection channel")}
                        value={filters.channel}
                        onChange={(e) =>
                          setFilters({ ...filters, channel: e.target.value })
                        }
                      >
                        {[
                          ["all", t("全部通道", "All channels")],
                          ["api", "API"],
                          ["web", t("网页", "Web UI")],
                          ["archive", t("归档", "Archive")],
                          ["manual", t("导入", "Manual")],
                          ["synthetic", t("合成示例", "Synthetic")],
                        ].map(([v, n]) => (
                          <option value={v} key={v}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field min-w-0 flex-1 text-xs">
                      {t("观察日期", "Observed date")}
                      <select
                        className="input min-w-[130px]"
                        aria-label={t("观察时间范围", "Time range")}
                        value={filters.days}
                        onChange={(e) =>
                          setFilters({ ...filters, days: e.target.value })
                        }
                      >
                        {[
                          ["all", t("全部观察时间", "All observations")],
                          ["7", t("最近 7 天", "Last 7 days")],
                          ["30", t("最近 30 天", "Last 30 days")],
                        ].map(([v, n]) => (
                          <option value={v} key={v}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                  <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                    <p role="status" aria-live="polite">
                      {updating
                        ? t("正在更新分析…", "Updating analysis…")
                        : t(
                            `当前范围 · ${analysis?.quality.valid ?? 0} 条有效回答 · ${analysis?.metrics.cohorts.length ?? 0} 个独立测量组`,
                            `Current scope · ${analysis?.quality.valid ?? 0} valid answers · ${analysis?.metrics.cohorts.length ?? 0} separate cohorts`,
                          )}
                    </p>
                    {Object.values(filters).some(
                      (value) => value !== "all",
                    ) && (
                      <button
                        className="link min-h-10 text-xs"
                        onClick={() =>
                          setFilters({
                            model: "all",
                            channel: "all",
                            days: "all",
                          })
                        }
                      >
                        {t("清除筛选", "Clear filters")}
                      </button>
                    )}
                  </div>
                </>
              )}
              {run &&
                (active ? (
                  <QueuePanel
                    run={run}
                    lang={lang}
                    refresh={refresh}
                    onRun={loadRun}
                  />
                ) : (
                  run.samplingQueue && (
                    <details
                      open={
                        run.samplingQueue.jobs.some((j) =>
                          ["review_required", "dead_letter", "paused"].includes(
                            j.state,
                          ),
                        ) || undefined
                      }
                      className="rounded-lg border border-stone-200 text-xs"
                    >
                      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2">
                        <span className="font-medium">
                          {t("本轮执行已结束", "Run execution ended")} ·{" "}
                          {run.analytics?.quality?.valid ?? "UNKNOWN"}/
                          {run.analytics?.quality?.planned ?? "UNKNOWN"}{" "}
                          {t("有效", "valid")}
                        </span>
                        <span className="text-stone-600">
                          {t(
                            "查看队列与执行记录",
                            "Review queue and execution",
                          )}
                        </span>
                      </summary>
                      <QueuePanel
                        run={run}
                        lang={lang}
                        refresh={refresh}
                        onRun={loadRun}
                      />
                    </details>
                  )
                ))}
              {active &&
              ["overview", "sources", "actions", "content"].includes(view) ? (
                <section className="panel p-8">
                  <h2>{t("诊断进行中", "Brand diagnosis in progress")}</h2>
                  <p className="muted mt-2">
                    {t(
                      "本轮结束后展示结果，执行记录和已取得的原文保存在本机。",
                      "Results appear when this run finishes. Progress and collected answers are stored locally.",
                    )}
                  </p>
                  <button
                    className="button mt-4"
                    onClick={() => changeView("flow")}
                  >
                    {t("查看执行记录", "View workflow")}
                  </button>
                </section>
              ) : !scopeMatches &&
                ["overview", "sources", "actions", "content"].includes(view) ? (
                <section className="panel min-h-[370px] p-5" aria-busy={!error}>
                  {error ? (
                    <p className="muted">
                      {t(
                        "当前筛选未能加载，请重试或清除筛选。",
                        "This scope could not load. Retry or clear the filters.",
                      )}
                    </p>
                  ) : (
                    <>
                      <div className="skeleton h-6 w-40" />
                      <div className="skeleton mt-6 h-64" />
                    </>
                  )}
                </section>
              ) : view === "overview" && analysis ? (
                <Overview
                  analysis={analysis}
                  lang={lang}
                  openEvidence={openEvidence}
                  diagnosis={run?.diagnosis}
                  onActions={() => changeView("actions")}
                />
              ) : view === "sources" && analysis ? (
                <Sources
                  analysis={analysis}
                  lang={lang}
                  openEvidence={openEvidence}
                />
              ) : (
                <Workflows
                  key={`${project.id}-${view}`}
                  view={view}
                  project={project}
                  run={run}
                  status={status}
                  analytics={analysis || undefined}
                  lang={lang}
                  refresh={refresh}
                  onRun={loadRun}
                  spaceId={space}
                  onSpace={switchSpace}
                />
              )}
              <details className="space-context text-xs text-stone-600">
                <summary className="min-h-10">
                  {t(
                    "诊断空间与问题快照",
                    "Diagnosis spaces and question snapshots",
                  )}
                </summary>
                <div className="panel flex flex-wrap gap-3 p-4">
                  <label className="field min-w-[180px] flex-1">
                    {t("诊断空间", "Diagnosis space")}
                    <select
                      className="input"
                      data-space
                      value={space}
                      onChange={(e) => void switchSpace(e.target.value)}
                    >
                      <option value="">
                        {t("未关联空间", "Unlinked runs")}
                      </option>
                      {project.diagnosisSpaces?.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button self-end"
                    onClick={() => changeView("flow")}
                  >
                    {t("在此空间开始测试", "Start a test in this space")}
                  </button>
                </div>
              </details>
            </>
          )}
        </main>
      </div>
      {sample && (
        <EvidenceDialog
          sample={sample}
          lang={lang}
          onClose={() => setSample(null)}
        />
      )}
      {dialog && (
        <AppDialog
          close={() => setDialog("")}
          title={
            dialog === "settings"
              ? t("服务商设置", "Provider settings")
              : t("项目管理", "Manage projects")
          }
        >
          <div className="mb-4 flex justify-end">
            <button
              autoFocus
              className="button button-quiet"
              aria-label={t("关闭", "Close")}
              onClick={() => setDialog("")}
            >
              <X size={18} />
            </button>
          </div>
          {dialog === "settings" ? (
            <Settings status={status} refresh={refresh} lang={lang} />
          ) : (
            <ProjectManager
              refresh={async () => {
                setProjects(await api("/api/projects"));
                await refresh().catch(() => {});
              }}
              lang={lang}
              onProject={async (id: string) => {
                await loadProject(id);
                setDialog("");
              }}
            />
          )}
        </AppDialog>
      )}
    </div>
  );
}

function AppDialog({
  children,
  close,
  title,
}: {
  children: React.ReactNode;
  close: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-24px)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl backdrop:bg-black/30"
    >
      {children}
    </dialog>
  );
}
