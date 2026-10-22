import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (t: string) => revalidateTag(t), revalidatePath: (p: string, k?: string) => revalidatePath(p, k) }));

const { POST } = await import('@/app/api/revalidate/route');

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/revalidate', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 's3cret';
    revalidateTag.mockClear();
    revalidatePath.mockClear();
  });

  it('401 without or with a wrong secret, and revalidates nothing', async () => {
    expect((await POST(req({ tags: ['db'] }))).status).toBe(401);
    expect((await POST(req({ tags: ['db'] }, { 'x-revalidate-secret': 'nope' }))).status).toBe(401);
    expect((await POST(req({ tags: ['db'] }, { 'x-revalidate-secret': 's3cret-but-longer' }))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('401 when the server has no secret configured', async () => {
    delete process.env.REVALIDATE_SECRET;
    expect((await POST(req({}, { 'x-revalidate-secret': '' }))).status).toBe(401);
  });

  it('revalidates the given tags and paths with a good secret', async () => {
    const res = await POST(req({ tags: ['db', 'models'], paths: ['/en/models/gpt-5', '/'] }, { 'x-revalidate-secret': 's3cret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, revalidated: { tags: ['db', 'models'], paths: ['/en/models/gpt-5', '/'] } });
    expect(revalidateTag.mock.calls).toEqual([['db'], ['models']]);
    expect(revalidatePath.mock.calls).toEqual([
      ['/en/models/gpt-5', undefined],
      ['/', 'layout'],
    ]);
  });

  it('accepts a Bearer token and defaults to everything on an empty body', async () => {
    const res = await POST(req(undefined, { authorization: 'Bearer s3cret' }));
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('db');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('400 on an invalid body', async () => {
    expect((await POST(req({ paths: ['no-leading-slash'] }, { 'x-revalidate-secret': 's3cret' }))).status).toBe(400);
  });
});
