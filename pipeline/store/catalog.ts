import { leaderboards, modelAliases, models, sources, vendors, type Db } from '@ail/db';
import { eq, inArray, notInArray, sql } from 'drizzle-orm';
import { flattenAliases, type Catalog } from '../matcher/catalog';
import type { SourceWithFlag } from '../sources.config';

/**
 * Mirror vendors.yaml / aliases.yaml / sources.config.ts into the DB. aliases.yaml is the source of
 * truth: model_aliases is rebuilt from it on every run.
 */
export async function syncCatalog(db: Db, catalog: Catalog, srcs: SourceWithFlag[]): Promise<Map<string, number>> {
  return db.transaction(async (tx) => {
    for (const v of catalog.vendors) {
      await tx
        .insert(vendors)
        .values({ slug: v.slug, name: v.name, country: v.country.toUpperCase(), website: v.website ?? null })
        .onConflictDoUpdate({
          target: vendors.slug,
          set: { name: v.name, country: v.country.toUpperCase(), website: v.website ?? null },
        });
    }
    const vendorIds = new Map((await tx.select({ id: vendors.id, slug: vendors.slug }).from(vendors)).map((r) => [r.slug, r.id]));

    for (const m of catalog.models) {
      const values = {
        slug: m.model,
        displayName: m.name,
        vendorId: vendorIds.get(m.vendor)!,
        family: m.family,
        paramsTotal: m.params?.total ?? null,
        paramsActive: m.params?.active ?? null,
        openWeights: m.open_weights ?? null,
        license: m.license ?? null,
        modalities: m.modalities,
        releasedAt: m.released ?? null,
        status: 'active',
      };
      await tx
        .insert(models)
        .values(values)
        .onConflictDoUpdate({ target: models.slug, set: { ...values, updatedAt: sql`now()` } });
    }
    // Models removed from aliases.yaml are hidden, not deleted (their history stays).
    const slugs = catalog.models.map((m) => m.model);
    if (slugs.length) await tx.update(models).set({ status: 'hidden' }).where(notInArray(models.slug, slugs));

    const modelIds = new Map((await tx.select({ id: models.id, slug: models.slug }).from(models)).map((r) => [r.slug, r.id]));
    await tx.delete(modelAliases);
    const rows = flattenAliases(catalog.models).map((a) => ({
      modelId: modelIds.get(a.modelSlug)!,
      sourceSlug: a.source,
      rawName: a.rawName,
      normalizedName: a.normalized,
      variantKey: a.variantKey,
    }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(modelAliases).values(rows.slice(i, i + 500));

    for (const s of srcs) {
      const values = {
        slug: s.id,
        name: s.name,
        homepage: s.url,
        license: s.license,
        licenseUrl: s.licenseUrl,
        attribution: s.attribution,
        kind: s.kind,
        enabled: s.enabled,
      };
      await tx.insert(sources).values(values).onConflictDoUpdate({ target: sources.slug, set: values });
    }
    // Sources that no longer exist in config are disabled.
    const ids = srcs.map((s) => s.id);
    await tx.update(sources).set({ enabled: false }).where(notInArray(sources.slug, ids));
    return modelIds;
  });
}

export async function modelIdMap(db: Db): Promise<Map<string, number>> {
  return new Map((await db.select({ id: models.id, slug: models.slug }).from(models)).map((r) => [r.slug, r.id]));
}

export async function sourceId(db: Db, slug: string): Promise<number> {
  const [row] = await db.select({ id: sources.id }).from(sources).where(eq(sources.slug, slug));
  if (!row) throw new Error(`source ${slug} not synced`);
  return row.id;
}

export async function leaderboardIdsForSources(db: Db, sourceIds: number[]): Promise<number[]> {
  if (!sourceIds.length) return [];
  return (await db.select({ id: leaderboards.id }).from(leaderboards).where(inArray(leaderboards.sourceId, sourceIds))).map((r) => r.id);
}
