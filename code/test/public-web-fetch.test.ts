import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicWebFetcher, createPublicWebResolver } from '../vendor/niubigeo/src/utils/public-web-fetch.js';

const publicAddress = { address: '8.136.26.148', family: 4 };
const fakeAddress = { address: '198.18.0.13', family: 4 };

test('Fake-IP DNS is re-resolved over pinned HTTPS and only real public addresses reach the website', async () => {
  const queries: string[] = [];
  const resolver = createPublicWebResolver(async () => [fakeAddress], async (url, addresses) => {
    assert.equal(url.hostname, 'cloudflare-dns.com');
    assert.deepEqual(addresses, [{ address: '1.1.1.1', family: 4 }]);
    assert.equal(url.searchParams.get('name'), 'flota.cn');
    queries.push(url.searchParams.get('type')!);
    return { status: 200, contentType: 'application/dns-json', text: JSON.stringify({ Status: 0, Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: publicAddress.address }] : [] }) };
  });
  const fetcher = createPublicWebFetcher(resolver, async (url, addresses) => {
    assert.equal(url.hostname, 'flota.cn');
    assert.deepEqual(addresses, [publicAddress]);
    return { status: 200, contentType: 'text/html', text: '<title>Flota</title>' };
  });
  assert.equal((await fetcher('https://flota.cn'))?.text, '<title>Flota</title>');
  assert.deepEqual(queries.sort(), ['A', 'AAAA']);
});

test('ordinary, private, mixed and empty DNS results do not trigger external DNS queries', async () => {
  for (const addresses of [[publicAddress], [], [{ address: '10.0.0.1', family: 4 }], [publicAddress, fakeAddress], [fakeAddress, { address: '127.0.0.1', family: 4 }]]) {
    const resolver = createPublicWebResolver(async () => addresses, async () => { throw new Error('unexpected DoH request'); });
    assert.deepEqual(await resolver('example.com'), addresses);
  }
});

test('unsafe, empty, failed and redirected DoH responses never reach the website transport', async () => {
  for (const response of [
    { status: 302, contentType: 'application/dns-json', text: '{}' },
    { status: 200, contentType: 'text/html', text: '{}' },
    ...[{ Status: 3 }, { Status: 0 }, { Status: 0, Answer: [{ type: 1, data: '127.0.0.1' }] }, { Status: 0, Answer: [{ type: 1, data: publicAddress.address }, { type: 1, data: fakeAddress.address }] }].map(payload => ({ status: 200, contentType: 'application/dns-json', text: JSON.stringify(payload) })),
  ]) {
    const resolver = createPublicWebResolver(async () => [fakeAddress], async () => response);
    const fetcher = createPublicWebFetcher(resolver, async () => { assert.fail('unsafe connection'); });
    await assert.rejects(fetcher('https://flota.cn'));
  }
});

test('redirects are still revalidated after Fake-IP recovery', async () => {
  let connections = 0;
  const resolver = createPublicWebResolver(async host => host === 'flota.cn' ? [publicAddress] : [{ address: '10.0.0.1', family: 4 }]);
  const fetcher = createPublicWebFetcher(resolver, async () => { connections++; return { status: 302, location: 'https://private.example/', contentType: '', text: '' }; });
  await assert.rejects(fetcher('https://flota.cn'));
  assert.equal(connections, 1);
});
