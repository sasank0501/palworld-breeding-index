import type { ReelChapter } from './reel.ts';
import type { TourPage } from './shots.ts';

/**
 * The five stops of the homepage tour. `from` and `to` say where on the page's
 * screenshot (in its own pixels) the chapter starts and how far it reaches.
 * The examples come from the sample save the screenshots were taken on.
 */
export interface Chapter extends ReelChapter {
  page: TourPage;
  /** The page's name, for the small label and the picture's description. */
  name: string;
  /** The headline in three parts; the middle one is picked out in the accent colour. */
  title: [string, string, string];
  text: string;
  points: [string, string, string];
  example: string;
}

export const CHAPTERS: Chapter[] = [
  {
    page: 'home',
    from: 0,
    to: 60,
    name: 'Spotlight',
    title: ['Your ', 'best', ' pals, front and centre'],
    text: 'PalDoc opens on your strongest pals, each with its stats, potential and passives, and shows how much of the Paldex you have filled.',
    points: ['Stats, potential and passives at a glance', 'Step through your top pals one by one', 'Alphas, lucky pals and high-potential pals counted'],
    example: 'Knocklem, level 55, with 290 of 300 potential. 84% of the Paldex complete.',
  },
  {
    page: 'home',
    from: 600,
    to: 900,
    name: 'Paldex',
    title: ['All ', '289', ' species on cards'],
    text: "Every species, with how many you own and your best one's potential. Filter by element, or by what is discovered, within reach or still missing.",
    points: ['Filter by element', 'Discovered, within reach or undiscovered', 'Open a species for its parent pairs and family tree'],
    example: 'Lamball ×8 means eight are owned; the best has 221 potential.',
  },
  {
    page: 'mypals',
    from: 0,
    to: 520,
    name: 'My Pals',
    title: ['Every pal you ', 'own', ', searchable'],
    text: 'Search by name, nickname or passive. Sort by potential, level or passives, and see which pals sit in your party, base or Pal Box.',
    points: ['Party, base, Pal Box and dimensional storage', 'Star the pals you care about', 'A full sheet per pal: potential, passives, techniques, jobs'],
    example: '1,990 pals. The top card is an alpha Knocklem with 290 potential.',
  },
  {
    page: 'breeding',
    from: 0,
    to: 560,
    name: 'Breeding',
    title: ['What you can ', 'hatch', ' today'],
    text: 'The species you do not have yet but can breed right now, each with the pair of your own pals that makes it.',
    points: ['One step away first, then further out', 'Shows which species need a mate you lack', 'Wild-only species are called out'],
    example: '28 new species are one step away. Aegidron comes from Frostallion × Blazamut Ryu.',
  },
  {
    page: 'planner',
    from: 0,
    to: 900,
    name: 'Planner',
    title: ['A plan for the ', 'perfect', ' pal'],
    text: 'Pick a species and up to four passives. The planner finds the chain of pairings from pals you already own, and where each one is kept.',
    points: ['Presets for base workers, mounts, combat and tanks', 'Lists the pals to gather and where they are kept', 'Save a plan and come back to it'],
    example: 'An Anubis with Demon God, Lucky, Ferocious and Musclehead: three generations, from four pals in the boxes.',
  },
];
