import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { applyMarqueeSelection, itemMatchesMarquee, marqueeMode } from './marquee';

describe('marquee classification', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('treats left-to-right as window and right-to-left as crossing', () => {
    expect(marqueeMode(new paper.Point(10, 10), new paper.Point(80, 40))).toBe('window');
    expect(marqueeMode(new paper.Point(80, 10), new paper.Point(10, 40))).toBe('crossing');
    expect(marqueeMode(new paper.Point(10, 10), new paper.Point(10, 40))).toBe('window');
  });

  it('window selects only items fully inside; crossing also hits intersecting items', () => {
    const inside = new paper.Path.Line({ from: [20, 20], to: [40, 20], strokeColor: 'black' });
    const crossing = new paper.Path.Line({ from: [70, 10], to: [120, 10], strokeColor: 'black' });
    const outside = new paper.Path.Line({ from: [200, 20], to: [240, 20], strokeColor: 'black' });
    const rect = new paper.Rectangle(10, 5, 80, 30);

    expect(itemMatchesMarquee(inside, rect, 'window')).toBe(true);
    expect(itemMatchesMarquee(crossing, rect, 'window')).toBe(false);
    expect(itemMatchesMarquee(outside, rect, 'window')).toBe(false);

    expect(itemMatchesMarquee(inside, rect, 'crossing')).toBe(true);
    expect(itemMatchesMarquee(crossing, rect, 'crossing')).toBe(true);
    expect(itemMatchesMarquee(outside, rect, 'crossing')).toBe(false);
  });

  it('replaces the selection unless Shift-add is requested', () => {
    const a = new paper.Path.Line({ from: [0, 0], to: [10, 0], strokeColor: 'black' });
    const b = new paper.Path.Line({ from: [20, 0], to: [30, 0], strokeColor: 'black' });
    const c = new paper.Path.Line({ from: [200, 0], to: [210, 0], strokeColor: 'black' });
    c.selected = true;

    applyMarqueeSelection(new paper.Rectangle(-1, -5, 40, 10), 'window', false);
    expect(a.selected).toBe(true);
    expect(b.selected).toBe(true);
    expect(c.selected).toBe(false);

    c.selected = true;
    applyMarqueeSelection(new paper.Rectangle(-1, -5, 15, 10), 'window', true);
    expect(a.selected).toBe(true);
    expect(c.selected).toBe(true);
  });
});
