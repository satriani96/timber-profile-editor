/**
 * Surface finishes applied to the pine sample.
 *
 * A finish is a coat of pigment sitting on the machined faces. The docked ends of a sample are
 * always bare timber, as they are on a real offcut, which is also what lets the profile read.
 * Everything here is a property of the coat, so a new product finish is one entry in this
 * record rather than another flag threaded through the preview.
 */

export const FINISH_IDS = ['clear', 'primed', 'blackOiled'] as const;
export type FinishId = (typeof FINISH_IDS)[number];

export interface Finish {
  label: string;
  title: string;
  /** Pigment colour, sRGB. */
  color: string;
  /** How much of the timber the pigment covers: 0 leaves it bare, 1 hides it completely. */
  cover: number;
  /**
   * How strongly the grain still reads through the coat. Pigment does not sit evenly on pine:
   * the open earlywood drinks it and the dense latewood sheds it, so this both varies the
   * coverage across a ring and modulates the pigment's own colour.
   */
  grain: number;
  /** Roughness of the coated face. Unused where `cover` is 0. */
  roughness: number;
  /** Fraction of the timber's own surface relief left after coating. */
  relief: number;
  /** Specular reflectance of the finished surface. Bare timber is a soft dielectric at 0.42. */
  specular: number;
  /** Fibre-aligned highlight stretch. A film of paint has no fibre direction; an oil does. */
  anisotropy: number;
}

export const FINISHES: Record<FinishId, Finish> = {
  clear: {
    label: 'Clear',
    title: 'Bare machined pine, no coating',
    // The identity coat: no pigment, no coverage, all of the timber's own relief.
    color: '#ffffff',
    cover: 0,
    grain: 0,
    roughness: 0.62,
    relief: 1,
    specular: 0.42,
    anisotropy: 0.5,
  },
  primed: {
    label: 'Primed',
    title: 'Factory primer on the machined faces; the cut ends stay bare timber',
    // Factory primer: a soft warm white rather than a paper white.
    color: '#e3e0d8',
    // Paint is a film: it hides the timber and fills most of the grain, leaving a faint ghost.
    cover: 0.98,
    grain: 0.05,
    roughness: 0.82,
    relief: 0.3,
    specular: 0.35,
    anisotropy: 0,
  },
  blackOiled: {
    label: 'Black oiled',
    title: 'Charcoal pigmented oil soaked into the machined faces; the grain still reads through',
    // Charcoal rather than a true black: pigmented oil never reads as ink, and a dead black
    // face would lose the profile's form to the shadows. Kept a shade cool, because the warm
    // key light and the timber under it bring it back to neutral.
    color: '#20211f',
    // A penetrating oil rather than a film, so a few percent of the timber shows through and
    // the grain varies that percentage: the ring lines stay lighter than the ground.
    cover: 0.97,
    grain: 0.1,
    // Oil leaves a satin sheen, well short of a lacquer, and does not fill the grain. Any
    // glossier and a dark face reads as painted metal rather than oiled timber.
    roughness: 0.55,
    relief: 0.9,
    specular: 0.5,
    anisotropy: 0.45,
  },
};

export const DEFAULT_FINISH: FinishId = 'clear';

export function isFinishId(value: string): value is FinishId {
  return FINISH_IDS.some((id) => id === value);
}
