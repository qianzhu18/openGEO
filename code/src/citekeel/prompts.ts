import { createHash, randomUUID } from 'node:crypto';
import { Store } from './storage.js';
import type { Project, Query } from './types.js';
import { parseQuestionSet } from './question-set.js';
export class WorkspaceError extends Error {
  constructor(message: string, readonly code = 'INVALID_INPUT', readonly status = 400) { super(message); }
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(value:unknown,label:string,max=2000):string {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new WorkspaceError(`Invalid ${label}.`);
  return value.trim();
}
const status=(q:Query)=>q.status||'active';
function version(project:Project,expected:unknown){if(expected!==project.queryVersion)throw new WorkspaceError('The question library changed. Refresh before saving.','STALE_REVISION',409);}
function country(value:unknown,project:Project){const result=value??project.country??'US';if(typeof result!=='string'||!['US','GB','CA','AU'].includes(result))throw new WorkspaceError('Select a supported target market.');return result;}
function topic(value:unknown,project:Project){if(value===undefined||value===null||value==='')return undefined;if(typeof value!=='string'||!project.topics?.some(t=>t.id===value))throw new WorkspaceError('Unknown topic.');return value;}
export class PromptService {
  constructor(private store:Store){}
  async list(projectId:string,filter:{status?:string;search?:string;topicId?:string;page?:number;pageSize?:number}={}){
    const project=await this.store.get<Project>('projects',projectId);if(!project)throw new WorkspaceError('Project not found.','NOT_FOUND',404);
    const counts={active:0,suggested:0,inactive:0};for(const q of project.queries)counts[status(q)]++;
    const search=(filter.search||'').toLowerCase();
    const rows=project.queries.filter(q=>(!filter.status||status(q)===filter.status)&&(!filter.topicId||q.topicId===filter.topicId)&&(!search||q.text.toLowerCase().includes(search)));
    const pageSize=Math.max(1,Math.min(100,Number(filter.pageSize)||50)),page=Math.max(1,Math.floor(Number(filter.page)||1));
    return {items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize,counts,version:project.queryVersion,topics:project.topics||[]};
  }
  async add(projectId:string,input:{texts:unknown;status?:unknown;topicId?:unknown;country?:unknown;expectedVersion:unknown;requestId:unknown}){
    const texts=parseQuestionSet(input.texts,{min:1,max:100,maxLength:2000}).questions;
    const requestId=text(input.requestId,'request ID',100),fingerprint=hash({...input,texts});
    const change=await this.store.updateProject(projectId,project=>{
      const old=project.promptChanges?.find(c=>c.requestId===requestId);
      if(old){if(old.fingerprint!==fingerprint)throw new WorkspaceError('Request ID reused with different input.','IDEMPOTENCY_CONFLICT',409);return {ids:old.ids,version:old.version};}
      version(project,input.expectedVersion);
      const desired=input.status??'active';if(desired!=='active'&&desired!=='suggested')throw new WorkspaceError('New prompts must be active or suggested.');
      const topicId=topic(input.topicId,project),target=country(input.country,project),now=new Date().toISOString();
      const ids:string[]=[];
      for(const value of texts){
        const found=project.queries.find(q=>q.text.toLowerCase()===value.toLowerCase()&&(q.country||project.country||'US')===target);
        if(found){ids.push(found.id);continue;}
        const q:Query={id:`prompt-${randomUUID()}`,text:value,intent:'informational',branded:[project.brand,...project.aliases].some(a=>a&&value.toLowerCase().includes(a.toLowerCase())),origin:'User-created prompt',status:desired,topicId,country:target,language:project.language||'en',revision:1,createdAt:now,updatedAt:now};
        project.queries.push(q);ids.push(q.id);
      }
      project.queryVersion++;
      project.promptChanges=[...(project.promptChanges||[]),{requestId,fingerprint,ids,version:project.queryVersion}].slice(-100);
      return {ids,version:project.queryVersion};
    });
    return {project:change.project,...change.result};
  }
  async edit(projectId:string,id:string,input:{text?:unknown;intent?:unknown;topicId?:unknown;country?:unknown;expectedRevision:unknown}){
    const change=await this.store.updateProject(projectId,project=>{
      const query=project.queries.find(q=>q.id===id);if(!query)throw new WorkspaceError('Prompt not found.','NOT_FOUND',404);
      if(input.expectedRevision!==(query.revision||1))throw new WorkspaceError('This prompt changed. Refresh before editing.','STALE_REVISION',409);
      const value=input.text===undefined?query.text:parseQuestionSet([input.text],{min:1,max:1,maxLength:2000}).questions[0]!;
      const intent=input.intent===undefined?query.intent:text(input.intent,'intent',80);
      const topicId=input.topicId===undefined?query.topicId:topic(input.topicId,project),target=country(input.country??query.country,project),now=new Date().toISOString();
      const changed=value!==query.text||target!==(query.country||project.country||'US');
      if(changed&&project.queries.some(q=>q.id!==id&&q.text.toLowerCase()===value.toLowerCase()&&(q.country||project.country||'US')===target))throw new WorkspaceError('This question already exists in the selected market.');
      const next:Query={...query,text:value,intent,topicId,country:target,revision:(query.revision||1)+1,updatedAt:now};
      if(changed){query.status='inactive';query.revision=(query.revision||1)+1;query.updatedAt=now;next.id=`prompt-${randomUUID()}`;next.previousVersionId=id;next.revision=1;next.createdAt=now;next.branded=[project.brand,...project.aliases].some(a=>a&&value.toLowerCase().includes(a.toLowerCase()));project.queries.push(next);}
      else Object.assign(query,next);
      project.queryVersion++;return next;
    });
    return {project:change.project,prompt:change.result};
  }
  async batch(projectId:string,input:{ids:unknown;operation:unknown;topicId?:unknown;expectedVersion:unknown}){
    if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>100||input.ids.some(id=>typeof id!=='string'))throw new WorkspaceError('Select 1–100 prompts.');
    const ids=new Set<string>(input.ids);
    const change=await this.store.updateProject(projectId,project=>{
      version(project,input.expectedVersion);
      const queries=project.queries.filter(q=>ids.has(q.id));if(queries.length!==ids.size)throw new WorkspaceError('Unknown prompts in selection.');
      if(!['track','untrack','assign-topic'].includes(String(input.operation)))throw new WorkspaceError('Unknown bulk operation.');
      const topicId=input.operation==='assign-topic'?topic(input.topicId,project):undefined;
      for(const query of queries){if(input.operation==='assign-topic')query.topicId=topicId;else query.status=input.operation==='track'?'active':'inactive';query.revision=(query.revision||1)+1;query.updatedAt=new Date().toISOString();}
      project.queryVersion++;return queries;
    });return {project:change.project,prompts:change.result};
  }
  async addTopic(projectId:string,input:{name:unknown;expectedVersion:unknown}){
    const name=text(input.name,'topic',120);
    const change=await this.store.updateProject(projectId,project=>{version(project,input.expectedVersion);const existing=project.topics?.find(t=>t.name.toLowerCase()===name.toLowerCase());if(existing)return existing;const value={id:`topic-${randomUUID()}`,name,sourceIds:[]};(project.topics??=[]).push(value);project.queryVersion++;return value;});return {project:change.project,topic:change.result};
  }
  async settings(projectId:string,input?:{hiddenColumns:unknown;deltaDisplay:unknown;expectedVersion:unknown}){
    if(!input){const p=await this.store.get<Project>('projects',projectId);if(!p)throw new WorkspaceError('Project not found.','NOT_FOUND',404);return p.tableSettings||{hiddenColumns:[],deltaDisplay:'full',version:1};}
    const allowed=['answers','visibility','excluded','intent','location','status','topic','position','sov','sentiment'];
    if(!Array.isArray(input.hiddenColumns)||input.hiddenColumns.some(c=>typeof c!=='string'||!allowed.includes(c))||!['full','icon','none'].includes(String(input.deltaDisplay)))throw new WorkspaceError('Invalid table settings.');
    return (await this.store.updateProject(projectId,p=>{const old=p.tableSettings||{hiddenColumns:[],deltaDisplay:'full',version:1};if(old.version!==input.expectedVersion)throw new WorkspaceError('Table settings changed. Refresh first.','STALE_REVISION',409);p.tableSettings={hiddenColumns:[...new Set(input.hiddenColumns as string[])],deltaDisplay:input.deltaDisplay as 'full'|'icon'|'none',version:old.version+1};return p.tableSettings;})).result;
  }
}
