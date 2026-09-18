import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test, mock } from 'node:test';
import handler from '../api/scan-receipt.ts';

const receipt = {
  merchant: 'Village Grocer', merchant_raw: 'VILLAGE GROCER SDN BHD',
  date: '2026-09-04', amount: 63.75, currency: 'MYR', category: 'Groceries',
  is_unreadable: false,
  confidence: { merchant: 0.95, date: 0.9, amount: 0.99, category: 0.85 },
};
const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const originalEnv = { ...process.env };
let requests: { url: string; headers: Headers; body: any }[];
let upstream: Record<string, unknown>;
let upstreamStatus: number;

function responseWith(data: unknown) {
  return {
    id: 'resp_test', object: 'response', created_at: 1, status: 'completed',
    error: null, incomplete_details: null, model: 'gpt-5.6-luna',
    output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(data), annotations: [], logprobs: [] }] }],
    parallel_tool_calls: true, tool_choice: 'auto', tools: [],
    temperature: 1, top_p: 1, metadata: {},
    usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200,
      input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  requests = [];
  upstream = responseWith(receipt);
  upstreamStatus = 200;
  // Replace only the external transport; the route and OpenAI SDK remain real.
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, headers: request.headers, body: await request.json() });
    return new Response(JSON.stringify(upstream), {
      status: upstreamStatus, headers: { 'Content-Type': 'application/json' },
    });
  });
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL']) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

async function invoke(body: unknown, method = 'POST') {
  const result = { status: 200, body: undefined as any, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { result.headers[name] = value; },
    status(code: number) { result.status = code; return this; },
    json(value: unknown) { result.body = value; return this; },
    end() { return this; },
  };
  await handler({ method, body } as any, res as any);
  return result;
}

test('image extraction preserves the form fields and sends a private structured OpenAI request', async () => {
  const result = await invoke({ fileBase64: imageBase64, mimeType: 'image/png', existingCategories: ['Groceries', 'Travel'] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, receipt);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.get('authorization'), 'Bearer test-openai-key');
  assert.equal(request.body.store, false);
  assert.match(request.body.instructions, /Groceries, Travel/);
  assert.deepEqual(request.body.input[0].content[0], {
    type: 'input_image', image_url: `data:image/png;base64,${imageBase64}`, detail: 'high',
  });
  const format = request.body.text.format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.strict, true);
  assert.equal(format.schema.additionalProperties, false);
  assert.equal(format.schema.properties.confidence.additionalProperties, false);
  assert.deepEqual([...format.schema.required].sort(), Object.keys(receipt).sort());
});

test('PDF receipts use file input, while the model can be configured without frontend changes', async () => {
  process.env.OPENAI_MODEL = 'gpt-5.6-sol';
  const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
  const result = await invoke({ fileBase64: pdf, mimeType: 'application/pdf' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, receipt);
  assert.equal(requests[0].body.model, 'gpt-5.6-sol');
  assert.deepEqual(requests[0].body.input[0].content[0], {
    type: 'input_file', filename: 'receipt.pdf', file_data: `data:application/pdf;base64,${pdf}`,
  });
  assert.match(requests[0].body.instructions, /Food & Dining, Groceries/);
});

test('multi-megabyte PDFs pass validation without overflowing the JavaScript stack', async () => {
  const fileBase64 = Buffer.alloc(4_000_000).toString('base64');
  const result = await invoke({ fileBase64, mimeType: 'application/pdf' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, receipt);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.input[0].content[0].file_data, `data:application/pdf;base64,${fileBase64}`);
});

for (const mimeType of ['image/heic', 'image/heif']) {
  test(`${mimeType} receipts are converted to JPEG before OpenAI sees them`, async () => {
    const fileBase64 = readFileSync(new URL('./fixtures/sample.heic', import.meta.url)).toString('base64');
    const result = await invoke({ fileBase64, mimeType });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, receipt);
    const part = requests[0].body.input[0].content[0];
    assert.equal(part.type, 'input_image');
    assert.match(part.image_url, /^data:image\/jpeg;base64,/);
    const bytes = Buffer.from(part.image_url.split(',')[1], 'base64');
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  });
}

test('missing OpenAI key produces an actionable error without an upstream call', async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await invoke({ fileBase64: imageBase64, mimeType: 'image/png' });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /OPENAI_API_KEY/);
  assert.equal(requests.length, 0);
});

for (const [name, body] of [
  ['missing receipt', undefined],
  ['non-string receipt', { fileBase64: 123, mimeType: 'image/png' }],
  ['invalid base64', { fileBase64: 'not base64!', mimeType: 'image/png' }],
  ['unsupported format', { fileBase64: imageBase64, mimeType: 'text/html' }],
  ['corrupt HEIC', { fileBase64: imageBase64, mimeType: 'image/heic' }],
] as const) {
  test(`${name} is rejected before any paid API call`, async () => {
    const result = await invoke(body);
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, 'string');
    assert.equal(requests.length, 0);
  });
}

test('unreadable receipts retain the existing fallback flag and empty values', async () => {
  const unreadable = { ...receipt, merchant: '', merchant_raw: '', date: '', amount: 0, is_unreadable: true };
  upstream = responseWith(unreadable);
  const result = await invoke({ fileBase64: imageBase64, mimeType: 'image/png' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, unreadable);
});

for (const failure of ['incomplete', 'refusal', 'empty', 'invalid-json', 'invalid-fields']) {
  test(`${failure} AI output returns an error instead of populating an expense`, async () => {
    if (failure === 'incomplete') upstream.status = 'incomplete';
    if (failure === 'refusal') upstream.output = [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot process this file.' }] }];
    if (failure === 'empty') upstream.output = [];
    if (failure === 'invalid-json') (upstream.output as any)[0].content[0].text = '{broken';
    if (failure === 'invalid-fields') upstream = responseWith({ ...receipt, amount: '63.75' });
    const result = await invoke({ fileBase64: imageBase64, mimeType: 'image/png' });
    assert.equal(result.status, 500);
    assert.equal(typeof result.body.error, 'string');
    assert.equal(result.body.merchant, undefined);
    assert.equal(requests.length, 1);
    assert.doesNotMatch(result.body.error, /API_KEY/);
  });
}

test('upstream failures keep the error contract without exposing provider details or retrying', async () => {
  upstreamStatus = 429;
  upstream = { error: { message: 'Sensitive upstream details', type: 'rate_limit_error', code: 'rate_limit_exceeded' } };
  const result = await invoke({ fileBase64: imageBase64, mimeType: 'image/png' });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /busy|limit|try again/i);
  assert.doesNotMatch(result.body.error, /Sensitive upstream details/);
  assert.equal(requests.length, 1);
});

test('preflight and unsupported methods preserve endpoint behavior without calling AI', async () => {
  assert.equal((await invoke(undefined, 'OPTIONS')).status, 200);
  assert.equal((await invoke(undefined, 'GET')).status, 405);
  assert.equal(requests.length, 0);
});
