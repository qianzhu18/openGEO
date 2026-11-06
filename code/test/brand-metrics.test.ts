import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBrandMetrics, deriveSourceMetrics, type BrandEntity } from '../src/citekeel/brand-metrics.js';
import type { Sample, Citation } from '../src/citekeel/types.js';
const brands: BrandEntity[] = [
  {id:'a',name:'Alpha',aliases:['A Product'],domains:['alpha.example'],status:'active',isOwn:true},
  {id:'b',name:'Beta',aliases:[],domains:['beta.example'],status:'active',isOwn:false},
];
function sample(id:string,answer:string, extra:Partial<Sample>={}):Sample {
  return {id,queryId:'q1',question:'Which products should I consider?',intent:'commercial',branded:false,origin:'api',model:'provider/model',observedAt:'2026-10-31T00:00:00Z',runGroup:'r1',protocolId:'api/search/v1',collectionStatus:'completed',analysisStatus:'completed',answer,citations:[],...extra};
}
const citation=(url:string,kind:Citation['kind']='provider_citation',integrity:Citation['integrity']='matched'):Citation=>({url,kind,integrity,source:'fixture'});
test('top 3 rate uses first-appearance rank and keeps failed answers out of the denominator',()=>{
  const tracked:BrandEntity[]=[
    ...brands,
    {id:'c',name:'Gamma',aliases:[],domains:[],status:'active',isOwn:false},
    {id:'d',name:'Delta',aliases:[],domains:[],status:'active',isOwn:false},
  ];
  const result=deriveBrandMetrics([
    sample('ranked','Beta, Gamma, Delta, then Alpha.'),
    sample('absent','Delta only.'),
    sample('failed','Alpha',{collectionStatus:'failed',analysisStatus:'unknown'}),
  ],tracked);
  const alpha=result.brands.find(row=>row.brandId==='a')!;
  const beta=result.brands.find(row=>row.brandId==='b')!;
  assert.equal(alpha.position.value,4);assert.equal(alpha.top1Rate.value,0);assert.equal(alpha.top3Rate.value,0);
  assert.equal(beta.top1Rate.value,.5);assert.equal(beta.top3Rate.value,.5);
  assert.equal(beta.top3Rate.numerator,1);assert.equal(beta.top3Rate.denominator,2);
  assert.equal(result.excludedObservationIds.includes('failed'),true);
});
test('SOV counts each response-brand slot once and ranks by the first actual brand position',()=>{
  const result=deriveBrandMetrics([sample('one','Beta first; Alpha is also useful. Alpha Alpha.')],brands);
  assert.equal(result.brands[0]!.sov.value,.5);assert.equal(result.brands[1]!.sov.value,.5);
  assert.equal(result.brands[0]!.position.value,2);assert.equal(result.brands[1]!.position.value,1);
  assert.equal(result.brands[1]!.top1Rate.value,1);
  const beta=result.observations[0]!.brands.find(row=>row.brandId==='b')!;
  assert.equal(beta.evidence!.matchStart,0);assert.equal(beta.evidence!.quote.slice(beta.evidence!.matchStart-beta.evidence!.start,beta.evidence!.matchEnd-beta.evidence!.start),'Beta');
});
test('a later long alias does not hide an earlier short brand name, and URL names do not count',()=>{
  const result=deriveBrandMetrics([sample('one','Alpha is first. Beta is second. A Product is an alias. See https://beta.example/Alpha')],brands);
  assert.equal(result.brands[0]!.position.value,1);assert.equal(result.brands[1]!.position.value,2);
  const urlOnly=deriveBrandMetrics([sample('two','Read https://alpha.example/Alpha for background.')],brands);
  assert.equal(urlOnly.brands[0]!.visibility.value,0);assert.equal(urlOnly.brands[0]!.position.value,null);
});
test('failed, incomplete and empty answers are excluded rather than counted as unmentioned',()=>{
  const result=deriveBrandMetrics([sample('good','Alpha'),sample('failed','',{collectionStatus:'failed',analysisStatus:'unknown'}),sample('incomplete','Alpha',{analysisStatus:'failed'}),sample('empty','  ')],brands);
  assert.deepEqual(result.eligibleObservationIds,['good']);assert.equal(result.excludedObservationIds.length,3);
  assert.equal(result.brands[0]!.visibility.value,1);assert.equal(result.brands[0]!.visibility.denominator,1);
  assert.equal(result.brands[0]!.sentiment.value,null);assert.equal(result.brands[0]!.sentiment.status,'unavailable');
  assert.equal(result.brands[0]!.cvr,null);assert.equal(result.brands[0]!.estimatedDemand,null);
});
test('incompatible origins, models, protocols and branded questions have separate cohorts and no aggregate percentage',()=>{
  for(const extra of [{origin:'manual' as const},{model:'different/model'},{protocolId:'web/search'},{branded:true}]) {
    const result=deriveBrandMetrics([sample('one','Alpha'),sample('two','Beta',extra)],brands);
    assert.equal(result.cohorts.length,2);assert.equal(result.mixedCohorts,true);
    assert.equal(result.brands[0]!.visibility.value,null);assert.equal(result.brands[0]!.visibility.status,'mixed-cohorts');
    assert.equal(result.brands[0]!.visibility.numerator,1);assert.equal(result.brands[0]!.visibility.denominator,2);
    assert.equal(result.cohorts[0]!.brands[0]!.visibility.value,1);
  }
});
test('overlapping aliases prefer the full name and shared aliases are explicitly ambiguous',()=>{
  const extended:BrandEntity[]=[...brands,{id:'pro',name:'Alpha Pro',aliases:[],domains:[],status:'active',isOwn:false}];
  const result=deriveBrandMetrics([sample('one','Alpha Pro precedes Beta, then Alpha.')],extended);
  assert.equal(result.brands.find(row=>row.brandId==='pro')!.position.value,1);
  assert.equal(result.brands.find(row=>row.brandId==='a')!.position.value,3);
  const shared=brands.map(brand=>({...brand,aliases:['Shared name']}));
  const ambiguous=deriveBrandMetrics([sample('two','Shared name is mentioned.')],shared);
  assert.equal(ambiguous.observations[0]!.ambiguities[0]!.reason,'shared-alias');
  assert.equal(ambiguous.observations[0]!.eligible,false);assert.equal(ambiguous.exclusions[0]!.reason,'ambiguous-brand-alias');
  assert.equal(ambiguous.brands[0]!.visibility.value,null);assert.equal(ambiguous.brands[1]!.visibility.value,null);
  assert.deepEqual(deriveBrandMetrics([sample('one','Alpha Pro precedes Beta, then Alpha.')],[...extended].reverse()),result);
});
test('suggested and inactive competitors do not alter the tracked-brand denominator',()=>{
  const untracked:BrandEntity[]=[brands[0]!,{...brands[1]!,status:'suggested'}];
  const result=deriveBrandMetrics([sample('one','Beta, Alpha.')],untracked);
  assert.equal(result.brands.length,1);assert.equal(result.brands[0]!.position.value,1);assert.equal(result.brands[0]!.sov.value,1);
  assert.throws(()=>deriveBrandMetrics([], [brands[0]!,brands[0]!]),/unique/);
});
test('source metrics keep evidence kind and integrity separate, excluding mismatches and failed answers',()=>{
  const result=deriveSourceMetrics([
    sample('one','Alpha and Beta.',{citations:[citation('https://www.docs.example/a'),citation('https://www.docs.example/a'),citation('https://other.example/b'),citation('https://www.docs.example/a','answer_url','unverified'),citation('https://www.docs.example/a','provider_citation','mismatch')]}),
    sample('two','No named brand.',{citations:[]}),
    sample('failed','Alpha',{collectionStatus:'failed',citations:[citation('https://www.docs.example/a')]}),
  ],brands);
  const row=result.domains.find(row=>row.source==='docs.example'&&row.kind==='provider_citation'&&row.integrity==='matched')!;
  assert.equal(row.citationCount,2);assert.equal(row.observedCitationCount,3);assert.equal(row.excludedCitationCount,1);
  assert.deepEqual(row.sampleIds,['one']);assert.deepEqual(row.excludedSampleIds,['failed']);
  assert.equal(row.used.value,.5);assert.equal(row.averageCitations.value,2);assert.equal(row.citationShare.value,2/3);
  assert.deepEqual(row.brandsAppear,['a','b']);
  const bad=result.domains.find(row=>row.integrity==='mismatch')!;
  assert.equal(bad.citationCount,0);assert.equal(bad.validation,'excluded');assert.equal(bad.used.status,'excluded');assert.equal(bad.used.value,null);
  const link=result.domains.find(row=>row.kind==='answer_url')!;assert.equal(link.integrity,'unverified');assert.equal(link.citationShare.value,1);
});
test('domain citations aggregate pages while URL citations remain distinct, without inventing source categories',()=>{
  const result=deriveSourceMetrics([sample('one','Alpha',{citations:[citation('https://docs.example/a#fragment'),citation('https://docs.example/b')]}),sample('two','Alpha',{citations:[citation('https://docs.example/a')]})]);
  assert.equal(result.domains.length,1);assert.equal(result.urls.length,2);assert.equal(result.domains[0]!.citationCount,3);
  assert.equal(result.domains[0]!.used.value,1);assert.equal(result.urls.find(row=>row.source==='https://docs.example/a')!.used.value,1);
  assert.equal(result.domains[0]!.category,'unknown');
});
test('source totals suppress mixed-cohort ratios, and invalid URLs never become counted sources',()=>{
  const result=deriveSourceMetrics([sample('one','Alpha',{citations:[citation('https://docs.example/a'),citation('javascript:alert(1)'),citation('https://user:secret@docs.example/a')]}),sample('two','Alpha',{model:'different',citations:[citation('https://docs.example/a')]})]);
  assert.equal(result.invalidCitationCount,2);assert.equal(result.domains[0]!.used.value,null);assert.equal(result.domains[0]!.used.status,'mixed-cohorts');
  assert.equal(result.cohorts[0]!.domains[0]!.used.value,1);assert.equal(result.domains[0]!.citationCount,2);
});
test('empty input exposes unavailable values and no fabricated source rows',()=>{
  const result=deriveBrandMetrics([],brands);assert.equal(result.brands[0]!.visibility.value,null);assert.equal(result.brands[0]!.sov.value,null);
  assert.equal(result.brands[0]!.visibility.status,'no-data');assert.deepEqual(deriveSourceMetrics([]).domains,[]);
});

test('replayed copies of an observation are counted once and conflicting identities are rejected',()=>{
  const row=sample('one','Alpha',{citations:[citation('https://docs.example/a')]});
  assert.equal(deriveBrandMetrics([row,structuredClone(row)],brands).brands[0]!.visibility.denominator,1);
  assert.equal(deriveSourceMetrics([row,structuredClone(row)]).domains[0]!.citationCount,1);
  assert.throws(()=>deriveBrandMetrics([row,{...row,answer:'Beta'}],brands),/Conflicting observation identity/);
});
