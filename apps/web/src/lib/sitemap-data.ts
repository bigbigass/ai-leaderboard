import 'server-only';
import { getBoards, getModelList, getVendors } from './data';
import { buildSitemapPaths } from './sitemap-paths';

export async function loadSitemapPaths() {
  const [list, boards, vendors] = await Promise.all([getModelList(), getBoards(), getVendors()]);
  return buildSitemapPaths(list, boards, vendors);
}
