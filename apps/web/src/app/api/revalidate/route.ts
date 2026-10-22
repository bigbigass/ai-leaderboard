import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tags: z.array(z.string().min(1).max(256)).max(64).optional(),
  paths: z.array(z.string().startsWith('/').max(1024)).max(256).optional(),
});

function secretOk(given: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/revalidate  (header `x-revalidate-secret: $REVALIDATE_SECRET`)
 * body: { "tags"?: string[], "paths"?: string[] }  — empty body revalidates the "db" tag + every page.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const given = req.headers.get('x-revalidate-secret') ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : null);
  if (!secretOk(given)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let json: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid body', issues: parsed.error.issues }, { status: 400 });

  let { tags = [], paths = [] } = parsed.data;
  if (!tags.length && !paths.length) {
    tags = ['db'];
    paths = ['/'];
  }
  for (const tag of tags) revalidateTag(tag);
  // "/" means the whole site (layout scope); other paths revalidate that page only.
  for (const p of paths) {
    if (p === '/') revalidatePath('/', 'layout');
    else revalidatePath(p);
  }
  return NextResponse.json({ ok: true, revalidated: { tags, paths }, now: Date.now() });
}
