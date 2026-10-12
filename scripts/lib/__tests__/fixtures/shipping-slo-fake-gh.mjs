import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (args, flag) => args[args.indexOf(flag) + 1];
export function fakeGh(state, args) {
  state.calls.push(args);
  const bad = reason => {
    throw new Error(reason);
  };
  if (args[0] === 'issue' && args[1] === 'list') {
    if (state.failure === 'lookup') bad('offline simulated transport outage');
    const search = arg(args, '--search');
    const term = search.match(/"([^"]+)"/)?.[1] ?? '';
    let rows = state.issues.filter(
      row => row.title.includes(term) || row.body.includes(term)
    );
    if (args.includes('--label'))
      rows = rows.filter(row => row.labels.includes(arg(args, '--label')));
    return args.includes('--jq') ? String(rows.length) : JSON.stringify(rows);
  }
  if (args[0] === 'label' && args[1] === 'list') {
    if (state.failure === 'label-lookup') bad('offline label transport outage');
    return JSON.stringify(state.labels.map(name => ({ name })));
  }
  if (args[0] === 'issue' && args[1] === 'create') {
    if (
      args.includes('--label') &&
      !state.labels.includes(arg(args, '--label'))
    )
      bad('label absent');
    const number = state.issues.length + 1;
    state.issues.push({
      number,
      title: arg(args, '--title'),
      body: arg(args, '--body'),
      labels: args.includes('--label') ? [arg(args, '--label')] : [],
      comments: [],
    });
    if (state.failure === 'create-after-write') {
      state.failure = null;
      bad('offline response lost after server commit');
    }
    return `https://github.com/JovieInc/Jovie/issues/${number}\n`;
  }
  if (args[0] === 'api' && args.includes('GET')) {
    if (state.failure === 'comments') bad('offline comment lookup outage');
    const number = Number(args.at(-1).match(/issues\/(\d+)\//)?.[1]);
    return JSON.stringify(
      state.issues.find(row => row.number === number)?.comments ?? []
    );
  }
  if (args[0] === 'issue' && args[1] === 'comment') {
    const row = state.issues.find(issue => issue.number === Number(args[2]));
    row.comments.push({ body: arg(args, '--body') });
    if (state.failure === 'comment-after-write') {
      state.failure = null;
      bad('offline comment response lost');
    }
    return `https://github.com/JovieInc/Jovie/issues/${row.number}#issuecomment-offline\n`;
  }
  bad(`unexpected offline gh call: ${JSON.stringify(args)}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // This executable never delegates to a real gh or network client.
  const path = process.env.SLO_OFFLINE_STATE;
  const state = JSON.parse(readFileSync(path, 'utf8'));
  try {
    console.log(fakeGh(state, process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    writeFileSync(path, JSON.stringify(state));
  }
}
