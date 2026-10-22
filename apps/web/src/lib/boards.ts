import type { BoardInfo } from '@ail/db/queries';

export const boardPath = (b: Pick<BoardInfo, 'sourceSlug' | 'boardKey'>) => `/leaderboards/${b.sourceSlug}/${b.boardKey}`;

export function boardLookup(boards: BoardInfo[]) {
  const bySlug = new Map(boards.map((b) => [b.slug, b]));
  return {
    get: (slug: string) => bySlug.get(slug),
    name: (slug: string) => bySlug.get(slug)?.name ?? slug,
    path: (slug: string) => {
      const b = bySlug.get(slug);
      return b ? boardPath(b) : null;
    },
  };
}
