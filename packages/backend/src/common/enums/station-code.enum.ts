export enum StationCode {
  RECEIVING = 'RECEIVING',
  SORTING = 'SORTING',
  WASHING = 'WASHING',
  DRYING = 'DRYING',
  FOLDING = 'FOLDING',
  DISPATCH = 'DISPATCH',
}

// Canonical order used for batch state & current-station computation
export const STATION_ORDER: StationCode[] = [
  StationCode.RECEIVING,
  StationCode.SORTING,
  StationCode.WASHING,
  StationCode.DRYING,
  StationCode.FOLDING,
  StationCode.DISPATCH,
];
