// 房产投资分析类型定义

export interface XiamenProperty {
  marketValue: number; // 市场价 RMB
  monthlyRent: number; // 月租金 RMB
  exchangeRate: number; // 汇率
  sellingCostRate: number; // 卖房成本率 (税费+中介费)
}

export interface SDPropertyOption {
  type: '1B1B' | '2B2B' | '3B2B';
  price: number;
  monthlyRent: number; // 每间房可出租价格
  rooms: number; // 可出租房间数
  appreciationRate: number; // 年升值率
  hoaAndTax: number; // HOA + 房产税 + 保险 每月
}

export interface LoanOption {
  name: string;
  type: 'conventional' | 'va' | 'fha';
  interestRate: number;
  minDownPayment: number; // 最低首付比例
  pmi?: number; // 私人贷款保险 (月)
}

export interface Borrower {
  name: string;
  monthlyIncome: number;
  loanOptions: LoanOption[];
}

export interface InvestmentScenario {
  id: string;
  name: string;
  sellXiamen: boolean;
  sdProperty: SDPropertyOption | null;
  downPaymentPercent: number;
  borrower: Borrower | null;
  roomsToRent: number; // 出租几间房
  sdRentIfNotBuying: number; // 如果不买房在SD租房的月租
}

export interface CalculationResult {
  scenario: InvestmentScenario;

  // 初始投入
  initialInvestment: number;
  downPayment: number;
  closingCosts: number;
  remainingCash: number;

  // 月度现金流
  monthlyMortgage: number;
  monthlyHOATax: number;
  monthlyRentalIncome: number; // 实际租金收入
  monthlyImputedRent: number; // 隐含租金（省下的房租）
  monthlyTotalIncome: number; // 总收益 = 实际租金 + 隐含租金
  monthlyCashflow: number; // 实际现金流（不含隐含租金）
  monthlyEffectiveCashflow: number; // 等效现金流（含隐含租金）

  // 年度指标
  annualCashflow: number;
  annualEffectiveCashflow: number; // 含隐含租金的年度现金流
  cashflowAPY: number; // 年度现金流收益率（不含隐含租金）
  effectiveCashflowAPY: number; // 等效年度收益率（含隐含租金）

  // 5年指标
  year5PropertyValue: number;
  year5Equity: number;
  year5TotalReturn: number;
  year5ROI: number;
  year5AnnualizedROI: number;

  // 风险指标
  dti: number; // 债务收入比
  mortgageToIncomeRatio: number;
}

export interface Parameters {
  xiamen: XiamenProperty;
  sdOptions: SDPropertyOption[];
  borrowers: Borrower[];
  sdRentIfNotBuying: number;
  analysisYears: number;
}
