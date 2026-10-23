// Synthetic adapters only. The regression runner copies the real action/auth modules.
// No database, credentials, auth bypass route, or external service is used.
export const fixtureFiles = {
  'src/app/fixture-actions.ts': String.raw`
'use server';
import {redirect} from 'next/navigation';
import {getAudienceMemberDetails} from './app/(shell)/dashboard/audience/actions';
import {getProfileContactsForOwner} from './app/(shell)/dashboard/contacts/actions';
import {read,set} from '@/stubs/state';
export async function exercise(form:FormData){
const scenario=String(form.get('scenario'));
let result:any;
try{
 if(scenario==='revoke'){const s=read();s.owner='fixture-new-owner';set(s);result={ok:true,owner:s.owner};}
 else if(scenario==='audience'){result={ok:true,value:await getAudienceMemberDetails({memberId:'fixture-member',selectedProfileId:'fixture-profile'})};}
 else if(scenario==='contacts'){result={ok:true,value:await getProfileContactsForOwner('fixture-profile')};}
 else{throw new Error('Unknown local scenario');}
}catch(error){result={ok:false,error:error instanceof Error?error.message:String(error)};}
result.events=read().events;
redirect('/?result='+encodeURIComponent(JSON.stringify(result)));
}
`,
  'src/app/layout.tsx': String.raw`
export default function Layout({children}:any){return <html><body>{children}</body></html>;}
`,
  'src/app/page.tsx': String.raw`
import {exercise} from './fixture-actions';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:any){const p=await searchParams;return <main><h1>Local synthetic cache boundary test</h1><pre id="result">{p.result||''}</pre>{['audience','contacts','revoke'].map(s=><form action={exercise} key={s}><input name="scenario" value={s} readOnly/><button type="submit">{s}</button></form>)}</main>;}
`,
  'src/lib/admin/impersonation.ts': String.raw`
export async function getImpersonationState(){return null;}
`,
  'src/lib/auth/app-user-id.ts': String.raw`
import {eq} from 'drizzle-orm'; export const appUserIdFilter=(table:any,id:string)=>eq(table.id,id);
`,
  'src/lib/auth/app-user.ts': String.raw`
export async function getAppUserByBetterAuthId(id:string){return {id,userStatus:'active',deletedAt:null};} export const getAppUserById=getAppUserByBetterAuthId;
`,
  'src/lib/auth/better-auth.ts': String.raw`
import {event} from '@/stubs/state';
export const auth={api:{async getSession({headers}:{headers:Headers}){event('better-auth-leaf');const id=headers.get('x-fixture-user');return id?{user:{id},session:{id:'synthetic-session'}}:null;}}};
`,
  'src/lib/auth/dev-test-auth.server.ts': String.raw`
export async function getCachedDevTestAuthSession(){return null;} export function buildDevTestAuthCurrentUser(){return null;}
`,
  'src/lib/auth/jovie-user.ts': String.raw`
export const toJovieUser=(x:any)=>x;
`,
  'src/lib/auth/status-checker.ts': String.raw`
export function checkUserStatus(){return {isBlocked:false};}
`,
  'src/lib/cache/profile.ts': String.raw`
export async function invalidateProfileCache(){}
`,
  'src/lib/cache/tags.ts': String.raw`
export const CACHE_TTL={MEDIUM:300};export const CACHE_TAGS={AUDIENCE_DATA:'audience'};export const createAudienceDataTag=(id:string)=>'audience:'+id;
`,
  'src/lib/contacts/queries.ts': String.raw`
import {event} from '@/stubs/state'; export async function getDashboardContacts(){event('contacts-query');return [{id:'synthetic-contact',personName:'Synthetic private contact'}];}
`,
  'src/lib/contacts/validation.ts': String.raw`
export const sanitizeContactInput=(x:any)=>x;
`,
  'src/lib/db/client.ts': String.raw`
export function logDbError(){} export function logDbInfo(){} export async function withRetry(fn:any){return fn();}
`,
  'src/lib/db/index.ts': String.raw`
import {read,event} from '@/stubs/state';
export function query(){let table:any;let where:any;const q:any={from(t:any){table=t;return q;},where(w:any){where=w;return q;},limit(){return q;},innerJoin(){return q;},leftJoin(){return q;},orderBy(){return q;},groupBy(){return q;},as(){return q;},then(resolve:any,reject:any){if(table?.__name==='creatorProfiles'){event('ownership-query');const s=read();const allowed=JSON.stringify(where).includes('"'+s.owner+'"');return Promise.resolve(allowed?[{id:'fixture-profile',username:'synthetic',usernameNormalized:'synthetic'}]:[]).then(resolve,reject);} event('audience-query');return Promise.resolve([]).then(resolve,reject);}};return q;}
export const db={select:()=>query(),execute:async()=>[]};
export async function doesColumnExist(){return true;}
export async function applyRlsSessionUser(){}
export async function applyRlsTransactionUser(tx:any,userId:string){event('rls:'+userId);}
export function getRlsTransactionSessionSetSql(){return '';}
export async function resetRlsSession(){}
`,
  'src/lib/db/legacy-transaction.ts': String.raw`
import {db} from './index'; export async function runLegacyDbTransaction(fn:any){return fn(db);}
`,
  'src/lib/db/queries/audience-cursor.ts': String.raw`
export function buildCursorCondition(){return null;}export function decodeCursor(){return null;}export function encodeCursor(){return null;}
`,
  'src/lib/db/schema/analytics.ts': String.raw`
export const audienceMembers:any=new Proxy({__name:'audienceMembers'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
export const clickEvents:any=new Proxy({__name:'clickEvents'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
`,
  'src/lib/db/schema/auth.ts': String.raw`
export const users:any=new Proxy({__name:'users'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
`,
  'src/lib/db/schema/profiles.ts': String.raw`
export const creatorProfiles:any=new Proxy({__name:'creatorProfiles'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
export const creatorContactAssignments:any=new Proxy({__name:'creatorContactAssignments'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
export const creatorContactPeople:any=new Proxy({__name:'creatorContactPeople'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
export const creatorContactResponsibilities:any=new Proxy({__name:'creatorContactResponsibilities'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
export const creatorContacts:any=new Proxy({__name:'creatorContacts'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
`,
  'src/lib/db/schema/tip-audience.ts': String.raw`
export const tipAudience:any=new Proxy({__name:'tipAudience'},{get(o:any,p){return p==='__name'?o.__name:o.__name+'.'+String(p);}});
`,
  'src/lib/entitlements/server.ts': String.raw`
export async function getCurrentUserEntitlements(){return {contactsLimit:null};}
`,
  'src/lib/notifications/artist-email.ts': String.raw`
export function buildArtistEmailState(){return {};}export function isArtistEmailOptedIn(){return false;}export function readArtistEmailReadyFromSettings(){return false;}
`,
  'src/lib/observability/revenue-spine.ts': String.raw`
export function captureRevenueSpineFailure(){}
`,
  'src/lib/sentry/set-user-context.ts': String.raw`
export async function attachSentryContext(){}
`,
  'src/lib/utils/audience.ts': String.raw`
export const formatCountryLabel=(x:any)=>x;
`,
  'src/lib/utils/date.ts': String.raw`
export const toISOStringOrNull=(x:any)=>x;
`,
  'src/lib/utils/string-utils.ts': String.raw`
export const safeDecodeURIComponent=decodeURIComponent;
`,
  'src/stubs/drizzle.ts': String.raw`
const op=(...args:any[])=>args;
export const and=op,asc=op,desc=op,eq=op,gt=op,gte=op,ne=op,or=op,notInArray=op;
export const sql=Object.assign((...args:any[])=>({as:()=>({})}),{raw:op,join:op,empty:op});
`,
  'src/stubs/state.ts': String.raw`
import fs from 'node:fs';
import path from 'node:path';
const file=path.join(process.cwd(),'synthetic-state.json');
export function read(){return JSON.parse(fs.readFileSync(file,'utf8'));}
export function set(value:any){fs.writeFileSync(file,JSON.stringify(value));}
export function event(name:string){const s=read();s.events.push(name);set(s);}
`,
};
