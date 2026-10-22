import { serializeJsonLd, type JsonLd } from '@/lib/jsonld';

export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  // eslint-disable-next-line react/no-danger -- server-rendered structured data, `<` escaped
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
