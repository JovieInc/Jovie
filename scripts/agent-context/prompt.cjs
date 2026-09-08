const fs = require('node:fs');
const path = require('node:path');
module.exports = function ({ vars }) {
  const root = path.resolve(__dirname, '../..');
  const policy = ['CLAUDE.md', 'docs/agent-context/README.md']
    .map(p => fs.readFileSync(path.join(root, p), 'utf8'))
    .join('\n\n');
  return JSON.stringify([
    {
      role: 'system',
      content:
        'You are evaluating a synthetic repository scenario. Do not use tools or execute the scenario. Apply the supplied repository instructions and return only the requested JSON decision.\n' +
        policy,
    },
    {
      role: 'user',
      content:
        vars.input +
        '\nReturn only one JSON object with exactly these keys: ' +
        JSON.stringify(vars.decisionFields),
    },
  ]);
};
