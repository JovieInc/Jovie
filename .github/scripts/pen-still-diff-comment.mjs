// biome-ignore-all format: compact comment helper for the advisory Pen-still job.
// biome-ignore-all assist/source/organizeImports: compact helper keeps imports together.
/** Upsert the advisory Pen-still comment and attach the triptych. Failures exit 0. */
import { execFileSync } from 'node:child_process'; import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path'; export const COMMENT_MARKER = '<!-- pen-still-diff -->';
function run(cmd, args) { return execFileSync(cmd, args, { encoding: 'utf8' }); }
/**
* @param {{pr: string, repo: string, bodyFile: string, image?: string, exec?: typeof run}} input
*/
export function upsertTriptychComment({ pr, repo, bodyFile, image, exec = run, }) {
const body = readFileSync(bodyFile, 'utf8'); if (!body.includes(COMMENT_MARKER))
throw new Error('comment body is missing the pen-still marker'); const comments = JSON.parse(
exec('gh', ['api', '--paginate', `repos/${repo}/issues/${pr}/comments`]) || '[]' );
const previous = comments.filter( comment =>
typeof comment.body === 'string' && comment.body.includes(COMMENT_MARKER) ); const args = [ 'pr', 'comment',
String(pr), '--repo', repo, '--body-file', bodyFile, ]; if (image && existsSync(image))
args.push('--attach', `${image}#Pen, render, and diff`); exec('gh', args); for (const comment of previous) {
exec('gh', [ 'api', '-X', 'DELETE', `repos/${repo}/issues/comments/${comment.id}`, ]); }
return { posted: true, removed: previous.length }; } function main() { const pr = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;
const outDir = resolve(process.env.PEN_STILL_OUT ?? 'pen-still-out'); if (!pr || !repo) { process.stderr.write(
'PR_NUMBER or GITHUB_REPOSITORY missing; skip comment\n' ); return; }
const bodyFile = resolve(outDir, 'comment.md'); if (!existsSync(bodyFile)) {
process.stderr.write('comment.md missing; skip comment\n'); return; } try { process.stdout.write(
`${JSON.stringify(upsertTriptychComment({ pr, repo, bodyFile, image: resolve(outDir, 'triptych.png') }))}\n` );
} catch (error) { process.stderr.write( `triptych attach failed (${error.message}); posting text only\n` );
try { upsertTriptychComment({ pr, repo, bodyFile }); } catch (textError) {
process.stderr.write(`comment skipped: ${textError.message}\n`); } } }
if (process.argv[1] && process.argv[1].endsWith('pen-still-diff-comment.mjs'))
main();
