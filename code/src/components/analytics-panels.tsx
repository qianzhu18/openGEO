"use client";
import { useState, useEffect } from "react";
import { SegmentedControl } from "./ui-controls";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ArrowUpRight,
  Info,
  ChevronRight,
  Search,
  CheckCircle2,
  FileText,
  ExternalLink,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { DiagnosticAnalysis } from "../workbench/analytics";
type Props = {
  analysis: DiagnosticAnalysis;
  lang: "zh" | "en";
  openEvidence: (id: string, cohortKey?: string) => void;
  diagnosis?: any;
  onActions: () => void;
};
const colors = [
  "#35745f",
  "#c37c35",
  "#668fc1",
  "#9a77a7",
  "#b76169",
  "#6d8d8b",
];
const pct = (m: any) =>
  m?.value == null ? "UNKNOWN" : `${(m.value * 100).toFixed(1)}%`;
const ratio = (m: any) => `${m?.numerator ?? 0}/${m?.denominator ?? 0}`;
const intentLabel = (value: string, lang: "zh" | "en") =>
  ({
    natural: lang === "zh" ? "自然发现" : "Discovery",
    branded_fact: lang === "zh" ? "点名核验" : "Fact check",
    candidate_comparison: lang === "zh" ? "候选比较" : "Comparison",
    discovery: lang === "zh" ? "发现" : "Discovery",
  })[value] || value;
export function Overview({
  analysis: a,
  lang,
  openEvidence,
  diagnosis,
  onActions,
}: Props) {
  const t = (zh: string, en: string) => (lang === "en" ? en : zh);
  const [metric, setMetric] = useState("visibility"),
    [focus, setFocus] = useState<number | null>(null),
    [hidden, setHidden] = useState<number[]>([]),
    [cohort, setCohort] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  useEffect(() => {
    setHidden([]);
    setFocus(null);
    setCohort("");
  }, [a.runId, JSON.stringify(a.filter)]);
  const q = a.quality,
    own = a.metrics.brands.find((b) => b.isOwn);
  const days = [
    ...new Set(a.trends.flatMap((s) => s.points.map((p) => p.day))),
  ].sort();
  const groups = a.metrics.cohorts;
  const label = (c: any) =>
    `${c.model.split("/").at(-1)} · ${c.origin === "browser" ? "Web" : c.origin.toUpperCase()} · ${c.branded ? t("点名", "Branded") : t("非点名", "Unbranded")}`;
  const groupMetric = (c: any, day?: string) => {
    if (metric === "citations") {
      const rows = a.rows.filter(
        (r) =>
          r.status === "valid" &&
          r.cohortKey === c.key &&
          (!day || r.observedAt?.startsWith(day)),
      );
      return {
        numerator: rows.filter((r) => r.providerCitations > 0).length,
        denominator: rows.length,
        value: rows.length
          ? rows.filter((r) => r.providerCitations > 0).length / rows.length
          : null,
      };
    }
    if (day && metric === "visibility")
      return a.trends
        .find((s) => s.key === c.key)
        ?.points.find((p) => p.day === day);
    return c.brands.find((b: any) => b.isOwn)?.[metric];
  };
  const metricNames: Record<string, string> = {
    visibility: t("品牌提及", "Brand mentions"),
    position: t("首次出现序", "First appearance"),
    sov: t("提及份额", "Mention share"),
    citations: t("引用覆盖", "Citation coverage"),
  };
  const fmt = (m: any) =>
    metric === "position"
      ? m?.value == null
        ? "UNKNOWN"
        : m.value.toFixed(1)
      : pct(m);
  const selected = groups.find((c) => c.key === cohort) || groups[0];
  const chartData = days.map((day) => ({
    day,
    time: Date.parse(day),
    ...Object.fromEntries(
      groups.map((c, i) => [`v${i}`, groupMetric(c, day)?.value ?? null]),
    ),
  }));
  const topics = [...new Set(a.questions.map((q) => q.topic))]
    .map((topic) => ({
      topic,
      questions: a.questions.filter(
        (q) =>
          q.topic === topic &&
          `${q.question} ${q.topic}`
            .toLowerCase()
            .includes(questionSearch.toLowerCase()),
      ),
    }))
    .filter((topic) => topic.questions.length);
  return (
    <div className="space-y-6">
      <section
        className="panel grid grid-cols-2 md:grid-cols-4 da-metrics"
        aria-label={t("数据概况", "Data summary")}
      >
        {[
          [
            t("有效回答覆盖", "Valid answer coverage"),
            q.coverage == null ? "UNKNOWN" : pct({ value: q.coverage }),
            `${q.valid}/${q.planned} ${q.planBasis === "frozen-units" ? t("有效 / 计划", "valid / planned") : t("有效 / 已存记录", "valid / saved")}`,
          ],
          [
            t("品牌提及率", "Brand mention rate"),
            a.metrics.mixedCohorts
              ? t("按组查看", "By cohort")
              : pct(own?.visibility),
            a.metrics.mixedCohorts
              ? t(
                  `${groups.length} 个独立测量组`,
                  `${groups.length} separate cohorts`,
                )
              : `${ratio(own?.visibility)} ${t("有效回答", "valid answers")}`,
          ],
          [
            t("已覆盖问题", "Questions covered"),
            `${a.summary.coveredQuestions}/${a.summary.questionCount}`,
            t("按本轮确认题集统计", "Within this question set"),
          ],
          [
            t("排除 / 待完成", "Excluded / pending"),
            `${q.excluded} / ${q.pending}`,
            t("失败不计入提及率分母", "Failures excluded from mention rates"),
          ],
        ].map(([name, value, note]) => (
          <div className="metric" key={name}>
            <p className="muted text-xs">{name}</p>
            <p className="number my-2 text-[25px] font-semibold leading-tight">
              {value}
            </p>
            <p className="muted text-xs">{note}</p>
          </div>
        ))}
      </section>
      {q.contaminated && (
        <p role="status" className="rounded-lg bg-amber-50 p-4 text-amber-900">
          {t(
            "此批次含问题分组标题，仅供工程核查，不能作为正式基线。",
            "QA-only run: question headings entered sampling. This is not a formal baseline.",
          )}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="panel-head">
            <div>
              <h2>
                {days.length > 1 && metric === "visibility"
                  ? t("实际观测趋势", "Observed trend")
                  : t("测量组比较", "Measurement group comparison")}
              </h2>
              <p className="muted mt-1 text-xs">
                {days.length === 1
                  ? `${days[0]} · ${t("单日观测，分别比较各组", "One observed date, compared by cohort")}`
                  : t(
                      "保留各组的独立协议与分母",
                      "Each cohort retains its protocol and denominator",
                    )}
              </p>
            </div>
            <Info size={16} className="text-stone-400" aria-hidden="true" />
          </div>
          <div className="border-b border-stone-200 px-4 py-3">
            <SegmentedControl
              label={t("图表指标", "Chart metric")}
              value={metric}
              options={Object.entries(metricNames).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={setMetric}
            />
          </div>
          <div className="chart-enter px-5 pb-5 pt-4" key={a.runId}>
            {!groups.length ? (
              <div className="empty">
                {t("暂无符合筛选条件的观察", "No observations in this scope")}
              </div>
            ) : days.length > 1 && metric === "visibility" ? (
              <div
                className="h-[270px] w-full"
                aria-label={t("实际观测折线图", "Observed values over time")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 12, right: 16, left: -18, bottom: 8 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="#e7e5e4"
                      strokeDasharray="3 4"
                    />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(n) =>
                        new Date(n).toISOString().slice(5, 10)
                      }
                      tick={{ fill: "#625f5a", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tickFormatter={(n) => `${n * 100}%`}
                      tick={{ fill: "#625f5a", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      animationDuration={150}
                      labelFormatter={(v) =>
                        new Date(Number(v)).toISOString().slice(0, 10)
                      }
                      formatter={(v: any, n: any, p: any) => {
                        const c = groups[Number(String(p.dataKey).slice(1))];
                        const m = c ? groupMetric(c, p.payload.day) : null;
                        return [
                          `${(Number(v) * 100).toFixed(1)}% (${ratio(m)})`,
                          n,
                        ];
                      }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e7e5e4",
                        fontSize: 12,
                      }}
                    />
                    {groups.map(
                      (c, i) =>
                        !hidden.includes(i) && (
                          <Line
                            key={c.key}
                            type="linear"
                            dataKey={`v${i}`}
                            name={label(c)}
                            stroke={colors[i % colors.length]}
                            strokeWidth={focus === i ? 3 : 2}
                            strokeOpacity={
                              focus == null || focus === i ? 1 : 0.2
                            }
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{ r: 3, fill: colors[i % colors.length] }}
                            activeDot={{
                              r: 6,
                              onClick: (_e: any, p: any) => {
                                const id = a.rows.find(
                                  (r) =>
                                    r.status === "valid" &&
                                    r.cohortKey === c.key &&
                                    r.observedAt?.startsWith(p.payload.day),
                                )?.sampleId;
                                if (id) openEvidence(id, c.key);
                              },
                            }}
                          />
                        ),
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div
                className="min-h-[210px] space-y-4 py-2"
                aria-label={t("分组指标条形图", "Metrics by cohort")}
              >
                {groups.map((c, i) => {
                  const m = groupMetric(c);
                  const id = c.eligibleObservationIds[0];
                  return (
                    <button
                      key={c.key}
                      className="group block min-h-12 w-full rounded-lg p-1 text-left focus-visible:bg-stone-50"
                      hidden={hidden.includes(i)}
                      disabled={!id}
                      style={{
                        opacity: focus == null || focus === i ? 1 : 0.25,
                      }}
                      onMouseEnter={() => setFocus(i)}
                      onMouseLeave={() => setFocus(null)}
                      onFocus={() => setFocus(i)}
                      onBlur={() => setFocus(null)}
                      onClick={() => id && openEvidence(id, c.key)}
                      title={`${c.protocolId} · ${c.runGroup} · ${c.intent}`}
                      aria-label={`${label(c)} ${fmt(m)} (${ratio(m)})`}
                    >
                      <span className="flex items-start justify-between gap-3 text-xs">
                        <span className="min-w-0 break-words">
                          {label(c)}
                          <span className="muted ml-2">
                            {c.intent === "natural"
                              ? t("自然发现", "Discovery")
                              : c.intent === "branded_fact"
                                ? t("点名核验", "Fact check")
                                : c.intent === "candidate_comparison"
                                  ? t("候选比较", "Comparison")
                                  : c.intent}
                          </span>
                        </span>
                        <strong className="number shrink-0">
                          {fmt(m)}{" "}
                          <span className="font-normal text-stone-500">
                            ({ratio(m)})
                          </span>
                        </strong>
                      </span>
                      <span className="mt-2 block h-2 rounded bg-stone-100">
                        <span
                          className="block h-2 rounded"
                          style={{
                            background: colors[i % colors.length],
                            width: `${Math.min(100, metric === "position" ? (m?.value ? 100 / m.value : 0) : (m?.value ?? 0) * 100)}%`,
                          }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div
              className="mt-5 flex flex-wrap gap-x-3 gap-y-1"
              aria-label={t("图表分组", "Chart series")}
            >
              {groups.map((c, i) => (
                <button
                  className="flex min-h-10 items-center gap-1.5 text-xs"
                  key={c.key}
                  aria-pressed={!hidden.includes(i)}
                  onMouseEnter={() => setFocus(i)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(i)}
                  onBlur={() => setFocus(null)}
                  onClick={() =>
                    setHidden((v) =>
                      v.includes(i) ? v.filter((n) => n !== i) : [...v, i],
                    )
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: hidden.includes(i)
                        ? "#d6d3d1"
                        : colors[i % colors.length],
                    }}
                  />
                  <span
                    className={
                      hidden.includes(i)
                        ? "text-stone-400 line-through"
                        : "text-stone-600"
                    }
                  >
                    {i + 1}. {c.model.split("/").at(-1)} ·{" "}
                    {intentLabel(c.intent, lang)}
                  </span>
                </button>
              ))}
            </div>
            {days.length > 1 && (
              <details className="mt-3 text-xs">
                <summary className="min-h-10">
                  {t("按日期查看数据与原文", "Data and evidence by date")}
                </summary>
                <div className="space-y-2 py-2">
                  {groups.flatMap(
                    (c) =>
                      a.trends
                        .find((s) => s.key === c.key)
                        ?.points.map((p) => {
                          const id = a.rows.find(
                            (r) =>
                              r.status === "valid" &&
                              r.cohortKey === c.key &&
                              r.observedAt?.startsWith(p.day),
                          )?.sampleId;
                          return (
                            <button
                              className="button w-full justify-between text-left text-xs"
                              key={c.key + p.day}
                              disabled={!id}
                              onClick={() => id && openEvidence(id, c.key)}
                            >
                              {p.day} · {label(c)}{" "}
                              <span>
                                {pct(p)} ({ratio(p)})
                              </span>
                            </button>
                          );
                        }) || [],
                  )}
                </div>
              </details>
            )}
            <p className="muted mt-2 text-xs">
              {metric === "position"
                ? t(
                    "跟踪品牌在正文中的首次出现序，不代表推荐排名。条长为首次出现序的倒数。",
                    "First appearance among tracked brands, not recommendation rank. Bar length is its reciprocal.",
                  )
                : metric === "sov"
                  ? t(
                      "只统计本轮已跟踪品牌的提及份额。",
                      "Only brands tracked in this run.",
                    )
                  : t(
                      "不同模型、通道、协议和题型分别统计，未知不记为零。",
                      "Models, channels, protocols and question types remain separate. Unknown is not zero.",
                    )}
            </p>
          </div>
        </section>
        <section className="panel overflow-hidden">
          <div className="panel-head">
            <h2>{t("品牌表现", "Tracked brands")}</h2>
            <span className="badge">{t("独立分组", "By cohort")}</span>
          </div>
          <div className="px-5 py-3">
            <label className="field text-xs">
              {t("比较范围", "Comparison cohort")}
              <select
                className="input"
                value={selected?.key || ""}
                onChange={(e) => setCohort(e.target.value)}
              >
                {groups.map((c, i) => (
                  <option value={c.key} key={c.key}>
                    {i + 1}. {label(c)} · {intentLabel(c.intent, lang)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table className="cohort-table">
              <thead>
                <tr>
                  <th>{t("品牌", "Brand")}</th>
                  <th className="text-right">{t("提及率", "Mentions")}</th>
                  <th className="text-right">{t("出现序", "Position")}</th>
                  <th className="text-right">{t("份额", "Share")}</th>
                </tr>
              </thead>
              <tbody>
                {selected?.brands.map((b, i) => (
                  <tr key={b.brandId} className="hover:bg-stone-50">
                    <td>
                      <button
                        className="flex min-h-10 items-center gap-2 text-left"
                        onClick={() =>
                          b.eligibleObservationIds[0] &&
                          openEvidence(
                            b.eligibleObservationIds[0],
                            selected.key,
                          )
                        }
                      >
                        <span className="number text-xs text-stone-400">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-xs font-semibold">
                          {b.name.slice(0, 1)}
                        </span>
                        <span className="break-words font-medium">
                          {b.name}
                          {b.isOwn && (
                            <span className="ml-2 text-xs font-normal text-stone-500">
                              {t("本品牌", "You")}
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="number text-right">
                      {pct(b.visibility)}
                      <div className="muted text-xs">{ratio(b.visibility)}</div>
                    </td>
                    <td className="number text-right">
                      {b.position.value?.toFixed(1) ?? "UNKNOWN"}
                    </td>
                    <td className="number text-right">{pct(b.sov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!selected && (
            <div className="empty">{t("没有有效分组", "No valid cohorts")}</div>
          )}
          <p className="muted px-5 py-4 text-xs">
            {t(
              "跟踪范围内比较，不能推导全市场份额或推荐排名。",
              "Within tracked brands only. This is not market share or recommendation rank.",
            )}
          </p>
        </section>
      </div>
      {diagnosis && (
        <section className="panel">
          <div className="panel-head">
            <h2>{t("本轮发现与下一步", "Findings and next steps")}</h2>
            <button className="link" onClick={onActions}>
              {t("查看行动", "Review actions")}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <p className="text-base font-medium leading-relaxed">
                {diagnosis.conclusion}
              </p>
              <p className="muted mt-3">{diagnosis.nextStep}</p>
            </div>
            <div className="space-y-4">
              {diagnosis.findings?.slice(0, 2).map((f: any) => (
                <article
                  key={f.id}
                  className="border-b border-stone-100 pb-4 last:border-0"
                >
                  <h3 className="break-words">{f.title}</h3>
                  <p className="muted mt-1">{f.detail}</p>
                  {f.sampleId && (
                    <button
                      className="link mt-2"
                      onClick={() => openEvidence(f.sampleId, f.id)}
                    >
                      {t("核对原文", "Read answer")}
                      <ChevronRight size={14} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("问题覆盖", "Question coverage")}</h2>
            <p className="muted mt-1 text-xs">
              {a.questions.length}{" "}
              {t("个问题，按主题展开核对回答", "questions, grouped by topic")}
            </p>
          </div>
          <label className="relative w-full sm:w-60">
            <Search
              size={15}
              className="absolute left-3 top-3 text-stone-500"
            />
            <input
              className="input pl-9"
              aria-label={t("搜索覆盖问题", "Search covered prompts")}
              placeholder={t("搜索问题或主题", "Search prompts or topics")}
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
            />
          </label>
        </div>
        {topics.map(({ topic, questions }) => (
          <details
            className="topic-row border-b border-stone-200 last:border-0"
            key={topic}
          >
            <summary>
              <ChevronRight
                className="topic-chevron shrink-0 text-stone-500"
                size={16}
              />
              <span className="min-w-0 flex-1 break-words font-medium">
                {intentLabel(topic, lang)}
              </span>
              <span className="number shrink-0 text-xs text-stone-600">
                {questions.length} {t("题", "prompts")}
              </span>
              <span className="number shrink-0 rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-700">
                {questions.filter((q) => q.valid > 0).length}/{questions.length}{" "}
                {t("已覆盖", "covered")}
              </span>
            </summary>
            <div className="table-wrap border-t border-stone-200">
              <table>
                <thead>
                  <tr>
                    <th className="w-3/5">{t("监测问题", "Prompt")}</th>
                    <th className="text-right">
                      {t("有效 / 计划", "Valid / planned")}
                    </th>
                    <th className="text-right">
                      {t("提及回答数", "Mentioned answers")}
                    </th>
                    <th>{t("证据", "Evidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.queryId + q.question}>
                      <td className="min-w-[230px]">{q.question}</td>
                      <td className="number text-right">
                        {q.valid}/{q.planned}
                      </td>
                      <td className="number text-right">{q.mentioned}</td>
                      <td>
                        {q.sampleIds[0] && (
                          <button
                            className="link min-h-10 whitespace-nowrap"
                            onClick={() => openEvidence(q.sampleIds[0])}
                          >
                            {t("查看回答", "Read answer")}
                            <ArrowUpRight size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {!topics.length && (
          <div className="empty">
            <p>
              {questionSearch
                ? t("没有匹配的问题", "No matching prompts")
                : t("当前范围没有监测问题", "No prompts in this scope")}
            </p>
            {questionSearch && (
              <button
                className="link mt-3 min-h-10"
                onClick={() => setQuestionSearch("")}
              >
                {t("清除搜索", "Clear search")}
              </button>
            )}
          </div>
        )}
      </section>
      <details className="text-xs text-stone-600">
        <summary className="min-h-10">
          {t("数据范围与统计口径", "Scope and methodology")}
        </summary>
        <div className="space-y-2 rounded-lg bg-stone-50 p-4">
          <p>
            {a.quality.planBasis === "frozen-units"
              ? t("本轮已冻结采样计划。", "Frozen measurement plan stored.")
              : t(
                  "未保存冻结计划，覆盖仅描述已有记录，原始覆盖未知。",
                  "No frozen plan stored. Coverage describes saved records; original coverage is unknown.",
                )}
          </p>
          <p>
            {t(
              "本页来自已保存回答，不新增模型调用。情绪、搜索量、转化和因果提升尚未核验。",
              "Computed from saved answers without new model calls. Sentiment, volume, conversion and causal uplift remain unverified.",
            )}
          </p>
          <p>{a.metrics.formulas.visibility}</p>
        </div>
      </details>
    </div>
  );
}
export function Sources({
  analysis: a,
  lang,
  openEvidence,
}: Pick<Props, "analysis" | "lang" | "openEvidence">) {
  const [level, setLevel] = useState<"domains" | "urls">("domains"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [sort, setSort] = useState<{
      key: "source" | "citationCount";
      direction: "asc" | "desc";
    }>({ key: "citationCount", direction: "desc" });
  const t = (z: string, e: string) => (lang === "en" ? e : z);
  const groups = a.sources.cohorts;
  useEffect(() => {
    setPage(1);
  }, [a.runId, JSON.stringify(a.filter), level, search]);
  const allRows = groups.flatMap((g) =>
    g[level].map((d) => ({ group: g, source: d })),
  );
  const rows = allRows
    .filter(({ source: d }) =>
      d.source.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((left, right) => {
      const comparison =
        sort.key === "source"
          ? left.source.source.localeCompare(right.source.source)
          : left.source.citationCount - right.source.citationCount;
      return (
        (sort.direction === "asc" ? 1 : -1) * comparison ||
        left.source.source.localeCompare(right.source.source)
      );
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pageCount);
  const shown = rows.slice((currentPage - 1) * 10, currentPage * 10);
  const sortColumn = (key: "source" | "citationCount") => {
    setSort((value) => ({
      key,
      direction:
        value.key === key && value.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };
  const sortIcon = (key: string) =>
    sort.key === key ? (
      sort.direction === "asc" ? (
        <ArrowUp size={13} />
      ) : (
        <ArrowDown size={13} />
      )
    ) : (
      <span aria-hidden="true" className="text-stone-400">
        ↕
      </span>
    );
  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="panel-head">
          <h2>{t("信源分布", "Source distribution")}</h2>
          <span className="badge">{t("按测量组分开", "Separate cohorts")}</span>
        </div>
        <div
          className={
            groups.some((g) => g.domains.length)
              ? "grid gap-6 p-5 md:grid-cols-2"
              : "hidden"
          }
        >
          {groups
            .filter((g) => g.domains.length)
            .slice(0, 4)
            .map((g) => (
              <div className="min-w-0" key={g.key}>
                <h3 className="break-words">
                  {g.model} · {g.origin}
                </h3>
                <p className="muted mt-1 break-all text-xs">
                  {g.protocolId} ·{" "}
                  {g.branded ? t("点名", "Branded") : t("非点名", "Unbranded")}
                </p>
                <div className="mt-4 space-y-3">
                  {g.domains.slice(0, 5).map((d, i) => (
                    <button
                      key={`${d.source}-${d.kind}-${i}`}
                      className="block w-full text-left"
                      onClick={() =>
                        d.sampleIds[0] && openEvidence(d.sampleIds[0], g.key)
                      }
                    >
                      <span className="flex justify-between gap-3 text-xs">
                        <span className="break-all">{d.source}</span>
                        <strong className="number">{d.citationCount}</strong>
                      </span>
                      <span className="mt-1.5 block h-1.5 rounded bg-stone-100">
                        <span
                          className="block h-1.5 rounded bg-emerald-700"
                          style={{
                            width: `${(d.citationShare.value ?? 0) * 100}%`,
                          }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
        {!groups.some((g) => g.domains.length) && (
          <div className="empty">
            <FileText className="mx-auto mb-3 text-stone-400" size={24} />
            {t(
              "本轮没有保存可比较的引用。引用缺失不代表模型没有检索。",
              "No comparable citations saved. Missing citations do not establish that no search occurred.",
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <SegmentedControl
            label={t("信源层级", "Source level")}
            value={level}
            options={[
              { value: "domains", label: t("域名", "Domains") },
              { value: "urls", label: "URLs" },
            ]}
            onChange={(value) => setLevel(value as "domains" | "urls")}
          />
          <label className="relative max-w-xs">
            <span className="sr-only">{t("搜索信源", "Search sources")}</span>
            <Search size={15} className="absolute left-3 top-3" />
            <input
              className="input pl-9"
              aria-label={t("搜索信源", "Search sources")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("搜索来源", "Search sources")}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th
                  aria-sort={
                    sort.key === "source"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    className="flex min-h-10 items-center gap-2"
                    onClick={() => sortColumn("source")}
                  >
                    {t("来源", "Source")}
                    {sortIcon("source")}
                  </button>
                </th>
                <th>{t("类型 / 完整性", "Type / integrity")}</th>
                <th
                  aria-sort={
                    sort.key === "citationCount"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className="text-right"
                >
                  <button
                    className="ml-auto flex min-h-10 items-center gap-2"
                    onClick={() => sortColumn("citationCount")}
                  >
                    {t("引用项", "Items")}
                    {sortIcon("citationCount")}
                  </button>
                </th>
                <th>{t("实际通道 / 模型", "Channel / model")}</th>
                <th>{t("证据", "Evidence")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ group: g, source: d }, i) => (
                <tr
                  className="da-source hover:bg-stone-50"
                  key={`${g.key}-${d.source}-${d.kind}-${d.integrity}-${i}`}
                >
                  <td className="min-w-[200px] max-w-md break-all font-medium">
                    {d.source}
                  </td>
                  <td className="text-xs">
                    {d.kind}
                    <br />
                    <span className="muted">{d.integrity}</span>
                  </td>
                  <td className="number text-right">{d.citationCount}</td>
                  <td className="max-w-60 break-words text-xs">
                    <span className="badge">{g.origin.toUpperCase()}</span>
                    <p className="muted mt-1">{g.model}</p>
                    <p className="muted mt-1">
                      {g.branded
                        ? t("点名", "Branded")
                        : t("非点名", "Unbranded")}{" "}
                      · {g.intent}
                    </p>
                  </td>
                  <td>
                    {d.sampleIds[0] && (
                      <button
                        className="link min-h-10 whitespace-nowrap"
                        onClick={() => openEvidence(d.sampleIds[0], g.key)}
                      >
                        {t("查看原文", "Read answer")}
                        <ExternalLink size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <Search
                        className="mx-auto mb-3 text-stone-400"
                        size={22}
                      />
                      <p className="font-medium text-stone-900">
                        {search
                          ? t("没有匹配的信源", "No matching sources")
                          : t(
                              "当前范围没有信源记录",
                              "No source records in this scope",
                            )}
                      </p>
                      <p className="mt-1">
                        {search
                          ? t(
                              "试试其他域名或清除搜索。",
                              "Try another domain or clear the search.",
                            )
                          : t(
                              "保存带引用的回答后，可在这里查看来源。",
                              "Sources appear when saved answers include citations.",
                            )}
                      </p>
                      {search && (
                        <button
                          className="button mt-4"
                          onClick={() => setSearch("")}
                        >
                          {t("清除搜索", "Clear search")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-5 py-3">
          <p className="number text-xs text-stone-600" role="status">
            {rows.length
              ? `${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, rows.length)} / ${rows.length}`
              : `0 / ${allRows.length}`}{" "}
            {t("条分组信源", "cohort source records")}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="button text-xs"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("上一页", "Previous")}
            </button>
            <span className="number px-2 text-xs">
              {currentPage} / {pageCount}
            </span>
            <button
              className="button text-xs"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("下一页", "Next")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
