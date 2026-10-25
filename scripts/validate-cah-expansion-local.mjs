import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const status=execSync('npx supabase status -o env',{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const val=(n)=>status.match(new RegExp(`^${n}=["']?([^"'\\r\\n]+)`,'m'))?.[1];
const url=val('API_URL');
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error('Only disposable local Supabase allowed');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,val('SERVICE_ROLE_KEY'),options);
const host=createClient(url,val('ANON_KEY')??val('PUBLISHABLE_KEY'),options);
const stranger=createClient(url,val('ANON_KEY')??val('PUBLISHABLE_KEY'),options);
async function rpc(c,n,a){const {data,error}=await c.rpc(n,a);if(error)throw new Error(`${n}: ${error.message}`);return data;}
async function rejects(c,n,a,re){const {error}=await c.rpc(n,a);assert.ok(error,`${n} denied`);if(re)assert.match(error.message,re);}
await host.auth.signInAnonymously();await stranger.auth.signInAnonymously();
const room=await rpc(host,'create_room_for_game',{p_game_slug:'cards-against-humanity',p_display_name:'Expansion QA'});
const args={p_room_id:room.id};
await rejects(stranger,'cah_add_bot',{...args,p_profile:'dry'},/membership/);
await rejects(host,'cah_worker_claim',{p_limit:1,p_worker_id:'unauthorized'});
await rejects(host,'cah_configure',{...args,p_pack_slug:'original',p_response_mode:'cards',p_scoring_mode:'crowd'},/no response cards/);
await rpc(host,'cah_configure',{...args,p_pack_slug:'after-hours',p_response_mode:'cards',p_scoring_mode:'crowd'});
await rpc(host,'cah_add_bot',{...args,p_profile:'dry'});
let view=await rpc(host,'cah_add_bot',{...args,p_profile:'chaos'});
assert.equal(view.participants.length,3);assert.equal(view.participants.filter(p=>p.isBot).length,2);
view=await rpc(host,'cah_start_game',{...args,p_total_rounds:3});
await rejects(host,'cah_add_bot',{...args,p_profile:'dry'},/lobby/);
await rejects(stranger,'cah_get_view',args,/membership/);
const seenPrompts=new Set();
async function complete(j,result){return rpc(service,'cah_worker_complete',{p_job_id:j.id,p_lease_token:j.leaseToken,p_result:result,p_error:null});}
async function claim(){return (await rpc(service,'cah_worker_claim',{p_limit:10,p_worker_id:'integration-qa'})).jobs;}
for(let round=1;round<=3;round++){
 assert.equal(view.hand.length,7);seenPrompts.add(view.prompt);
 assert.equal(view.responses.length,0);
 await rejects(host,'cah_submit_card',{...args,p_card_id:crypto.randomUUID()},/not in your hand/);
 const card=view.hand[0];view=await rpc(host,'cah_submit_card',{...args,p_card_id:card.id});
 assert.equal(view.hand.length,6);assert.equal(view.responses.length,0);
 const jobs=await claim();assert.equal(jobs.length,2);
 assert.equal((await claim()).length,0,'active leases cannot be claimed twice');
 for(const j of jobs){
  assert.equal(j.payload.kind,'submit');assert.equal(j.payload.choices.length,7);
  assert.ok(!j.payload.choices.some(c=>c.id===card.id),'bot cannot see human hand');
  await rejects(service,'cah_worker_complete',{p_job_id:j.id,p_lease_token:j.leaseToken,p_result:{choiceId:card.id},p_error:null},/not in bot hand/);
  await complete(j,{choiceId:j.payload.choices[0].id,fallback:true});
  await complete(j,{choiceId:j.payload.choices[0].id,fallback:true});
 }
 view=await rpc(host,'cah_get_view',args);assert.equal(view.phase,'voting');assert.equal(view.responses.length,2);
 assert.ok(view.responses.every(r=>r.author===null&&r.votes===null));
 assert.equal(view.aiStatus.fallbackUsed,true);
 view=await rpc(host,'cah_cast_vote',{...args,p_submission_id:view.responses[0].id});
 const votes=await claim();assert.equal(votes.length,2);
 for(const j of votes){assert.equal(j.payload.choices.length,2);await complete(j,{choiceId:j.payload.choices[0].id});}
 view=await rpc(host,'cah_get_view',args);assert.equal(view.phase,'reveal');assert.ok(view.responses.every(r=>r.author));
 assert.ok(view.scores.reduce((n,s)=>n+s.score,0)>=round);
 view=await rpc(host,'cah_next_round',args);
}
assert.equal(view.phase,'complete');assert.equal(seenPrompts.size,3);
// Same room, new generation; judge mode failure must require explicit host fallback.
await rpc(host,'cah_configure',{...args,p_pack_slug:'after-hours',p_response_mode:'cards',p_scoring_mode:'judge'});
view=await rpc(host,'cah_start_game',{...args,p_total_rounds:3});
await rpc(host,'cah_submit_card',{...args,p_card_id:view.hand[0].id});
for(const j of await claim())await complete(j,{choiceId:j.payload.choices[0].id});
view=await rpc(host,'cah_get_view',args);assert.equal(view.responses.length,0);assert.equal(view.judge.status,'pending');
let [judge]=await claim();assert.equal(judge.payload.kind,'judge');assert.equal(judge.payload.choices.length,3);
assert.deepEqual(Object.keys(judge.payload.choices[0]).sort(),['id','text']);
const ratings=judge.payload.choices.map((c,i)=>({id:c.id,humor:i===1?4.99:5-i,surprise:i===1?4.99:5-i,fit:i===1?4.99:5-i,originality:i===1?4.99:5-i,timing:i===1?4.99:5-i}));
await rejects(service,'cah_worker_complete',{p_job_id:judge.id,p_lease_token:judge.leaseToken,p_result:{ratings:[...ratings.slice(0,2),ratings[0]],explanation:'invalid'},p_error:null},/invalid rating/);
await rejects(service,'cah_worker_complete',{p_job_id:judge.id,p_lease_token:judge.leaseToken,p_result:{ratings:ratings.map(r=>({...r,fit:6})),explanation:'invalid'},p_error:null},/0 to 5/);
await complete(judge,{ratings,explanation:'A stronger fit and punchline.'});
view=await rpc(host,'cah_get_view',args);assert.equal(view.phase,'reveal');assert.equal(view.judge.winnerIds.length,2);assert.equal(view.scores.reduce((n,s)=>n+s.score,0),2);
await complete(judge,{ratings,explanation:'Duplicate must not rescore.'});
view=await rpc(host,'cah_next_round',args);await rpc(host,'cah_submit_card',{...args,p_card_id:view.hand[0].id});
for(const j of await claim())await complete(j,{choiceId:j.payload.choices[0].id});
[judge]=await claim();await rpc(service,'cah_worker_complete',{p_job_id:judge.id,p_lease_token:judge.leaseToken,p_result:null,p_error:'provider unavailable'});
view=await rpc(host,'cah_get_view',args);assert.equal(view.phase,'voting');assert.equal(view.judge.status,'failed');
await rpc(host,'cah_judge_fallback',args);view=await rpc(host,'cah_get_view',args);assert.equal(view.judge.status,'fallback');assert.equal(view.responses.length,2);
await rpc(host,'cah_cast_vote',{...args,p_submission_id:view.responses[0].id});
for(const j of await claim())await complete(j,{choiceId:j.payload.choices[0].id});
view=await rpc(host,'cah_get_view',args);assert.equal(view.phase,'reveal');
// Simulate three worker crashes; fourth claim resolves bots legally and fails judge visibly.
view=await rpc(host,'cah_next_round',args);
await rpc(host,'cah_submit_card',{...args,p_card_id:view.hand[0].id});
let crashed=await claim();assert.equal(crashed.length,2);
const expire=()=>execSync(`docker exec supabase_db_game-library psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "update private.cah_jobs set attempts=3,lease_until=now()-interval '1 second' where room_id='${room.id}' and status='leased';"`,{stdio:'pipe'});
expire();assert.equal((await claim()).length,0);
view=await rpc(host,'cah_get_view',args);assert.equal(view.phase,'voting');assert.equal(view.aiStatus.fallbackUsed,true);
[judge]=await claim();assert.equal(judge.payload.kind,'judge');expire();assert.equal((await claim()).length,0);
view=await rpc(host,'cah_get_view',args);assert.equal(view.judge.status,'failed');
for(const table of ['cah_hands','cah_jobs','cah_bots','cah_used_prompts'])assert.ok((await host.schema('private').from(table).select('*')).error);
console.log(JSON.stringify({ok:true,cardRounds:3,privateHands:7,bots:2,judge:'validated scores, idempotence, explicit crowd fallback',security:'membership, host, hand ownership, service-only worker, private tables'}));
for(const client of [host,stranger,service])client.realtime.disconnect();
