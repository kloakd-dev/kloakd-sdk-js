import { callUrl, makeClient, mockFetch, ORG_PREFIX, parseCallBody } from './helpers.js';

type Calls = { mock: { calls: unknown[][] } };
const first = (f: unknown) => (f as Calls).mock.calls[0]!;
const base = `https://api.kloakd.dev${ORG_PREFIX}`;

describe('fetchyr', () => {
  it('authenticates with stored credentials', async () => {
    const fetch = mockFetch({ success: true, session_id: 'sess-1', artifact_id: 'art-1', target_domain: 'example.com', auth_method: 'form' });
    const r = await makeClient(fetch).fetchyr.authenticate('my-login', 'https://example.com/login');
    expect(callUrl(first(fetch))).toBe(`${base}/fetchyr/authenticate`);
    expect(parseCallBody(first(fetch))).toEqual({ credential_name: 'my-login', target_url: 'https://example.com/login' });
    expect([r.ok, r.sessionId, r.artifactId, r.authMethod]).toEqual([true, 'sess-1', 'art-1', 'form']);
  });

  it('stores credentials with the API fields', async () => {
    const fetch = mockFetch({ name: 'my-login' });
    await makeClient(fetch).fetchyr.storeCredentials('my-login', { username: 'u', password: 'p' });
    expect(parseCallBody(first(fetch))).toEqual({ name: 'my-login', username: 'u', password: 'p' });
  });

  it('creates and executes a workflow', async () => {
    const create = mockFetch({ id: 'wf-1', name: 'w', steps: [{ a: 1 }], is_active: true, created_at: 't' });
    const wf = await makeClient(create).fetchyr.createWorkflow('w', [{ a: 1 }], { description: 'd' });
    expect(parseCallBody(first(create))).toEqual({ name: 'w', steps: [{ a: 1 }], description: 'd' });
    expect(wf.workflowId).toBe('wf-1');

    const run = mockFetch({ execution_id: 'ex-1', workflow_id: 'wf-1', status: 'completed', result: { n: 1 } });
    const ex = await makeClient(run).fetchyr.executeWorkflow('wf-1', 'https://example.com', { sessionArtifactId: 's' });
    expect(parseCallBody(first(run))).toEqual({ target_url: 'https://example.com', session_artifact_id: 's' });
    expect([ex.ok, ex.result]).toEqual([true, { n: 1 }]);
  });

  it('detects forms at form/detect', async () => {
    const fetch = mockFetch({ url: 'u', forms_found: 1, login_form_detected: true, fields: [{ name: 'email' }] });
    const r = await makeClient(fetch).fetchyr.detectForms('u');
    expect(callUrl(first(fetch))).toBe(`${base}/fetchyr/form/detect`);
    expect([r.totalForms, r.loginFormDetected, r.forms.length]).toEqual([1, true, 1]);
  });

  it('detects MFA at mfa/detect and resolves a challenge in the queue', async () => {
    const detect = mockFetch({ mfa_detected: true, mfa_type: 'totp', challenge_id: 'ch-1', message: 'enter code' });
    const d = await makeClient(detect).fetchyr.detectMfa('u');
    expect(callUrl(first(detect))).toBe(`${base}/fetchyr/mfa/detect`);
    expect([d.mfaDetected, d.challengeId, d.message]).toEqual([true, 'ch-1', 'enter code']);

    const resolve = mockFetch({ id: 'ch-1', status: 'resolved', mfa_type: 'totp' });
    const c = await makeClient(resolve).fetchyr.submitMfa('ch-1', '123456');
    expect(callUrl(first(resolve))).toBe(`${base}/fetchyr/mfa-queue/ch-1/resolve`);
    expect(parseCallBody(first(resolve))).toEqual({ resolution: '123456' });
    expect(c.status).toBe('resolved');
  });

  it('checks one URL for duplicates', async () => {
    const fetch = mockFetch({ is_duplicate: true, original_url: 'https://e.com/a', similarity_score: 1, match_type: 'exact' });
    const r = await makeClient(fetch).fetchyr.checkDuplicate('https://e.com/a?x', { sessionId: 'ds-1' });
    expect(parseCallBody(first(fetch))).toEqual({ url: 'https://e.com/a?x', session_id: 'ds-1' });
    expect([r.isDuplicate, r.matchType]).toEqual([true, 'exact']);
  });
});
