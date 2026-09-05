export enum CollectionStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum CanonicalEventStatus {
  ACCEPTED = 'ACCEPTED',
  DUPLICATE = 'DUPLICATE',
  CONFLICT = 'CONFLICT',
}

export enum BatchState {
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  IN_PROGRESS = 'IN_PROGRESS',
  PLANNED = 'PLANNED',
}
