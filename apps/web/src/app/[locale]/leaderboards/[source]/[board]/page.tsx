import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BoardView } from '@/components/board-view';
import type { Locale } from '@/i18n/routing';
import { getBoards, getBoardTable, getEnabledSources } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { resolveLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
type Props = { params: Promise<{ locale: string; source: string; board: string }> };

export async function generateStaticParams() {
  return (await getBoards()).map((b) => ({ source: b.sourceSlug, board: b.boardKey }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, source, board } = (await params) as { locale: Locale; source: string; board: string };
  const table = await getBoardTable(source, board);
  if (!table) return {};
  const t = await getTranslations({ locale, namespace: 'leaderboards' });
  const date = fmtDate(locale, table.publishedAt);
  return pageMetadata({
    locale,
    path: `/leaderboards/${source}/${board}`,
    title: t('boardTitle', { board: table.board.name, date }),
    description: t('boardDescription', {
      board: table.board.name,
      count: table.rows.length,
      date,
      leader: table.rows[0]?.modelName ?? '—',
      source: table.board.sourceName,
    }),
    noindex: table.rows.length === 0,
  });
}

export default async function BoardPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { source, board } = await params;
  const [table, sources] = await Promise.all([getBoardTable(source, board), getEnabledSources()]);
  if (!table) notFound();
  return <BoardView locale={locale} table={table} sources={sources} archived={false} />;
}
