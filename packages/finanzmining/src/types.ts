/**
 * Types derived from cashbuzz platform API 1.2.1 (finanzmining.de).
 * Source OpenAPI: ~/Downloads/finanzmining.yaml
 */

export interface PageablePaging {
  page?: number;
  pageCount?: number;
  perPage?: number;
  totalCount?: number;
}

export interface FinanzminingContract {
  id: string;
  org_id: string;
  periodicity: number;
  start_date: string;
  end_date: string;
  transaction_count: number;
  currency: string;
  is_irregular: boolean;
  last_transaction?: string;
  amount_annually?: number;
  amount_mean?: number;
  amount_total?: number;
  amount_mode?: number;
  amount_median?: number;
  contract_type?: string;
  tariff?: string;
  customer_ident?: string;
  contract_ident?: string;
  qme?: string;
  qorg?: string;
  qsubject?: string;
  qaction?: string;
}

export interface FinanzminingSubscription {
  id: string;
  org_id: string;
  classifier_mnv: string;
  periodicity: number;
  start_date: string;
  end_date: string;
  transaction_count: number;
  amount: number;
  class: string;
  currency: string;
  is_irregular: boolean;
  tariff?: string;
  customer_ident?: string;
  contract_ident?: string;
  amount_annually?: number;
  amount_mean?: number;
  contract_type?: string;
  qme?: string;
  qorg?: string;
}

export interface FinanzminingInsight {
  date: string | null;
  value: number | string;
  start_date?: string;
  end_date?: string;
}

export interface InsightDescription {
  insight_section: string;
  insight_group: string;
  insight_name: string;
  statement?: string;
  title_en?: string;
  title_de?: string;
  description?: string;
  result_type?: string;
  value_type?: string;
}

export interface UserStatistics {
  cashback_amounts: Record<string, number>;
  cashback_counts: Record<string, number>;
  securities_bought?: Record<string, unknown>;
  securities_sold?: Record<string, unknown>;
}

export interface FinanzminingTransaction {
  id: string;
  accountId: string;
  amount: number;
  bankBookingDate: string;
  valueDate: string;
  cb_id?: string;
  purpose?: string;
  counterpartName?: string;
  counterpartIban?: string;
  org_id?: string;
  subscription_id?: string;
  /** Predicted / forecasted transaction flag from cashbuzz engine */
  predicted?: boolean;
  qme?: string;
  qorg?: string;
  contract_ident?: string;
  customer_ident?: string;
}

export interface FinanzminingAccount {
  id: number | string;
  accountName?: string;
  iban?: string;
  accountNumber?: string;
  accountTypeId?: number;
  balance?: number;
  bankConnectionId?: number;
}

export interface UserAttribute {
  section?: string;
  group?: string;
  name?: string;
  value?: unknown;
  date?: string;
}

export interface UserAffinity {
  class?: string;
  sub_class?: string;
  score?: number;
  month?: string;
}

export interface DailyHint {
  id?: string | number;
  title?: string;
  text?: string;
  is_relevant?: boolean;
}

export interface Organization {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface PaginationQuery {
  page?: number;
  perPage?: number;
}

export interface ContractSearchQuery extends PaginationQuery {
  ids?: string;
  org_id?: string;
  classes?: string;
  sub_classes?: string;
  positive_amount?: boolean;
}

export interface SubscriptionSearchQuery extends ContractSearchQuery {
  no_contracts?: boolean;
  qclasses?: string;
  includeRegiox?: boolean;
  from_date?: string;
  to_date?: string;
}

export interface InsightQuery {
  start_date?: string;
  end_date?: string;
  quantization?: string;
  class?: string;
  sub_classes?: string;
  vat_modified?: boolean;
}

export interface TransactionSearchQuery extends PaginationQuery {
  ids?: string;
  search?: string;
  accountIds?: string;
  minBankBookingDate?: string;
  maxBankBookingDate?: string;
  only_predicted?: boolean;
  minAmount?: number;
  maxAmount?: number;
  order?: string;
}

export interface CategorizationOptions {
  reset?: boolean;
  categorization_only?: boolean;
  subscriptions_only?: boolean;
  callback_uri?: string;
  volume_processing?: boolean;
}
