export type IncomeExpenditure = {
  incomeMinor: number;
  expenditureMinor: number;
  netMinor: number;
};

export type FundBalance = {
  fundId: string;
  fundName: string;
  balanceMinor: number;
};

export type DonationTrendPoint = {
  period: string;
  totalMinor: number;
};

/** Read-only reporting over DONATIONS/EXPENSES/FUNDS — no writes, no own table. */
export interface StatisticsRepository {
  incomeExpenditure(fromDate: string, toDate: string): Promise<IncomeExpenditure>;
  fundBalances(): Promise<FundBalance[]>;
  donationTrends(months: number): Promise<DonationTrendPoint[]>;
}
