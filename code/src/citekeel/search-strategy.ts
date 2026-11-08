import type { Project, Query } from './types.js';

export type SearchMode = 'provider_native' | 'browser_ui' | 'disabled';

export interface SearchPolicy {
  mode: SearchMode;
  requested: boolean;
  language: string;
  requestedCountry: string;
  queryStrategy: 'original_question';
  note: string;
}

/**
 * Keep search policy separate from the question text. The observation model
 * receives the original prompt; the policy only controls the adapter and is
 * persisted for replay and comparison.
 */
export function searchPolicy(project: Project, query: Query, mode: SearchMode): SearchPolicy {
  const requested = mode !== 'disabled';
  const channel = mode === 'browser_ui' ? '网页界面' : mode === 'provider_native' ? 'Provider 原生搜索' : '未启用搜索';
  return {
    mode,
    requested,
    language: project.language || query.language || 'unknown',
    requestedCountry: project.country || query.country || 'unknown',
    queryStrategy: 'original_question',
    note: `${channel}；只发送冻结后的原始问题，不把品牌事实、策略或内容草稿注入采样上下文。`,
  };
}

export function searchPolicyId(policy: SearchPolicy): string {
  return `mode=${policy.mode};requested=${policy.requested};language=${policy.language};country=${policy.requestedCountry};query=original_question`;
}
