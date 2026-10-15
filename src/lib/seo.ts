/**
 * What search engines and link previews read about each page. index.html carries the home page's
 * title, description and share tags for anything that doesn't run scripts; once the app runs, each
 * screen sets its own here, the same way it sets document.title.
 *
 * Only the pages a visitor without a save can open are worth finding in a search: the landing page,
 * the Paldex and its species pages (vite.config.ts lists those in sitemap.xml). Those get a canonical
 * address on paldoc.app, so the pages.dev copies of the site count as the same page, not a duplicate.
 * Google asks that a canonical set by script not contradict one in the HTML, so index.html has none.
 */

export const SITE = 'https://paldoc.app';

export const HOME_TITLE = 'PalDoc: Palworld breeding calculator and save viewer';
export const HOME_DESCRIPTION =
  'Free Palworld breeding calculator, Paldex and save viewer. Find every parent pair for a pal, plan passive skill lineages, and see the pals in your own save, all in your browser.';
export const DEX_DESCRIPTION =
  'Every Palworld species with its elements, work suitability and every parent pair that breeds it. Browse the Paldex without a save.';
export const speciesDescription = (name: string): string =>
  `${name} in Palworld: every parent pair that breeds ${name}, its elements and work suitability, and a breeding calculator.`;

function meta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  el.content = content;
}

/**
 * Title, description and share tags for the screen now showing. `path` is its address when it is a
 * page worth indexing, and null for one that only exists with a save loaded (no canonical then).
 */
export function describePage(title: string, description: string, path: string | null) {
  document.title = title;
  meta('name', 'description', description);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (path === null) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.append(link);
  }
  link.href = SITE + path;
  meta('property', 'og:url', SITE + path);
}
