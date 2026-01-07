import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  calculateScenario,
  calculateXiamenNetProceeds,
  calculateMonthlyMortgage,
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

const defaultBorrowers: Borrower[] = [
  {
    name: '我 (Jinglin)',
    monthlyIncome: 3500,
    loanOptions: [
      { name: 'Conventional', type: 'conventional', interestRate: 0.065, minDownPayment: 0.2, pmi: 150 },
    ]
  },
  {
    name: 'Gavin',
    monthlyIncome: 8000,
    loanOptions: [
      { name: 'Conventional', type: 'conventional', interestRate: 0.065, minDownPayment: 0.2, pmi: 150 },
    ]
  },
  {
    name: '小雨 (VA Loan)',
    monthlyIncome: 6000,
    loanOptions: [
      { name: 'VA Loan', type: 'va', interestRate: 0.055, minDownPayment: 0, pmi: 0 },
      { name: 'Conventional', type: 'conventional', interestRate: 0.065, minDownPayment: 0.2, pmi: 150 },
    ]
  },
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

export default function App() {
  // 状态管理
  const [xiamen, setXiamen] = useState(defaultXiamen);
  const [sdOptions, setSDOptions] = useState(defaultSDOptions);
  const [borrowers, setBorrowers] = useState(defaultBorrowers);
  const [sdRentIfNotBuying, setSDRentIfNotBuying] = useState(850);
  const [analysisYears, setAnalysisYears] = useState(5);

  // 当前选中的场景参数
  const [selectedPropertyType, setSelectedPropertyType] = useState<'1B1B' | '2B2B' | '3B2B'>('2B2B');
  const [selectedBorrowerIndex, setSelectedBorrowerIndex] = useState(2); // 小雨
  const [downPaymentPercent, setDownPaymentPercent] = useState(0.2);
  const [roomsToRent, setRoomsToRent] = useState(2);

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

    // 所有组合场景
    const dpOptions = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8];

    for (const property of sdOptions) {
      for (let bi = 0; bi < borrowers.length; bi++) {
        const borrower = borrowers[bi];
        for (const dp of dpOptions) {
          const loanOption = getBestLoanOption(borrower, dp);
          if (!loanOption) continue;

          // 检查首付是否够
          const downPayment = property.price * dp;
          const closingCosts = property.price * 0.03;
          if (downPayment + closingCosts > xiamenNetProceeds) continue;

          for (let rooms = 0; rooms <= property.rooms; rooms++) {
            const scenario: InvestmentScenario = {
              id: `${property.type}-${borrower.name}-${dp * 100}%-${rooms}rooms`,
              name: `${property.type} (${borrower.name}, ${(dp * 100).toFixed(0)}%首付, 出租${rooms}间)`,
              sellXiamen: true,
              sdProperty: property,
              downPaymentPercent: dp,
              borrower,
              roomsToRent: rooms,
              sdRentIfNotBuying,
            };
            results.push(calculateScenario(scenario, xiamen, analysisYears));
          }
        }
      }
    }

    return results;
  }, [xiamen, sdOptions, borrowers, sdRentIfNotBuying, analysisYears]);

  // 当前选中场景的计算结果
  const currentResult = useMemo(() => {
    const property = sdOptions.find(p => p.type === selectedPropertyType)!;
    const borrower = borrowers[selectedBorrowerIndex];

    const scenario: InvestmentScenario = {
      id: 'current',
      name: `${selectedPropertyType} (${borrower.name}, ${(downPaymentPercent * 100).toFixed(0)}%首付, 出租${roomsToRent}间)`,
      sellXiamen: true,
      sdProperty: property,
      downPaymentPercent,
      borrower,
      roomsToRent: Math.min(roomsToRent, property.rooms),
      sdRentIfNotBuying,
    };

    return calculateScenario(scenario, xiamen, analysisYears);
  }, [selectedPropertyType, selectedBorrowerIndex, downPaymentPercent, roomsToRent, xiamen, sdOptions, borrowers, sdRentIfNotBuying, analysisYears]);

  // 基准场景结果
  const baselineResult = allResults.find(r => r.scenario.id === 'baseline')!;

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
    const borrower = borrowers[selectedBorrowerIndex];
    const data = [];

    for (let dp = 0; dp <= 0.8; dp += 0.05) {
      const loanOption = getBestLoanOption(borrower, dp);
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
        borrower,
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
  }, [selectedPropertyType, selectedBorrowerIndex, roomsToRent, xiamen, sdOptions, borrowers, sdRentIfNotBuying, analysisYears, xiamenNetProceeds]);

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

          {/* 贷款人选择 */}
          <div className="param-section">
            <h3>贷款人</h3>
            <div className="param-row">
              <label>选择贷款人</label>
              <select
                value={selectedBorrowerIndex}
                onChange={e => setSelectedBorrowerIndex(Number(e.target.value))}
              >
                {borrowers.map((b, i) => (
                  <option key={b.name} value={i}>
                    {b.name} - {formatCurrency(b.monthlyIncome)}/月
                  </option>
                ))}
              </select>
            </div>

            <div className="param-row">
              <label>月收入 (USD)</label>
              <input
                type="number"
                value={borrowers[selectedBorrowerIndex].monthlyIncome}
                onChange={e => {
                  const newBorrowers = [...borrowers];
                  newBorrowers[selectedBorrowerIndex] = {
                    ...newBorrowers[selectedBorrowerIndex],
                    monthlyIncome: Number(e.target.value)
                  };
                  setBorrowers(newBorrowers);
                }}
              />
            </div>

            <div className="param-row">
              <label>贷款利率 (%)</label>
              <input
                type="number"
                step="0.125"
                value={borrowers[selectedBorrowerIndex].loanOptions[0].interestRate * 100}
                onChange={e => {
                  const newBorrowers = [...borrowers];
                  newBorrowers[selectedBorrowerIndex] = {
                    ...newBorrowers[selectedBorrowerIndex],
                    loanOptions: newBorrowers[selectedBorrowerIndex].loanOptions.map(lo => ({
                      ...lo,
                      interestRate: Number(e.target.value) / 100
                    }))
                  };
                  setBorrowers(newBorrowers);
                }}
              />
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
                  formatter={(value: number, name: string) => {
                    if (name === 'monthlyEffectiveCashflow') return formatCurrency(value);
                    return formatPercent(value);
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
                <XAxis dataKey="cashflowAPY" name="Cashflow APY" label={{ value: 'Cashflow APY (%)', position: 'insideBottom', offset: -5 }} domain={['auto', 'auto']} />
                <YAxis dataKey="year5ROI" name={`${analysisYears}年年化ROI`} label={{ value: `${analysisYears}年年化ROI (%)`, angle: -90, position: 'insideLeft' }} domain={['auto', 'auto']} />
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
