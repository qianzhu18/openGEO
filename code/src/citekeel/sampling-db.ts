import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRun } from './types.js';

/** New queue-enabled runs only. Existing JSON remains readable and is never migrated in place. */
export class SamplingDatabase {
  private db: DatabaseSync;
  constructor(root:string) {
    mkdirSync(root,{recursive:true,mode:0o700});
    const path=join(root,'sampling.sqlite');this.db=new DatabaseSync(path);chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, unit_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
        state TEXT NOT NULL, attempts INTEGER NOT NULL, next_at TEXT, lease_token TEXT, payload TEXT NOT NULL, UNIQUE(run_id,unit_id));
      CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state,next_at);
      CREATE TABLE IF NOT EXISTS submissions (project_id TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, run_id TEXT NOT NULL, PRIMARY KEY(project_id, request_key));
      CREATE TABLE IF NOT EXISTS worker (slot INTEGER PRIMARY KEY CHECK(slot=1), pid INTEGER NOT NULL, token TEXT NOT NULL);`);
  }
  save(run:AgentRun) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (run.submission) this.db.prepare('INSERT INTO submissions VALUES (?,?,?,?) ON CONFLICT(project_id,request_key) DO NOTHING').run(run.projectId,run.submission.key,run.submission.fingerprint,run.id);
      if (run.submission && this.submission(run.projectId,run.submission.key)?.run_id!==run.id) throw new Error('提交标识已存在，请查询原任务');
      this.db.prepare('INSERT INTO runs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot').run(run.id,run.projectId,JSON.stringify(run));
      const upsert=this.db.prepare(`INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,attempts=excluded.attempts,next_at=excluded.next_at,lease_token=excluded.lease_token,payload=excluded.payload WHERE jobs.fingerprint=excluded.fingerprint`);
      for(const job of run.samplingQueue!.jobs) {
        const previous=this.db.prepare('SELECT fingerprint FROM jobs WHERE run_id=? AND unit_id=?').get(run.id,job.unitId) as {fingerprint:string}|undefined;
        if(previous && previous.fingerprint!==job.fingerprint) throw new Error('冻结任务协议不一致，拒绝覆盖任务');
        upsert.run(job.id,run.id,job.unitId,job.fingerprint,job.state,job.attempts,job.nextAttemptAt||null,job.leaseToken||null,JSON.stringify(job));
      }
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  submission(projectId:string,key:string) { return this.db.prepare('SELECT run_id,fingerprint FROM submissions WHERE project_id=? AND request_key=?').get(projectId,key) as {run_id:string;fingerprint:string}|undefined; }
  get(id:string):AgentRun|null {const row=this.db.prepare('SELECT snapshot FROM runs WHERE id=?').get(id) as {snapshot:string}|undefined;return row?JSON.parse(row.snapshot):null;}
  ids():string[]{return (this.db.prepare('SELECT id FROM runs').all() as {id:string}[]).map(r=>r.id);}
  acquire(token:string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row=this.db.prepare('SELECT pid,token FROM worker WHERE slot=1').get() as {pid:number;token:string}|undefined;
      if(row && row.token!==token) {let alive=true;try{process.kill(row.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}if(alive)throw new Error('此数据目录已有本地服务，拒绝启动第二个采样 worker');}
      this.db.prepare('INSERT OR REPLACE INTO worker VALUES (1,?,?)').run(process.pid,token);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  release(token:string){this.db.prepare('DELETE FROM worker WHERE token=?').run(token);}
  close(){this.db.close();}
}
