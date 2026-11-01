import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentRun, Project } from './types.js';

export class Store {
  readonly root: string;
  private queue: Promise<unknown> = Promise.resolve();
  private projectQueues = new Map<string, Promise<unknown>>();
  constructor(root = process.env.CITEKEEL_DATA_DIR || 'data/citekeel') { this.root = resolve(root); }
  private path(kind: string, id: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('无效的记录 ID');
    return join(this.root, kind, `${id}.json`);
  }
  async save<T extends { id: string }>(kind: 'projects' | 'runs' | 'researches', value: T): Promise<void> {
    const copy = JSON.stringify(value, null, 2);
    const work = this.queue.catch(() => {}).then(async () => {
      const dest = this.path(kind, value.id);
      await mkdir(join(this.root, kind), { recursive: true });
      const temp = `${dest}.${randomUUID()}.tmp`;
      await writeFile(temp, copy + '\n', { mode: 0o600 });
      await rename(temp, dest);
    });
    this.queue = work;
    await work;
  }
  async get<T>(kind: 'projects' | 'runs' | 'researches', id: string): Promise<T | null> {
    try { return JSON.parse(await readFile(this.path(kind, id), 'utf8')) as T; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  async list<T>(kind: 'projects' | 'runs' | 'researches'): Promise<T[]> {
    const names = await readdir(join(this.root, kind)).catch(() => [] as string[]);
    return (await Promise.all(names.filter(n => n.endsWith('.json')).map(n => this.get<T>(kind, n.slice(0, -5))))).filter(Boolean) as T[];
  }
  async updateProject<T>(id: string, work: (project: Project) => T | Promise<T>): Promise<{ project: Project; result: T }> {
    const previous = this.projectQueues.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      const project = await this.get<Project>('projects', id);
      if (!project) throw new Error('Project not found.');
      const result = await work(project);
      project.updatedAt = new Date().toISOString();
      await this.save('projects', project);
      return { project, result };
    });
    this.projectQueues.set(id, current);
    try { return await current; }
    finally { if (this.projectQueues.get(id) === current) this.projectQueues.delete(id); }
  }
  async initialize(projects: Project[]) {
    for (const project of projects) if (!await this.get('projects', project.id)) await this.save('projects', project);
    for (const run of await this.list<AgentRun>('runs')) {
      if (run.status === 'running' || run.status === 'queued') {
        run.status = 'interrupted'; run.error = '上次进程在执行中退出，已保留完成的步骤与原文。可重新创建一轮。';
        for (const step of run.steps) if (step.status === 'running') step.status = 'failed';
        await this.save('runs', run);
      }
    }
  }
}
