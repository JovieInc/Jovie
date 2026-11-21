import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
const webRoot = process.cwd();
const options = JSON.parse(readFileSync('eslint-rules/shadcn-no-restyle.options.json','utf8'));
const eslint = new ESLint({cwd: webRoot, overrideConfigFile: webRoot+'/eslint.config.js', overrideConfig:{rules:{'shadcn/no-restyle':['error',options]}}});
const res = await eslint.lintFiles(process.argv.slice(2));
for (const r of res) for (const m of r.messages) if (m.ruleId==='shadcn/no-restyle') console.log(r.filePath.split('apps/web/')[1]+':'+m.line+':'+m.column+' '+m.message.slice(0,110));
