import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BoardView } from '@/components/board-view';
import type { Locale } from '@/i18n/routing';
import { getBoardTable, getEnabledSources } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { resolveLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';

// Archived snapshots: rendered on demand, always noindex, never in the sitemap.
export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}
type Props = { params: Promise<{ locale: string; source: string; board: string; date: string }> };

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, source, board, date } = (await params) as { locale: Locale; source: string; board: string; date: string };
  if (!isDate(date)) return {};
  const table = await getBoardTable(source, board, date);
  if (!table) return {};
  const t = await getTranslations({ locale, namespace: 'leaderboards' });
  const d = fmtDate(locale, date);
  return pageMetadata({
    locale,
    path: `/leaderboards/${source}/${board}/${date}`,
    title: t('historyTitle', { board: table.board.name, date: d }),
    description: t('historyDescription', { board: table.board.name, date: d }),
    noindex: true,
  });
}

export default async function SnapshotPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { source, board, date } = await params;
  if (!isDate(date)) notFound();
  const [table, sources] = await Promise.all([getBoardTable(source, board, date), getEnabledSources()]);
  if (!table) notFound();
  return <BoardView locale={locale} table={table} sources={sources} archived />;
}
