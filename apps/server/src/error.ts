export class SystemError extends Error {}

export class ResourcesSlowQueryBusyError extends Error {
  public constructor() {
    super('Resources slow database query is busy. Please retry later.');
    this.name = ResourcesSlowQueryBusyError.name;
  }
}

export class ResourcesSlowQueryTimeoutError extends Error {
  public constructor() {
    super('Resources query exceeded both normal and extended database timeouts.');
    this.name = ResourcesSlowQueryTimeoutError.name;
  }
}

export class ResourcesDeepPaginationError extends Error {
  public constructor(maxOffsetLimit: number) {
    super(`Resources pagination is too deep. Please keep offset + limit <= ${maxOffsetLimit}.`);
    this.name = ResourcesDeepPaginationError.name;
  }
}

export interface UnknownPartyFilters {
  fansubs: string[];

  publishers: string[];
}

export class UnknownPartyFilterError extends Error {
  public readonly unmatched: UnknownPartyFilters;

  public constructor(unmatched: UnknownPartyFilters) {
    const parts: string[] = [];
    if (unmatched.fansubs.length > 0) {
      parts.push(`Unknown fansubs: ${unmatched.fansubs.join(', ')}`);
    }
    if (unmatched.publishers.length > 0) {
      parts.push(`Unknown publishers: ${unmatched.publishers.join(', ')}`);
    }
    super(parts.join('; '));
    this.name = UnknownPartyFilterError.name;
    this.unmatched = unmatched;
  }
}
