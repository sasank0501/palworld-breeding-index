/**
 * PalDoc's own element and work icons, as path data on a 24 x 24 grid. They are drawn for this
 * site (after the game's icons in what each one shows, so a player knows them at a glance), not
 * copied from the game's files, so every build has them, the public one included.
 *
 * Each icon is a few parts, and a part's `c` says which colour paints it:
 *   glyph              an element's mark, in the element's colour
 *   cut                a detail knocked out of a mark, painted in the surface behind it
 *   main, shade, tint  a work icon's own colour, and a darker and a lighter step of it
 * src/design/icons.tsx turns the roles into colours.
 */
export interface IconPart {
  c: 'glyph' | 'cut' | 'main' | 'shade' | 'tint';
  d: string;
  /** Drawn as a round-ended line of this width instead of a filled shape. */
  stroke?: number;
  evenodd?: boolean;
}

export const ELEMENT_ICONS: Record<string, IconPart[]> = {
  fire: [
    { c: 'glyph', d: 'M12.3 6c.5 2.3 3.4 3.5 3.4 6.9a3.7 3.7 0 0 1-7.4 0c0-1.6.7-2.6 1.6-3.4.1 1.1.5 1.7 1.1 2-.2-2.1.3-4.1 1.3-5.5zM12 12.7c.8.8 1.4 1.4 1.4 2.2a1.4 1.4 0 0 1-2.8 0c0-.8.6-1.4 1.4-2.2z', evenodd: true },
  ],
  water: [
    { c: 'glyph', d: 'M12 6.1c2.1 2.6 3.8 4.7 3.8 7a3.8 3.8 0 0 1-7.6 0c0-2.3 1.7-4.4 3.8-7z' },
    { c: 'cut', d: 'M10 13.4a2 2 0 0 0 2 2', stroke: 1.2 },
  ],
  grass: [
    { c: 'glyph', d: 'M17 6.9c.5 5.2-1.9 9.4-6.7 9.9-2 .2-3.1-1-3.1-2.8 0-4.5 4.1-7.1 9.8-7.1z' },
    { c: 'cut', d: 'M8.2 16.2 14.9 9.4', stroke: 1.1 },
  ],
  electric: [
    { c: 'glyph', d: 'M13.5 5.8 8 12.9h3.3l-1 5.4 5.8-7.5h-3.4z' },
  ],
  ice: [
    { c: 'glyph', d: 'M12 12 12 6.1M12 8.5l-1.46 -1.22M12 8.5l1.46 -1.22M12 12 17.11 9.05M15.03 10.25l0.33 -1.87M15.03 10.25l1.79 0.65M12 12 17.11 14.95M15.03 13.75l1.79 -0.65M15.03 13.75l0.33 1.87M12 12 12 17.9M12 15.5l1.46 1.22M12 15.5l-1.46 1.22M12 12 6.89 14.95M8.97 13.75l-0.33 1.87M8.97 13.75l-1.79 -0.65M12 12 6.89 9.05M8.97 10.25l-1.79 0.65M8.97 10.25l-0.33 -1.87', stroke: 1.5 },
  ],
  ground: [
    { c: 'glyph', d: 'M6.3 16.8 8.4 8.8h3.9l1.1 8zM14.4 11.3h2.2l1.4 5.5h-3z' },
  ],
  dark: [
    { c: 'glyph', d: 'M16.6 10.2a5 5 0 1 0-1.3 5.6', stroke: 2 },
    { c: 'glyph', d: 'M12.2 9.8a2.3 2.3 0 1 1-2.3 2.9', stroke: 2 },
  ],
  dragon: [
    { c: 'glyph', d: 'M6.2 12.6C7.2 10.6 8.6 9.2 10.8 8.4L11.6 8.3C13.6 8 16 7.2 17.8 5.2 17.4 7.6 16.2 9.2 14.4 10 15.8 9.9 17 9.8 18.2 9.2 17.6 10.8 16.6 11.8 15.2 12.4 15.9 14 16.3 15.8 16.4 17.8H11C11.1 16.8 10.9 15.9 10.3 15.2L7 15.6C8.2 14.9 9.6 14.2 10.9 13.5 9.4 13.4 7.8 13.2 6.2 12.6zM10 10.7 12.5 10.2 11.3 11.7z', evenodd: true },
  ],
  neutral: [
    { c: 'glyph', d: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z', stroke: 2.5 },
  ],
};

/** Each job's hue, after the game's: Kindling orange, Watering blue, and so on. */
export const WORK_COLOURS: Record<string, string> = {
  'Kdl': '#f0683c',
  'Wtr': '#2fb4d6',
  'Plt': '#86cc34',
  'Elc': '#eebb12',
  'Hnd': '#f2bd84',
  'Gth': '#2fb85e',
  'Lmb': '#c47e3a',
  'Min': '#8a9fd0',
  'Med': '#93bb44',
  'Cool': '#62d4e6',
  'Trn': '#d6975a',
  'Frm': '#f0a272',
};

export const WORK_ICONS: Record<string, IconPart[]> = {
  Kdl: [
    { c: 'shade', d: 'M5 17.2 19 20.6M19 17.2 5 20.6', stroke: 2.6 },
    { c: 'main', d: 'M12.3 2.8c.6 2.7 4 4.1 4 7.9a4.3 4.3 0 0 1-8.6 0c0-1.8.8-3 1.8-3.9.1 1.3.6 2 1.3 2.3-.3-2.4.3-4.7 1.5-6.3zM12 10.4c.9.9 1.6 1.6 1.6 2.6a1.6 1.6 0 0 1-3.2 0c0-1 .7-1.7 1.6-2.6z', evenodd: true },
  ],
  Wtr: [
    { c: 'main', d: 'M8.4 9.2h9.2v8.6a2 2 0 0 1-2 2h-5.2a2 2 0 0 1-2-2zM8.4 12.2 4 8.6 2.6 10.4l5.8 5.4zM1.6 7.2l3.4 1-1.8 2.4z' },
    { c: 'main', d: 'M17.4 11.4h1.8a2 2 0 0 1 2 2v1.2a2 2 0 0 1-2 2h-1.8', stroke: 1.9 },
    { c: 'cut', d: 'M13 11.7c1 1.3 1.8 2.2 1.8 3.2a1.8 1.8 0 0 1-3.6 0c0-1 .8-1.9 1.8-3.2z' },
  ],
  Plt: [
    { c: 'shade', d: 'M12 21v-9.4M7.4 21h9.2', stroke: 2.2 },
    { c: 'main', d: 'M12 13.6c-4.8.5-7.4-1.6-7.6-5.9 4.6-.5 7.2 1.5 7.6 5.9zM12 11.2c.1-4.4 2.7-6.9 7.6-6.7.2 4.6-2.6 7-7.6 6.7z' },
  ],
  Elc: [
    { c: 'main', d: 'M9.6 2.8h4.8v2.4H9.6zM8.6 5.2h6.8a2.4 2.4 0 0 1 2.4 2.4v11.2a2.4 2.4 0 0 1-2.4 2.4H8.6a2.4 2.4 0 0 1-2.4-2.4V7.6a2.4 2.4 0 0 1 2.4-2.4z' },
    { c: 'cut', d: 'M13.1 8.4 9.3 13.6h2.4l-.8 4.2 3.9-5.3h-2.4z' },
  ],
  Hnd: [
    { c: 'main', d: 'M6.8 12.8V7.6a1.35 1.35 0 0 1 2.7 0v3.6h.4V5.2a1.35 1.35 0 0 1 2.7 0v6h.4V6a1.35 1.35 0 0 1 2.7 0v6.2h.4V8.8a1.3 1.3 0 0 1 2.6 0v6.4c0 3.4-2.4 5.8-5.9 5.8-2.6 0-4.4-1.3-5.6-3.4l-2.6-4.3a1.35 1.35 0 0 1 2.2-1.5z' },
  ],
  Gth: [
    { c: 'shade', d: 'M12 8.6V21.4', stroke: 1.8 },
    { c: 'main', d: 'M12 2.4c2.2 2.3 2.2 5 0 7.2-2.2-2.2-2.2-4.9 0-7.2zM11.1 14.2c-3.2.3-5.4-1.2-5.9-4.4 3.2-.3 5.3 1.2 5.9 4.4zM12.9 14.2c3.2.3 5.4-1.2 5.9-4.4-3.2-.3-5.3 1.2-5.9 4.4zM11.1 19.6c-3.2.3-5.4-1.2-5.9-4.4 3.2-.3 5.3 1.2 5.9 4.4zM12.9 19.6c3.2.3 5.4-1.2 5.9-4.4-3.2-.3-5.3 1.2-5.9 4.4z' },
  ],
  Lmb: [
    { c: 'main', d: 'M10 6.2h9a3.2 3.2 0 0 1 0 6.4h-9zM6.4 12.8h14a3.2 3.2 0 0 1 0 6.4h-14z' },
    { c: 'shade', d: 'M10 6.2a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM10 8.1a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM6.4 12.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM6.4 14.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z', evenodd: true },
  ],
  Min: [
    { c: 'shade', d: 'M14.2 9.8 4.8 19.2', stroke: 2.7 },
    { c: 'main', d: 'M7.2 3.6Q17.4 4.2 20.4 16.8 17.8 12.6 14.9 9.7 11.9 6.3 7.2 3.6z' },
    { c: 'main', d: 'M12.3 9.3 14.7 6.9 17.1 9.3 14.7 11.7z' },
  ],
  Med: [
    { c: 'main', d: 'M8.6 2.4h6.8v2H14v3.1h-4V4.4H8.6z' },
    { c: 'main', d: 'M12 8.6a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z', stroke: 2.2 },
    { c: 'main', d: 'M7.2 15h9.6a4.85 4.85 0 0 1-9.6 0z' },
  ],
  Cool: [
    { c: 'main', d: 'M12 10.5 9.74 6.69 12 2.4 14.26 6.69zM13.3 11.25 15.47 7.39 20.31 7.2 17.73 11.3zM13.3 12.75 17.73 12.7 20.31 16.8 15.47 16.61zM12 13.5 14.26 17.31 12 21.6 9.74 17.31zM10.7 12.75 8.53 16.61 3.69 16.8 6.27 12.7zM10.7 11.25 6.27 11.3 3.69 7.2 8.53 7.39z' },
  ],
  Trn: [
    { c: 'tint', d: 'M12 3.2 20.4 7.4 12 11.6 3.6 7.4z' },
    { c: 'shade', d: 'M3.6 9.2l7.6 3.8v8L3.6 17.2z' },
    { c: 'main', d: 'M20.4 9.2l-7.6 3.8v8l7.6-3.8z' },
  ],
  Frm: [
    { c: 'main', d: 'M4.6 21V7.8l1.7-2.6L8 7.8V21zM10.3 21V7.8L12 5.2l1.7 2.6V21zM16 21V7.8l1.7-2.6 1.7 2.6V21z' },
    { c: 'shade', d: 'M2.6 9.8h18.8v2.2H2.6zM2.6 15.4h18.8v2.2H2.6z' },
  ],
};
