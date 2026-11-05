/**
 * Timber species the sample can be rendered in.
 *
 * The shader models one log — rings around a pith, fibres along it — and a species is the set
 * of numbers that log is drawn with: its two colours, how far apart and how hard-edged the
 * rings are, how the heartwood varies, whether it carries resin, and how its planed face
 * takes the light. Everything here lands in a uniform, so the four species share one compiled
 * program.
 *
 * Species-specific figure that the pine log cannot draw (the ray fleck of beech and oak, the
 * open pore lines of oak) is not here yet; those need their own shader features.
 */

export const SPECIES_IDS = ['pine', 'cedar', 'beech', 'oak'] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

export interface Species {
  label: string;
  title: string;
  /** Colour of the pale wood grown in spring, sRGB. */
  earlywood: string;
  /** Colour of the dense wood grown late in the season, sRGB. */
  latewood: string;
  /** Ring pitch in mm. Tighter rings put more fine grain lines across a planed face. */
  ringMm: number;
  /**
   * Where in each ring (0..1 from its start) the latewood begins on a planed face. Low values
   * make most of the ring dense and dark; high values leave a thin line near its end.
   */
  latewoodStart: number;
  /**
   * How strongly the rings read on a planed face, 0..1. End grain always shows every ring;
   * this is what separates a bold-figured softwood from the quiet face of a close-grained
   * hardwood.
   */
  ringContrast: number;
  /** Resin streaks on the faces and resin canals in the end grain: 1 for a resinous softwood, 0 otherwise. */
  resin: number;
  /**
   * Heartwood colour as a multiplier on the ring colours; `[1, 1, 1]` is no variation. The
   * shader applies it over slow regions of the log, so a board shows bands of it rather than
   * an even wash.
   */
  heartTint: [number, number, number];
  /**
   * Noise thresholds the heartwood regions are cut from, as a smoothstep range. A narrow
   * range gives distinct patches, a wide one a gradual wash between light and dark stretches.
   */
  heartBand: [number, number];
  /**
   * Frequency of the heartwood regions across the board and along it, in 1/mm. Streaky
   * timbers vary quickly across the width and slowly along the length.
   */
  heartScale: [number, number];
  /** Roughness of the bare planed face; the latewood and fibre vary it around this. */
  roughness: number;
  /** Strength of the surface relief the grain leaves after the cutter. */
  bump: number;
  /** Colour of the light that leaks back out of the fibres at a grazing edge and on the cut end. */
  scatterTint: [number, number, number];
}

export const SPECIES: Record<SpeciesId, Species> = {
  pine: {
    label: 'Pine',
    title: 'Clear radiata pine: pale cream with bold, well-spaced rings and the odd resin streak',
    // Photographed clear pine: pale cream earlywood, soft pinkish-tan latewood. The warm key
    // light and tone mapping add the honey on top, so these read paler than the final image.
    earlywood: '#eadcbf',
    latewood: '#bd9062',
    ringMm: 5.0,
    // A face is mostly earlywood with the latewood a line near the end of each ring.
    latewoodStart: 0.66,
    ringContrast: 0.85,
    resin: 1,
    heartTint: [1.04, 0.98, 0.92],
    heartBand: [0.46, 0.62],
    heartScale: [0.008, 0.004],
    roughness: 0.62,
    bump: 0.22,
    scatterTint: [0.72, 0.4, 0.2],
  },
  cedar: {
    label: 'Western Red Cedar',
    title: 'Western red cedar: reddish brown with thin dark rings and streaks of darker heartwood',
    earlywood: '#cf9f7a',
    latewood: '#7a4e36',
    // Fine, even rings, each ending in a thin, abrupt latewood line.
    ringMm: 3.0,
    latewoodStart: 0.7,
    ringContrast: 1.0,
    resin: 0,
    // Cedar's colour varies a lot board to board and within one board: bands of darker,
    // redder heartwood run the length, a few centimetres wide.
    heartTint: [0.74, 0.6, 0.54],
    heartBand: [0.3, 0.7],
    heartScale: [0.03, 0.003],
    // Soft, open and matte, even after the planer.
    roughness: 0.72,
    bump: 0.26,
    scatterTint: [0.7, 0.32, 0.18],
  },
  beech: {
    label: 'European Beech',
    title: 'Steamed European beech: even pinkish buff, close-grained with faint rings',
    earlywood: '#e2c3a8',
    latewood: '#caa588',
    ringMm: 3.5,
    latewoodStart: 0.6,
    // Diffuse-porous: the rings barely register on a planed face.
    ringContrast: 0.35,
    resin: 0,
    heartTint: [1.0, 0.98, 0.97],
    heartBand: [0.46, 0.62],
    heartScale: [0.008, 0.004],
    // Close grain planes to a smooth, satin face with little relief.
    roughness: 0.55,
    bump: 0.14,
    scatterTint: [0.76, 0.52, 0.4],
  },
  oak: {
    label: 'American White Oak',
    title: 'American white oak: tan with an olive cast, ring-porous with dense dark latewood',
    earlywood: '#dabe95',
    latewood: '#a4865e',
    ringMm: 4.0,
    // Ring-porous: a narrow band of large pores opens each ring, then dense latewood fills
    // most of it.
    latewoodStart: 0.38,
    ringContrast: 0.9,
    resin: 0,
    heartTint: [0.95, 0.93, 0.86],
    heartBand: [0.42, 0.64],
    heartScale: [0.012, 0.004],
    // Open grain: the pores stay as pits in the planed face.
    roughness: 0.66,
    bump: 0.3,
    scatterTint: [0.7, 0.5, 0.28],
  },
};

export const DEFAULT_SPECIES: SpeciesId = 'pine';

export function isSpeciesId(value: string): value is SpeciesId {
  return SPECIES_IDS.some((id) => id === value);
}
