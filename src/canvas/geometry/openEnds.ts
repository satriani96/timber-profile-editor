import paper from 'paper';

/** Ends closer than this count as joined, here and when the 3D preview stitches outlines. CAD fillets often miss by a few microns. */
export const JOIN_TOLERANCE_MM = 0.05;

const MARKER_COLOR = '#dc2626';
const MARKER_RADIUS_PX = 7;
const MARKER_STROKE_PX = 2;

/** Endpoints of open paths that no other endpoint in `paths` meets within the join tolerance. */
export function findOpenEnds(paths: paper.Path[]): paper.Point[] {
  const ends = paths
    .filter((path) => !path.closed)
    .flatMap((path) => [path.firstSegment.point, path.lastSegment.point]);
  return ends.filter((end) => !ends.some((other) => other !== end && other.getDistance(end) <= JOIN_TOLERANCE_MM));
}

let markers: paper.Path[] = [];

function sizeMarker(marker: paper.Path, center: paper.Point, zoom: number): void {
  const radius = MARKER_RADIUS_PX / zoom;
  marker.segments = new paper.Path.Circle({ center, radius, insert: false }).segments;
  marker.strokeWidth = MARKER_STROKE_PX / zoom;
}

/** Ring each point in red. Rings are temporary items, so undo/redo and snapshots drop them. */
export function showOpenEnds(points: paper.Point[]): void {
  clearOpenEnds();
  const zoom = paper.view.zoom;
  markers = points.map((point) => {
    const marker = new paper.Path({ closed: true, strokeColor: MARKER_COLOR });
    marker.data = { isTemporary: true, isOpenEndMarker: true, center: point.clone() };
    sizeMarker(marker, point, zoom);
    return marker;
  });
}

/** Keep the rings a constant size on screen. */
export function rescaleOpenEnds(): void {
  const zoom = paper.view.zoom;
  markers = markers.filter((marker) => marker.isInserted());
  for (const marker of markers) sizeMarker(marker, marker.data.center, zoom);
}

export function clearOpenEnds(): void {
  for (const marker of markers) marker.remove();
  markers = [];
}
