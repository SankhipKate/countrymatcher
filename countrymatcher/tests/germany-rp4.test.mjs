import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const de = JSON.parse(await readFile(new URL('../data/DE-research-v4.0.json', import.meta.url), 'utf8'));
const route = (id) => de.routes.find((r) => r.route_id === id);
const req = (id, needle) => route(id).requirements.find((r) => r.requirement_id.includes(needle));
const amount = (id, needle = 'FINANCE') => req(id, needle).financial.alternatives[0].amount;
const profile = ({ savings = 0, relationship = null, answers = {} } = {}) => ({
  citizenships:['RU'], residence:{current_country:'RU',current_status:'CITIZEN'},
  application_preferences:{methods:['FROM_ABROAD']},
  family:{adults_count:relationship?2:1,adult_ages:relationship?[35,35]:[35],partner_included:!!relationship,relationship_type:relationship,children:[],school_needed:false},
  lgbt:{enabled:false,consent_for_personalization:false,family_recognition_relevant:null,safety_relevant:null},
  income:{primary:{owner:'APPLICANT',type:'OTHER_REGULAR_INCOME',source_geography:'SINGLE_COUNTRY',country_id:'RU',monthly_total:{amount:0,currency:'EUR'},monthly_provable:{amount:0,currency:'EUR'}},additional_sources:[],partner:{has_income:false,sources:[]},savings:{amount:savings,currency:'EUR'}},
  investment_capital:null, goal:{long_term:'TEMPORARY_RESIDENCE_SUFFICIENT',keep_russian_citizenship:'NOT_REQUIRED'},
  pets:{types:['NONE'],dogs:[],other_pet_notes:null},special_circumstances:['NONE'],route_specific_answers:answers,
});
const calc = (p={}) => calculateActiveCountry(profile(p),de,{fx:{base_currency:'EUR',rates:{EUR:1,USD:1.17},source:'test',as_of:'2026-08-27'}});
const result = (c,id) => c.routes.find((x)=>x.routeId===id);

test('Germany package is complete QA RP4 with exactly 13 Canon coverage decisions',()=>{
  assert.equal(de.country_id,'DE'); assert.equal(de.schema_version,'4.0'); assert.equal(de.route_coverage.length,13);
  assert.equal(de.routes.length,20);
  assert.equal(route('DE_ICT').publishable,false); assert.equal(route('DE_FAMILY').publishable,false);
  assert.ok(de.routes.filter((r)=>!['DE_ICT','DE_FAMILY'].includes(r.route_id)).every((r)=>r.publishable));
  assert.equal(de.completeness.country_ready_status,'READY');
});

test('mandatory Germany route inventory is complete',()=>{
  const expected=['DE_18A','DE_18B','DE_BLUE','DE_EXPERIENCED','DE_DRIVER','DE_NURSING_ASSISTANT','DE_ICT','DE_CHANCE','DE_TRAINING_COMPANY','DE_TRAINING_SCHOOL','DE_TRAINING_SEARCH','DE_RECOGNITION','DE_STUDY','DE_UNI_SEARCH','DE_LANGUAGE','DE_RESEARCH','DE_BUSINESS','DE_FREELANCE','DE_FAMILY','DE_PROTECTION'];
  assert.deepEqual(de.routes.map(r=>r.route_id),expected);
});

test('no-route categories are explicit and no artificial residence routes exist',()=>{
  const no=de.route_coverage.filter(x=>x.result==='NO_ROUTE').map(x=>x.category);
  assert.deepEqual(no,['DIGITAL_NOMAD_REMOTE_WORK','INCOME_FINANCIALLY_INDEPENDENT','RETIREMENT','INVESTMENT','GENERAL_RESIDENCE']);
});

test('future German employment finance never screens current foreign income',()=>{
  for(const id of ['DE_18A','DE_18B','DE_BLUE','DE_EXPERIENCED','DE_DRIVER','DE_NURSING_ASSISTANT','DE_ICT'])
    for(const r of route(id).requirements.filter(x=>x.financial)) assert.equal(r.evaluation_mode,'UNASKED_CONDITION',id);
  assert.equal(result(calc(),'DE_BLUE').routeStatus,'SUITABLE_WITH_CONDITIONS');
});

test('2026 Blue Card and employment thresholds are exact',()=>{
  assert.equal(amount('DE_BLUE','STANDARD'),50700); assert.equal(amount('DE_BLUE','REDUCED'),45934.2);
  assert.equal(amount('DE_EXPERIENCED'),45630);
  for(const id of ['DE_18A','DE_18B','DE_EXPERIENCED','DE_DRIVER','DE_NURSING_ASSISTANT']) assert.equal(amount(id,'AGE45'),55770,id);
});

test('Opportunity, study, training, search, language and recognition finance is preserved',()=>{
  assert.equal(amount('DE_CHANCE'),13092); assert.equal(amount('DE_STUDY'),11904);
  assert.equal(amount('DE_TRAINING_COMPANY'),1048); assert.equal(amount('DE_TRAINING_SCHOOL'),11508);
  assert.equal(amount('DE_TRAINING_SEARCH'),13092); assert.equal(amount('DE_UNI_SEARCH'),13092); assert.equal(amount('DE_LANGUAGE'),13092);
  assert.equal(amount('DE_RECOGNITION','COMPANY'),1200); assert.equal(amount('DE_RECOGNITION','SCHOOL'),13092);
});

test('known savings boundary is evaluated for study without inventing salary substitution',()=>{
  const answers={DE_STUDY:{de_study_finance_method:'OWN_SAVINGS'}};
  assert.equal(result(calc({savings:11903,answers}),'DE_STUDY').financialSummary.state,'FAIL');
  assert.equal(result(calc({savings:11904,answers}),'DE_STUDY').financialSummary.state,'PASS');
});

test('ICT is full route with no fixed salary and change-of-basis long-term mapping',()=>{
  const ict=route('DE_ICT'); assert.equal(ict.route_type,'INTRA_COMPANY_TRANSFER');
  assert.match(ict.basis_ru,/руководителя, специалиста или оплачиваемого стажёра/); assert.match(ict.requirements[0].condition_ru,/шести месяцев/);
  assert.equal(req('DE_ICT','FINANCE').financial.alternatives[0].comparison,'NO_FIXED_THRESHOLD');
  assert.equal(ict.long_term_path.pr_path_status,'REQUIRES_CHANGE_OF_BASIS'); assert.equal(ict.long_term_path.first_permit_months,36);
});

test('registered partnership recognition remains DISPLAY_ONLY in the unpublished Germany family route',()=>{
  const recognition=req('DE_FAMILY','OTHER_BASIS'); assert.equal(recognition.evaluation_mode,'DISPLAY_ONLY'); assert.equal(recognition.unmet_effect,'NONE');
});



test('Germany ICT and standalone family routes are researched but never published to matcher output',()=>{
  const evaluated=calc({relationship:'MARRIED'}).routes.map((x)=>x.routeId);
  assert.equal(route('DE_ICT').publishable,false); assert.equal(route('DE_FAMILY').publishable,false);
  assert.equal(evaluated.includes('DE_ICT'),false); assert.equal(evaluated.includes('DE_FAMILY'),false);
  assert.equal(evaluated.length,18);
});

test('unregistered partnership is not represented as spouse-equivalent',()=>{
  assert.ok(!route('DE_FAMILY').family_scenarios.some(s=>s.relationship_types.includes('UNREGISTERED_PARTNERSHIP')));
});

test('protection is humanitarian, separate-basis, individual and not a Russian/LGBT auto-pass',()=>{
  const p=route('DE_PROTECTION'); assert.equal(p.route_type,'INTERNATIONAL_PROTECTION'); assert.equal(p.is_humanitarian,true);
  assert.equal(p.requirements[0].type,'PROTECTION_BASIS'); assert.equal(p.requirements[0].requires_separate_basis,true);
  assert.match(p.protection_details.individual_risk_rule_ru,/сами по себе не дают права на международную защиту/);
  assert.match(p.protection_details.safe_third_country_ru,/Россия.*не входит/);
  assert.match(p.protection_details.status_after_positive_decision_ru,/23 июля 2027/);
  assert.equal(result(calc(),'DE_PROTECTION').routeStatus,'SUITABLE_WITH_CONDITIONS');
});


test('Germany work-rights are route-specific and have no ICT contamination outside the ICT route',()=>{
  for(const r of de.routes.filter((x)=>x.route_id!=='DE_ICT')){
    const text=JSON.stringify({applicant:r.applicant_work_rights,partner:r.partner_work_rights});
    assert.doesNotMatch(text,/ICT-держател|ICT-основан|ICT-разрешен|внутрикорпоративного перевода/i,r.route_id);
  }
  assert.equal(route('DE_18A').applicant_work_rights.employment.status,'ALLOWED');
  assert.equal(route('DE_18A').applicant_work_rights.self_employment.status,'SEPARATE_PERMISSION_REQUIRED');
  assert.match(route('DE_BLUE').applicant_work_rights.employment.rule_ru,/первого года/);
  assert.match(route('DE_CHANCE').applicant_work_rights.employment.rule_ru,/20 часов/); assert.match(route('DE_CHANCE').applicant_work_rights.employment.rule_ru,/двух недель/);
  assert.match(route('DE_TRAINING_COMPANY').applicant_work_rights.employment.rule_ru,/20 часов/);
  assert.match(route('DE_TRAINING_SEARCH').applicant_work_rights.employment.rule_ru,/20 часов/);
  assert.match(route('DE_RECOGNITION').applicant_work_rights.employment.rule_ru,/20 часов/);
  assert.match(route('DE_STUDY').applicant_work_rights.employment.rule_ru,/140/); assert.match(route('DE_STUDY').applicant_work_rights.employment.rule_ru,/280/); assert.equal(route('DE_STUDY').applicant_work_rights.self_employment.status,'SEPARATE_PERMISSION_REQUIRED');
  assert.match(route('DE_LANGUAGE').applicant_work_rights.employment.rule_ru,/20 часов/);
  assert.match(route('DE_RESEARCH').applicant_work_rights.employment.rule_ru,/научная работа/); assert.match(route('DE_RESEARCH').applicant_work_rights.employment.rule_ru,/преподавательская/);
  assert.equal(route('DE_BUSINESS').applicant_work_rights.self_employment.status,'ALLOWED');
  assert.equal(route('DE_FREELANCE').applicant_work_rights.self_employment.status,'ALLOWED');
  assert.equal(route('DE_FAMILY').applicant_work_rights.employment.status,'ALLOWED'); assert.equal(route('DE_FAMILY').applicant_work_rights.self_employment.status,'ALLOWED');
});

test('Germany partner work rights follow actual family availability rather than ICT copy',()=>{
  for(const id of ['DE_18A','DE_18B','DE_BLUE','DE_EXPERIENCED','DE_DRIVER','DE_NURSING_ASSISTANT','DE_ICT','DE_TRAINING_COMPANY','DE_TRAINING_SCHOOL','DE_RECOGNITION','DE_STUDY','DE_RESEARCH','DE_BUSINESS','DE_FREELANCE']){
    assert.equal(route(id).partner_work_rights.employment.status,'ALLOWED',id);
    assert.match(route(id).partner_work_rights.employment.rule_ru,/семейного вида на жительство/,id);
  }
  for(const id of ['DE_CHANCE','DE_TRAINING_SEARCH','DE_UNI_SEARCH','DE_LANGUAGE']) assert.equal(route(id).partner_work_rights.employment.status,'NOT_APPLICABLE',id);
});

test('Germany protection work clock uses current three-month and conditional six-month rule',()=>{
  const p=route('DE_PROTECTION');
  assert.match(p.applicant_work_rights.employment.rule_ru,/тр[её]х месяцев/);
  assert.match(p.applicant_work_rights.employment.rule_ru,/шесть месяцев/);
  assert.doesNotMatch(p.applicant_work_rights.employment.rule_ru,/60 дней/);
  assert.match(p.protection_details.right_to_remain_during_processing_ru,/тр[её]х месяцев/);
  assert.match(p.protection_details.right_to_remain_during_processing_ru,/шести месяцев/);
});

test('Germany long-term user copy has valid Russian grammar and family PR remains conditional',()=>{
  for(const r of de.routes){
    assert.doesNotMatch(r.long_term_path.pr_path_ru,/Путь к разрешения|3 лет|квалифицирующий вида|основания лет/i,r.route_id);
    assert.doesNotMatch(r.long_term_path.citizenship_path_ru,/тр[её]хлетний особой интеграции путь/i,r.route_id);
  }
  assert.equal(route('DE_FAMILY').long_term_path.pr_path_status,'AVAILABLE_AFTER_RESIDENCE');
  assert.equal(route('DE_FAMILY').long_term_path.residence_counts_for_pr,'CONDITIONAL');
});

test('application and Russia-specific passport rules are explicit and asylum is not a D-visa filing',()=>{
  assert.match(de.entry_for_russian_citizen.rule_ru,/биометрический/);
  assert.equal(route('DE_18A').application_methods[0].method,'ORIGIN_COUNTRY');
  assert.equal(route('DE_PROTECTION').application_methods[0].method,'IN_COUNTRY');
});

test('PR and citizenship mappings preserve special timelines and no repealed three-year promise',()=>{
  assert.equal(route('DE_BLUE').long_term_path.years_to_pr,null); assert.match(route('DE_BLUE').long_term_path.pr_path_ru,/27 месяцев/); assert.match(route('DE_BLUE').long_term_path.pr_path_ru,/21 месяц/); assert.equal(route('DE_BLUE').long_term_path.first_permit_months,48); assert.match(route('DE_BLUE').long_term_path.initial_status_ru,/срок договора плюс три месяца/); assert.equal(route('DE_18A').long_term_path.years_to_pr,3);
  assert.equal(route('DE_BUSINESS').long_term_path.years_to_pr,3); assert.equal(route('DE_FREELANCE').long_term_path.years_to_pr,5);
  assert.equal(route('DE_18A').long_term_path.years_to_citizenship,5); assert.equal(route('DE_FAMILY').long_term_path.years_to_citizenship,null); assert.match(route('DE_FAMILY').long_term_path.citizenship_path_ru,/§9 StAG/); assert.match(route('DE_FAMILY').long_term_path.citizenship_path_ru,/три года проживания и два года/); assert.equal(route('DE_ICT').long_term_path.years_to_citizenship,null); assert.equal(route('DE_PROTECTION').long_term_path.years_to_citizenship,null);
  assert.ok(de.routes.every(r=>!/обычн.*натурализац.*после тр[её]х лет/i.test(r.long_term_path.citizenship_path_ru)));
});

test('Germany source ledger is domain-specific and every reference resolves',()=>{
  const ids=new Set(de.sources.map(s=>s.source_id)); assert.ok(de.sources.length>10); assert.equal(ids.has('DE_SRC_MASTER'),false);
  const unresolved=[]; const walk=(v,path='')=>{if(Array.isArray(v))return v.forEach((x,i)=>walk(x,`${path}[${i}]`));if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(k==='source_ids'||k==='official_source_ids'){for(const id of x)if(!ids.has(id))unresolved.push(`${path}.${k}:${id}`);}else if(k==='official_source_id'){if(!ids.has(x))unresolved.push(`${path}.${k}:${x}`);}else walk(x,`${path}.${k}`);}}; walk(de); assert.deepEqual(unresolved,[]);
  assert.notEqual(route('DE_BLUE').official_source_id,route('DE_PROTECTION').official_source_id); assert.notEqual(route('DE_FAMILY').official_source_id,route('DE_ICT').official_source_id);
  assert.deepEqual(de.taxes.source_ids.sort(),['DE_SRC_TAX_2026','DE_SRC_TAX_RU']); assert.deepEqual(de.cities[0].climate.source_ids,['DE_SRC_CLIMATE']);
});

test('Germany user-facing data has no Greek contamination and no audited English filler',()=>{
  const ru=[]; const walk=(v,path='')=>{if(Array.isArray(v))return v.forEach((x,i)=>walk(x,`${path}[${i}]`));if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(typeof x==='string'&&k.endsWith('_ru'))ru.push([`${path}.${k}`,x]);else walk(x,`${path}.${k}`);}};walk(de);
  const contamination=ru.filter(([,s])=>/\b(Греци(?:я|и|ю|ей)|греческ)/i.test(s)); assert.deepEqual(contamination,[]);
  const audited=/(job offer|settlement permit|lawful habitual residence|civic knowledge|self-support|gross\/year|net\/month|hosting agreement|work contract|salary threshold|employed researcher|company pathway|school pathway|Germany QA|\bRP4\b|\bPASS\b|BA approval|\bcutoff\b|анкета не устанавливает|информационное предупреждение|Путь к разрешения|квалифицирующий вида)/i;
  assert.deepEqual(ru.filter(([,s])=>audited.test(s)),[]);
});

test('Blue Card standard, reduced and unresolved branches are mutually exclusive',()=>{
  const unresolved=result(calc(),'DE_BLUE'); assert.equal(unresolved.routeStatus,'SUITABLE_WITH_CONDITIONS');
  const standard=result(calc({answers:{DE_BLUE:{de_blue_salary_band:'STANDARD'}}}),'DE_BLUE'); const reduced=result(calc({answers:{DE_BLUE:{de_blue_salary_band:'REDUCED'}}}),'DE_BLUE');
  assert.deepEqual(standard.financialSummary.alternatives.map(x=>x.threshold),[50700]); assert.deepEqual(reduced.financialSummary.alternatives.map(x=>x.threshold),[45934.2]);
});

test('first-issue age branches hide the 45+ rule from under-45 users',()=>{
  for(const id of ['DE_18A','DE_18B','DE_EXPERIENCED','DE_DRIVER','DE_NURSING_ASSISTANT']){
    const q=route(id).route_specific_questions[0].question_id;
    const under=result(calc({answers:{[id]:{[q]:'UNDER_45'}}}),id); const older=result(calc({answers:{[id]:{[q]:'AGE_45_PLUS'}}}),id);
    assert.equal(under.financialSummary.alternatives.some(x=>x.threshold===55770),false,id); assert.equal(older.financialSummary.alternatives.some(x=>x.threshold===55770),true,id);
    const pension=req(id,'AGE45').financial.alternatives[1]; assert.equal(pension.amount,null); assert.equal(pension.comparison,'NO_FIXED_THRESHOLD');
  }
});

test('recognition company and school finance never apply together',()=>{
  const company=result(calc({answers:{DE_RECOGNITION:{de_recognition_pathway:'COMPANY'}}}),'DE_RECOGNITION'); const school=result(calc({answers:{DE_RECOGNITION:{de_recognition_pathway:'SCHOOL'}}}),'DE_RECOGNITION');
  assert.notEqual(company.routeStatus,'UNSUITABLE'); assert.equal(company.financialSummary.alternatives.some(x=>x.threshold===13092),false); assert.notEqual(school.routeStatus,'UNSUITABLE');
});

test('research employed and self-funded finance never block one another',()=>{
  const employed=result(calc({answers:{DE_RESEARCH:{de_research_funding:'EMPLOYED'}}}),'DE_RESEARCH'); const self=result(calc({answers:{DE_RESEARCH:{de_research_funding:'SELF_FINANCED'}}}),'DE_RESEARCH');
  assert.notEqual(employed.routeStatus,'UNSUITABLE'); assert.equal(employed.financialSummary.alternatives.some(x=>x.threshold===13092),false); assert.notEqual(self.routeStatus,'UNSUITABLE');
});

test('school training free-housing branch applies the 380 euro reduction',()=>{
  const full=result(calc({answers:{DE_TRAINING_SCHOOL:{de_school_training_finance_method:'BLOCKED_ACCOUNT',de_school_training_housing:'NO_FREE_HOUSING'}}}),'DE_TRAINING_SCHOOL'); const reduced=result(calc({answers:{DE_TRAINING_SCHOOL:{de_school_training_finance_method:'BLOCKED_ACCOUNT',de_school_training_housing:'FREE_HOUSING'}}}),'DE_TRAINING_SCHOOL');
  assert.deepEqual(full.financialSummary.alternatives.map(x=>x.threshold),[11508]); assert.deepEqual(reduced.financialSummary.alternatives.map(x=>x.threshold),[6948]);
});

test('Opportunity Card and study unknown official finance alternatives do not cause false UNSUITABLE',()=>{
  for(const id of ['DE_CHANCE','DE_STUDY','DE_UNI_SEARCH','DE_LANGUAGE','DE_TRAINING_SEARCH','DE_TRAINING_SCHOOL','DE_RECOGNITION','DE_RESEARCH']) assert.notEqual(result(calc({savings:0}),id).routeStatus,'UNSUITABLE',id);
  assert.notEqual(result(calc({savings:0,answers:{DE_CHANCE:{de_chance_finance_method:'OTHER_OFFICIAL'}}}),'DE_CHANCE').routeStatus,'UNSUITABLE');
  assert.notEqual(result(calc({savings:0,answers:{DE_STUDY:{de_study_finance_method:'SCHOLARSHIP'}}}),'DE_STUDY').routeStatus,'UNSUITABLE');
});

for(const [id,qid] of [['DE_UNI_SEARCH','de_uni_search_finance_method'],['DE_LANGUAGE','de_language_finance_method'],['DE_TRAINING_SEARCH','de_training_search_finance_method']]){
  test(`${id} distinguishes blocked account, commitment and unanswered finance`,()=>{
    const answer=(value)=>({[id]:{[qid]:value}});
    const enough=result(calc({savings:13092,answers:answer('BLOCKED_ACCOUNT')}),id); const short=result(calc({savings:13091,answers:answer('BLOCKED_ACCOUNT')}),id);
    const commitment=result(calc({savings:0,answers:answer('FORMAL_COMMITMENT')}),id); const unanswered=result(calc({savings:0}),id);
    assert.notEqual(enough.financialSummary.state,'FAIL'); assert.equal(short.financialSummary.state,'FAIL'); assert.notEqual(commitment.routeStatus,'UNSUITABLE'); assert.notEqual(unanswered.routeStatus,'UNSUITABLE');
  });
}

test('school training separates finance method from free-housing amount',()=>{
  const selected=(method,housing)=>({DE_TRAINING_SCHOOL:{de_school_training_finance_method:method,de_school_training_housing:housing}});
  assert.notEqual(result(calc({savings:11508,answers:selected('BLOCKED_ACCOUNT','NO_FREE_HOUSING')}),'DE_TRAINING_SCHOOL').financialSummary.state,'FAIL');
  assert.equal(result(calc({savings:11507,answers:selected('BLOCKED_ACCOUNT','NO_FREE_HOUSING')}),'DE_TRAINING_SCHOOL').financialSummary.state,'FAIL');
  assert.notEqual(result(calc({savings:6948,answers:selected('BLOCKED_ACCOUNT','FREE_HOUSING')}),'DE_TRAINING_SCHOOL').financialSummary.state,'FAIL');
  assert.equal(result(calc({savings:6947,answers:selected('BLOCKED_ACCOUNT','FREE_HOUSING')}),'DE_TRAINING_SCHOOL').financialSummary.state,'FAIL');
  for(const method of ['FORMAL_COMMITMENT','SCHOLARSHIP']) assert.notEqual(result(calc({savings:0,answers:selected(method,'NO_FREE_HOUSING')}),'DE_TRAINING_SCHOOL').routeStatus,'UNSUITABLE');
  assert.notEqual(result(calc({savings:0}),'DE_TRAINING_SCHOOL').routeStatus,'UNSUITABLE');
});

test('remaining audited German user copy contains no mixed English fragments',()=>{
  const ru=[];const walk=(v)=>{if(Array.isArray(v))return v.forEach(walk);if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(typeof x==='string'&&k.endsWith('_ru'))ru.push(x);else walk(x);}};walk(de);
  const mixed=/(marriage equality|joint adoption|registered partnership|equivalence checks|same-sex nature|parenthood documents|admissibility|prior protection|suspensive effect|DWD normals|mean daily|nationwide post-entry housing rule|dog registration\/tax\/rules|recognition partnership|qualifying recognition procedure|asylum reception system|resident children|newcomer support|German-medium|Schengen visa)/i;
  assert.deepEqual(ru.filter(x=>mixed.test(x)),[]);
});

test('recognition school finance distinguishes unresolved, commitment, failing and passing blocked account',()=>{
  const base={de_recognition_pathway:'SCHOOL'};const selected=(method)=>({DE_RECOGNITION:{...base,de_recognition_school_finance_method:method}});
  assert.notEqual(result(calc({savings:0,answers:{DE_RECOGNITION:base}}),'DE_RECOGNITION').routeStatus,'UNSUITABLE');
  assert.notEqual(result(calc({savings:0,answers:selected('COMMITMENT')}),'DE_RECOGNITION').routeStatus,'UNSUITABLE');
  const fail=result(calc({savings:13091,answers:selected('BLOCKED_ACCOUNT')}),'DE_RECOGNITION');const pass=result(calc({savings:13092,answers:selected('BLOCKED_ACCOUNT')}),'DE_RECOGNITION');
  assert.equal(fail.financialSummary.state,'FAIL');assert.equal(fail.routeStatus,'UNSUITABLE');assert.equal(pass.financialSummary.state,'PASS');
  const company=result(calc({answers:{DE_RECOGNITION:{de_recognition_pathway:'COMPANY'}}}),'DE_RECOGNITION');assert.equal(company.financialSummary.alternatives.some(x=>x.threshold===13092),false);
});

test('research funding cleanly separates employed, scholarship and self-financed evidence',()=>{
  const answer=(funding,method)=>({DE_RESEARCH:{de_research_funding:funding,...(method?{de_research_self_financed_method:method}:{})}});
  const employed=result(calc({savings:0,answers:answer('EMPLOYED')}),'DE_RESEARCH');assert.notEqual(employed.routeStatus,'UNSUITABLE');assert.equal(employed.financialSummary.alternatives.some(x=>x.threshold===13092),false);
  const scholarship=result(calc({savings:0,answers:answer('SCHOLARSHIP')}),'DE_RESEARCH');assert.notEqual(scholarship.routeStatus,'UNSUITABLE');assert.equal(scholarship.routeStatus,'SUITABLE_WITH_CONDITIONS');
  assert.notEqual(result(calc({savings:0,answers:answer('SELF_FINANCED')}),'DE_RESEARCH').routeStatus,'UNSUITABLE');
  assert.notEqual(result(calc({savings:0,answers:answer('SELF_FINANCED','COMMITMENT')}),'DE_RESEARCH').routeStatus,'UNSUITABLE');
  const fail=result(calc({savings:13091,answers:answer('SELF_FINANCED','BLOCKED_ACCOUNT')}),'DE_RESEARCH');const pass=result(calc({savings:13092,answers:answer('SELF_FINANCED','BLOCKED_ACCOUNT')}),'DE_RESEARCH');assert.equal(fail.financialSummary.state,'FAIL');assert.equal(pass.financialSummary.state,'PASS');
});

test('school-training unresolved housing produces no empty amount in the rendered UI contract',async()=>{
  const unresolved=result(calc({savings:11508,answers:{DE_TRAINING_SCHOOL:{de_school_training_finance_method:'BLOCKED_ACCOUNT'}}}),'DE_TRAINING_SCHOOL');
  assert.ok(unresolved.financialSummary.alternatives.every(x=>x.threshold==null));
  const app=await readFile(new URL('../matcher/app.js',import.meta.url),'utf8');
  assert.match(app,/alternatives\?\.filter\(\(item\) => item\.threshold != null\)/);assert.doesNotMatch(app,/DE_TRAINING_SCHOOL/);
});

test('tax copy describes both formula zones without fake fixed rates',()=>{
  assert.match(de.taxes.personal_income_tax_ru,/12 349–17 799/); assert.match(de.taxes.personal_income_tax_ru,/17 800–69 878/); assert.equal(de.taxes.personal_income_tax_rates.some(x=>x.rate_percent===14||x.rate_percent===23.97),false);
});

test('city, school, pet, tax, LGBT and QoL-adjacent country contracts are concrete',()=>{
  assert.deepEqual(de.cities.map(c=>c.name_ru),['Берлин','Гамбург','Лейпциг','Бамберг']);
  for(const c of de.cities){assert.equal(c.structural_roles.filter(x=>['LARGE','MEDIUM','SMALL'].includes(x)).length,1); assert.deepEqual(c.cost_components.map(x=>x.component).sort(),['GROCERIES','RENT_STANDARD','TRANSPORT','UTILITIES']);}
  assert.equal(de.schools.public_school_rules[0].is_free,true); assert.match(de.pets.import_restrictions.explanation_ru,/Pit Bull/);
  assert.match(de.taxes.double_taxation_with_russia_ru,/1 января 2027/); assert.match(de.lgbt.registered_partnership_rule_ru,/исключительно информационный характер/);
});

test('Germany is production-active',async()=>{
  const active=JSON.parse(await readFile(new URL('../data/active-countries.json',import.meta.url),'utf8'));
  assert.equal(active.some(x=>x.code==='DE'),true);
});
