// 房产投资计算引擎

import type {
  XiamenProperty,
  SDPropertyOption,
  Borrower,
  InvestmentScenario,
  CalculationResult,
  LoanOption
} from './types';

// 计算月供 (P&I)
export function calculateMonthlyMortgage(
  principal: number,
  annualRate: number,
  years: number = 30
): number {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;

  if (monthlyRate === 0) return principal / numPayments;

  const payment = principal *
    (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  return payment;
}

// 计算N年后贷款余额
export function calculateRemainingBalance(
  principal: number,
  annualRate: number,
  years: number,
  paymentsMade: number
): number {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;

  if (monthlyRate === 0) return principal - (principal / numPayments) * paymentsMade;

  const balance = principal *
    (Math.pow(1 + monthlyRate, numPayments) - Math.pow(1 + monthlyRate, paymentsMade)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  return balance;
}

// 计算卖厦门房后到手金额
export function calculateXiamenNetProceeds(xiamen: XiamenProperty): number {
  const grossUSD = xiamen.marketValue / xiamen.exchangeRate;
  const netUSD = grossUSD * (1 - xiamen.sellingCostRate);
  return netUSD;
}

// 获取借款人的最佳贷款选项
export function getBestLoanOption(
  borrower: Borrower,
  downPaymentPercent: number
): LoanOption | null {
  // 找到满足首付要求的最低利率贷款
  const validOptions = borrower.loanOptions.filter(
    opt => downPaymentPercent >= opt.minDownPayment
  );

  if (validOptions.length === 0) return null;

  return validOptions.reduce((best, current) =>
    current.interestRate < best.interestRate ? current : best
  );
}

// 主计算函数
export function calculateScenario(
  scenario: InvestmentScenario,
  xiamen: XiamenProperty,
  analysisYears: number = 5
): CalculationResult {
  const xiamenNetProceeds = calculateXiamenNetProceeds(xiamen);
  const xiamenMonthlyRentUSD = xiamen.monthlyRent / xiamen.exchangeRate;
  const xiamenValueUSD = xiamen.marketValue / xiamen.exchangeRate;

  // 场景1：继续持有厦门 + SD租房
  if (!scenario.sellXiamen || !scenario.sdProperty) {
    const sdRent = scenario.sdRentIfNotBuying;
    const monthlyCashflow = xiamenMonthlyRentUSD - sdRent;
    const annualCashflow = monthlyCashflow * 12;

    // 假设厦门房价不涨
    const year5Value = xiamenValueUSD;
    const totalCashflow5Y = annualCashflow * analysisYears;
    const year5TotalReturn = year5Value + totalCashflow5Y - xiamenValueUSD;

    return {
      scenario,
      initialInvestment: xiamenValueUSD,
      downPayment: 0,
      closingCosts: 0,
      remainingCash: 0,
      monthlyMortgage: 0,
      monthlyHOATax: 0,
      monthlyRentalIncome: xiamenMonthlyRentUSD,
      monthlyImputedRent: 0, // 租房没有隐含租金
      monthlyTotalIncome: xiamenMonthlyRentUSD,
      monthlyCashflow,
      monthlyEffectiveCashflow: monthlyCashflow,
      annualCashflow,
      annualEffectiveCashflow: annualCashflow,
      cashflowAPY: (annualCashflow / xiamenValueUSD) * 100,
      effectiveCashflowAPY: (annualCashflow / xiamenValueUSD) * 100,
      year5PropertyValue: year5Value,
      year5Equity: year5Value,
      year5TotalReturn,
      year5ROI: (year5TotalReturn / xiamenValueUSD) * 100,
      year5AnnualizedROI: (Math.pow(1 + year5TotalReturn / xiamenValueUSD, 1/analysisYears) - 1) * 100,
      dti: 0,
      mortgageToIncomeRatio: 0,
    };
  }

  // 场景2：卖厦门 → 买SD
  const property = scenario.sdProperty;
  const downPaymentPercent = scenario.downPaymentPercent;
  const downPayment = property.price * downPaymentPercent;
  const closingCosts = property.price * 0.03; // 买房closing cost约3%
  const loanAmount = property.price - downPayment;

  // 获取贷款条件
  let interestRate = 0.065; // 默认6.5%
  let pmi = 0;

  if (scenario.borrower) {
    const loanOption = getBestLoanOption(scenario.borrower, downPaymentPercent);
    if (loanOption) {
      interestRate = loanOption.interestRate;
      if (loanOption.pmi && downPaymentPercent < 0.2) {
        pmi = loanOption.pmi;
      }
    }
  }

  // 计算初始资金
  const totalInitialCost = downPayment + closingCosts;
  const remainingCash = xiamenNetProceeds - totalInitialCost;

  // 月度计算
  const monthlyMortgage = calculateMonthlyMortgage(loanAmount, interestRate);
  const monthlyHOATax = property.hoaAndTax;
  const monthlyRentalIncome = property.monthlyRent * scenario.roomsToRent;

  // 隐含租金（省下的房租）= 原来要付的SD租金
  // 只要你买房自住了，就省下了这笔租金
  const monthlyImputedRent = scenario.sdRentIfNotBuying;
  const monthlyTotalIncome = monthlyRentalIncome + monthlyImputedRent;

  const totalMonthlyPayment = monthlyMortgage + monthlyHOATax + pmi;

  // 实际现金流（银行账户变化）
  const monthlyCashflow = monthlyRentalIncome - totalMonthlyPayment;

  // 等效现金流（含隐含租金，用于公平对比）
  const monthlyEffectiveCashflow = monthlyTotalIncome - totalMonthlyPayment;

  // 年度计算
  const annualCashflow = monthlyCashflow * 12;
  const annualEffectiveCashflow = monthlyEffectiveCashflow * 12;
  const cashflowAPY = (annualCashflow / totalInitialCost) * 100;
  const effectiveCashflowAPY = (annualEffectiveCashflow / totalInitialCost) * 100;

  // 5年计算
  const year5PropertyValue = property.price * Math.pow(1 + property.appreciationRate, analysisYears);
  const year5LoanBalance = calculateRemainingBalance(loanAmount, interestRate, 30, analysisYears * 12);
  const year5Equity = year5PropertyValue - year5LoanBalance;

  // 5年总回报 = 房产净值 + 剩余现金 + 累计等效现金流 - 初始总资产
  // 使用等效现金流，因为省下的租金也是一种"收益"
  const totalEffectiveCashflow5Y = annualEffectiveCashflow * analysisYears;
  const year5NetWorth = year5Equity + remainingCash + totalEffectiveCashflow5Y;
  const year5TotalReturn = year5NetWorth - xiamenNetProceeds;
  const year5ROI = (year5TotalReturn / xiamenNetProceeds) * 100;
  const year5AnnualizedROI = (Math.pow(year5NetWorth / xiamenNetProceeds, 1/analysisYears) - 1) * 100;

  // 风险指标
  const monthlyIncome = scenario.borrower?.monthlyIncome || 5000;
  const dti = (totalMonthlyPayment / monthlyIncome) * 100;
  const mortgageToIncomeRatio = (monthlyMortgage / monthlyIncome) * 100;

  return {
    scenario,
    initialInvestment: xiamenNetProceeds,
    downPayment,
    closingCosts,
    remainingCash,
    monthlyMortgage,
    monthlyHOATax,
    monthlyRentalIncome,
    monthlyImputedRent,
    monthlyTotalIncome,
    monthlyCashflow,
    monthlyEffectiveCashflow,
    annualCashflow,
    annualEffectiveCashflow,
    cashflowAPY,
    effectiveCashflowAPY,
    year5PropertyValue,
    year5Equity,
    year5TotalReturn,
    year5ROI,
    year5AnnualizedROI,
    dti,
    mortgageToIncomeRatio,
  };
}

// 生成多场景对比
export function generateScenarios(
  xiamen: XiamenProperty,
  sdOptions: SDPropertyOption[],
  borrowers: Borrower[],
  sdRentIfNotBuying: number
): InvestmentScenario[] {
  const scenarios: InvestmentScenario[] = [];

  // 基准场景：继续持有厦门
  scenarios.push({
    id: 'baseline',
    name: '持有厦门 + SD租房',
    sellXiamen: false,
    sdProperty: null,
    downPaymentPercent: 0,
    borrower: null,
    roomsToRent: 0,
    sdRentIfNotBuying,
  });

  // 生成所有组合
  const downPaymentOptions = [0.2, 0.25, 0.3, 0.35, 0.5];

  for (const property of sdOptions) {
    for (const borrower of borrowers) {
      for (const dp of downPaymentOptions) {
        // 检查首付是否可行
        const loanOption = getBestLoanOption(borrower, dp);
        if (!loanOption) continue;

        // 根据房型设置出租策略
        const maxRooms = property.rooms;
        for (let rooms = 0; rooms <= maxRooms; rooms++) {
          scenarios.push({
            id: `${property.type}-${borrower.name}-${dp * 100}%-${rooms}rooms`,
            name: `${property.type} (${borrower.name}, ${dp * 100}%首付, 出租${rooms}间)`,
            sellXiamen: true,
            sdProperty: property,
            downPaymentPercent: dp,
            borrower,
            roomsToRent: rooms,
            sdRentIfNotBuying,
          });
        }
      }
    }
  }

  return scenarios;
}

// 计算所有场景结果
export function calculateAllScenarios(
  scenarios: InvestmentScenario[],
  xiamen: XiamenProperty,
  analysisYears: number = 5
): CalculationResult[] {
  return scenarios.map(s => calculateScenario(s, xiamen, analysisYears));
}

// 找到Pareto前沿 (cashflow APY vs 5-year ROI)
export function findParetoFrontier(results: CalculationResult[]): CalculationResult[] {
  const frontier: CalculationResult[] = [];

  for (const result of results) {
    let isDominated = false;

    for (const other of results) {
      if (result === other) continue;

      // 检查是否被支配 (两个目标都更差)
      if (other.cashflowAPY >= result.cashflowAPY &&
          other.year5AnnualizedROI >= result.year5AnnualizedROI &&
          (other.cashflowAPY > result.cashflowAPY || other.year5AnnualizedROI > result.year5AnnualizedROI)) {
        isDominated = true;
        break;
      }
    }

    if (!isDominated) {
      frontier.push(result);
    }
  }

  return frontier.sort((a, b) => a.cashflowAPY - b.cashflowAPY);
}
