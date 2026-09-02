import { useEffect, useState } from 'react';
import { getLayerState, subscribeLayers, type LayerState } from '../../canvas/layers';

export function useLayers(): LayerState {
  const [state, setState] = useState(getLayerState);
  useEffect(() => subscribeLayers(() => setState(getLayerState())), []);
  return state;
}
