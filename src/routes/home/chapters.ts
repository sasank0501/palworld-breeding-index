import type { ReelChapter } from './reel.ts';
import type { TourPage } from './shots.ts';

/**
 * The five stops of the homepage tour. `from` and `to` say where on the page's
 * screenshot (in its own pixels) the chapter starts and how far it reaches.
 */
export interface Chapter extends ReelChapter {
  page: TourPage;
  /** The page's name, for the small label and the picture's description. */
  name: string;
  /** The headline in three parts; the middle one is picked out in the accent colour. */
  title: [string, string, string];
  text: string;
  points: [string, string, string];
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
  },
  {
    page: 'home',
    from: 600,
    to: 900,
    name: 'Paldex',
    title: ['All ', '289', ' species on cards'],
    text: "Every species, with how many you own and your best one's potential. Filter by element, or by what is discovered, within reach or still missing.",
    points: ['Filter by element', 'Discovered, within reach or undiscovered', 'Open a species for its parent pairs and family tree'],
  },
  {
    page: 'mypals',
    from: 0,
    to: 520,
    name: 'My Pals',
    title: ['Every pal you ', 'own', ', searchable'],
    text: 'Search by name, nickname or passive. Sort by potential, level or passives, and see which pals sit in your party, base or Pal Box.',
    points: ['Party, base, Pal Box and dimensional storage', 'Star the pals you care about', 'A full sheet per pal: potential, passives, techniques, jobs'],
  },
  {
    page: 'breeding',
    from: 0,
    to: 780,
    name: 'Breeding',
    title: ['What you can ', 'hatch', ' today'],
    text: 'The species you do not have yet but can breed right now, each with the pair of your own pals that makes it. Or pick any two parents and see what they make.',
    points: ['A pair calculator: two parents in, their child out', 'One step away first, then further out', 'Shows which species need a mate you lack'],
  },
  {
    page: 'planner',
    from: 0,
    to: 1100,
    name: 'Planner',
    title: ['A plan for the ', 'perfect', ' pal'],
    text: 'Pick a species and up to four passives. The planner finds the chain of pairings from pals you already own, and where each one is kept.',
    points: ['Presets for base workers, mounts, combat and tanks', 'Lists the pals to gather and where they are kept', 'Save a plan and come back to it'],
  },
];
