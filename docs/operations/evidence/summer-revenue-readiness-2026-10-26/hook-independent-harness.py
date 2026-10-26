#!/usr/bin/env python3
"""Independent isolated hook-boundary checks. Never executes hooks in Jovie."""
import hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,datetime
P=pathlib.Path
source=P(sys.argv[1]).resolve(); out=P(sys.argv[2]).resolve()
base_env={k:v for k,v in os.environ.items() if not k.startswith('GIT_') and not k.startswith('JOVIE_')}
base_env.update(GIT_CONFIG_GLOBAL='/dev/null',GIT_CONFIG_SYSTEM='/dev/null',PATH='/tmp/jovie-readiness-toolchain/node_modules/.bin:'+base_env['PATH'])
def invoke(cmd,cwd,env=base_env):
 r=subprocess.run(cmd,cwd=cwd,env=env,capture_output=True,text=True,timeout=15)
 if r.returncode:raise RuntimeError((cmd,r.returncode,r.stderr))
 return r.stdout.strip()
def sha(p):return hashlib.sha256(P(p).read_bytes()).hexdigest()
def snapshot(repo):
 gd=P(invoke(['git','rev-parse','--absolute-git-dir'],repo));common=P(invoke(['git','rev-parse','--path-format=absolute','--git-common-dir'],repo))
 return {'head':(gd/'HEAD').read_text(),'headSha':invoke(['git','rev-parse','HEAD'],repo),'refs':invoke(['git','for-each-ref','--format=%(refname):%(objectname)'],repo),'indexSha256':sha(gd/'index'),'configSha256':sha(common/'config')}
shim='''#!/usr/bin/python3
import json,os,pathlib,subprocess,sys
p=pathlib.Path(os.environ['JOVIE_REVIEW_FIXTURE']);p.mkdir()
r={'sentinel':os.environ.get('JOVIE_REVIEW_SENTINEL'),'inheritedLocalNames':[n for n in json.loads(os.environ['JOVIE_REVIEW_LOCAL_NAMES']) if n in os.environ]}
for args in [['init','-q','-b','fixture'],['config','user.name','fixture-review'],['config','user.email','fixture-review@invalid'],['config','core.hooksPath',str(p/'fixture-hooks')]]:
 q=subprocess.run(['git',*args],cwd=p,capture_output=True,text=True)
 if q.returncode:r['error']=q.stderr;break
else:
 (p/'fixture.txt').write_text('independent control\\n')
 for args in [['add','-A'],['commit','-qm','independent fixture','--allow-empty'],['config','core.bare','true']]:
  q=subprocess.run(['git',*args],cwd=p,capture_output=True,text=True)
  if q.returncode:r['error']=q.stderr;break
pathlib.Path(os.environ['JOVIE_REVIEW_RECEIPT']).write_text(json.dumps(r))
sys.exit(int(os.environ.get('JOVIE_REVIEW_EXIT','0')))
'''
results=[]
local_names=invoke(['git','rev-parse','--local-env-vars'],'/tmp').splitlines()
for name,linked,exitcode,config_only in [('ordinary-hook',False,0,False),('linked-worktree-hook',True,0,False),('child-failure-propagation',False,23,False),('local-config-injection',False,0,True)]:
 with tempfile.TemporaryDirectory(prefix='jovie-independent-hook-') as d:
  top=P(d);parent=top/'parent';parent.mkdir()
  invoke(['git','init','-q','-b','parent'],parent)
  for key,val in [('user.name','parent-review'),('user.email','parent-review@invalid'),('core.hooksPath',str(top/'parent-hooks'))]:invoke(['git','config',key,val],parent)
  (parent/'marker').write_text('parent protected content\n');invoke(['git','add','marker'],parent);invoke(['git','commit','-qm','parent baseline'],parent)
  repo=parent
  if linked:
   repo=top/'linked';invoke(['git','worktree','add','-qb','linked',str(repo)],parent)
  hooks=repo/'scripts/hooks';hooks.mkdir(parents=True)
  shutil.copyfile(source,hooks/'pre-push-gate.sh')
  shutil.copyfile('/workspace/Jovie/scripts/hooks/resolve-repo-node.sh',hooks/'resolve-repo-node.sh')
  shutil.copyfile('/workspace/Jovie/.nvmrc',repo/'.nvmrc')
  bins=top/'bin';bins.mkdir();(bins/'pnpm').write_text(shim);(bins/'pnpm').chmod(0o755)
  gd=P(invoke(['git','rev-parse','--absolute-git-dir'],repo));common=P(invoke(['git','rev-parse','--path-format=absolute','--git-common-dir'],repo))
  env={**base_env,'PATH':str(bins)+':'+base_env['PATH'],'JOVIE_REVIEW_FIXTURE':str(top/'child'),'JOVIE_REVIEW_RECEIPT':str(top/'child.json'),'JOVIE_REVIEW_SENTINEL':'preserved-nonsecret-sentinel','JOVIE_REVIEW_EXIT':str(exitcode),'JOVIE_REVIEW_LOCAL_NAMES':json.dumps(local_names)}
  if config_only:env.update(GIT_CONFIG_COUNT='1',GIT_CONFIG_KEY_0='review.inherited',GIT_CONFIG_VALUE_0='unexpected')
  else:env.update(GIT_DIR=str(gd),GIT_WORK_TREE=str(repo),GIT_INDEX_FILE=str(gd/'index'),GIT_COMMON_DIR=str(common),GIT_PREFIX='prefix/')
  before=snapshot(repo)
  r=subprocess.run(['bash',str(hooks/'pre-push-gate.sh'),'lint'],cwd=repo,env=env,capture_output=True,text=True,timeout=15)
  # Explicit Git directories permit read-only inspection even after the pre-fix fixture flips bare=true.
  after={'head':(gd/'HEAD').read_text(),'headSha':invoke(['git','--git-dir='+str(gd),'rev-parse','HEAD'],repo),'refs':invoke(['git','--git-dir='+str(gd),'for-each-ref','--format=%(refname):%(objectname)'],repo),'indexSha256':sha(gd/'index'),'configSha256':sha(common/'config')}
  child=json.loads((top/'child.json').read_text()) if (top/'child.json').exists() else {}
  own=(top/'child/.git/HEAD').exists()
  valid=False
  if own:valid=subprocess.run(['git','--git-dir='+str(top/'child/.git'),'cat-file','-e','HEAD^{commit}'],env=base_env,capture_output=True).returncode==0
  checks={'parentHeadIndexRefsConfigUnchanged':before==after,'fixtureOwnGitAndCommit':own and valid,'localGitEnvironmentCleared':child.get('inheritedLocalNames')==[],'unrelatedSentinelPreserved':child.get('sentinel')=='preserved-nonsecret-sentinel','childExitStatusPreserved':r.returncode==exitcode}
  results.append({'id':name,'status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'gateExitCode':r.returncode,'changedParentFields':[k for k in before if before[k]!=after[k]],'inheritedLocalNames':child.get('inheritedLocalNames'),'fixtureErrorPresent':'error' in child})
receipt={'schemaVersion':1,'runId':'independent-hook-isolation-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'),'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'isolated-local-temporary-git-repositories','sourcePath':str(source),'sourceSha256':sha(source),'harnessSha256':sha(__file__),'node':'24.22.1','expected':'Actual hook removes repository-local routing from child tests, preserves unrelated environment and failures, leaves parent metadata unchanged.','scope':'Copied actual gate and Node resolver; pnpm shim performs real fixture Git operations. No Jovie repository Git writes and no network.','total':len(results),'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results),'skipped':0,'results':results}
out.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
sys.exit(1 if receipt['failed'] else 0)
