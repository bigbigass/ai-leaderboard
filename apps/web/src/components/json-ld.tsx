import { serializeJsonLd, type JsonLd } from '@/lib/jsonld';

// Server-rendered structured data; `<` is escaped by serializeJsonLd.
export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
