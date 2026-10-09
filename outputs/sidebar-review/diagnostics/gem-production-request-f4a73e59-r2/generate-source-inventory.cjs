const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {createRequire}=require('node:module');const req=createRequire(path.resolve('apps/web/package.json'));const ts=req('typescript');
const [dest,head,tree]=process.argv.slice(2);if(!dest||!head||!tree)throw Error('Explicit destination/head/tree required');
const sourcePath='apps/web/.storybook/main.ts';const source=cp.execFileSync('git',['show',head+':'+sourcePath],{encoding:'utf8'});const ast=ts.createSourceFile(sourcePath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);let globs=null,stories=null;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='FULL_CATALOG_STORIES'){let x=n.initializer;while(ts.isAsExpression(x)||ts.isParenthesizedExpression(x))x=x.expression;if(!ts.isArrayLiteralExpression(x)||!x.elements.every(ts.isStringLiteral))throw Error('Nonliteral story inventory requires owner review');globs=x.elements.map(x=>x.text);}if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='stories')stories=n.initializer;ts.forEachChild(n,visit);}visit(ast);
if(!globs||globs.length!==3||!stories||!ts.isConditionalExpression(stories)||stories.condition.getText(ast)!=="process.env.JOVIE_LIVE_STORYBOOK_CERT === '1'"||stories.whenFalse.getText(ast)!=='[...FULL_CATALOG_STORIES]')throw Error('Current full-style Storybook selection not proved');
function matchGlob(input) {
  let out='^';
  for(let i=0;i<input.length;) {
    if(input.startsWith('**/',i)) { out+='(?:.*/)?'; i+=3; }
    else if(input.startsWith('@(',i)) {
      const end=input.indexOf(')',i), alternatives=input.slice(i+2,end).split('|');
      if(end<0||!alternatives.every(x=>/^[a-z]+$/.test(x)))throw Error('Unrecognized extension glob');
      out+='(?:'+alternatives.join('|')+')'; i=end+1;
    } else if(input[i]==='*') { out+='[^/]*'; i++; }
    else { out+=(".+?^${}()|[]\\".includes(input[i])?'\\'+input[i]:input[i]); i++; }
  }
  return new RegExp(out+'$');
}
const normalized=globs.map(x=>path.posix.normalize(path.posix.join('apps/web/.storybook',x)));const patterns=normalized.map(matchGlob);const names=cp.execFileSync('git',['ls-tree','-r','--name-only',head],{encoding:'utf8'}).trim().split('\n');const paths=names.filter(x=>patterns.some(p=>p.test(x))).sort();if(paths.length!==new Set(paths).size||!paths.includes('apps/web/components/organisms/UnifiedSidebar.stories.tsx'))throw Error('Source story inventory invalid');
const inventory={sourceHead:head,sourceTree:tree,sourceConfigPath:sourcePath,sourceConfigSha256:crypto.createHash('sha256').update(source).digest('hex'),configuredFullCatalogGlobs:globs,paths,count:paths.length,limitation:'Tracked exact-head source imports matched to actual configured full-catalog globs. Actual built index.json must separately prove generated story IDs.'};fs.writeFileSync(path.join(dest,'full-story-source-inventory.json'),JSON.stringify(inventory,null,2)+'\n');console.log(JSON.stringify({head,tree,globs:normalized,count:paths.length,uniqueCount:new Set(paths).size}));
