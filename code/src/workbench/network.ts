import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

let route: { mode: 'direct' | 'proxy'; endpoint?: string; localBypass: boolean } = { mode: 'direct', localBypass: true };
export function networkRoute() { return { ...route }; }

/** Called after .env is loaded, before any outbound service work starts. */
export function configureNetwork(env: Record<string, string | undefined> = process.env) {
  const explicit = env.OPENGEO_PROXY_URL?.trim();
  const httpProxy = explicit || env.HTTP_PROXY || env.http_proxy;
  const httpsProxy = explicit || env.HTTPS_PROXY || env.https_proxy || httpProxy;
  if (!httpProxy && !httpsProxy) return undefined;
  for (const value of [httpProxy, httpsProxy].filter(Boolean)) {
    let url: URL;
    try { url = new URL(value!); } catch { throw new Error('代理地址无效，请配置 http://127.0.0.1:7897 形式的地址'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP 代理地址仅支持 http/https 协议');
  }
  const noProxy = ['127.0.0.1', 'localhost', '[::1]', env.NO_PROXY || env.no_proxy || ''].join(',');
  const agent = new EnvHttpProxyAgent({ httpProxy: httpProxy || httpsProxy, httpsProxy, noProxy });
  setGlobalDispatcher(agent);
  const endpoint = new URL(httpsProxy || httpProxy!);
  route = { mode: 'proxy', endpoint: `${endpoint.protocol}//${endpoint.hostname}${endpoint.port ? `:${endpoint.port}` : ''}`, localBypass: true };
  return agent;
}
