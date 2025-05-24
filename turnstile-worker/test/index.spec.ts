import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Turnstile Worker', () => {
	it('rejects non-POST requests', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(405);
		expect(await response.text()).toBe('Only POST allowed');
	});

	it('rejects requests without JSON content-type', async () => {
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Expected JSON body');
	});

	it('rejects requests with invalid JSON', async () => {
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: 'not valid json',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Invalid JSON');
	});

	it('rejects requests without a Turnstile token', async () => {
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const responseBody = await response.json();
		expect(responseBody.error).toBe('Missing Turnstile token');
	});

	it('verifies a valid Turnstile token', async () => {
		// Mock the fetch function to simulate a successful Turnstile verification
		global.fetch = vi.fn().mockResolvedValue({
			json: () => Promise.resolve({ success: true }),
		});

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'cf-connecting-ip': '127.0.0.1',
			},
			body: JSON.stringify({
				'cf-turnstile-response': 'valid-token',
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const responseBody = await response.json();
		expect(responseBody.verified).toBe(true);
	});

	it('rejects an invalid Turnstile token', async () => {
		// Mock the fetch function to simulate a failed Turnstile verification
		global.fetch = vi.fn().mockResolvedValue({
			json: () => Promise.resolve({
				success: false,
				'error-codes': ['invalid-token']
			}),
		});

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				'cf-turnstile-response': 'invalid-token',
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
		const responseBody = await response.json();
		expect(responseBody.verified).toBe(false);
		expect(responseBody.errors).toEqual(['invalid-token']);
	});
});
