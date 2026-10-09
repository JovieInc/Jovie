const fs=require('node:fs');
const cp=require('node:child_process');
const plan=JSON.parse(fs.readFileSync('/private/tmp/sidebar-coverage-plan-hover-final.json','utf8'));
const results=[];
for(let n=1;n<=4;n++) {
 const log=`/private/tmp/sidebar-coverage-hover-final.${n}.log`;
 const out=fs.openSync(log,'w');
 const started=new Date().toISOString();
 const r=cp.spawnSync('pnpm',['--filter','@jovie/web','test:coverage','--changed','95c4afede3605e63a3dd9d2519ff843aae81f26e','--bail','1','--shard',`${n}/4`],{env:{...process.env,JOVIE_AGENT_PROFILE:'coder',JOVIE_COVERAGE_INCLUDE:plan.coverageInclude.join('\n'),JOVIE_COVERAGE_RELATED_TESTS:plan.relatedTests.join('\n')},stdio:['ignore',out,out]});
 fs.closeSync(out);
 const record={shard:n,started,finished:new Date().toISOString(),exit:r.status,error:r.error?.message,log};
 if(r.status===0) {
  record.coverage=`/private/tmp/sidebar-coverage-hover-final.${n}.json`;
  fs.copyFileSync('apps/web/coverage/coverage-final.json',record.coverage);
 }
 results.push(record);
 fs.writeFileSync('/private/tmp/sidebar-coverage-hover-final-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(record));
 if(r.status!==0) process.exit(r.status||1);
}
