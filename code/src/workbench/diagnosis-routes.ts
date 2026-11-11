import type { MeasurementTarget } from './types.js';

export interface DiagnosisRoute extends MeasurementTarget { collectionNote: string; collectionNoteEn: string }

/** Resolve once for a new run; resumes use its persisted targets, never these defaults. */
export function diagnosisRoutes(env: Record<string, string | undefined> = process.env): DiagnosisRoute[] {
  return [
    {
      id: 'chatgpt', platform: 'ChatGPT', preferredChannel: 'api', provider: 'openrouter',
      model: env.OPENGEO_CHATGPT_API_MODEL || 'openai/gpt-6-luna',
      webSearch: false, searchMode: 'disabled', browserPreference: 'api_only',
      apiFallback: { version: 'api-route/v1', mode: 'configured', fromProvider: 'cloro', fromModel: 'chatgpt', reason: 'upstream_unavailable' },
      collectionNote: '已预设从 Cloro 降级到 OpenRouter 模型 API，本轮不请求 Cloro ChatGPT；默认不搜索，不代表 ChatGPT 网页表现。',
      collectionNoteEn: 'Preselected OpenRouter model API fallback; this run does not call Cloro ChatGPT. Search is off by default. This is not a ChatGPT web observation.',
    },
    {
      id: 'gemini', platform: 'Gemini', preferredChannel: 'api', provider: 'cloro', model: 'gemini',
      webSearch: false, searchMode: 'disabled', browserPreference: 'api_only',
      collectionNote: 'Cloro 远程网页监测 API；实际底层模型与搜索执行未知，不等同于本机网页四件套。',
      collectionNoteEn: 'Cloro remote monitoring API; actual model and search execution are unknown. This is not local browser evidence.',
    },
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
  if (!target.apiFallback) return undefined;
  return en
    ? `${target.platform}: preselected API fallback from ${target.apiFallback.fromProvider}/${target.apiFallback.fromModel} to ${target.provider}/${target.model}; no primary request in this unit. Model API results do not measure the ChatGPT web interface and cannot be compared as the same protocol.`
    : `${target.platform}：预设从 ${target.apiFallback.fromProvider}/${target.apiFallback.fromModel} 降级到 ${target.provider}/${target.model}，本单元不发送原入口请求。模型 API 补测不代表 ChatGPT 网页表现，协议变化后不能直接比较。`;
}
