import type { FinanzminingHttp } from "./http.js";
import type {
  DailyHint,
  InsightDescription,
  InsightQuery,
  FinanzminingInsight,
  PageablePaging,
  PaginationQuery,
  UserAffinity,
  UserAttribute,
  UserStatistics,
} from "./types.js";

/**
 * Analytics connector — statistics, insights, affinities, attributes, finance groups, hints.
 * Maps to cashbuzz tags: Statistics, Users/insights, Users/affinities, Users/attributes,
 * Users/finance_groups, Daily Hints, Descriptions.
 */
export class AnalyticsConnector {
  constructor(private readonly http: FinanzminingHttp) {}

  /** GET /data — user financial statistics */
  getStatistics(): Promise<UserStatistics> {
    return this.http.get("/data");
  }

  /** GET /insights/{section}/{group}/{name} */
  getInsight(
    section: string,
    group: string,
    name: string,
    query: InsightQuery = {},
  ): Promise<FinanzminingInsight | FinanzminingInsight[]> {
    return this.http.get(
      `/insights/${encodeURIComponent(section)}/${encodeURIComponent(group)}/${encodeURIComponent(name)}`,
      { ...query },
    );
  }

  listInsightDescriptions(query?: {
    section?: string;
    group?: string;
    only_own?: boolean;
    page?: number;
    perPage?: number;
  }): Promise<{
    insights?: InsightDescription[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/descriptions/insights", { ...query });
  }

  getUserAttributes(query: PaginationQuery & {
    from_date?: string;
    to_date?: string;
  } = {}): Promise<{
    attributes?: UserAttribute[];
    groups?: unknown[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/users/attributes", { ...query });
  }

  getUserAttribute(
    section: string,
    group: string,
    name: string,
  ): Promise<UserAttribute> {
    return this.http.get(
      `/users/attributes/${encodeURIComponent(section)}/${encodeURIComponent(group)}/${encodeURIComponent(name)}`,
    );
  }

  getUserAffinities(query: PaginationQuery & {
    month?: string;
    class?: string;
    sub_classes?: string;
    order?: string;
  } = {}): Promise<{
    affinities?: UserAffinity[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/users/affinities", { ...query });
  }

  getFinanceGroups(query: PaginationQuery & {
    fgroup: string;
    from_month?: string;
    to_month?: string;
  }): Promise<{
    finance_groups?: unknown[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/users/f_groups", { ...query });
  }

  getDailyHints(query: PaginationQuery & {
    is_relevant?: boolean;
  } = {}): Promise<{
    hints?: DailyHint[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/suggestions", { ...query });
  }
}
