/**
 * The two places PalDoc sends people off the site. Plain links, opened only when clicked: no
 * script, picture or widget is loaded from either, so nothing leaves the visitor's browser by
 * itself and the Content-Security-Policy (public/_headers) needs no exception for them.
 */

/** Where a problem is reported. */
export const ISSUES_URL = 'https://github.com/sasank0501/palworld-breeding-index/issues';

/** The author's tip page. Shown on the public site only, never beside the portfolio build's hosted art. */
export const SUPPORT_URL = 'https://buymeacoffee.com/rougestark';
export const SHOW_SUPPORT = import.meta.env.MODE !== 'resume';
