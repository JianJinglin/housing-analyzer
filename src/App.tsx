import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ResponsiveContainer, ReferenceLine,
  BarChart, Bar
} from 'recharts';
import {
  calculateScenario,
  calculateXiamenNetProceeds,
  getBestLoanOption
} from './calculator';
import type {
  XiamenProperty,
  SDPropertyOption,
  Borrower,
  InvestmentScenario,
  CalculationResult
} from './types';
import './App.css';

// 股市投资计算
interface StockInvestmentResult {
  initialInvestment: number; // 首付+closing cost
  stockReturn: number; // 股市年化收益率
  yearNValue: number; // N年后股票价值
  yearNGain: number; // N年总收益
  annualizedROI: number; // 年化收益率
  // 同时继续租房的成本
  totalRentPaid: number; // N年总租金支出
  netGainAfterRent: number; // 扣除租金后的净收益
}

// 共同借款人
interface CoBorrower {
  name: string;
  monthlyIncome: number;
}

// 贷款类型配置
const LOAN_TYPES = {
  conventional: {
    name: 'Conventional (普通贷款)',
    interestRate: 0.062,
    minDownPayment: 0.035,
    pmi: 150,
  },
  va: {
    name: 'VA Loan (退伍军人贷款)',
    interestRate: 0.055,
    minDownPayment: 0,
    pmi: 0,
  },
};

// 默认参数
const defaultXiamen: XiamenProperty = {
  marketValue: 2800000,
  monthlyRent: 2800,
  exchangeRate: 7.27,
  sellingCostRate: 0.036,
};

const defaultSDOptions: SDPropertyOption[] = [
  { type: '1B1B', price: 420000, monthlyRent: 1800, rooms: 1, appreciationRate: 0.02, hoaAndTax: 750 },
  { type: '2B2B', price: 550000, monthlyRent: 1200, rooms: 2, appreciationRate: 0.03, hoaAndTax: 850 },
  { type: '3B2B', price: 750000, monthlyRent: 1100, rooms: 3, appreciationRate: 0.035, hoaAndTax: 1000 },
];

// 默认共同借款人
const defaultCoBorrowers: CoBorrower[] = [
  { name: 'JJ', monthlyIncome: 3900 },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

// 计算股市投资收益
function calculateStockInvestment(
  initialInvestment: number,
  annualReturn: number,
  years: number,
  monthlyRent: number
): StockInvestmentResult {
  const yearNValue = initialInvestment * Math.pow(1 + annualReturn, years);
  const yearNGain = yearNValue - initialInvestment;
  const totalRentPaid = monthlyRent * 12 * years;
  const netGainAfterRent = yearNGain - totalRentPaid;
  const annualizedROI = (Math.pow(yearNValue / initialInvestment, 1 / years) - 1) * 100;

  return {
    initialInvestment,
    stockReturn: annualReturn,
    yearNValue,
    yearNGain,
    annualizedROI,
    totalRentPaid,
    netGainAfterRent,
  };
}

// 生成CSV内容
function generateCSV(
  xiamen: XiamenProperty,
  currentResult: CalculationResult,
  stockResult: StockInvestmentResult,
  analysisYears: number,
  sdRentIfNotBuying: number,
  stockReturnRate: number
): string {
  const rows: string[][] = [];

  // 参数部分
  rows.push(['=== 输入参数 ===', '']);
  rows.push(['厦门房产市值 (RMB)', xiamen.marketValue.toString()]);
  rows.push(['厦门月租金 (RMB)', xiamen.monthlyRent.toString()]);
  rows.push(['汇率 (CNY/USD)', xiamen.exchangeRate.toString()]);
  rows.push(['卖房成本率', (xiamen.sellingCostRate * 100).toFixed(1) + '%']);
  rows.push(['SD租房月租 (USD)', sdRentIfNotBuying.toString()]);
  rows.push(['分析年限', analysisYears.toString()]);
  rows.push(['股市年化收益率假设', (stockReturnRate * 100).toFixed(1) + '%']);
  rows.push(['']);

  // 当前方案参数
  if (currentResult.scenario.sdProperty) {
    rows.push(['=== 当前购房方案 ===', '']);
    rows.push(['房型', currentResult.scenario.sdProperty.type]);
    rows.push(['房价 (USD)', currentResult.scenario.sdProperty.price.toString()]);
    rows.push(['首付比例', (currentResult.scenario.downPaymentPercent * 100).toFixed(0) + '%']);
    rows.push(['贷款人', currentResult.scenario.borrower?.name || 'N/A']);
    rows.push(['出租房间数', currentResult.scenario.roomsToRent.toString()]);
    rows.push(['']);
  }

  // 购房方案结果
  rows.push(['=== 购房方案计算结果 ===', '']);
  rows.push(['厦门卖房到手 (USD)', currentResult.initialInvestment.toFixed(0)]);
  rows.push(['首付 (USD)', currentResult.downPayment.toFixed(0)]);
  rows.push(['Closing Cost (USD)', currentResult.closingCosts.toFixed(0)]);
  rows.push(['剩余现金 (USD)', currentResult.remainingCash.toFixed(0)]);
  rows.push(['月供 P&I (USD)', currentResult.monthlyMortgage.toFixed(0)]);
  rows.push(['月HOA+税+保险 (USD)', currentResult.monthlyHOATax.toFixed(0)]);
  rows.push(['月租金收入 (USD)', currentResult.monthlyRentalIncome.toFixed(0)]);
  rows.push(['月省下租金/隐含收益 (USD)', currentResult.monthlyImputedRent.toFixed(0)]);
  rows.push(['月等效现金流 (USD)', currentResult.monthlyEffectiveCashflow.toFixed(0)]);
  rows.push(['年等效现金流 (USD)', currentResult.annualEffectiveCashflow.toFixed(0)]);
  rows.push(['等效年收益率 APY', currentResult.effectiveCashflowAPY.toFixed(2) + '%']);
  rows.push([`${analysisYears}年后房产价值 (USD)`, currentResult.year5PropertyValue.toFixed(0)]);
  rows.push([`${analysisYears}年后房产净值 (USD)`, currentResult.year5Equity.toFixed(0)]);
  rows.push([`${analysisYears}年总回报 (USD)`, currentResult.year5TotalReturn.toFixed(0)]);
  rows.push([`${analysisYears}年年化ROI`, currentResult.year5AnnualizedROI.toFixed(2) + '%']);
  rows.push(['DTI', currentResult.dti.toFixed(2) + '%']);
  rows.push(['']);

  // 股市投资对比
  rows.push(['=== 股市投资对比 (首付投入股市) ===', '']);
  rows.push(['投入本金 (USD)', stockResult.initialInvestment.toFixed(0)]);
  rows.push(['股市年化收益率', (stockResult.stockReturn * 100).toFixed(1) + '%']);
  rows.push([`${analysisYears}年后股票价值 (USD)`, stockResult.yearNValue.toFixed(0)]);
  rows.push([`${analysisYears}年股票收益 (USD)`, stockResult.yearNGain.toFixed(0)]);
  rows.push([`${analysisYears}年租房总支出 (USD)`, stockResult.totalRentPaid.toFixed(0)]);
  rows.push([`扣除租金后净收益 (USD)`, stockResult.netGainAfterRent.toFixed(0)]);
  rows.push(['']);

  // 对比总结
  const buyingNetWorth = currentResult.year5Equity + currentResult.remainingCash + currentResult.annualEffectiveCashflow * analysisYears;
  const stockNetWorth = stockResult.yearNValue;
  const buyingVsStock = buyingNetWorth - stockNetWorth;

  rows.push(['=== 对比总结 ===', '']);
  rows.push([`${analysisYears}年后购房净资产 (USD)`, buyingNetWorth.toFixed(0)]);
  rows.push([`${analysisYears}年后股市净值 (USD)`, stockNetWorth.toFixed(0)]);
  rows.push(['购房 vs 股市差异 (USD)', buyingVsStock.toFixed(0)]);
  rows.push(['结论', buyingVsStock > 0 ? '购房方案更优' : '股市投资更优']);

  // 转换为CSV字符串
  return rows.map(row => row.join(',')).join('\n');
}

export default function App() {
  // 状态管理
  const [xiamen, setXiamen] = useState(defaultXiamen);
  const [sdOptions, setSDOptions] = useState(defaultSDOptions);
  const [sdRentIfNotBuying, setSDRentIfNotBuying] = useState(850);
  const [analysisYears, setAnalysisYears] = useState(5);

  // 贷款配置
  const [loanType, setLoanType] = useState<'conventional' | 'va'>('va');
  const [coBorrowers, setCoBorrowers] = useState<CoBorrower[]>(defaultCoBorrowers);
  const [customInterestRate, setCustomInterestRate] = useState<number | null>(null); // null表示使用默认利率
  const [newBorrowerName, setNewBorrowerName] = useState('');
  const [newBorrowerIncome, setNewBorrowerIncome] = useState('');

  // 当前选中的场景参数
  const [selectedPropertyType, setSelectedPropertyType] = useState<'1B1B' | '2B2B' | '3B2B'>('2B2B');
  const [downPaymentPercent, setDownPaymentPercent] = useState(0.2);
  const [roomsToRent, setRoomsToRent] = useState(2);

  // 股市对比参数
  const [stockReturnRate, setStockReturnRate] = useState(0.06); // 6%年化

  // 计算总收入
  const totalMonthlyIncome = useMemo(() => {
    return coBorrowers.reduce((sum, b) => sum + b.monthlyIncome, 0);
  }, [coBorrowers]);

  // 当前贷款配置
  const currentLoanConfig = useMemo(() => {
    const base = LOAN_TYPES[loanType];
    return {
      ...base,
      interestRate: customInterestRate !== null ? customInterestRate : base.interestRate,
    };
  }, [loanType, customInterestRate]);

  // 构建当前借款人对象（用于计算）
  const currentBorrower: Borrower = useMemo(() => ({
    name: coBorrowers.map(b => b.name).join(' + '),
    monthlyIncome: totalMonthlyIncome,
    loanOptions: [{
      name: currentLoanConfig.name,
      type: loanType,
      interestRate: currentLoanConfig.interestRate,
      minDownPayment: currentLoanConfig.minDownPayment,
      pmi: currentLoanConfig.pmi,
    }],
  }), [coBorrowers, totalMonthlyIncome, currentLoanConfig, loanType]);

  // 添加借款人
  const handleAddBorrower = useCallback(() => {
    if (newBorrowerName.trim() && newBorrowerIncome) {
      setCoBorrowers([...coBorrowers, {
        name: newBorrowerName.trim(),
        monthlyIncome: Number(newBorrowerIncome),
      }]);
      setNewBorrowerName('');
      setNewBorrowerIncome('');
    }
  }, [newBorrowerName, newBorrowerIncome, coBorrowers]);

  // 删除借款人
  const handleRemoveBorrower = useCallback((index: number) => {
    if (coBorrowers.length > 1) {
      setCoBorrowers(coBorrowers.filter((_, i) => i !== index));
    }
  }, [coBorrowers]);

  // 计算厦门到手金额
  const xiamenNetProceeds = useMemo(() => calculateXiamenNetProceeds(xiamen), [xiamen]);

  // 计算所有场景
  const allResults = useMemo(() => {
    const results: CalculationResult[] = [];

    // 基准场景
    const baseline: InvestmentScenario = {
      id: 'baseline',
      name: '持有厦门 + SD租房',
      sellXiamen: false,
      sdProperty: null,
      downPaymentPercent: 0,
      borrower: null,
      roomsToRent: 0,
      sdRentIfNotBuying,
    };
    results.push(calculateScenario(baseline, xiamen, analysisYears));

    // 使用当前借款人配置生成所有首付组合
    const dpOptions = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8];

    for (const property of sdOptions) {
      for (const dp of dpOptions) {
        const loanOption = getBestLoanOption(currentBorrower, dp);
        if (!loanOption) continue;

        // 检查首付是否够
        const downPayment = property.price * dp;
        const closingCosts = property.price * 0.03;
        if (downPayment + closingCosts > xiamenNetProceeds) continue;

        for (let rooms = 0; rooms <= property.rooms; rooms++) {
          const scenario: InvestmentScenario = {
            id: `${property.type}-${dp * 100}%-${rooms}rooms`,
            name: `${property.type} (${(dp * 100).toFixed(0)}%首付, 出租${rooms}间)`,
            sellXiamen: true,
            sdProperty: property,
            downPaymentPercent: dp,
            borrower: currentBorrower,
            roomsToRent: rooms,
            sdRentIfNotBuying,
          };
          results.push(calculateScenario(scenario, xiamen, analysisYears));
        }
      }
    }

    return results;
  }, [xiamen, sdOptions, currentBorrower, sdRentIfNotBuying, analysisYears, xiamenNetProceeds]);

  // 当前选中场景的计算结果
  const currentResult = useMemo(() => {
    const property = sdOptions.find(p => p.type === selectedPropertyType)!;

    const scenario: InvestmentScenario = {
      id: 'current',
      name: `${selectedPropertyType} (${currentBorrower.name}, ${(downPaymentPercent * 100).toFixed(0)}%首付, 出租${roomsToRent}间)`,
      sellXiamen: true,
      sdProperty: property,
      downPaymentPercent,
      borrower: currentBorrower,
      roomsToRent: Math.min(roomsToRent, property.rooms),
      sdRentIfNotBuying,
    };

    return calculateScenario(scenario, xiamen, analysisYears);
  }, [selectedPropertyType, downPaymentPercent, roomsToRent, xiamen, sdOptions, currentBorrower, sdRentIfNotBuying, analysisYears]);

  // 基准场景结果
  const baselineResult = allResults.find(r => r.scenario.id === 'baseline')!;

  // 股市投资计算 (首付+closing cost投入股市)
  const stockResult = useMemo(() => {
    const investment = currentResult.downPayment + currentResult.closingCosts;
    return calculateStockInvestment(investment, stockReturnRate, analysisYears, sdRentIfNotBuying);
  }, [currentResult.downPayment, currentResult.closingCosts, stockReturnRate, analysisYears, sdRentIfNotBuying]);

  // 购房 vs 股市对比数据
  const stockComparisonData = useMemo(() => {
    const buyingNetWorth = currentResult.year5Equity + currentResult.remainingCash + currentResult.annualEffectiveCashflow * analysisYears;
    const stockNetWorth = stockResult.yearNValue;

    return [
      { name: '购房方案', value: buyingNetWorth, fill: '#00d4ff' },
      { name: '股市投资', value: stockNetWorth, fill: '#ffc107' },
    ];
  }, [currentResult, stockResult, analysisYears]);

  // CSV下载处理
  const handleDownloadCSV = useCallback(() => {
    const csv = generateCSV(xiamen, currentResult, stockResult, analysisYears, sdRentIfNotBuying, stockReturnRate);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // 加BOM支持中文
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `房产投资分析_${selectedPropertyType}_${(downPaymentPercent * 100).toFixed(0)}%首付_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [xiamen, currentResult, stockResult, analysisYears, sdRentIfNotBuying, stockReturnRate, selectedPropertyType, downPaymentPercent]);

  // Pareto前沿数据
  const paretoData = useMemo(() => {
    return allResults
      .filter(r => r.scenario.sellXiamen && r.dti < 43) // 过滤DTI过高的
      .map(r => ({
        cashflowAPY: r.effectiveCashflowAPY, // 使用等效APY
        year5ROI: r.year5AnnualizedROI,
        name: r.scenario.name,
        id: r.scenario.id,
      }));
  }, [allResults]);

  // 不同首付比例的收益曲线
  const dpCurveData = useMemo(() => {
    const property = sdOptions.find(p => p.type === selectedPropertyType)!;
    const data = [];

    for (let dp = 0; dp <= 0.8; dp += 0.05) {
      const loanOption = getBestLoanOption(currentBorrower, dp);
      if (!loanOption) continue;

      const downPayment = property.price * dp;
      const closingCosts = property.price * 0.03;
      if (downPayment + closingCosts > xiamenNetProceeds) continue;

      const scenario: InvestmentScenario = {
        id: `curve-${dp}`,
        name: `${(dp * 100).toFixed(0)}%首付`,
        sellXiamen: true,
        sdProperty: property,
        downPaymentPercent: dp,
        borrower: currentBorrower,
        roomsToRent: Math.min(roomsToRent, property.rooms),
        sdRentIfNotBuying,
      };

      const result = calculateScenario(scenario, xiamen, analysisYears);
      data.push({
        downPayment: dp * 100,
        cashflowAPY: result.cashflowAPY,
        effectiveCashflowAPY: result.effectiveCashflowAPY,
        year5ROI: result.year5AnnualizedROI,
        monthlyCashflow: result.monthlyCashflow,
        monthlyEffectiveCashflow: result.monthlyEffectiveCashflow,
        dti: result.dti,
      });
    }

    return data;
  }, [selectedPropertyType, roomsToRent, xiamen, sdOptions, currentBorrower, sdRentIfNotBuying, analysisYears, xiamenNetProceeds]);

  const selectedProperty = sdOptions.find(p => p.type === selectedPropertyType)!;

  return (
    <div className="app">
      <header className="header">
        <h1>房产投资多目标优化分析器</h1>
        <p>厦门 vs 圣地亚哥 - 卖房买房决策工具</p>
      </header>

      <div className="main-content">
        {/* 左侧：参数面板 */}
        <div className="panel params-panel">
          <h2>参数设置</h2>

          {/* 厦门房产 */}
          <div className="param-section">
            <h3>厦门房产</h3>
            <div className="param-row">
              <label>市场价 (万RMB)</label>
              <input
                type="number"
                value={xiamen.marketValue / 10000}
                onChange={e => setXiamen({ ...xiamen, marketValue: Number(e.target.value) * 10000 })}
              />
            </div>
            <div className="param-row">
              <label>月租金 (RMB)</label>
              <input
                type="number"
                value={xiamen.monthlyRent}
                onChange={e => setXiamen({ ...xiamen, monthlyRent: Number(e.target.value) })}
              />
            </div>
            <div className="param-row">
              <label>汇率 (CNY/USD)</label>
              <input
                type="number"
                step="0.01"
                value={xiamen.exchangeRate}
                onChange={e => setXiamen({ ...xiamen, exchangeRate: Number(e.target.value) })}
              />
            </div>
            <div className="info-box">
              卖房到手: <strong>{formatCurrency(xiamenNetProceeds)}</strong>
            </div>
          </div>

          {/* SD租房成本 */}
          <div className="param-section">
            <h3>SD租房成本 (不买房时)</h3>
            <div className="param-row">
              <label>月租金 (USD)</label>
              <input
                type="number"
                value={sdRentIfNotBuying}
                onChange={e => setSDRentIfNotBuying(Number(e.target.value))}
              />
            </div>
          </div>

          {/* 购房选择 */}
          <div className="param-section">
            <h3>SD购房选择</h3>
            <div className="param-row">
              <label>房型</label>
              <select
                value={selectedPropertyType}
                onChange={e => {
                  setSelectedPropertyType(e.target.value as '1B1B' | '2B2B' | '3B2B');
                  const newProp = sdOptions.find(p => p.type === e.target.value)!;
                  setRoomsToRent(Math.min(roomsToRent, newProp.rooms));
                }}
              >
                {sdOptions.map(p => (
                  <option key={p.type} value={p.type}>
                    {p.type} - {formatCurrency(p.price)}
                  </option>
                ))}
              </select>
            </div>

            <div className="param-row">
              <label>房价 (USD)</label>
              <input
                type="number"
                value={selectedProperty.price}
                onChange={e => {
                  const newOptions = sdOptions.map(p =>
                    p.type === selectedPropertyType ? { ...p, price: Number(e.target.value) } : p
                  );
                  setSDOptions(newOptions);
                }}
              />
            </div>

            <div className="param-row">
              <label>每间租金 (USD/月)</label>
              <input
                type="number"
                value={selectedProperty.monthlyRent}
                onChange={e => {
                  const newOptions = sdOptions.map(p =>
                    p.type === selectedPropertyType ? { ...p, monthlyRent: Number(e.target.value) } : p
                  );
                  setSDOptions(newOptions);
                }}
              />
            </div>

            <div className="param-row">
              <label>年升值率 (%)</label>
              <input
                type="number"
                step="0.5"
                value={selectedProperty.appreciationRate * 100}
                onChange={e => {
                  const newOptions = sdOptions.map(p =>
                    p.type === selectedPropertyType ? { ...p, appreciationRate: Number(e.target.value) / 100 } : p
                  );
                  setSDOptions(newOptions);
                }}
              />
            </div>

            <div className="param-row">
              <label>HOA+税+保险 (USD/月)</label>
              <input
                type="number"
                value={selectedProperty.hoaAndTax}
                onChange={e => {
                  const newOptions = sdOptions.map(p =>
                    p.type === selectedPropertyType ? { ...p, hoaAndTax: Number(e.target.value) } : p
                  );
                  setSDOptions(newOptions);
                }}
              />
            </div>
          </div>

          {/* 贷款类型 */}
          <div className="param-section">
            <h3>贷款类型</h3>
            <div className="param-row">
              <label>选择贷款类型</label>
              <select
                value={loanType}
                onChange={e => {
                  setLoanType(e.target.value as 'conventional' | 'va');
                  setCustomInterestRate(null); // 重置自定义利率
                }}
              >
                <option value="conventional">Conventional (普通贷款) - 3.5%首付起</option>
                <option value="va">VA Loan (退伍军人贷款) - 0%首付</option>
              </select>
            </div>

            <div className="param-row">
              <label>贷款利率 (%)</label>
              <input
                type="number"
                step="0.125"
                value={(customInterestRate !== null ? customInterestRate : LOAN_TYPES[loanType].interestRate) * 100}
                onChange={e => setCustomInterestRate(Number(e.target.value) / 100)}
              />
              <span className="slider-value">
                默认: {(LOAN_TYPES[loanType].interestRate * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 借款人 */}
          <div className="param-section">
            <h3>借款人 (总收入: {formatCurrency(totalMonthlyIncome)}/月)</h3>

            {/* 已添加的借款人列表 */}
            <div className="borrowers-list">
              {coBorrowers.map((b, i) => (
                <div key={i} className="borrower-item">
                  <button
                    className="borrower-btn minus"
                    onClick={() => handleRemoveBorrower(i)}
                    disabled={coBorrowers.length <= 1}
                    title="移除借款人"
                  >
                    −
                  </button>
                  <span className="borrower-name">{b.name}</span>
                  <span className="borrower-income">{formatCurrency(b.monthlyIncome)}/月</span>
                </div>
              ))}
            </div>

            {/* 添加新借款人 */}
            <div className="add-borrower">
              <input
                type="text"
                placeholder="姓名"
                value={newBorrowerName}
                onChange={e => setNewBorrowerName(e.target.value)}
                className="borrower-input name"
              />
              <input
                type="number"
                placeholder="月收入"
                value={newBorrowerIncome}
                onChange={e => setNewBorrowerIncome(e.target.value)}
                className="borrower-input income"
              />
              <button
                className="borrower-btn plus"
                onClick={handleAddBorrower}
                disabled={!newBorrowerName.trim() || !newBorrowerIncome}
                title="添加借款人"
              >
                +
              </button>
            </div>
          </div>

          {/* 首付和出租 */}
          <div className="param-section">
            <h3>首付和出租策略</h3>
            <div className="param-row">
              <label>首付比例: {(downPaymentPercent * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0"
                max="80"
                step="5"
                value={downPaymentPercent * 100}
                onChange={e => setDownPaymentPercent(Number(e.target.value) / 100)}
              />
              <span className="slider-value">
                {formatCurrency(selectedProperty.price * downPaymentPercent)}
              </span>
            </div>

            <div className="param-row">
              <label>出租房间数: {roomsToRent}</label>
              <input
                type="range"
                min="0"
                max={selectedProperty.rooms}
                value={roomsToRent}
                onChange={e => setRoomsToRent(Number(e.target.value))}
              />
              <span className="slider-value">
                {formatCurrency(selectedProperty.monthlyRent * roomsToRent)}/月
              </span>
            </div>

            <div className="param-row">
              <label>分析年限</label>
              <select value={analysisYears} onChange={e => setAnalysisYears(Number(e.target.value))}>
                <option value={3}>3年</option>
                <option value={5}>5年</option>
                <option value={7}>7年</option>
                <option value={10}>10年</option>
              </select>
            </div>
          </div>

          {/* 股市对比参数 */}
          <div className="param-section">
            <h3>股市投资对比</h3>
            <div className="param-row">
              <label>美股年化收益率 (%)</label>
              <input
                type="number"
                step="0.5"
                value={stockReturnRate * 100}
                onChange={e => setStockReturnRate(Number(e.target.value) / 100)}
              />
            </div>
            <div className="info-box">
              假设：首付+Closing Cost投入股市，继续租房
            </div>
          </div>

          {/* 导出按钮 */}
          <div className="param-section">
            <button className="export-btn" onClick={handleDownloadCSV}>
              📥 导出分析结果 (CSV)
            </button>
          </div>
        </div>

        {/* 中间：结果展示 */}
        <div className="panel results-panel">
          <h2>当前方案分析</h2>

          {/* 关键指标卡片 */}
          <div className="metrics-grid">
            <div className="metric-card primary">
              <div className="metric-label">等效年收益率 (含省租金)</div>
              <div className="metric-value">{formatPercent(currentResult.effectiveCashflowAPY)}</div>
              <div className="metric-sub">
                等效月现金流: {formatCurrency(currentResult.monthlyEffectiveCashflow)}
              </div>
            </div>

            <div className="metric-card primary">
              <div className="metric-label">{analysisYears}年年化ROI</div>
              <div className="metric-value">{formatPercent(currentResult.year5AnnualizedROI)}</div>
              <div className="metric-sub">
                总回报: {formatCurrency(currentResult.year5TotalReturn)}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">月供 (P&I)</div>
              <div className="metric-value">{formatCurrency(currentResult.monthlyMortgage)}</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">HOA+税+保险</div>
              <div className="metric-value">{formatCurrency(currentResult.monthlyHOATax)}</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">出租收入</div>
              <div className="metric-value">{formatCurrency(currentResult.monthlyRentalIncome)}</div>
              <div className="metric-sub">
                {currentResult.scenario.roomsToRent}间 × {formatCurrency(currentResult.scenario.sdProperty?.monthlyRent || 0)}
              </div>
            </div>

            <div className="metric-card highlight-green">
              <div className="metric-label">省下的租金 (隐含收益)</div>
              <div className="metric-value">{formatCurrency(currentResult.monthlyImputedRent)}</div>
              <div className="metric-sub">
                原本要付的SD房租
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">总收益 (租金+省租金)</div>
              <div className="metric-value">{formatCurrency(currentResult.monthlyTotalIncome)}</div>
              <div className="metric-sub">
                {formatCurrency(currentResult.monthlyRentalIncome)} + {formatCurrency(currentResult.monthlyImputedRent)}
              </div>
            </div>

            <div className={`metric-card ${currentResult.dti > 43 ? 'warning' : ''}`}>
              <div className="metric-label">DTI (债务收入比)</div>
              <div className="metric-value">{formatPercent(currentResult.dti)}</div>
              <div className="metric-sub">
                {currentResult.dti > 43 ? '⚠️ 超过43%上限' : '✅ 符合要求'}
              </div>
            </div>
          </div>

          {/* 与基准对比 */}
          <div className="comparison-section">
            <h3>vs 继续持有厦门</h3>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>指标</th>
                  <th>持有厦门+租房</th>
                  <th>当前方案</th>
                  <th>差异</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>实际月现金流</td>
                  <td>{formatCurrency(baselineResult.monthlyCashflow)}</td>
                  <td>{formatCurrency(currentResult.monthlyCashflow)}</td>
                  <td className={currentResult.monthlyCashflow > baselineResult.monthlyCashflow ? 'positive' : 'negative'}>
                    {formatCurrency(currentResult.monthlyCashflow - baselineResult.monthlyCashflow)}
                  </td>
                </tr>
                <tr>
                  <td>等效月现金流 (含省租金)</td>
                  <td>{formatCurrency(baselineResult.monthlyEffectiveCashflow)}</td>
                  <td>{formatCurrency(currentResult.monthlyEffectiveCashflow)}</td>
                  <td className={currentResult.monthlyEffectiveCashflow > baselineResult.monthlyEffectiveCashflow ? 'positive' : 'negative'}>
                    {formatCurrency(currentResult.monthlyEffectiveCashflow - baselineResult.monthlyEffectiveCashflow)}
                  </td>
                </tr>
                <tr>
                  <td>等效年收益率</td>
                  <td>{formatPercent(baselineResult.effectiveCashflowAPY)}</td>
                  <td>{formatPercent(currentResult.effectiveCashflowAPY)}</td>
                  <td className={currentResult.effectiveCashflowAPY > baselineResult.effectiveCashflowAPY ? 'positive' : 'negative'}>
                    {formatPercent(currentResult.effectiveCashflowAPY - baselineResult.effectiveCashflowAPY)}
                  </td>
                </tr>
                <tr>
                  <td>{analysisYears}年后净资产</td>
                  <td>{formatCurrency(baselineResult.year5Equity + baselineResult.year5TotalReturn)}</td>
                  <td>{formatCurrency(currentResult.year5Equity + currentResult.remainingCash + currentResult.annualEffectiveCashflow * analysisYears)}</td>
                  <td className={currentResult.year5TotalReturn > baselineResult.year5TotalReturn ? 'positive' : 'negative'}>
                    {formatCurrency(currentResult.year5TotalReturn - baselineResult.year5TotalReturn)}
                  </td>
                </tr>
                <tr>
                  <td>{analysisYears}年年化ROI</td>
                  <td>{formatPercent(baselineResult.year5AnnualizedROI)}</td>
                  <td>{formatPercent(currentResult.year5AnnualizedROI)}</td>
                  <td className={currentResult.year5AnnualizedROI > baselineResult.year5AnnualizedROI ? 'positive' : 'negative'}>
                    {formatPercent(currentResult.year5AnnualizedROI - baselineResult.year5AnnualizedROI)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 资金流向图 */}
          <div className="flow-section">
            <h3>资金流向</h3>
            <div className="flow-diagram">
              <div className="flow-item source">
                <div className="flow-label">厦门卖房到手</div>
                <div className="flow-value">{formatCurrency(xiamenNetProceeds)}</div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-item">
                <div className="flow-label">首付</div>
                <div className="flow-value">{formatCurrency(currentResult.downPayment)}</div>
              </div>
              <div className="flow-item">
                <div className="flow-label">Closing Cost</div>
                <div className="flow-value">{formatCurrency(currentResult.closingCosts)}</div>
              </div>
              <div className="flow-item highlight">
                <div className="flow-label">剩余现金</div>
                <div className="flow-value">{formatCurrency(currentResult.remainingCash)}</div>
              </div>
            </div>
          </div>

          {/* 股市投资对比 */}
          <div className="stock-comparison-section">
            <h3>vs 股市投资 (S&P 500 @ {(stockReturnRate * 100).toFixed(0)}%)</h3>
            <div className="stock-comparison-grid">
              <div className="stock-scenario">
                <h4>方案A: 购房</h4>
                <div className="stock-detail">
                  <span className="label">投入资金:</span>
                  <span className="value">{formatCurrency(currentResult.downPayment + currentResult.closingCosts)}</span>
                </div>
                <div className="stock-detail">
                  <span className="label">{analysisYears}年后房产净值:</span>
                  <span className="value">{formatCurrency(currentResult.year5Equity)}</span>
                </div>
                <div className="stock-detail">
                  <span className="label">+ 剩余现金:</span>
                  <span className="value">{formatCurrency(currentResult.remainingCash)}</span>
                </div>
                <div className="stock-detail">
                  <span className="label">+ {analysisYears}年等效现金流:</span>
                  <span className="value">{formatCurrency(currentResult.annualEffectiveCashflow * analysisYears)}</span>
                </div>
                <div className="stock-detail total">
                  <span className="label">净资产总计:</span>
                  <span className="value highlight-blue">
                    {formatCurrency(currentResult.year5Equity + currentResult.remainingCash + currentResult.annualEffectiveCashflow * analysisYears)}
                  </span>
                </div>
              </div>

              <div className="vs-divider">VS</div>

              <div className="stock-scenario">
                <h4>方案B: 投股市 + 租房</h4>
                <div className="stock-detail">
                  <span className="label">投入股市:</span>
                  <span className="value">{formatCurrency(stockResult.initialInvestment)}</span>
                </div>
                <div className="stock-detail">
                  <span className="label">{analysisYears}年后股票价值:</span>
                  <span className="value">{formatCurrency(stockResult.yearNValue)}</span>
                </div>
                <div className="stock-detail">
                  <span className="label">- {analysisYears}年租金支出:</span>
                  <span className="value negative">-{formatCurrency(stockResult.totalRentPaid)}</span>
                </div>
                <div className="stock-detail">
                  <span className="label">+ 剩余现金:</span>
                  <span className="value">{formatCurrency(currentResult.remainingCash)}</span>
                </div>
                <div className="stock-detail total">
                  <span className="label">净资产总计:</span>
                  <span className="value highlight-yellow">
                    {formatCurrency(stockResult.yearNValue - stockResult.totalRentPaid + currentResult.remainingCash)}
                  </span>
                </div>
              </div>
            </div>

            {/* 对比柱状图 */}
            <div className="comparison-chart">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={stockComparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Bar dataKey="value" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 结论 */}
            <div className={`comparison-verdict ${
              (currentResult.year5Equity + currentResult.remainingCash + currentResult.annualEffectiveCashflow * analysisYears) >
              (stockResult.yearNValue - stockResult.totalRentPaid + currentResult.remainingCash) ? 'positive' : 'negative'
            }`}>
              {(() => {
                const buyingTotal = currentResult.year5Equity + currentResult.remainingCash + currentResult.annualEffectiveCashflow * analysisYears;
                const stockTotal = stockResult.yearNValue - stockResult.totalRentPaid + currentResult.remainingCash;
                const diff = buyingTotal - stockTotal;
                return diff > 0
                  ? `✅ 购房方案优于股市投资 ${formatCurrency(diff)}`
                  : `⚠️ 股市投资优于购房方案 ${formatCurrency(-diff)}`;
              })()}
            </div>
          </div>
        </div>

        {/* 右侧：可视化 */}
        <div className="panel viz-panel">
          <h2>决策空间可视化</h2>

          {/* 首付-收益曲线 */}
          <div className="chart-section">
            <h3>首付比例 vs 收益率</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dpCurveData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="downPayment" label={{ value: '首付 (%)', position: 'insideBottom', offset: -5 }} />
                <YAxis yAxisId="left" label={{ value: 'APY (%)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: '月现金流', angle: 90, position: 'insideRight' }} />
                <Tooltip
                  formatter={(value) => {
                    if (typeof value === 'number') {
                      return value > 100 ? formatCurrency(value) : formatPercent(value);
                    }
                    return value;
                  }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="effectiveCashflowAPY" stroke="#8884d8" name="等效APY (含省租金)" />
                <Line yAxisId="left" type="monotone" dataKey="year5ROI" stroke="#82ca9d" name={`${analysisYears}年年化ROI`} />
                <Line yAxisId="right" type="monotone" dataKey="monthlyEffectiveCashflow" stroke="#ff7300" name="等效月现金流" />
                <ReferenceLine yAxisId="left" x={downPaymentPercent * 100} stroke="red" strokeDasharray="5 5" label="当前" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pareto前沿散点图 */}
          <div className="chart-section">
            <h3>多目标优化空间 (等效APY vs {analysisYears}年ROI)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cashflowAPY" name="Cashflow APY" label={{ value: 'Cashflow APY (%)', position: 'insideBottom', offset: -5 }} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(1)} />
                <YAxis dataKey="year5ROI" name={`${analysisYears}年年化ROI`} label={{ value: `${analysisYears}年年化ROI (%)`, angle: -90, position: 'insideLeft' }} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(1)} />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="custom-tooltip">
                        <p><strong>{data.name}</strong></p>
                        <p>Cashflow APY: {formatPercent(data.cashflowAPY)}</p>
                        <p>{analysisYears}年ROI: {formatPercent(data.year5ROI)}</p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={paretoData}
                  fill="#8884d8"
                  opacity={0.6}
                />
                {/* 当前选中点 */}
                <Scatter
                  data={[{
                    cashflowAPY: currentResult.effectiveCashflowAPY,
                    year5ROI: currentResult.year5AnnualizedROI,
                    name: '当前方案'
                  }]}
                  fill="#ff0000"
                  shape="star"
                />
                {/* 基准点 */}
                <Scatter
                  data={[{
                    cashflowAPY: baselineResult.effectiveCashflowAPY,
                    year5ROI: baselineResult.year5AnnualizedROI,
                    name: '持有厦门'
                  }]}
                  fill="#00ff00"
                  shape="diamond"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <div className="legend-custom">
              <span className="legend-item"><span className="dot red"></span> 当前方案</span>
              <span className="legend-item"><span className="dot green"></span> 持有厦门基准</span>
              <span className="legend-item"><span className="dot purple"></span> 其他方案</span>
            </div>
          </div>

          {/* 问题定义 */}
          <div className="problem-definition">
            <h3>多目标优化问题定义</h3>
            <div className="formula-box">
              <p><strong>关键概念 - 隐含租金 (Imputed Rent):</strong></p>
              <ul>
                <li>买房自住 = 省下原本要付的租金</li>
                <li>等效收益 = 实际租金收入 + 省下的租金</li>
              </ul>
              <p><strong>优化目标 (Maximize):</strong></p>
              <ul>
                <li>f₁: 等效APY = (年等效现金流 / 投入资本) × 100%</li>
                <li>f₂: {analysisYears}年年化ROI = 含房产增值的总回报</li>
              </ul>
              <p><strong>决策变量:</strong></p>
              <ul>
                <li>x₁: 房产类型 ∈ {'{1B1B, 2B2B, 3B2B}'}</li>
                <li>x₂: 首付比例 ∈ [0%, 80%]</li>
                <li>x₃: 贷款人 ∈ {'{我, Gavin, 小雨}'}</li>
                <li>x₄: 出租房间数 ∈ [0, 房间总数]</li>
              </ul>
              <p><strong>约束条件:</strong></p>
              <ul>
                <li>首付 + Closing Cost ≤ 卖房到手金额</li>
                <li>DTI ≤ 43% (贷款资格)</li>
                <li>首付 ≥ 贷款最低要求</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className="footer">
        <p>分析基于当前市场数据 | 数据来源: Zillow, RentCafe, Redfin | 更新时间: 2026-01-07</p>
      </footer>
    </div>
  );
}
