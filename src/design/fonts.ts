/**
 * The app's typefaces, served from this site. They used to come from Google Fonts, which meant every
 * visitor's address went to Google on their first page view; now the files are bundled by Vite from
 * the @fontsource packages (all SIL Open Font License) and nothing is requested from anywhere else.
 *
 * Variable fonts take the family name "<Name> Variable". The weights the CSS asks for (200-1000 for
 * Nunito, 100-800 for JetBrains Mono, and so on) are all inside their axes. Each family is split into
 * scripts with a unicode-range, so the browser downloads only the ones a page's text needs.
 *
 * Which scripts ship, and why:
 *   - Nunito (body, and where pal nicknames show) and JetBrains Mono: every script the font has, since
 *     a nickname from a save can be in any of them.
 *   - Oxanium and Josefin Sans (display faces of two skins): all of theirs, a few KB each.
 *   - Lilita One and Zen Antique (display faces of the other two): Latin and Latin Extended only. Zen
 *     Antique's Japanese sets are 4.8 MB in 123 files; text outside Latin falls back to the next font.
 *
 * public/font-licenses.txt carries each font's copyright notice and the OFL text, which the licence
 * requires to travel with the files; the footers link to it. Regenerate it when a package is added
 * or updated: concatenate each package's LICENSE (the LICENSE file in each package under node_modules/@fontsource).
 */
import '@fontsource-variable/nunito/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/oxanium/wght.css';
import '@fontsource-variable/josefin-sans/wght.css';
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/lilita-one/latin-ext-400.css';
import '@fontsource/zen-antique/latin-400.css';
import '@fontsource/zen-antique/latin-ext-400.css';
