import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
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
      if (await this.deleted(kind === 'projects' ? value.id : (value as unknown as { projectId?: string }).projectId)) throw new Error('项目已删除，请先恢复项目');
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
    try {
      const value = JSON.parse(await readFile(this.path(kind, id), 'utf8'));
      if (await this.deleted(kind === 'projects' ? id : value.projectId)) return null;
      return value as T;
    }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  async list<T>(kind: 'projects' | 'runs' | 'researches'): Promise<T[]> {
    const names = await readdir(join(this.root, kind)).catch(() => [] as string[]);
    return (await Promise.all(names.filter(n => n.endsWith('.json')).map(n => this.get<T>(kind, n.slice(0, -5))))).filter(Boolean) as T[];
  }
  async updateProject<T>(id: string, work: (project: Project) => T | Promise<T>, persist = true): Promise<{ project: Project; result: T }> {
    const previous = this.projectQueues.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      const project = await this.get<Project>('projects', id);
      if (!project) throw new Error('Project not found.');
      const result = await work(project);
      project.updatedAt = new Date().toISOString();
      if (persist) await this.save('projects', project);
      return { project, result };
    });
    this.projectQueues.set(id, current);
    try { return await current; }
    finally { if (this.projectQueues.get(id) === current) this.projectQueues.delete(id); }
  }
  private async deleted(projectId?: string): Promise<boolean> {
    if (!projectId) return false;
    try { await readFile(this.path('deleted-projects', projectId)); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
  async deleteProject(id: string) {
    return this.updateProject(id, async project => {
      const runs = (await this.list<AgentRun>('runs')).filter(run => run.projectId === id);
      if (runs.some(run => ['queued', 'running'].includes(run.status))) throw new Error('项目正在执行，请等待结束后删除');
      const work = this.queue.catch(() => {}).then(async () => {
        const marker = this.path('deleted-projects', id);
        await mkdir(join(this.root, 'deleted-projects'), { recursive: true });
        await writeFile(marker, JSON.stringify({ id, name: project.name, deletedAt: new Date().toISOString() }), { mode: 0o600 });
      });
      this.queue = work; await work;
      return { deleted: true };
    }, false);
  }
  async deletedProjects() {
    const names = await readdir(join(this.root, 'deleted-projects')).catch(() => [] as string[]);
    return Promise.all(names.filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(this.root, 'deleted-projects', name), 'utf8'))));
  }
  async restoreProject(id: string) {
    await unlink(this.path('deleted-projects', id));
    return this.get<Project>('projects', id);
  }
  async initialize(projects: Project[]) {
    for (const project of projects) if (!await this.deleted(project.id) && !await this.get('projects', project.id)) await this.save('projects', project);
    for (const run of await this.list<AgentRun>('runs')) {
      if (run.status === 'running' || run.status === 'queued') {
        run.status = 'interrupted'; run.error = '上次进程在执行中退出，已保留完成的步骤与原文。可重新创建一轮。';
        for (const step of run.steps) if (step.status === 'running') step.status = 'failed';
        await this.save('runs', run);
      }
    }
  }
}
