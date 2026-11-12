import type { MeasurementTarget } from './types.js';

export interface DiagnosisRoute extends MeasurementTarget { collectionNote: string; collectionNoteEn: string }

/** Resolve once for a new run; resumes use its persisted targets, never these defaults. */
export function diagnosisRoutes(env: Record<string, string | undefined> = process.env): DiagnosisRoute[] {
  return [
    ...(['chatgpt', 'gemini'] as const).map((engine): DiagnosisRoute => ({
      id: engine, platform: engine === 'chatgpt' ? 'ChatGPT' : 'Gemini', preferredChannel: 'api', provider: 'cloro', model: engine,
      webSearch: false, searchMode: 'disabled', browserPreference: 'api_only',
      observationCountry: 'SG',
      failureFallback: { version: 'api-route/v2', provider: 'openrouter', model: engine === 'chatgpt'
        ? env.OPENGEO_CHATGPT_API_MODEL || 'openai/gpt-6-luna'
        : env.OPENGEO_GEMINI_API_MODEL || 'google/gemini-3.8-flash' },
      collectionNote: 'Cloro 新加坡（SG）远程网页监测；确认失败后降级 OpenRouter 模型 API（不搜索）。原任务状态不明时先核对；两类结果分协议展示。',
      collectionNoteEn: 'Cloro remote monitoring from Singapore (SG); confirmed failure falls back to OpenRouter model API without search. Unresolved remote tasks require reconciliation. Protocols stay separate.',
    })),
    ...([
      ['deepseek', 'DeepSeek', 'OPENGEO_DEEPSEEK_MODEL', 'deepseek/deepseek-v4.1-flash'],
      ['qwen', '千问', 'OPENGEO_QWEN_MODEL', 'qwen/qwen3.8-flash'],
      ['seed', '豆包 Seed', 'OPENGEO_SEED_MODEL', 'bytedance-seed/seed-2-1-turbo'],
    ] as const).map(([id, platform, key, model]): DiagnosisRoute => ({
      id, platform, preferredChannel: 'api', provider: 'openrouter', model: env[key] || model,
      webSearch: false, searchMode: 'disabled', browserPreference: 'api_only',
      collectionNote: 'OpenRouter 模型 API 直接采样，默认不搜索；不代表消费级网页表现。',
      collectionNoteEn: 'Direct OpenRouter model API; search is off by default. This does not measure the consumer web interface.',
    })),
  ];
}

export function apiFallbackNote(target: MeasurementTarget, en = false): string | undefined {
  if (target.failureFallback) return en
    ? `${target.platform}: Cloro observation country ${target.observationCountry}; confirmed failures may use ${target.failureFallback.provider}/${target.failureFallback.model}. Actual attempts are retained separately. Model API fallback does not measure the web interface or enforce a geographic region.`
    : `${target.platform}：Cloro 采样地区 ${target.observationCountry}；确认失败后可降级 ${target.failureFallback.provider}/${target.failureFallback.model}。各次尝试独立留证；模型 API 补测不代表网页表现，亦不保证采样地区。`;
  if (!target.apiFallback) return undefined;
  return en
    ? `${target.platform}: preselected API fallback from ${target.apiFallback.fromProvider}/${target.apiFallback.fromModel} to ${target.provider}/${target.model}; no primary request in this unit. Model API results do not measure the ChatGPT web interface and cannot be compared as the same protocol.`
    : `${target.platform}：预设从 ${target.apiFallback.fromProvider}/${target.apiFallback.fromModel} 降级到 ${target.provider}/${target.model}，本单元不发送原入口请求。模型 API 补测不代表 ChatGPT 网页表现，协议变化后不能直接比较。`;
}
