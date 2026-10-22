import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { normalizeName } from './normalize';

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

const variantSchema = z
  .string()
  .regex(/^$|^(reasoning=(on|off|high|low|medium)|style_control=(on|off)|quant=[\w.-]+|provider=[\w.-]+)(;(reasoning=(on|off|high|low|medium)|style_control=(on|off)|quant=[\w.-]+|provider=[\w.-]+))*$/);

export const aliasSchema = z.object({
  source: z.string().min(1), // adapter id, or "*" for any source
  name: z.string().min(1),
  variant: variantSchema.default(''),
});

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const modelEntrySchema = z.object({
  model: slug,
  name: z.string().min(1),
  vendor: slug,
  family: z.string().min(1),
  released: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  open_weights: z.boolean().optional(),
  license: z.string().optional(),
  params: z.object({ total: z.number().positive().optional(), active: z.number().positive().optional() }).optional(),
  modalities: z.array(z.enum(['text', 'image', 'audio', 'video'])).default(['text']),
  aliases: z.array(aliasSchema).default([]),
});
export type ModelEntry = z.infer<typeof modelEntrySchema>;

export const vendorSchema = z.object({
  slug,
  name: z.string().min(1),
  country: z.string().length(2),
  website: z.string().url().optional(),
});
export type VendorEntry = z.infer<typeof vendorSchema>;

export interface Catalog {
  vendors: VendorEntry[];
  models: ModelEntry[];
}

export interface FlatAlias {
  modelSlug: string;
  source: string;
  rawName: string;
  normalized: string;
  variantKey: string;
}

/** Validates cross-references and alias collisions. Throws on any problem — a bad alias file must never ship. */
export function validateCatalog(input: unknown, vendorsInput: unknown): Catalog {
  const models = z.array(modelEntrySchema).parse(input);
  const vendors = z.array(vendorSchema).parse(vendorsInput);
  const vendorSlugs = new Set(vendors.map((v) => v.slug));
  const seen = new Set<string>();
  for (const m of models) {
    if (seen.has(m.model)) throw new Error(`aliases.yaml: duplicate model ${m.model}`);
    seen.add(m.model);
    if (!vendorSlugs.has(m.vendor)) throw new Error(`aliases.yaml: model ${m.model} has unknown vendor ${m.vendor}`);
  }
  // Two different models must never share an exact or normalized alias within a source.
  const owner = new Map<string, string>();
  for (const a of flattenAliases(models)) {
    for (const key of [`x|${a.source}|${a.rawName}`, `n|${a.source}|${a.normalized}`]) {
      const prev = owner.get(key);
      if (prev && prev !== a.modelSlug) {
        throw new Error(`aliases.yaml: alias "${a.rawName}" (${a.source}) maps to both ${prev} and ${a.modelSlug}`);
      }
      owner.set(key, a.modelSlug);
    }
  }
  return { vendors, models };
}

/** Each model's canonical slug is implicitly an alias for every source. */
export function flattenAliases(models: ModelEntry[]): FlatAlias[] {
  const out: FlatAlias[] = [];
  for (const m of models) {
    out.push({ modelSlug: m.model, source: '*', rawName: m.model, normalized: normalizeName(m.model), variantKey: '' });
    for (const a of m.aliases) {
      out.push({ modelSlug: m.model, source: a.source, rawName: a.name, normalized: normalizeName(a.name), variantKey: a.variant });
    }
  }
  return out;
}

export async function loadCatalog(dir = DATA_DIR): Promise<Catalog> {
  const [aliases, vendors] = await Promise.all([
    readFile(path.join(dir, 'aliases.yaml'), 'utf8'),
    readFile(path.join(dir, 'vendors.yaml'), 'utf8'),
  ]);
  return validateCatalog(YAML.parse(aliases), YAML.parse(vendors));
}
