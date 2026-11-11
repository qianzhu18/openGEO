import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const path = process.env.OPENGEO_HOST_WORKER_TOKEN_FILE || 'data/docker-worker/token';
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
try {
  await writeFile(path, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
}
console.log('OpenGEO browser worker token is ready locally. The token is not displayed or committed.');
console.log('Start the optional bridge: docker compose -f compose.yaml -f compose.browser.yaml up --build');
console.log('Then, on the host: npm run browser:worker');
