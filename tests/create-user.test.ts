import assert from 'node:assert/strict';
import { beforeEach, afterEach, test, mock } from 'node:test';
import handler from '../api/admin/create-user.ts';

const originalEnv = { ...process.env };
const validBody = { email: 'Jing@app.local', password: 'synthetic-password', displayName: 'Jing', role: 'user' };
let caller: any;
let authStatus: number;
let createStatus: number;
let createResult: any;
let requests: { url: string; method: string; authorization: string | null; body: any }[];

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-secret';
  caller = { id: 'owner-id', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: { role: 'admin' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  authStatus = 200;
  createStatus = 200;
  createResult = { ...caller, id: 'new-id', email: 'jing@app.local', app_metadata: { role: 'user' } };
  requests = [];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const r = new Request(input, init);
    requests.push({url: r.url, method: r.method, authorization: r.headers.get('authorization'), body: r.method === 'POST' ? await r.json() : null});
    const auth = r.url.endsWith('/auth/v1/user');
    assert.ok(auth || r.url.endsWith('/auth/v1/admin/users'));
    return new Response(JSON.stringify(auth ? caller : createResult), { status: auth ? authStatus : createStatus, headers: {'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'} });
  });
});
afterEach(() => {
  mock.restoreAll();
  for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});
async function invoke(body: any = validBody, authorization: any = 'Bearer caller-token', method = 'POST') {
  const result = { status: 200, body: undefined as any, headers: {} as Record<string,string> };
  const res = {setHeader(k:string,v:string){result.headers[k]=v;},status(s:number){result.status=s;return this;},json(b:any){result.body=b;return this;}};
  await handler({method,headers:{authorization},body},res);
  return result;
}
test('authorized admin creates a confirmed username account with a server-controlled role', async () => {
  const r = await invoke();
  assert.equal(r.status,201);
  assert.deepEqual(r.body,{user:{id:'new-id',email:'jing@app.local'}});
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.equal(requests[0].authorization,'Bearer caller-token');
  assert.equal(requests[1].authorization,'Bearer test-server-secret');
  assert.deepEqual(requests[1].body,{email:'jing@app.local',password:'synthetic-password',email_confirm:true,app_metadata:{role:'user'},user_metadata:{display_name:'Jing'}});
});
test('admin can select the existing admin role', async () => {
  assert.equal((await invoke({...validBody,role:'admin'})).status,201);
  assert.equal(requests[1].body.app_metadata.role,'admin');
});
test('missing bearer credentials cannot create users', async () => {
  assert.equal((await invoke(validBody,'')).status,401);
  assert.equal(requests.length,0);
});
test('invalid or expired sessions cannot create users', async () => {
  caller={code:'bad_jwt',message:'invalid JWT'};authStatus=401;
  assert.equal((await invoke()).status,401);
  assert.equal(requests.length,1);
});
test('a self-edited user metadata admin role grants no authority', async () => {
  caller.app_metadata={};caller.user_metadata={role:'admin'};
  assert.equal((await invoke()).status,403);
  assert.equal(requests.length,1);
});
test('normal users cannot create users even when requesting admin', async () => {
  caller.app_metadata={role:'user'};
  assert.equal((await invoke({...validBody,role:'admin'})).status,403);
  assert.equal(requests.length,1);
});
for(const [name,body] of [
  ['invalid username',{...validBody,email:'has space@app.local'}],
  ['external email',{...validBody,email:'someone@example.com'}],
  ['short password',{...validBody,password:'123'}],
  ['invalid role',{...validBody,role:'owner'}],
  ['invalid display name',{...validBody,displayName:{name:'bad'}}],
  ['missing body',null],
] as const) test(`${name} returns a useful error without creating an account`,async()=>{
  const r=await invoke(body);assert.equal(r.status,400);assert.equal(typeof r.body.error,'string');assert.ok(requests.every(r=>r.method!=='POST'));
});
test('duplicate usernames return conflict JSON',async()=>{
 createStatus=422;createResult={code:'email_exists',msg:'User already registered'};
 const r=await invoke();assert.equal(r.status,409);assert.match(r.body.error,/already|exists/i);
});
test('password policy failures return actionable JSON',async()=>{
 createStatus=422;createResult={code:'weak_password',msg:'Password should be at least 12 characters.'};
 const r=await invoke();assert.equal(r.status,400);assert.match(r.body.error,/password/i);
});
test('unexpected provider errors do not expose service details',async()=>{
 createStatus=500;createResult={msg:'private provider details test-server-secret'};
 const r=await invoke();assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(r.body),/private|test-server-secret/);
});
test('missing server credentials fail without calling Supabase',async()=>{
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await invoke();assert.equal(r.status,503);assert.equal(requests.length,0);
});
test('unsupported methods cannot create users',async()=>{
 assert.equal((await invoke(null,'','GET')).status,405);assert.equal(requests.length,0);
});
