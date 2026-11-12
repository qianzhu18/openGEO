"use client";

import {
  useEffect,
  useRef,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type FormEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CirclePlus,
  FileText,
  LayoutGrid,
  List,
  LoaderCircle,
  Play,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

type Lang = "zh" | "en";
type Row = Record<string, any>;
export interface WorkflowProps {
  view: string;
  project: Row;
  run?: Row | null;
  status?: Row;
  analytics?: Row | null;
  lang: Lang;
  refresh: () => Promise<void>;
  onRun: (id: string) => void;
  spaceId?: string;
  onSpace?: (id: string) => void;
}
const copy = (lang: Lang) => (zh: string, en: string) =>
  lang === "zh" ? zh : en;
export async function workbenchApi(
  path: string,
  method = "GET",
  data?: unknown,
) {
  const response = await fetch(path, {
    method,
    ...(data === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error || `Request failed (${response.status})`);
  return value;
}
function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-neutral-950">{title}</h1>
        <p className="muted mt-2 leading-7">{description}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
function Feedback({
  message,
  error,
  lang = "zh",
}: {
  message?: string;
  error?: string;
  lang?: Lang;
}) {
  const [visible, setVisible] = useState(false),
    id = useId();
  useEffect(() => {
    const onNotification = (event: Event) => {
      if ((event as CustomEvent).detail !== id) setVisible(false);
    };
    document.addEventListener("opengeo:notification", onNotification);
    return () =>
      document.removeEventListener("opengeo:notification", onNotification);
  }, [id]);
  useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return;
    document.dispatchEvent(
      new CustomEvent("opengeo:notification", { detail: id }),
    );
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [message, id]);
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && visible && (
        <div
          data-feedback-toast
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed right-4 bottom-4 z-[100] flex max-w-[min(400px,calc(100vw_-_32px))] items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-lg"
        >
          <Check
            size={17}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-emerald-700"
          />
          <span className="min-w-0 break-words leading-6">{message}</span>
          <button
            type="button"
            className="-mt-1 -mr-2 grid min-h-8 min-w-8 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
            aria-label={copy(lang)("关闭提示", "Dismiss notification")}
            onClick={() => setVisible(false)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
function useMutation(refresh?: () => Promise<void>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function mutate(action: () => Promise<unknown>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      await refresh?.();
      setMessage(success);
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, message, mutate };
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm font-medium text-neutral-700">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
function Status({ value, lang }: { value: string; lang: Lang }) {
  const labels: Row = {
    confirmed: "已确认",
    unconfirmed: "待确认",
    conflict: "有冲突",
    active: "已启用",
    suggested: "建议",
    inactive: "已停用",
    proposed: "建议",
    in_progress: "待办",
    done: "已完成",
    skipped: "已跳过",
    reviewed: "已审核",
    draft: "草稿",
  };
  return (
    <span
      className={`badge whitespace-nowrap ${["confirmed", "done", "reviewed"].includes(value) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}
    >
      {lang === "zh" ? labels[value] || value : value}
    </span>
  );
}
function Modal({
  title,
  lang,
  children,
  onClose,
}: {
  title: string;
  lang: Lang;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      id="evidence-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[88dvh] w-[min(840px,calc(100%_-_32px))] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/30"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          className="button shrink-0"
          onClick={onClose}
          aria-label={copy(lang)("关闭", "Close evidence")}
        >
          <X size={16} />
        </button>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </dialog>
  );
}
export function EvidenceDialog({
  sample,
  lang,
  onClose,
}: {
  sample: Row;
  lang: Lang;
  onClose: () => void;
}) {
  const t = copy(lang);
  return (
    <Modal
      title={t("原始回答", "Original answer")}
      lang={lang}
      onClose={onClose}
    >
      <h3 className="font-semibold leading-7">{sample.question}</h3>
      <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
        <span className="badge">{sample.origin}</span>
        <span>{sample.model}</span>
        <span>{sample.observedAt}</span>
        <span>{sample.protocolId}</span>
      </div>
      <p className="muted">
        {sample.collectionStatus} / {sample.analysisStatus}
      </p>
      {sample.error && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
          {sample.error}
        </p>
      )}
      <pre className="answer answer-text whitespace-pre-wrap break-words font-sans text-sm leading-8">
        {sample.answer ||
          t("未取得回答原文。", "No answer text was collected.")}
      </pre>
      <div className="space-y-3">
        <h3 className="font-semibold">
          {t("来源项", "Sources")} · {sample.citations?.length || 0}
        </h3>
        {sample.citations?.map((citation: Row, index: number) => (
          <div key={index} className="border-t border-neutral-100 pt-3">
            <span className="badge">{citation.kind}</span>
            <span className="ml-2 text-xs text-neutral-600">
              {citation.integrity}
            </span>
            <a
              href={safeUrl(citation.url)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block break-all text-sm underline underline-offset-4"
            >
              {citation.url}
            </a>
          </div>
        ))}
      </div>
      <details>
        <summary>{t("原始响应", "Raw response")}</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-50 p-4 text-xs">
          {JSON.stringify(sample.rawResponse || {}, null, 2)}
        </pre>
      </details>
    </Modal>
  );
}

export function Workflows(props: WorkflowProps) {
  switch (props.view) {
    case "queries":
    case "prompts":
      return <Prompts {...props} />;
    case "facts":
    case "project":
      return <BrandProject {...props} />;
    case "flow":
    case "agent":
      return <Agent {...props} />;
    case "recording":
      return <Recordings {...props} />;
    case "actions":
      return <Actions {...props} />;
    case "content":
      return <Content {...props} />;
    case "evidence":
      return <Evidence {...props} />;
    default:
      return null;
  }
}

function Prompts({
  project,
  run,
  lang,
  refresh,
  onRun,
  ...rest
}: WorkflowProps) {
  const t = copy(lang),
    mutation = useMutation(refresh);
  const [filter, setFilter] = useState("active"),
    [search, setSearch] = useState(""),
    [topic, setTopic] = useState(""),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]),
    [editor, setEditor] = useState<Row | null>(null),
    [showEditor, setShowEditor] = useState(false),
    [detail, setDetail] = useState<Row | null>(null),
    [sample, setSample] = useState<Row | null>(null),
    [recommend, setRecommend] = useState(false),
    [measure, setMeasure] = useState(false);
  const [observations, setObservations] = useState<Row[]>([]),
    [settings, setSettings] = useState<Row>({
      hiddenColumns: [],
      deltaDisplay: "full",
      version: 1,
    });
  useEffect(() => {
    let active = true;
    workbenchApi(`/api/projects/${project.id}/observations`)
      .then((value) => {
        if (active) setObservations(value.observations || []);
      })
      .catch(() => {});
    workbenchApi(`/api/projects/${project.id}/table-settings`)
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project.id, project.queryVersion, run?.id]);
  const queries: Row[] = project.queries || [],
    topics: Row[] = project.topics || [];
  const filtered = queries.filter(
    (q) =>
      (!filter || (q.status || "active") === filter) &&
      (!topic || q.topicId === topic) &&
      q.text.toLowerCase().includes(search.toLowerCase()),
  );
  const shown = filtered.slice((page - 1) * 50, page * 50);
  const columns = ["answers", "excluded", "intent", "location", "status"];
  const columnLabels: Row = {
    answers: t("有效回答", "Answers"),
    excluded: t("排除", "Excluded"),
    intent: t("意图", "Intent"),
    location: t("市场", "Location"),
    status: t("状态", "Status"),
  };
  const visibleColumn = (column: string) =>
    !settings.hiddenColumns.includes(column);
  async function batch(operation: string, topicId?: string) {
    await mutation.mutate(
      () =>
        workbenchApi(`/api/projects/${project.id}/prompts/batch`, "POST", {
          ids: selected,
          operation,
          topicId,
          expectedVersion: project.queryVersion,
        }),
      t("问题库已保存", "Question library saved."),
    );
    setSelected([]);
  }
  function exportCsv() {
    const escape = (value: unknown) =>
      `"${String(value ?? "")
        .replaceAll('"', '""')
        .replace(/^[=+@-]/, "'$&")}"`;
    download(
      "opengeo-prompts.csv",
      "\uFEFF" +
        [
          ["id", "prompt", "status", "topic", "intent", "country"],
          ...filtered.map((q) => [
            q.id,
            q.text,
            q.status || "active",
            topics.find((v) => v.id === q.topicId)?.name,
            q.intent,
            q.country || project.country,
          ]),
        ]
          .map((row) => row.map(escape).join(","))
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  return (
    <div className="space-y-5">
      <Heading
        title={t("问题库", "Prompts")}
        description={t(
          "管理启用问题与候选。修改问题会保留旧版本和历史回答。",
          "Manage tracked questions and suggestions. Edits preserve previous versions and answer history.",
        )}
      >
        <button className="button" onClick={exportCsv}>
          <ArrowDownToLine size={16} />
          {t("导出 CSV", "Export CSV")}
        </button>
        <button
          className="button button-primary"
          onClick={() => setRecommend(true)}
        >
          <Sparkles size={16} aria-hidden="true" />
          {t("智能推荐", "Recommend prompts")}
        </button>
        <button
          className="button"
          onClick={() => {
            setEditor(null);
            setShowEditor(true);
          }}
        >
          <CirclePlus size={16} />
          {t("添加问题", "Add prompts")}
        </button>
      </Heading>
      <Feedback {...mutation} lang={lang} />
      <div
        className="flex flex-wrap gap-x-5 gap-y-1 border-b border-neutral-200"
        role="group"
        aria-label={t("问题状态", "Prompt status")}
      >
        {["active", "suggested", "inactive"].map((value) => (
          <button
            key={value}
            className={`flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm ${filter === value ? "border-neutral-900 font-semibold text-neutral-950" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {lang === "zh"
              ? { active: "已启用", suggested: "建议", inactive: "已停用" }[
                  value
                ]
              : value}{" "}
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-normal tabular-nums text-neutral-600">
              {queries.filter((q) => (q.status || "active") === value).length}
            </span>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 p-4">
          <div className="relative min-w-40 flex-[1_1_240px]">
            <Search
              className="absolute left-3 top-3 text-neutral-400"
              size={16}
            />
            <input
              className="input w-full pl-9"
              aria-label={t("搜索问题", "Search prompts")}
              placeholder={t("搜索问题", "Search prompts")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input w-auto min-w-36 max-w-full flex-[1_1_160px] sm:max-w-52 sm:flex-none"
            aria-label={t("按主题筛选", "Filter by topic")}
            value={topic}
            onChange={(event) => {
              setTopic(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("全部主题", "All topics")}</option>
            {topics.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
          <details className="relative z-50 basis-full sm:basis-auto">
            <summary className="button whitespace-nowrap">
              {t("显示列", "Columns")}
            </summary>
            <form
              className="absolute left-0 z-50 mt-1 w-52 space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg sm:right-0 sm:left-auto"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void mutation.mutate(
                  async () => {
                    const value = await workbenchApi(
                      `/api/projects/${project.id}/table-settings`,
                      "PUT",
                      {
                        hiddenColumns: columns.filter(
                          (column) => !data.has(column),
                        ),
                        deltaDisplay: settings.deltaDisplay,
                        expectedVersion: settings.version,
                      },
                    );
                    setSettings(value);
                  },
                  t("显示列已保存", "Columns saved."),
                );
              }}
            >
              {columns.map((column) => (
                <label key={column} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={column}
                    defaultChecked={visibleColumn(column)}
                  />
                  {columnLabels[column]}
                </label>
              ))}
              <button className="button" disabled={mutation.busy}>
                {t("保存列", "Save columns")}
              </button>
            </form>
          </details>
        </div>
        {selected.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs"
            aria-label={t("批量问题操作", "Bulk prompt actions")}
          >
            <span className="mr-2 text-neutral-600">
              {selected.length} {t("项已选", "selected")}
            </span>
            <button
              className="button"
              disabled={!selected.length || mutation.busy}
              onClick={() => setMeasure(true)}
            >
              {t("测量所选", "Measure selected")}
            </button>
            <button
              className="button"
              disabled={!selected.length || mutation.busy}
              onClick={() => void batch("track")}
            >
              {t("启用所选", "Track selected")}
            </button>
            <button
              className="button"
              disabled={!selected.length || mutation.busy}
              onClick={() => void batch("untrack")}
            >
              {t("停用所选", "Untrack selected")}
            </button>
            <select
              className="input w-auto min-w-36 max-w-full"
              aria-label={t("所选问题分配主题", "Assign topic")}
              defaultValue=""
              disabled={!selected.length || mutation.busy}
              onChange={(event) => {
                if (event.target.value !== "__none")
                  void batch("assign-topic", event.target.value);
                else void batch("assign-topic", "");
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                {t("分配主题", "Assign topic")}
              </option>
              <option value="__none">{t("无主题", "No topic")}</option>
              {topics.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="table-wrap">
          <table className="prompt-table w-full min-w-[650px] text-sm">
            <thead>
              <tr>
                <th className="w-10 py-3 align-middle">
                  <input
                    type="checkbox"
                    aria-label={t("选择本页问题", "Select visible prompts")}
                    checked={
                      shown.length > 0 &&
                      shown.every((q) => selected.includes(q.id))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [
                              ...new Set([
                                ...selected,
                                ...shown.map((q) => q.id),
                              ]),
                            ]
                          : selected.filter(
                              (id) => !shown.some((q) => q.id === id),
                            ),
                      )
                    }
                  />
                </th>
                <th>{t("问题 / 主题", "Prompt / topic")}</th>
                {columns.filter(visibleColumn).map((column) => (
                  <th
                    key={column}
                    className={`${["answers", "excluded"].includes(column) ? "text-right" : ""} whitespace-nowrap py-3`}
                  >
                    {columnLabels[column]}
                  </th>
                ))}
                <th className="w-20 min-w-20">
                  <span className="sr-only">{t("操作", "Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => {
                const answers = observations.filter((s) => s.queryId === q.id),
                  valid = answers.filter(
                    (s) =>
                      s.collectionStatus === "completed" &&
                      s.analysisStatus === "completed" &&
                      s.answer?.trim(),
                  );
                return (
                  <tr
                    key={q.id}
                    className={
                      selected.includes(q.id)
                        ? "bg-neutral-50"
                        : "hover:bg-neutral-50/60"
                    }
                  >
                    <td className="py-3.5 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`${t("选择", "Select")} ${q.text}`}
                        checked={selected.includes(q.id)}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, q.id]
                              : selected.filter((id) => id !== q.id),
                          )
                        }
                      />
                    </td>
                    <td className="min-w-64 py-3.5">
                      <button
                        className="text-left font-medium leading-6 text-neutral-900 hover:underline"
                        onClick={() => setDetail(q)}
                      >
                        {q.text}
                      </button>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        {topics.find((value) => value.id === q.topicId)?.name ||
                          q.intent}{" "}
                        ·{" "}
                        {q.branded
                          ? t("点名问题", "Branded")
                          : t("自然发现", "Unbranded")}
                      </p>
                    </td>
                    {visibleColumn("answers") && (
                      <td className="py-3.5 text-right align-middle tabular-nums">
                        {valid.length}
                      </td>
                    )}
                    {visibleColumn("excluded") && (
                      <td className="py-3.5 text-right align-middle tabular-nums text-neutral-500">
                        {answers.length - valid.length}
                      </td>
                    )}
                    {visibleColumn("intent") && (
                      <td className="py-3.5 align-middle text-neutral-600">
                        {q.intent}
                      </td>
                    )}
                    {visibleColumn("location") && (
                      <td className="py-3.5 align-middle text-neutral-600">
                        {q.country || project.country || "UNKNOWN"}
                      </td>
                    )}
                    {visibleColumn("status") && (
                      <td className="whitespace-nowrap py-3.5 align-middle">
                        <Status value={q.status || "active"} lang={lang} />
                      </td>
                    )}
                    <td className="min-w-20 whitespace-nowrap py-3.5 align-middle">
                      <button
                        className="button button-quiet whitespace-nowrap"
                        onClick={() => {
                          setEditor(q);
                          setShowEditor(true);
                        }}
                      >
                        {t("编辑", "Edit")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && (
          <div className="empty">
            <Search
              size={22}
              aria-hidden="true"
              className="mx-auto mb-3 text-neutral-400"
            />
            <p className="font-medium text-neutral-800">
              {search || topic
                ? t("没有符合筛选的问题", "No prompts match these filters")
                : t("此分类暂无问题", "No prompts in this status")}
            </p>
            <p className="mt-1 text-neutral-500">
              {search || topic
                ? t(
                    "调整关键词或主题，再查看问题。",
                    "Try a different keyword or topic.",
                  )
                : t(
                    "添加问题，或切换到其他状态。",
                    "Add a prompt or switch to another status.",
                  )}
            </p>
            {search || topic ? (
              <button
                className="button mt-4"
                onClick={() => {
                  setSearch("");
                  setTopic("");
                  setPage(1);
                }}
              >
                {t("清除筛选", "Clear filters")}
              </button>
            ) : (
              <button
                className="button mt-4"
                onClick={() => {
                  setEditor(null);
                  setShowEditor(true);
                }}
              >
                <CirclePlus size={15} aria-hidden="true" />
                {t("添加第一条问题", "Add your first prompt")}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-xs">
          <span className="muted">
            {filtered.length} {t("个问题", "prompts")} · {page} /{" "}
            {Math.max(1, Math.ceil(filtered.length / 50))}
          </span>
          <div className="flex gap-2">
            <button
              className="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t("上一页", "Previous")}
            </button>
            <button
              className="button"
              disabled={page * 50 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              {t("下一页", "Next")}
            </button>
          </div>
        </div>
      </section>
      <details className="panel p-5">
        <summary className="font-medium">{t("新建主题", "New topic")}</summary>
        <form
          className="mt-4 flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget,
              name = new FormData(form).get("name");
            void mutation.mutate(
              async () => {
                await workbenchApi(
                  `/api/projects/${project.id}/topics`,
                  "POST",
                  { name, expectedVersion: project.queryVersion },
                );
                form.reset();
              },
              t("主题已创建", "Topic created."),
            );
          }}
        >
          <input
            className="input flex-1"
            name="name"
            required
            maxLength={120}
            aria-label={t("主题名称", "Topic name")}
          />
          <button className="button" disabled={mutation.busy}>
            {t("创建主题", "Create topic")}
          </button>
        </form>
      </details>
      <details className="panel p-5">
        <summary className="font-medium">
          {t("批量编辑与冻结问题集", "Edit and freeze the question set")}
        </summary>
        <p className="muted mt-3 leading-7">
          {t(
            "每行一个问题。保存为独立的诊断空间，历史运行保留原版本。",
            "One question per line. Save a diagnostic space while preserving historical runs.",
          )}
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const questions = String(
              new FormData(event.currentTarget).get("questions"),
            ).split("\n");
            void mutation.mutate(
              async () => {
                await workbenchApi(
                  `/api/projects/${project.id}/queries`,
                  "PUT",
                  { questions },
                );
                await workbenchApi(
                  `/api/projects/${project.id}/diagnosis-spaces`,
                  "POST",
                  {},
                );
              },
              t(
                "问题快照已保存到诊断空间，可开始测试或稍后返回",
                "Question snapshot saved in a diagnosis space.",
              ),
            );
          }}
        >
          <textarea
            className="input min-h-56 w-full leading-7"
            name="questions"
            aria-label={t("问题编辑器", "Question editor")}
            defaultValue={queries
              .filter((q) => !q.status || q.status === "active")
              .map((q) => q.text)
              .join("\n")}
          />
          <button
            className="button button-primary"
            disabled={
              mutation.busy || ["queued", "running"].includes(run?.status)
            }
          >
            {t("保存问题集", "Save question set")}
          </button>
        </form>
      </details>
      {measure && (
        <Modal
          title={t("测量所选问题", "Measure selected prompts")}
          lang={lang}
          onClose={() => setMeasure(false)}
        >
          <Agent
            {...rest}
            view="agent"
            spaceId=""
            onSpace={undefined}
            project={{
              ...project,
              diagnosisSpaces: [],
              queries: queries.filter(
                (query) =>
                  selected.includes(query.id) &&
                  (!query.status || query.status === "active"),
              ),
            }}
            run={run}
            lang={lang}
            refresh={refresh}
            onRun={(id) => {
              setMeasure(false);
              onRun(id);
            }}
          />
        </Modal>
      )}
      {showEditor && (
        <Modal
          title={
            editor ? t("编辑问题", "Edit prompt") : t("添加问题", "Add prompts")
          }
          lang={lang}
          onClose={() => setShowEditor(false)}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              void mutation.mutate(
                async () => {
                  if (editor)
                    await workbenchApi(
                      `/api/projects/${project.id}/prompts/${editor.id}`,
                      "PATCH",
                      {
                        text: values.texts,
                        topicId: values.topicId,
                        country: values.country,
                        expectedRevision: editor.revision || 1,
                      },
                    );
                  else
                    await workbenchApi(
                      `/api/projects/${project.id}/prompts`,
                      "POST",
                      {
                        ...values,
                        texts: String(values.texts).split("\n"),
                        expectedVersion: project.queryVersion,
                        requestId: crypto.randomUUID(),
                      },
                    );
                  setShowEditor(false);
                },
                editor
                  ? t("问题已保存", "Prompt saved.")
                  : t("问题已添加", "Prompts added."),
              );
            }}
          >
            <Field
              label={
                editor
                  ? t("问题", "Prompt")
                  : t("问题（每行一条）", "Prompts (one per line)")
              }
            >
              <textarea
                className="input min-h-40"
                name="texts"
                required
                defaultValue={editor?.text || ""}
              />
            </Field>
            <Field label={t("主题", "Topic")}>
              <select
                className="input"
                name="topicId"
                defaultValue={editor?.topicId || ""}
              >
                <option value="">{t("无主题", "No topic")}</option>
                {topics.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("市场", "Location")}>
              <select
                className="input"
                name="country"
                defaultValue={
                  editor?.country ||
                  (["US", "GB", "CA", "AU", "CN"].includes(project.country)
                    ? project.country
                    : "US")
                }
              >
                {["US", "GB", "CA", "AU", "CN"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            {!editor && (
              <Field label={t("状态", "Status")}>
                <select className="input" name="status">
                  <option value="active">{t("启用", "Active")}</option>
                  <option value="suggested">{t("候选", "Suggested")}</option>
                </select>
              </Field>
            )}
            <Feedback error={mutation.error} lang={lang} />
            <button className="button button-primary" disabled={mutation.busy}>
              {editor
                ? t("保存问题", "Save prompt")
                : t("添加问题", "Add prompts")}
            </button>
          </form>
        </Modal>
      )}
      {recommend && (
        <Modal
          title={t("推荐问题集", "Question recommendations")}
          lang={lang}
          onClose={() => setRecommend(false)}
        >
          <PromptRecommendations
            project={project}
            lang={lang}
            refresh={refresh}
            onAccepted={() => {
              setFilter("suggested");
              setPage(1);
              setSearch("");
              setTopic("");
              setRecommend(false);
            }}
          />
        </Modal>
      )}
      {detail && !sample && (
        <Modal title={detail.text} lang={lang} onClose={() => setDetail(null)}>
          <p className="muted">
            {detail.intent} · {detail.country || project.country || "UNKNOWN"}
          </p>
          <details className="rounded-lg bg-neutral-50 p-4 text-sm">
            <summary className="font-medium">
              {t("问题来源与审核", "Question provenance")}
            </summary>
            <p className="muted mt-3 break-words leading-6">{detail.origin}</p>
            {detail.sourceIds?.map((id: string) => {
              const source = project.sources.find(
                (source: Row) => source.id === id,
              );
              return (
                source && (
                  <p key={id} className="mt-2 text-xs leading-6">
                    {source.title}
                    {source.url && safeUrl(source.url) && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={safeUrl(source.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {source.url}
                        </a>
                      </>
                    )}
                  </p>
                )
              );
            })}
          </details>
          <h3 className="font-semibold">
            {t("所有运行中的原始回答", "Original answers across runs")}
          </h3>
          {observations
            .filter((value) => value.queryId === detail.id)
            .map((value) => (
              <div
                key={`${value.runGroup}-${value.id}`}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 py-3"
              >
                <div>
                  <p>{value.model}</p>
                  <p className="muted mt-1 text-xs">
                    {value.observedAt} · {value.protocolId}
                  </p>
                </div>
                <button
                  className="button"
                  data-sample={value.id}
                  onClick={() => setSample(value)}
                >
                  {t("查看原始回答", "Read original answer")}
                </button>
              </div>
            ))}
        </Modal>
      )}
      {sample && (
        <EvidenceDialog
          sample={sample}
          lang={lang}
          onClose={() => setSample(null)}
        />
      )}
    </div>
  );
}

function PromptRecommendations({
  project,
  lang,
  refresh,
  onAccepted,
}: {
  project: Row;
  lang: Lang;
  refresh: () => Promise<void>;
  onAccepted: () => void;
}) {
  const t = copy(lang),
    mutation = useMutation(),
    [items, setItems] = useState<Row[]>([]),
    [job, setJob] = useState<Row | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const base = `/api/projects/${project.id}/prompt-recommendations`;
  const load = async () => {
    const value = await workbenchApi(base);
    setItems(value.items);
    setJob(value.job);
    return value;
  };
  useEffect(() => {
    let active = true;
    workbenchApi(base)
      .then((value) => {
        if (active) {
          setItems(value.items);
          setJob(value.job);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base]);
  useEffect(() => {
    if (job?.status !== "running") return;
    let active = true;
    const timer = setInterval(() => {
      workbenchApi(base)
        .then((value) => {
          if (active) {
            setItems(value.items);
            setJob(value.job);
            setLoadError("");
          }
        })
        .catch((error) => {
          if (active) setLoadError(error.message);
        });
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base, job?.status]);
  const busy = mutation.busy || job?.status === "running";
  async function generate(source: string, prompts?: unknown) {
    await mutation.mutate(async () => {
      const value = await workbenchApi(`${base}/generate`, "POST", {
        source,
        prompts,
        requestId: requestId.current,
      });
      setItems(value.items);
      setJob(value.job);
      setSelected([]);
      requestId.current = crypto.randomUUID();
    });
  }
  const labels: Row = {
    informational: t("了解与学习", "Learning"),
    commercial: t("比较与选择", "Choosing"),
    brand_awareness: t("品牌核验", "Brand check"),
    navigational: t("寻找入口", "Navigation"),
    transactional: t("采取行动", "Action"),
  };
  return (
    <div className="space-y-5" data-prompt-recommendations>
      <div>
        <p className="leading-7 text-neutral-700">
          {t(
            `根据 ${project.brand} 的品牌资料，发现更具体的场景与问题。先审核加入建议库，再启用采样。`,
            `Use ${project.brand}'s saved sources to propose specific scenarios and questions. Review suggestions before tracking and sampling.`,
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
          <span>
            {project.country || "US"} · {project.language || "en"}
          </span>
          <span>
            · {project.sources?.length || 0} {t("份品牌来源", "brand sources")}
          </span>
          <span>
            ·{" "}
            {t("候选题不代表已测量需求", "Suggestions are not measured demand")}
          </span>
        </div>
      </div>
      <div className="rounded-lg bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              {t("从品牌资料智能生成", "Generate from brand sources")}
            </p>
            <p className="muted mt-1 text-xs leading-5">
              {t(
                "一次 OpenRouter 模型调用，生成 2–8 题；可能产生 API 费用。不会开始采样。",
                "One OpenRouter model call proposes 2–8 questions and may incur API costs. Sampling starts separately.",
              )}
            </p>
          </div>
          <button
            className="button button-primary"
            disabled={busy || loading}
            onClick={() => void generate("model-assisted")}
          >
            <Sparkles size={16} aria-hidden="true" />
            {busy
              ? t("正在生成", "Generating")
              : t("生成问题集", "Generate questions")}
          </button>
        </div>
        {job?.status === "running" && (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm">
            <LoaderCircle
              size={15}
              className="animate-spin"
              aria-hidden="true"
            />
            {t(
              "正在理解来源和设计问题，可关闭弹层，稍后返回。",
              "Reading sources and proposing questions. You can close this dialog and return later.",
            )}
          </p>
        )}
        {job?.status === "completed" && (
          <p role="status" className="muted mt-3 text-xs">
            {t("上次生成已完成", "Last generation completed")} ·{" "}
            {job.call?.provider}/{job.call?.model} ·{" "}
            {job.call?.costStatus === "known"
              ? `$${Number(job.call.costUsd).toFixed(5)}`
              : t("费用 UNKNOWN", "Cost UNKNOWN")}
          </p>
        )}
        {["failed", "interrupted"].includes(job?.status) && (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {t(
              "上次生成未完成或未通过校验。原有问题已保留；未自动重试，请核对服务商用量后再生成。",
              "The last generation failed or was interrupted. Existing prompts are retained. No automatic retry was sent; review provider usage before trying again.",
            )}
          </p>
        )}
      </div>
      <Feedback error={mutation.error || loadError} lang={lang} />
      {loading ? (
        <p role="status" className="muted">
          {t("正在读取候选", "Loading suggestions")}
        </p>
      ) : items.length ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  items.length > 0 &&
                  items.every((item) => selected.includes(item.id))
                }
                onChange={(event) =>
                  setSelected(
                    event.target.checked ? items.map((item) => item.id) : [],
                  )
                }
              />
              {t("全选候选", "Select all suggestions")}
            </label>
            <span className="muted text-xs">
              {selected.length} / {items.length}
            </span>
          </div>
          <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {items.map((item) => (
              <div key={item.id} className="p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5 shrink-0"
                    aria-label={`${t("选择候选", "Select suggestion")} ${item.text}`}
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block font-medium leading-6">
                      {item.text}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-neutral-500">
                      <span>{labels[item.intent] || item.intent}</span>
                      <span>
                        ·{" "}
                        {item.branded
                          ? t("点名问题", "Branded")
                          : t("自然发现", "Unbranded")}
                      </span>
                      {item.topicName && <span>· {item.topicName}</span>}
                    </span>
                  </span>
                </label>
                <details className="ml-7 mt-2 text-xs text-neutral-500">
                  <summary>{t("查看依据", "View rationale")}</summary>
                  <p className="mt-2 leading-6">
                    {item.source === "open-seo"
                      ? t(
                          "用户导入的 OpenSEO 候选，保留美国英语市场标签；没有在此工作台执行需求测量。",
                          "User-imported OpenSEO suggestions retain the US English market label; demand was not measured by this workbench.",
                        )
                      : item.reason}
                  </p>
                  <p className="mt-1 break-words">{item.sourceLabel}</p>
                  {item.sourceIds?.map((id: string) => {
                    const source = project.sources.find(
                      (source: Row) => source.id === id,
                    );
                    return (
                      source && (
                        <p key={id} className="mt-1 break-words">
                          {source.title}
                          {source.url && safeUrl(source.url) && (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                className="underline"
                                href={safeUrl(source.url)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {source.url}
                              </a>
                            </>
                          )}
                        </p>
                      )
                    );
                  })}
                </details>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="button button-primary"
              disabled={!selected.length || busy}
              onClick={() =>
                void mutation.mutate(async () => {
                  await workbenchApi(`${base}/accept`, "POST", {
                    ids: selected,
                    expectedVersion: project.queryVersion,
                  });
                  await refresh();
                  onAccepted();
                })
              }
            >
              {t(
                `加入建议库（${selected.length}）`,
                `Add suggestions (${selected.length})`,
              )}
            </button>
            <button
              className="button"
              disabled={!selected.length || busy}
              onClick={() =>
                void mutation.mutate(async () => {
                  await workbenchApi(`${base}/dismiss`, "POST", {
                    ids: selected,
                  });
                  setSelected([]);
                  await load();
                })
              }
            >
              {t("忽略所选", "Dismiss selected")}
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-200 p-6 text-center text-sm leading-7 text-neutral-500">
          {t(
            "还没有新候选。生成品牌问题集，或导入外部研究。与现有问题重复的候选会自动略过。",
            "No new suggestions yet. Generate a set or import research. Questions already in the library are skipped.",
          )}
        </p>
      )}
      <details className="border-t border-neutral-200 pt-4">
        <summary className="text-sm font-medium">
          {t(
            "其他来源：模板与 OpenSEO",
            "Other sources: templates and OpenSEO",
          )}
        </summary>
        <div className="mt-4 space-y-5">
          <div>
            <p className="muted mb-2 text-xs leading-6">
              {t(
                "不调用模型，根据已有主题生成基础模板。",
                "Use saved topics to create basic templates without a model call.",
              )}
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={() => void generate("local-source-derived")}
            >
              {t("生成基础模板", "Generate basic templates")}
            </button>
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const raw = new FormData(event.currentTarget).get("prompts");
              void mutation.mutate(async () => {
                const prompts = JSON.parse(String(raw));
                const value = await workbenchApi(`${base}/generate`, "POST", {
                  source: "open-seo",
                  prompts,
                });
                setItems(value.items);
                setSelected([]);
              });
            }}
          >
            <div>
              <p className="text-sm font-medium">
                {t("导入 OpenSEO 研究结果", "Import OpenSEO research")}
              </p>
              <p className="muted mt-1 text-xs leading-6">
                {t(
                  "OpenSEO 在外部 MCP 客户端中运行。本工作台暂不直接连接其付费服务。Prompt Research 主要来自 Google PAA，覆盖美国英语，不是 ChatGPT 提问日志。",
                  "Run OpenSEO in an external MCP client. This workbench does not directly connect to the paid service. Prompt Research is mostly Google PAA data for US English, not ChatGPT prompt logs.",
                )}
              </p>
            </div>
            <Field
              label={t(
                "候选 JSON（text、intent）",
                "Suggestion JSON (text, intent)",
              )}
            >
              <textarea
                className="input min-h-28 font-mono text-xs"
                name="prompts"
                required
                maxLength={50000}
                placeholder={
                  '[{"text":"Which tools fit a small team?","intent":"commercial"}]'
                }
              />
            </Field>
            <button className="button" disabled={busy}>
              {t("预览导入候选", "Preview imported suggestions")}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}

function BrandProject({ project, lang, refresh }: WorkflowProps) {
  const t = copy(lang),
    mutation = useMutation(refresh),
    sourceMutation = useMutation(refresh),
    claimMutation = useMutation(refresh),
    [kind, setKind] = useState("file");
  async function sourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    await sourceMutation.mutate(
      async () => {
        const payload: Row = Object.fromEntries(
          [...data].filter(([key]) => key !== "file"),
        );
        if (kind === "file" || kind === "pdf") {
          const file = data.get("file") as File;
          if (!file?.size || file.size > 1_000_000)
            throw new Error(
              t("请选择不超过 1MB 的文件", "Select a file up to 1MB."),
            );
          if (!/\.(pdf|txt|md|markdown)$/i.test(file.name))
            throw new Error(
              t(
                "仅支持 PDF、TXT 和 Markdown",
                "Only PDF, TXT and Markdown files are supported.",
              ),
            );
          if (/\.pdf$/i.test(file.name)) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            Object.assign(payload, {
              kind: "pdf",
              fileName: file.name,
              base64: btoa(binary),
            });
          } else
            Object.assign(payload, {
              kind: "text",
              title: file.name,
              text: await file.text(),
            });
        }
        await workbenchApi(
          `/api/projects/${project.id}/brand-sources`,
          "POST",
          payload,
        );
      },
      t(
        "资料已保存，请逐项核对事实；历史运行快照保持原样。",
        "Sources saved. Review each fact before reuse; historical snapshots remain unchanged.",
      ),
    );
  }
  return (
    <div className="space-y-5">
      <Heading
        title={t("品牌事实与来源", "Project")}
        description={t(
          "让品牌资料、待确认陈述和已确认事实各有出处。事实审核不阻止你采集诊断基线。",
          "Keep source material and reviewed facts together. Fact review is not required before collecting a diagnostic baseline.",
        )}
      />
      <Feedback error={mutation.error} message={mutation.message} lang={lang} />
      <section className="panel p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{project.brand}</h2>
            <p className="muted mt-2 leading-7">
              {project.description || project.industry}
            </p>
          </div>
          <span className="badge">{t("本地项目", "Local project")}</span>
        </div>
        <div className="grid gap-5 text-sm sm:grid-cols-3">
          <div>
            <p className="muted mb-1">{t("官网", "Website")}</p>
            <a
              className="break-all underline underline-offset-4"
              href={safeUrl(
                project.domain?.includes("://")
                  ? project.domain
                  : `https://${project.domain}`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {project.domain || "UNKNOWN"}
            </a>
          </div>
          <div>
            <p className="muted mb-1">
              {t("语言 / 目标市场", "Language / market")}
            </p>
            {project.language || "UNKNOWN"} / {project.country || "UNKNOWN"}
          </div>
          <div>
            <p className="muted mb-1">{t("问题版本", "Question version")}</p>v
            {project.queryVersion}
          </div>
        </div>
      </section>
      <section className="panel p-5 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold">
          {t("补充品牌资料", "Add brand sources")}
        </h2>
        <p className="muted mb-5 leading-7">
          {t(
            "上传 PDF / TXT / Markdown，或导入官网与粘贴原文。资料留在本机，来源陈述需要人工核对。",
            "Upload PDF / TXT / Markdown, import a public URL, or paste source text. Files stay local and statements require review.",
          )}
        </p>
        <form data-brand-source className="space-y-4" onSubmit={sourceSubmit}>
          <Field label={t("资料类型", "Source type")}>
            <select
              className="input sm:max-w-sm"
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="file">
                {t("上传本地文件", "Upload local file")}
              </option>
              <option value="text">{t("粘贴原文", "Pasted text")}</option>
              <option value="website">{t("官网网址", "Public website")}</option>
            </select>
          </Field>
          {kind === "text" && (
            <>
              <Field label={t("资料标题", "Source title")}>
                <input
                  className="input"
                  name="title"
                  required
                  maxLength={200}
                />
              </Field>
              <Field label={t("资料原文", "Source text")}>
                <textarea
                  className="input min-h-40 leading-7"
                  name="text"
                  required
                  maxLength={100000}
                />
              </Field>
            </>
          )}
          {kind === "website" && (
            <Field label={t("公开网址", "Public URL")}>
              <input
                className="input"
                name="url"
                type="url"
                required
                placeholder="https://"
              />
            </Field>
          )}
          {["file", "pdf"].includes(kind) && (
            <>
              <Field
                label={t(
                  "本地品牌文件（PDF / TXT / MD，最多 1MB）",
                  "Local brand file (PDF / TXT / MD, up to 1MB)",
                )}
              >
                <input
                  className="input py-3"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md,.markdown"
                />
              </Field>
              <p className="muted text-xs leading-6">
                {t(
                  "文字 PDF 最多 40 页；OCR、Word 与复杂表格解析未实现。",
                  "Text PDFs support up to 40 pages. OCR, Word and complex table parsing are not available.",
                )}
              </p>
            </>
          )}
          <Feedback {...sourceMutation} lang={lang} />
          <button
            className="button button-primary"
            disabled={sourceMutation.busy}
            type="submit"
          >
            {sourceMutation.busy ? (
              <LoaderCircle
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Upload size={16} />
            )}
            {sourceMutation.busy
              ? t("正在导入…", "Importing…")
              : t("导入来源", "Import source")}
          </button>
        </form>
        <details className="mt-6 border-t border-neutral-200 pt-5">
          <summary className="font-medium">
            {t("从来源录入一项事实", "Add a fact from a source")}
          </summary>
          <form
            data-brand-claim
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              void claimMutation.mutate(
                async () => {
                  await workbenchApi(
                    `/api/projects/${project.id}/brand-claims`,
                    "POST",
                    values,
                  );
                },
                t("事实已录入，待人工确认。", "Fact saved for review."),
              );
            }}
          >
            <Field label={t("原文来源／页码", "Source / page")}>
              <select className="input" name="sourceId" required>
                {project.sources?.map((source: Row) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t(
                "事实名称（建议包含型号与属性）",
                "Fact label (include model and attribute)",
              )}
            >
              <input className="input" name="label" required maxLength={120} />
            </Field>
            <Field
              label={t(
                "复制一段原文（不能改写）",
                "Exact source excerpt (no rewriting)",
              )}
            >
              <textarea
                className="input min-h-24"
                name="value"
                required
                maxLength={2000}
              />
            </Field>
            <Feedback {...claimMutation} lang={lang} />
            <button className="button" disabled={claimMutation.busy}>
              {t("录入待确认事实", "Add fact for review")}
            </button>
          </form>
        </details>
      </section>
      <section className="panel overflow-hidden">
        <h2 className="border-b border-neutral-200 p-5 text-lg font-semibold">
          {t("品牌事实", "Brand facts")}
        </h2>
        {project.claims?.length ? (
          project.claims.map((claim: Row) => (
            <article
              key={claim.id}
              className="space-y-3 border-b border-neutral-100 p-5 last:border-b-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-medium">{claim.label}</h3>
                <Status value={claim.status} lang={lang} />
              </div>
              <p className="leading-7">{claim.value}</p>
              <p className="muted text-xs leading-6">
                {claim.sourceIds
                  ?.map(
                    (id: string) =>
                      project.sources?.find((source: Row) => source.id === id)
                        ?.title || id,
                  )
                  .join(" · ")}
              </p>
              {claim.status !== "confirmed" && (
                <div className="flex flex-wrap gap-2">
                  {claim.status === "conflict" ? (
                    claim.alternatives?.map((alternative: Row) => (
                      <button
                        className="button"
                        disabled={mutation.busy}
                        key={alternative.sourceId}
                        onClick={() =>
                          void mutation.mutate(
                            () =>
                              workbenchApi(
                                `/api/projects/${project.id}/claims`,
                                "POST",
                                {
                                  claimId: claim.id,
                                  sourceId: alternative.sourceId,
                                },
                              ),
                            t(
                              "事实已确认。重新运行会使用新资料，历史结果保留。",
                              "Fact confirmed. New runs use the updated project snapshot.",
                            ),
                          )
                        }
                      >
                        {t("采用：", "Use: ")}
                        {alternative.value}
                      </button>
                    ))
                  ) : (
                    <button
                      className="button"
                      disabled={mutation.busy}
                      onClick={() =>
                        void mutation.mutate(
                          () =>
                            workbenchApi(
                              `/api/projects/${project.id}/claims`,
                              "POST",
                              {
                                claimId: claim.id,
                                sourceId: claim.sourceIds[0],
                              },
                            ),
                          t(
                            "事实已确认。重新运行会使用新资料，历史结果保留。",
                            "Fact confirmed. New runs use the updated project snapshot.",
                          ),
                        )
                      }
                    >
                      <Check size={15} />
                      {t("我已核对，确认此项", "I reviewed this fact, confirm")}
                    </button>
                  )}
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="empty">
            {t(
              "还没有录入事实。可先采集问题基线。",
              "No facts yet. You can still collect a diagnostic baseline.",
            )}
          </div>
        )}
      </section>
      <section className="panel overflow-hidden">
        <h2 className="border-b border-neutral-200 p-5 text-lg font-semibold">
          {t("来源原文", "Website research sources")}{" "}
          <span className="muted ml-2 text-sm font-normal">
            {project.sources?.length || 0}
          </span>
        </h2>
        {project.sources?.map((source: Row) => (
          <article
            key={source.id}
            className="space-y-3 border-b border-neutral-100 p-5 last:border-b-0"
          >
            <h3 className="font-medium">{source.title}</h3>
            {source.url && (
              <a
                href={safeUrl(source.url)}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-sm underline underline-offset-4"
              >
                {source.url}
              </a>
            )}
            <details>
              <summary className="text-sm">
                {t("阅读采集原文", "Read collected text")}
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">
                {source.text}
              </pre>
            </details>
          </article>
        ))}
      </section>
    </div>
  );
}

function Actions({ project, run, analytics, lang, refresh }: WorkflowProps) {
  const t = copy(lang),
    mutation = useMutation(refresh),
    [category, setCategory] = useState("all"),
    [filter, setFilter] = useState("all"),
    [priority, setPriority] = useState("all"),
    [layout, setLayout] = useState<"board" | "list">("board"),
    [sample, setSample] = useState<Row | null>(null),
    [pendingAction, setPendingAction] = useState("");
  const actions: Row[] =
    analytics?.diagnosis?.actions ||
    run?.diagnosis?.actions ||
    (run?.actions || []).filter((action: Row) => action.kind !== "measurement");
  const visible = actions.filter(
    (action) =>
      (category === "all" || action.kind === category) &&
      (priority === "all" || action.priority === priority) &&
      (filter === "all" || action.status === filter),
  );
  const states = [
    ["proposed", t("建议", "Suggestions")],
    ["in_progress", t("待办", "Todo")],
    ["done", t("已完成", "Done")],
    ["skipped", t("已跳过", "Skipped")],
  ];
  const groups = [
    ["all", t("全部类别", "All categories")],
    ["content", t("内容制作", "Content briefs")],
    ["fact", t("事实核验", "Fact review")],
    ["source", t("信源改进", "Source review")],
  ];
  const contentTypes: Row = {
    faq: t("FAQ", "FAQ"),
    product_page: t("产品页", "Product page"),
    comparison: t("对比稿", "Comparison"),
    implementation_guide: t("实施指南", "Implementation guide"),
    case_study: t("案例稿", "Case study"),
    selection_guide: t("选型指南", "Selection guide"),
  };
  const emptyStates: Row = {
    proposed: t("暂无新建议", "No suggestions yet"),
    in_progress: t("把选中的建议加入待办", "Add a suggestion to start"),
    done: t("完成的任务会保存在这里", "Completed work appears here"),
    skipped: t("跳过的建议随时可以恢复", "Skipped work can be restored"),
  };
  const card = (action: Row) => {
    const sampleIds = [...new Set<string>(action.sampleIds || [])],
      queryIds = [...new Set<string>(action.queryIds || [])],
      queries: Row[] = run?.queries || project.queries || [],
      question =
        action.trigger ||
        queries.find((query) => queryIds.includes(query.id))?.text,
      firstSample = run?.samples?.find((value: Row) =>
        sampleIds.includes(value.id),
      );
    return (
      <article
        key={action.id}
        data-action-card={action.id}
        aria-busy={pendingAction === action.id}
        className="flex min-w-0 flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-neutral-500">
            {action.priority}
          </span>
          <span className="h-3 w-px bg-neutral-200" aria-hidden="true" />
          <span className="text-neutral-500">
            {groups.find((value) => value[0] === action.kind)?.[1] ||
              action.kind}
          </span>
          {layout === "list" && <Status value={action.status} lang={lang} />}
        </div>
        <div>
          <h3 className="break-words font-semibold leading-6 text-neutral-950">
            {action.title}
          </h3>
          <p
            data-action-summary
            className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600"
          >
            {action.rationale}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1.5 text-emerald-800 hover:underline disabled:text-neutral-500"
            disabled={!firstSample}
            onClick={() => firstSample && setSample(firstSample)}
          >
            <Search size={13} aria-hidden="true" />
            {sampleIds.length}{" "}
            {t("条证据", sampleIds.length === 1 ? "answer" : "answers")}
          </button>
          {queryIds.length > 0 && (
            <span>
              {queryIds.length}{" "}
              {t("个问题", queryIds.length === 1 ? "prompt" : "prompts")}
            </span>
          )}
          {action.claimIds?.length > 0 && (
            <span>
              {action.claimIds.length} {t("项事实", "facts")}
            </span>
          )}
        </div>
        {question && (
          <div className="rounded-md bg-neutral-50 px-3 py-2">
            <p className="text-xs text-neutral-500">
              {t("目标问题", "Target prompt")}
            </p>
            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-neutral-700">
              {question}
            </p>
          </div>
        )}
        <details className="text-sm">
          <summary className="min-h-8 font-medium leading-6 text-neutral-700">
            <FileText size={14} aria-hidden="true" className="mr-1 inline" />
            {contentTypes[action.contentType]
              ? `${contentTypes[action.contentType]} · ${t("制作单", "Brief")}`
              : t("制作单与依据", "Brief and evidence")}
          </summary>
          <div className="mt-3 space-y-3 leading-7">
            <div>
              <h4 className="text-xs font-medium text-neutral-500">
                {t("完整理由", "Full rationale")}
              </h4>
              <p className="mt-1 text-neutral-600">{action.rationale}</p>
            </div>
            {question && (
              <p className="break-words">
                <strong>{t("目标问题：", "Target prompt: ")}</strong>
                {question}
              </p>
            )}
            {action.evidenceGap && (
              <p className="text-amber-800">{action.evidenceGap}</p>
            )}
            {action.outline?.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5">
                {action.outline.map((item: string, index: number) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
            )}
            {action.acceptance && (
              <p>
                <strong>{t("验收：", "Acceptance: ")}</strong>
                {action.acceptance}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {sampleIds.slice(0, 3).map((id, index) => (
                <button
                  key={id}
                  className="button"
                  disabled={
                    !run?.samples?.some((value: Row) => value.id === id)
                  }
                  onClick={() =>
                    setSample(
                      run?.samples?.find((value: Row) => value.id === id),
                    )
                  }
                >
                  {t("原文", "Answer")} {index + 1}
                </button>
              ))}
            </div>
            <p className="muted break-words text-xs">
              {t("关联问题：", "Question IDs: ")}
              {action.queryIds?.join(", ") || "UNKNOWN"}
            </p>
          </div>
        </details>
        <div className="mt-auto flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {(action.status === "proposed"
            ? [
                ["in_progress", t("加入待办", "Add to Todo")],
                ["skipped", t("跳过", "Skip")],
              ]
            : action.status === "in_progress"
              ? [
                  ["done", t("标为完成", "Mark done")],
                  ["proposed", t("移回建议", "Return to suggestions")],
                ]
              : [["proposed", t("恢复建议", "Restore suggestion")]]
          ).map(([next, label]) => (
            <button
              key={next}
              className={`button px-3 text-xs ${next === "in_progress" || next === "done" ? "button-primary" : ""}`}
              disabled={mutation.busy || !run}
              onClick={async () => {
                setPendingAction(action.id);
                await mutation.mutate(
                  () =>
                    workbenchApi(`/api/runs/${run!.id}/actions`, "PATCH", {
                      id: action.id,
                      status: next,
                    }),
                  t("行动状态已保存", "Action status saved."),
                );
                setPendingAction("");
              }}
            >
              {pendingAction === action.id && (
                <LoaderCircle
                  size={13}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </article>
    );
  };
  return (
    <div className="space-y-5">
      <Heading
        title={t("行动中心", "Action Center")}
        description={t(
          "把已保存的证据变成制作单，跟踪每一步。建议仍需人工审核和相同协议复测。",
          "Turn saved evidence into reviewable briefs and track work. Suggestions still need human review and a repeat measurement.",
        )}
      >
        <div className="flex rounded-lg border border-neutral-200 p-1">
          <button
            className={`button border-0 ${layout === "board" ? "bg-neutral-100" : ""}`}
            aria-pressed={layout === "board"}
            onClick={() => setLayout("board")}
          >
            <LayoutGrid size={16} />
            {t("看板", "Board")}
          </button>
          <button
            className={`button border-0 ${layout === "list" ? "bg-neutral-100" : ""}`}
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={16} />
            {t("列表", "List")}
          </button>
        </div>
      </Heading>
      <Feedback {...mutation} lang={lang} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-4">
        {states.map(([state, label]) => (
          <div key={state} className="bg-white px-5 py-4">
            <span className="muted text-xs">{label}</span>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {actions.filter((action) => action.status === state).length}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          className="input"
          aria-label={t("行动类别", "Action category")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {groups.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label={t("行动优先级", "Action priority")}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          {["all", "P0", "P1", "P2"].map((value) => (
            <option key={value} value={value}>
              {value === "all" ? t("全部优先级", "All priorities") : value}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label={t("行动状态", "Action status")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">{t("全部状态", "All states")}</option>
          {states.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!actions.length ? (
        <div className="panel empty">
          {t(
            "暂无可执行建议。先取得有效回答，再生成诊断。",
            "No actionable suggestions yet. Collect valid answers before diagnosing.",
          )}
        </div>
      ) : layout === "board" ? (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {states
            .filter(([value]) => filter === "all" || filter === value)
            .map(([state, label]) => (
              <section
                key={state}
                aria-label={label}
                data-action-column={state}
                tabIndex={0}
                className="min-w-0 rounded-xl bg-neutral-100 p-3 xl:h-[min(70dvh,900px)] xl:min-h-[400px] xl:overflow-y-auto xl:overscroll-y-contain"
              >
                <div className="-mx-1 -mt-1 mb-3 flex items-center justify-between bg-neutral-100 px-2 py-2 text-sm font-medium xl:sticky xl:-top-3 xl:z-10">
                  <h2>{label}</h2>
                  <span className="text-neutral-500">
                    {visible.filter((action) => action.status === state).length}
                  </span>
                </div>
                <div className="space-y-3">
                  {visible
                    .filter((action) => action.status === state)
                    .map(card)}
                  {!visible.some((action) => action.status === state) && (
                    <p className="px-2 py-6 text-center text-xs leading-5 text-neutral-500">
                      {category !== "all" || priority !== "all"
                        ? t("没有符合筛选的任务", "No matching tasks")
                        : emptyStates[state]}
                    </p>
                  )}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map(card)}
          {!visible.length && (
            <div className="panel empty">
              {t("当前筛选没有任务", "No tasks match these filters.")}
            </div>
          )}
        </div>
      )}
      {sample && (
        <EvidenceDialog
          sample={sample}
          lang={lang}
          onClose={() => setSample(null)}
        />
      )}
    </div>
  );
}

function Content({ run, lang, refresh }: WorkflowProps) {
  const t = copy(lang),
    mutation = useMutation(refresh),
    draft = run?.draft;
  const [markdown, setMarkdown] = useState(draft?.markdown || ""),
    [reviewed, setReviewed] = useState(draft?.status === "reviewed");
  useEffect(() => {
    setMarkdown(draft?.markdown || "");
    setReviewed(draft?.status === "reviewed");
  }, [run?.id, draft?.markdown, draft?.status]);
  return (
    <div className="space-y-5">
      <Heading
        title={t("把确认的事实写成内容", "Content & delivery")}
        description={t(
          "草稿、人工审核和发布登记分开记录。登记链接后，还需核对真实访问与引用。",
          "Keep drafts, human review and publication records separate. A saved link still needs access and citation verification.",
        )}
      />
      <Feedback {...mutation} lang={lang} />
      {!draft ? (
        <div className="panel empty">
          {t(
            "先回放已保存资料或运行 Agent 生成草稿。",
            "Replay saved evidence or run the workflow to prepare a draft.",
          )}
        </div>
      ) : draft.status === "blocked" ? (
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">
            {t("内容生成等待确认", "Draft blocked for fact review")}
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7">
            {draft.warnings?.map((warning: string, index: number) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-5">
              <h2 className="font-semibold">{draft.title}</h2>
              <Status value={draft.status} lang={lang} />
            </div>
            <textarea
              className="input min-h-[480px] w-full rounded-none border-0 p-5 font-mono text-sm leading-7"
              aria-label={t("内容草稿", "Content draft")}
              maxLength={50000}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 p-5">
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                {t("我已核对事实与引用", "I reviewed the facts and citations")}
              </label>
              <button
                className="button button-primary"
                disabled={mutation.busy}
                onClick={() =>
                  void mutation.mutate(
                    () =>
                      workbenchApi(`/api/runs/${run!.id}/draft`, "PATCH", {
                        markdown,
                        reviewed,
                      }),
                    t("内容与审核状态已保存", "Draft and review state saved."),
                  )
                }
              >
                {t("保存内容与审核状态", "Save draft and review")}
              </button>
            </div>
          </section>
          {draft.warnings?.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-5 text-sm leading-7 text-amber-900">
              {draft.warnings.map((warning: string, index: number) => (
                <p key={index}>{warning}</p>
              ))}
            </div>
          )}
          <section className="panel space-y-4 p-5">
            <h2 className="text-lg font-semibold">
              {t("发布登记", "Publication records")}
            </h2>
            <p className="muted leading-7">
              {t(
                "仅记录你已人工发布的链接，不代表已访问、被索引或被 AI 引用。",
                "Record pages you published manually. A record does not verify access, indexing or AI citation.",
              )}
            </p>
            {draft.status === "reviewed" && (
              <form
                className="flex flex-wrap gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget,
                    values = Object.fromEntries(new FormData(form));
                  void mutation.mutate(
                    async () => {
                      await workbenchApi(
                        `/api/runs/${run!.id}/publications`,
                        "POST",
                        values,
                      );
                      form.reset();
                    },
                    t(
                      "已登记，访问状态未验证",
                      "Recorded; access has not been verified.",
                    ),
                  );
                }}
              >
                <input
                  className="input min-w-44 flex-1"
                  name="url"
                  type="url"
                  required
                  aria-label={t("发布链接", "Publication URL")}
                  placeholder="https://"
                />
                <button className="button" disabled={mutation.busy}>
                  {t("登记发布链接", "Record publication URL")}
                </button>
              </form>
            )}
            {run?.publications?.map((value: Row) => (
              <div key={value.id} className="border-t border-neutral-100 pt-3">
                <a
                  className="block break-all text-sm underline"
                  href={safeUrl(value.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {value.url}
                </a>
                <p className="muted mt-2 text-xs">
                  {value.recordedAt} ·{" "}
                  {t("已登记，访问状态未验证", "Recorded; access not verified")}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export function QueuePanel({
  run,
  lang,
  refresh,
  onRun,
}: {
  run?: Row | null;
  lang: Lang;
  refresh: () => Promise<void>;
  onRun?: (id: string) => void;
}) {
  const t = copy(lang),
    mutation = useMutation(refresh),
    queue = run?.samplingQueue;
  if (!queue) return null;
  const running = ["queued", "running"].includes(run?.status),
    jobs: Row[] = queue.jobs || [];
  const unfinished = jobs.filter((job) => job.state !== "succeeded"),
    settled = jobs.filter((job) =>
      ["succeeded", "dead_letter", "review_required", "paused"].includes(
        job.state,
      ),
    ).length,
    progress = jobs.length ? Math.round((settled / jobs.length) * 100) : 0;
  async function act(action: string, jobId?: string) {
    if (
      action === "redrive" &&
      !window.confirm(
        t(
          "旧请求可能已经收费。本次重投会保留旧记录，并可能再次收费。确认已核对回执并重投？",
          "The previous request may already have been charged. Redriving preserves that record and may charge again. Confirm you checked the receipt and want to retry?",
        ),
      )
    )
      return;
    await mutation.mutate(async () => {
      await workbenchApi(`/api/runs/${run!.id}/${action}`, "POST", {
        jobId,
        jobIds: jobId ? [jobId] : [],
        acknowledgeCost: action === "redrive",
      });
      onRun?.(run!.id);
    });
  }
  return (
    <section className="queue-status panel mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">
            {t("采样队列", "Sampling queue")}{" "}
            <span className="badge ml-2">{run?.status}</span>
          </p>
          <p className="muted mt-1 text-xs leading-6">
            {jobs.filter((job) => job.state === "succeeded").length}/
            {jobs.length}{" "}
            {t(
              "已完成；执行结束不代表全部采集成功。",
              "completed. Execution ending does not mean every collection succeeded.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <button
              className="button"
              data-queue-action="stop"
              disabled={mutation.busy || queue.stopRequested}
              onClick={() => void act("stop")}
            >
              {queue.stopRequested
                ? t("正在停止后续发送", "Stopping new dispatches")
                : t("停止后续发送", "Stop future requests")}
            </button>
          ) : (
            jobs.some(
              (job) =>
                ["queued", "retry_wait"].includes(job.state) ||
                (job.state === "paused" &&
                  job.reason === "用户停止了后续发送。"),
            ) && (
              <button
                className="button"
                data-queue-action="resume"
                disabled={mutation.busy}
                onClick={() => void act("resume")}
              >
                {t("继续未发送任务", "Resume unsent jobs")}
              </button>
            )
          )}
        </div>
      </div>
      <div className="px-4 pb-4">
        <div
          role="progressbar"
          aria-label={t("采样执行进度", "Sampling execution progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${settled}/${jobs.length} ${t("个单元已处理", "units processed")}`}
          className="h-1.5 overflow-hidden rounded-full bg-neutral-100"
        >
          <div
            className="h-full rounded-full bg-emerald-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="muted mt-2 text-xs">
          {progress}% · {settled}/{jobs.length}{" "}
          {t(
            "个单元已处理，有效覆盖另计",
            "units processed; valid coverage is reported separately",
          )}
        </p>
      </div>
      <details className="border-t border-neutral-100">
        <summary className="px-4 py-3 text-sm font-medium">
          {t("逐题任务与恢复", "Jobs and recovery")} · {unfinished.length}{" "}
          {t("未完成", "unfinished")}
        </summary>
        <div className="space-y-3 border-t border-neutral-100 p-4">
          <Feedback {...mutation} lang={lang} />
          <p className="muted text-xs leading-6">
            {t(
              "已发出的请求可能仍在生成或收费。费用未知的任务需要核对回执；不会自动重新提交。",
              "Dispatched requests may still generate or incur charges. Check uncertain receipts before an explicit retry.",
            )}
          </p>
          {jobs.map((job) => {
            const remotePending =
                job.remote &&
                !["FAILED", "REJECTED", "COMPLETED"].includes(job.remote.status) &&
                ["review_required", "paused", "queued"].includes(job.state),
              call = run?.calls?.find((value: Row) => value.id === job.callId),
              remoteError = call?.response?.response?.error,
              latency = call?.response?.task?.latencyMs;
            return (
              <article
                key={job.id}
                className="queue-job space-y-2 rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-7">
                    {run?.queries?.find(
                      (query: Row) => query.id === job.queryId,
                    )?.text || job.queryId}
                  </h3>
                  <span className="badge">{job.state}</span>
                </div>
                <p className="muted text-xs">
                  {job.targetId} · {job.attempts} {t("次尝试", "attempts")}
                  {job.state === "leased" && job.phase ? ` · ${job.phase}` : ""}
                </p>
                {job.reason && (
                  <p className="text-sm leading-7 text-amber-900">
                    {job.reason}
                  </p>
                )}
                {job.remote && (
                  <p className="break-all text-xs leading-6 text-neutral-600">
                    {job.remote.status} ·{" "}
                    {job.remote.taskId ||
                      t(
                        "远端任务身份尚未返回",
                        "Remote task ID not returned",
                      )}{" "}
                    ·{" "}
                    {job.remote.creditsCharged !== undefined
                      ? `${job.remote.creditsCharged} credits`
                      : t("费用未知", "Cost unknown")}
                    {latency !== undefined
                      ? ` · ${(latency / 1000).toFixed(1)}s`
                      : ""}
                    {remoteError?.code ? ` · ${remoteError.code}` : ""}
                  </p>
                )}
                {!running && (
                  <div className="flex flex-wrap gap-2">
                    {remotePending ? (
                      <button
                        className="button"
                        data-queue-action="reconcile"
                        disabled={mutation.busy}
                        onClick={() => void act("reconcile", job.id)}
                      >
                        {t("查询原远端任务", "Query original remote task")}
                      </button>
                    ) : (
                      ["dead_letter", "review_required", "paused"].includes(
                        job.state,
                      ) &&
                      (job.redrives || 0) < 1 && (
                        <button
                          className="button"
                          data-queue-action="redrive"
                          disabled={mutation.busy}
                          onClick={() => void act("redrive", job.id)}
                        >
                          {t("核对后重投", "Review and redrive")}
                        </button>
                      )
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </details>
    </section>
  );
}

function Agent({
  project,
  run,
  status,
  lang,
  refresh,
  onRun,
  spaceId: externalSpace,
  onSpace,
}: WorkflowProps) {
  const t = copy(lang),
    mutation = useMutation(refresh),
    queries: Row[] =
      project.queries?.filter(
        (query: Row) => !query.status || query.status === "active",
      ) || [];
  const targets: Row[] = status?.diagnosisTargets || [],
    spaces: Row[] = project.diagnosisSpaces || [];
  const [spaceId, setSpaceId] = useState(
      externalSpace !== undefined
        ? externalSpace
        : run?.spaceId || spaces.at(-1)?.id || "",
    ),
    [queryIds, setQueryIds] = useState<string[]>(
      queries.slice(0, lang === "en" ? 5 : 10).map((query) => query.id),
    ),
    [targetIds, setTargetIds] = useState<string[]>(
      targets.map((target) => target.id),
    ),
    [history, setHistory] = useState<Row[]>([]);
  const request = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    workbenchApi(`/api/runs?projectId=${project.id}`)
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project.id, run?.status, run?.id]);
  useEffect(() => {
    if (externalSpace !== undefined) setSpaceId(externalSpace);
  }, [externalSpace]);
  useEffect(() => {
    const space = spaces.find((space) => space.id === spaceId);
    if (space) {
      setQueryIds(
        space.selectedQueryIds ||
          space.queries.slice(0, lang === "en" ? 5 : 10).map((q: Row) => q.id),
      );
      setTargetIds(
        space.targetIds?.length
          ? space.targetIds
          : targets.map((target) => target.id),
      );
    } else {
      setQueryIds(
        queries.slice(0, lang === "en" ? 5 : 10).map((query) => query.id),
      );
      setTargetIds(targets.map((target) => target.id));
    }
  }, [spaceId]);
  const running = ["queued", "running"].includes(run?.status),
    availableQueries =
      spaces.find((space) => space.id === spaceId)?.queries || queries;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    await mutation.mutate(async () => {
      if (!queryIds.length || queryIds.length > 50 || !targetIds.length)
        throw new Error(
          t(
            "请选择 1–50 个问题和至少一个平台",
            "Select 1–50 prompts and at least one platform.",
          ),
        );
      const apiKeys: Row = {};
      for (const provider of ["openrouter", "cloro"]) {
        const key = String(values.get(`key-${provider}`) || "").trim();
        if (key) apiKeys[provider] = key;
      }
      if (spaceId)
        await workbenchApi(
          `/api/projects/${project.id}/diagnosis-spaces/${spaceId}`,
          "PATCH",
          { queryIds, targetIds },
        );
      const payload = {
        projectId: project.id,
        ...(spaceId ? { spaceId } : {}),
        mode: "live",
        diagnosis: true,
        goal: project.goal,
        queryIds,
        maxQuestions: queryIds.length,
        targetIds,
      };
      const signature = JSON.stringify(payload);
      if (request.current?.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      const saved = await workbenchApi("/api/runs", "POST", {
        ...payload,
        apiKeys,
        requestKey: request.current.key,
      });
      request.current = null;
      form
        .querySelectorAll<HTMLInputElement>("input[type=password]")
        .forEach((input) => {
          input.value = "";
        });
      onRun(saved.id);
    });
  }
  return (
    <div className="space-y-5">
      <Heading
        title={t("把观察变成下一步行动", "Measure, review, improve")}
        description={t(
          "先确认问题与平台，再发起一轮有边界的测量。原文、失败和执行状态一起保存在本地。",
          "Confirm questions and platforms, then run a bounded measurement. Answers, failures and progress stay saved locally.",
        )}
      >
        <button
          className="button"
          disabled={mutation.busy || running}
          onClick={() =>
            void mutation.mutate(async () => {
              const value = await workbenchApi("/api/runs", "POST", {
                projectId: project.id,
                mode: "replay",
                goal: project.goal,
                requestKey: crypto.randomUUID(),
              });
              onRun(value.id);
            })
          }
        >
          <Play size={15} />
          {t("仅回放", "Replay saved evidence")}
        </button>
      </Heading>
      <Feedback {...mutation} lang={lang} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <section className="panel p-5 sm:p-6">
          <h2 className="mb-2 text-lg font-semibold">
            {t("运行一轮品牌诊断", "Start a brand diagnosis")}
          </h2>
          <p className="muted mb-5 leading-7">
            {t(
              "ChatGPT 与 Gemini 先走 Cloro 新加坡（SG）监测，明确失败后才降级 OpenRouter；其他目标使用 OpenRouter。费用由你的服务商账号承担。",
              "ChatGPT and Gemini use Cloro Singapore (SG) first and fall back to OpenRouter only after a confirmed failure; other targets use OpenRouter. Your provider account is charged.",
            )}
          </p>
          <form className="space-y-5" onSubmit={submit}>
            {spaces.length > 0 && (
              <Field label={t("诊断空间", "Diagnosis space")}>
                <select
                  className="input"
                  value={spaceId}
                  onChange={(event) => {
                    setSpaceId(event.target.value);
                    onSpace?.(event.target.value);
                  }}
                >
                  <option value="">
                    {t("当前问题库", "Current question library")}
                  </option>
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name} · v{space.queryVersion}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <fieldset className="min-w-0">
              <legend className="mb-3 font-medium">
                {t("已确认问题", "Confirmed questions")}{" "}
                <span className="muted text-xs">{queryIds.length}/50</span>
              </legend>
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-neutral-200 p-4">
                {availableQueries.map((query: Row) => (
                  <label
                    key={query.id}
                    className="flex items-start gap-3 text-sm leading-7"
                  >
                    <input
                      className="mt-2"
                      type="checkbox"
                      name="queryIds"
                      value={query.id}
                      checked={queryIds.includes(query.id)}
                      onChange={(event) =>
                        setQueryIds(
                          event.target.checked
                            ? [...queryIds, query.id]
                            : queryIds.filter((id) => id !== query.id),
                        )
                      }
                    />
                    <span>{query.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-3 font-medium">
                {t("诊断平台", "Diagnosis platforms")}
              </legend>
              <div className="space-y-3">
                {targets.map((target) => (
                  <label
                    key={target.id}
                    className="flex items-start gap-3 rounded-lg border border-neutral-200 p-4 text-sm"
                  >
                    <input
                      className="mt-1"
                      type="checkbox"
                      name="targetIds"
                      value={target.id}
                      checked={targetIds.includes(target.id)}
                      onChange={(event) =>
                        setTargetIds(
                          event.target.checked
                            ? [...targetIds, target.id]
                            : targetIds.filter((id) => id !== target.id),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <strong className="font-medium">{target.platform}</strong>
                      <span className="ml-2 text-xs text-neutral-600">
                        {target.provider === "cloro"
                          ? t("Cloro 监测 API", "Cloro monitoring API")
                          : t("OpenRouter 模型 API", "OpenRouter model API")}
                      </span>
                      <small className="mt-1 block leading-6 text-neutral-500">
                        {target.id === "chatgpt"
                          ? t(
                              "Cloro SG 优先；确认失败后才使用 OpenRouter 模型 API，不代表 ChatGPT 网页表现。",
                              "Cloro SG first; confirmed failures use the OpenRouter model API, which is not a ChatGPT web observation.",
                            )
                          : target.collectionNote}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="rounded-lg bg-neutral-50 p-4">
              <summary className="text-sm font-medium">
                {t(
                  "服务商密钥（已有本地配置可直接运行）",
                  "Provider keys (leave blank to use local configuration)",
                )}
              </summary>
              <div className="mt-4 space-y-4">
                {["openrouter", "cloro"].map((provider) => (
                  <Field key={provider} label={`${provider} API Key`}>
                    <input
                      className="input"
                      type="password"
                      autoComplete="off"
                      name={`key-${provider}`}
                    />
                  </Field>
                ))}
                <p className="muted text-xs leading-6">
                  {t(
                    "密钥不写入项目或浏览器存储。",
                    "Keys are never saved in project data or browser storage.",
                  )}
                </p>
              </div>
            </details>
            <div className="flex flex-wrap gap-3">
              <button
                className="button button-primary"
                disabled={mutation.busy || running}
              >
                <Play size={15} />
                {t("开始品牌诊断", "Start brand diagnosis")}
              </button>
              {spaceId && (
                <button
                  className="button"
                  type="button"
                  disabled={mutation.busy || running}
                  onClick={() =>
                    void mutation.mutate(
                      () =>
                        workbenchApi(
                          `/api/projects/${project.id}/diagnosis-spaces/${spaceId}`,
                          "PATCH",
                          { queryIds, targetIds },
                        ),
                      t(
                        "问题与平台选择已保存，可稍后返回此空间测试",
                        "Selection saved. Return to this space later to measure.",
                      ),
                    )
                  }
                >
                  {t("保存选择，稍后测试", "Save selection for later")}
                </button>
              )}
            </div>
          </form>
        </section>
        <div className="space-y-5">
          <section className="panel p-5">
            <h2 className="mb-4 text-lg font-semibold">
              {t("本轮执行记录", "Latest workflow")}
            </h2>
            {run ? (
              <div className="space-y-4">
                <span className="badge">{run.status}</span>
                {run.error && (
                  <p className="text-sm leading-7 text-red-800">{run.error}</p>
                )}
                <ol className="divide-y divide-neutral-100">
                  {run.steps?.map((step: Row, index: number) => (
                    <li key={step.id} className="py-4">
                      <div className="flex justify-between gap-3 text-sm">
                        <span>
                          <span className="mr-3 tabular-nums text-neutral-400">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {step.label}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {step.status}
                        </span>
                      </div>
                      <p className="muted mt-2 text-xs leading-6">
                        {step.summary}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="muted leading-7">
                {t(
                  "还没有运行。打开页面不会自动调用模型。",
                  "No run yet. Opening this page never calls a model.",
                )}
              </p>
            )}
          </section>
          <section className="panel p-5">
            <h2 className="mb-4 text-lg font-semibold">
              {t("运行历史", "Run history")}
            </h2>
            {history.length ? (
              history.map((value) => (
                <div
                  key={value.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 py-3 first:border-0"
                >
                  <div>
                    <p className="text-sm">
                      {new Date(value.createdAt).toLocaleString(
                        lang === "zh" ? "zh-CN" : "en-US",
                      )}
                    </p>
                    <p className="muted mt-1 text-xs">
                      {value.mode} · {value.sampleCount ?? "UNKNOWN"}{" "}
                      {t("条原文", "answers")}
                    </p>
                  </div>
                  <button className="button" onClick={() => onRun(value.id)}>
                    {t("打开结果", "Open")} · {value.status}
                  </button>
                </div>
              ))
            ) : (
              <p className="muted text-sm">
                {t("尚无运行记录", "No saved runs.")}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Recordings({ project, lang, refresh }: WorkflowProps) {
  const t = copy(lang),
    [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  async function load() {
    const result = await workbenchApi(`/api/projects/${project.id}/recordings`);
    setRows(result.recordings || []);
  }
  const mutation = useMutation(async () => {
    await load();
    await refresh();
  });
  useEffect(() => {
    let active = true;
    workbenchApi(`/api/projects/${project.id}/recordings`)
      .then((value) => {
        if (active) setRows(value.recordings || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project.id]);
  return (
    <div className="space-y-5">
      <Heading
        title={t("网址资料池", "Recording")}
        description={t(
          "采集公开网址作为问题设计材料。网址资料不会被当作 AI 回答或 Provider 引用。",
          "Collect public URLs for prompt discovery. Recorded source material is not an AI answer or provider citation.",
        )}
      />
      <Feedback {...mutation} lang={lang} />
      <section className="panel overflow-hidden">
        <form
          id="recording-form"
          className="space-y-4 border-b border-neutral-200 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget,
              url = new FormData(form).get("url");
            void mutation.mutate(
              async () => {
                await workbenchApi(
                  `/api/projects/${project.id}/recordings`,
                  "POST",
                  { url },
                );
                form.reset();
              },
              t("网址已加入资料池", "URL added to the recording pool."),
            );
          }}
        >
          <Field label={t("公开网址", "Public URL")}>
            <input
              className="input"
              type="url"
              name="url"
              required
              placeholder="https://example.com/guide"
            />
          </Field>
          <button className="button button-primary" disabled={mutation.busy}>
            <CirclePlus size={16} />
            {t("添加网址", "Add URL")}
          </button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <span className="muted text-sm">
            {selected.length} / 5 {t("项已选", "selected")}
          </span>
          <button
            className="button"
            disabled={mutation.busy || !selected.length}
            onClick={() =>
              void mutation.mutate(
                () =>
                  workbenchApi(
                    `/api/projects/${project.id}/recordings/prompts`,
                    "POST",
                    { ids: selected },
                  ),
                t(
                  "候选问题已加入问题库，启用后可采集。",
                  "Suggestions added to the question library. Activate them before collecting.",
                ),
              )
            }
          >
            {t("生成候选问题", "Generate prompts")}
          </button>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="source-table w-full min-w-[620px] text-sm">
              <thead>
                <tr>
                  <th />
                  <th>URL</th>
                  <th>{t("标题 / 状态", "Title / status")}</th>
                  <th>{t("操作", "Manage")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${t("选择", "Select")} ${row.url}`}
                        checked={selected.includes(row.id)}
                        disabled={
                          !selected.includes(row.id) && selected.length >= 5
                        }
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, row.id]
                              : selected.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
                    <td className="max-w-80">
                      <a
                        className="break-all underline underline-offset-4"
                        href={safeUrl(row.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.url}
                      </a>
                      {row.error && (
                        <p className="mt-2 text-xs leading-6 text-red-800">
                          {row.error}
                        </p>
                      )}
                    </td>
                    <td>
                      <p>{row.title || t("尚未采集", "Not collected")}</p>
                      <span className="badge mt-2">{row.status}</span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="button"
                          disabled={mutation.busy}
                          onClick={() =>
                            void mutation.mutate(() =>
                              workbenchApi(
                                `/api/projects/${project.id}/recordings/${row.id}/collect`,
                                "POST",
                                {},
                              ),
                            )
                          }
                        >
                          {t("采集", "Collect")}
                        </button>
                        <button
                          className="button"
                          disabled={mutation.busy}
                          onClick={() =>
                            void mutation.mutate(async () => {
                              await workbenchApi(
                                `/api/projects/${project.id}/recordings/${row.id}`,
                                "DELETE",
                              );
                              setSelected(
                                selected.filter((id) => id !== row.id),
                              );
                            })
                          }
                        >
                          {t("移除", "Remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            {t(
              "还没有网址。添加公开页面，采集原文后生成候选问题。",
              "No URLs recorded yet. Add a public URL to collect source text and generate prompt suggestions.",
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Evidence({ project, run, lang, refresh }: WorkflowProps) {
  const t = copy(lang),
    mutation = useMutation(refresh),
    [search, setSearch] = useState(""),
    [sample, setSample] = useState<Row | null>(null),
    [observations, setObservations] = useState<Row[]>([]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    workbenchApi(`/api/projects/${project.id}/observations`)
      .then((value) => {
        if (active) setObservations(value.observations || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project.id, project.samples?.length, run?.id]);
  const rows: Row[] = (run?.samples || observations).filter((value: Row) =>
    `${value.question} ${value.answer} ${value.model}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <Heading
        title={t("回答、判定与信源", "Answers & evidence")}
        description={t(
          "每一条记录都能返回原文。失败、分析未知和品牌未提及分别保留。",
          "Return to every original answer. Collection failure, unknown analysis and brand absence remain distinct.",
        )}
      >
        <button
          className="button"
          onClick={() =>
            download(
              "opengeo-import-template.json",
              JSON.stringify(
                [
                  {
                    question:
                      project.queries?.[0]?.text || "Your original question",
                    answer: "Replace with the actual answer text",
                    model: "Actual model",
                    observedAt: new Date().toISOString(),
                    runGroup: "manual-batch-1",
                  },
                ],
                null,
                2,
              ),
            )
          }
        >
          <ArrowDownToLine size={16} />
          {t("下载导入格式", "Download import template")}
        </button>
        <button className="button" onClick={() => file.current?.click()}>
          <Upload size={16} />
          {t("导入回答 JSON", "Import answers JSON")}
        </button>
      </Heading>
      <input
        ref={file}
        className="hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          void mutation.mutate(
            async () => {
              if (selected.size > 1_500_000)
                throw new Error(
                  t("文件超过限制", "File exceeds the size limit."),
                );
              const samples = JSON.parse(await selected.text());
              await workbenchApi(
                `/api/projects/${project.id}/samples`,
                "POST",
                { samples },
              );
            },
            t(
              "原文已导入项目。回放可生成新的分析快照。",
              "Answers imported. Replay to generate an updated analysis snapshot.",
            ),
          );
          event.target.value = "";
        }}
      />
      <Feedback {...mutation} lang={lang} />
      <input
        className="input w-full sm:max-w-lg"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={t("筛选回答", "Search answers")}
        placeholder={t(
          "筛选问题、回答或模型",
          "Search question, answer or model",
        )}
      />
      <section className="panel overflow-hidden">
        <div className="table-wrap">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr>
                <th>{t("问题 / 意图", "Question / intent")}</th>
                <th>{t("模型 / 来源", "Model / channel")}</th>
                <th>{t("状态", "Status")}</th>
                <th className="text-right">{t("引用", "Citations")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((value, index) => (
                <tr key={`${value.runGroup}-${value.id}-${index}`}>
                  <td className="max-w-xl">
                    <button
                      className="text-left leading-7 hover:underline"
                      data-sample={value.id}
                      onClick={() => setSample(value)}
                    >
                      {value.question}
                    </button>
                    <p className="muted mt-1 text-xs">
                      {value.intent} ·{" "}
                      {value.branded
                        ? t("点名", "Branded")
                        : t("非点名", "Unbranded")}
                    </p>
                  </td>
                  <td>
                    <p>{value.model}</p>
                    <span className="badge mt-2">{value.origin}</span>
                  </td>
                  <td>
                    <span className="badge">{value.collectionStatus}</span>
                    <p className="muted mt-1 text-xs">{value.analysisStatus}</p>
                  </td>
                  <td className="text-right tabular-nums">
                    {value.citations?.filter(
                      (citation: Row) => citation.kind === "provider_citation",
                    ).length || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            {t(
              "当前没有匹配的回答。可以导入原文，或用模型执行新测量。",
              "No matching answers. Import saved answer text or collect a new measurement.",
            )}
          </div>
        )}
      </section>
      {run?.measurementUnits?.length > 0 && (
        <details className="panel p-5">
          <summary className="font-medium">
            {t("逐题通道核对", "Measurement channels and attempts")}
          </summary>
          <div className="mt-4 space-y-4">
            {run!.measurementUnits.map((unit: Row) => (
              <article
                key={unit.id}
                className="border-t border-neutral-100 pt-4"
              >
                <h3 className="text-sm font-medium leading-7">
                  {unit.question} · {unit.platform}
                </h3>
                {unit.attempts?.map((attempt: Row) => (
                  <p key={attempt.id} className="muted mt-2 text-xs leading-6">
                    {attempt.channel} · {attempt.provider || "Xue + Kimi"} /{" "}
                    {attempt.model || "UNKNOWN"} · {attempt.status}
                    {attempt.fallback ? " · fallback" : ""}
                    {attempt.reason ? ` · ${attempt.reason}` : ""}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </details>
      )}
      {sample && (
        <EvidenceDialog
          sample={sample}
          lang={lang}
          onClose={() => setSample(null)}
        />
      )}
    </div>
  );
}

export function Settings({
  status,
  refresh,
  lang,
}: {
  status?: Row;
  refresh: () => Promise<void>;
  lang: Lang;
}) {
  const t = copy(lang),
    mutation = useMutation(refresh);
  return (
    <section className="space-y-5">
      <Heading
        title={t("服务商设置", "Provider settings")}
        description={t(
          "OpenGEO 使用你自己的服务商账号。密钥仅在本地进程内存中生效，重启后清除。",
          "OpenGEO uses your own provider account. Keys stay in local process memory and clear on restart.",
        )}
      />
      <Feedback {...mutation} lang={lang} />
      <form
        className="panel max-w-2xl space-y-5 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget,
            values = Object.fromEntries(new FormData(form));
          void mutation.mutate(
            async () => {
              await workbenchApi("/api/provider-session", "POST", values);
              form.reset();
            },
            t(
              "服务商配置已在本地进程内生效",
              "Provider settings are active in the local process.",
            ),
          );
        }}
      >
        {["openrouter", "cloro"].map((provider) => (
          <Field key={provider} label={`${provider} API Key`}>
            <input
              className="input"
              name={provider}
              type="password"
              autoComplete="off"
              placeholder={
                [
                  ...(status?.providers || []),
                  ...(status?.monitorProviders || []),
                ].find((value) => value.id === provider)?.configured
                  ? t("已配置，留空保留", "Configured, leave blank to keep")
                  : t("尚未配置", "Not configured")
              }
            />
          </Field>
        ))}
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            className="underline underline-offset-4"
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            OpenRouter <ArrowUpRight className="inline" size={14} />
          </a>
          <a
            className="underline underline-offset-4"
            href="https://dashboard.cloro.dev/"
            target="_blank"
            rel="noreferrer"
          >
            Cloro <ArrowUpRight className="inline" size={14} />
          </a>
        </div>
        <button className="button button-primary" disabled={mutation.busy}>
          {t("保存服务商配置", "Save provider settings")}
        </button>
      </form>
    </section>
  );
}

export function ProjectManager({
  lang,
  refresh,
  onProject,
  onSelect,
}: {
  lang: Lang;
  refresh: () => Promise<void>;
  onProject?: (id: string) => void;
  onSelect?: (id: string) => void;
  [key: string]: unknown;
}) {
  const t = copy(lang),
    [projects, setProjects] = useState<Row[]>([]),
    [deleted, setDeleted] = useState<Row[]>([]),
    [examples, setExamples] = useState(false);
  async function load() {
    const [current, removed] = await Promise.all([
      workbenchApi("/api/projects"),
      workbenchApi("/api/deleted-projects"),
    ]);
    setProjects(current);
    setDeleted(removed);
  }
  const mutation = useMutation(async () => {
    await load();
    await refresh();
  });
  useEffect(() => {
    void load().catch(() => {});
    setExamples(localStorage.getItem("opengeo-show-examples") === "true");
  }, []);
  function open(id: string) {
    if (onProject || onSelect) (onProject || onSelect)!(id);
    else
      location.href = `${lang === "en" ? "/workspace" : "/"}?project=${encodeURIComponent(id)}`;
  }
  return (
    <div className="space-y-5">
      <Heading
        title={t("项目管理", "Manage projects")}
        description={t(
          "资料、问题和报告按项目隔离。删除进入本地回收站，随时可以恢复。",
          "Sources, prompts and reports remain separate per project. Deleted projects move to a recoverable local bin.",
        )}
      >
        <a
          className="button button-primary"
          href={`/create-workspace?lang=${lang}`}
        >
          <CirclePlus size={16} />
          {t("新建项目", "New project")}
        </a>
      </Heading>
      <Feedback {...mutation} lang={lang} />
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={examples}
          onChange={(event) => {
            setExamples(event.target.checked);
            localStorage.setItem(
              "opengeo-show-examples",
              String(event.target.checked),
            );
          }}
        />
        {t("显示内置示例项目", "Show built-in examples")}
      </label>
      <section className="panel divide-y divide-neutral-100">
        {projects
          .filter((project) => examples || !project.example)
          .map((project) => (
            <div
              key={project.id}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div>
                <p className="font-medium">{project.name}</p>
                <p className="muted mt-1 text-xs">
                  {project.domain || project.industry}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="button" onClick={() => open(project.id)}>
                  {t("打开", "Open")}
                </button>
                <button
                  className="button"
                  disabled={mutation.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          `将「${project.name}」移入回收站？资料和运行会一起隐藏，可恢复。`,
                          `Move ${project.name} to the local bin? Sources and runs will be hidden and can be restored.`,
                        ),
                      )
                    )
                      void mutation.mutate(() =>
                        workbenchApi(`/api/projects/${project.id}`, "DELETE"),
                      );
                  }}
                >
                  {t("删除项目", "Delete project")}
                </button>
              </div>
            </div>
          ))}
      </section>
      <section className="panel p-5">
        <h2 className="mb-4 text-lg font-semibold">
          {t("回收站", "Recycle bin")}
        </h2>
        {deleted.length ? (
          deleted.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between gap-3 border-t border-neutral-100 py-3"
            >
              <p className="text-sm">{project.name}</p>
              <button
                className="button"
                disabled={mutation.busy}
                onClick={() =>
                  void mutation.mutate(() =>
                    workbenchApi(
                      `/api/deleted-projects/${project.id}/restore`,
                      "POST",
                      {},
                    ),
                  )
                }
              >
                {t("恢复项目", "Restore project")}
              </button>
            </div>
          ))
        ) : (
          <p className="muted text-sm">
            {t("暂无已删除项目", "No deleted projects.")}
          </p>
        )}
      </section>
    </div>
  );
}
