import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertActiveResearchPackage, calculateActiveCountry } from '../js/engine/rp4-engine.js';

const bolivia=JSON.parse(await readFile(new URL('../data/BO-research-v4.0.json',import.meta.url),'utf8'));
const active=JSON.parse(await readFile(new URL('../data/active-countries.json',import.meta.url),'utf8'));
const qol=JSON.parse(await readFile(new URL('../data/quality-of-life-ru.json',import.meta.url),'utf8'));
const context={fx:{base_currency:'USD',rates:{USD:1,BOB:6.91,GBP:0.75},source:'test',as_of:'2026-09-06'}};
const profile=({type='REMOTE_EMPLOYMENT',partner=false,relationship='MARRIED',children=[]}={})=>({citizenships:['RU'],residence:{current_country:'PH',current_status:'LEGAL_RESIDENT'},application_preferences:{methods:['IN_COUNTRY']},family:{adults_count:partner?2:1,adult_ages:partner?[35,35]:[35],partner_included:partner,relationship_type:partner?relationship:null,children:children.map(age_years=>({age_years})),school_needed:children.length>0},lgbt:{enabled:false,consent_for_personalization:false,family_recognition_relevant:null,safety_relevant:null},income:{primary:{owner:'APPLICANT',type,source_geography:'SINGLE_COUNTRY',country_id:'US',monthly_total:{amount:3000,currency:'USD'},monthly_provable:{amount:3000,currency:'USD'}},additional_sources:[],partner:{has_income:false,sources:[]},savings:{amount:10000,currency:'USD'}},investment_capital:null,goal:{long_term:'TEMPORARY_RESIDENCE_SUFFICIENT',keep_russian_citizenship:'REQUIRED'},pets:{types:['NONE'],dogs:[],other_pet_notes:null},special_circumstances:['NONE'],route_specific_answers:{}});
const calc=(o={})=>calculateActiveCountry(profile(o),bolivia,context);

test('Bolivia package is valid, active and has four visible routes',()=>{
  assert.doesNotThrow(()=>assertActiveResearchPackage(bolivia));
  assert.equal(active.some(x=>x.code==='BO'&&x.name==='Боливия'),true);
  assert.equal(bolivia.routes.length,8);
  assert.equal(calc().routes.length,4);
});

test('employment and self-employment remain unasked legal bases rather than false financial failures',()=>{
  for(const id of ['BO_EMPLOYED_WORK','BO_SELF_EMPLOYED_WORK']){
    const r=calc().routes.find(x=>x.routeId===id);
    assert.ok(r);
    assert.equal(r.routeStatus,'SUITABLE_WITH_CONDITIONS');
    assert.equal(r.blockers.length,0);
  }
});

test('all partner types have explicit conditional family outcomes',()=>{
  for(const relationship of ['MARRIED','REGISTERED_PARTNERSHIP','UNREGISTERED_PARTNERSHIP']){
    const r=calc({partner:true,relationship}).routes.find(x=>x.routeId==='BO_EMPLOYED_WORK');
    assert.equal(r.familyEvaluation.state,'CONDITION',relationship);
  }
});

test('child ages 0 through 25 never create a family data gap',()=>{
  for(let age=0;age<=25;age++){
    const r=calc({children:[age]}).routes.find(x=>x.routeId==='BO_EMPLOYED_WORK');
    assert.ok(r,`${age}`);
    assert.equal(r.familyEvaluation.state,'CONDITION',`${age}`);
  }
});

test('remote employment does not create a digital-nomad route',()=>{
  assert.equal(bolivia.route_coverage.find(x=>x.category==='DIGITAL_NOMAD_REMOTE_WORK').result,'NO_ROUTE');
  assert.equal(calc({type:'REMOTE_EMPLOYMENT'}).routes.some(x=>x.routeType==='DIGITAL_NOMAD_REMOTE_WORK'),false);
});

test('cities and quality-of-life presentation are complete',()=>{
  assert.equal(bolivia.cities.length,4);
  assert.ok(bolivia.cities.every(x=>x.cost_components.length&&x.climate));
  assert.ok(bolivia.cities.every(x=>x.cost_components.some(item=>item.component==='RENT_STANDARD'&&item.currency==='BOB')));
  assert.equal(qol.countries.BO.score,6.4);
  assert.ok(qol.countries.BO.narrative_ru.length>=8);
});

test('every Bolivia route has a researched long-term outcome',()=>{
  for(const route of bolivia.routes){
    const path=route.long_term_path;
    assert.notEqual(path.pr_path_status,'NOT_RESEARCHED',route.route_id);
    assert.notEqual(path.citizenship_path_status,'NOT_RESEARCHED',route.route_id);
    assert.notEqual(path.residence_counts_for_pr,'NOT_RESEARCHED',route.route_id);
    assert.notEqual(path.residence_counts_for_citizenship,'NOT_RESEARCHED',route.route_id);
  }
});

test('study residence counts for citizenship but not permanent residence',()=>{
  const study=bolivia.routes.find(route=>route.route_id==='BO_STUDY').long_term_path;
  assert.equal(study.pr_path_status,'REQUIRES_CHANGE_OF_BASIS');
  assert.equal(study.residence_counts_for_pr,'NO');
  assert.equal(study.citizenship_path_status,'AVAILABLE');
  assert.equal(study.residence_counts_for_citizenship,'YES');
  assert.equal(study.years_to_citizenship,3);
});

test('2026 school access and LGBT practical evidence are explicitly sourced',()=>{
  const school=bolivia.schools.public_school_rules[0];
  assert.equal(school.compulsory_age_min,6);
  assert.equal(school.compulsory_age_max,17);
  assert.ok(school.source_ids.includes('BO_EDUCATION_2026'));
  assert.ok(bolivia.lgbt.source_ids.includes('BO_LGBT_PRACTICE_2025'));
  assert.ok(bolivia.lgbt.source_ids.includes('BO_LGBT_MARRIAGE_CASE_2026'));
});
