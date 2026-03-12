// ═══════════════════════════════════════════════════
// 股票技术分析仪表盘 — 前端逻辑 (GitHub Pages 静态版)
// 所有数据通过相对路径读取 data/ 目录下的静态 JSON 文件
// ═══════════════════════════════════════════════════

// ── 全局状态 ──────────────────────────────────────────
let state = {
    dates: [],
    currentDate: null,
    currentMarket: 'cn',
    currentSymbol: null,
    overviewData: null,
    stocksData: [],
    searchQuery: '',
};

// ── 初始化 ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // 加载可用日期（使用相对路径）
    try {
        const res = await fetch('data/dates.json');
        state.dates = await res.json();
    } catch (e) {
        console.error('Failed to load dates:', e);
        showEmpty();
        return;
    }

    if (state.dates.length === 0) {
        showEmpty();
        return;
    }

    // 填充日期选择器
    const dateSelect = document.getElementById('dateSelect');
    state.dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.date;
        opt.textContent = d.date + ' (' + d.markets.join('/') + ')';
        dateSelect.appendChild(opt);
    });

    // 绑定日期切换事件
    dateSelect.addEventListener('change', () => {
        state.currentDate = dateSelect.value;
        loadOverview();
    });

    // 绑定市场切换事件
    document.querySelectorAll('.btn-market').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-market').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentMarket = btn.dataset.market;
            state.currentSymbol = null;
            renderTable();
            hideDetail();
        });
    });

    // 绑定搜索框事件
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderTable();
    });

    // 设置默认日期并加载
    state.currentDate = state.dates[0].date;
    // 如果最新日期有cn则默认cn，否则us
    const latestMarkets = state.dates[0].markets;
    if (latestMarkets.includes('cn')) {
        state.currentMarket = 'cn';
    } else if (latestMarkets.includes('us')) {
        state.currentMarket = 'us';
        document.querySelector('[data-market="us"]').classList.add('active');
        document.querySelector('[data-market="cn"]').classList.remove('active');
    }

    await loadOverview();
}

// ── 数据加载 ──────────────────────────────────────────
async function loadOverview() {
    showLoading();
    try {
        // 使用相对路径加载静态 JSON 数据
        const res = await fetch(`data/${state.currentDate}/overview.json`);
        state.overviewData = await res.json();
        showMain();
        renderTable();
        hideDetail();
        updateStatus();
    } catch (e) {
        console.error('Failed to load overview:', e);
        showEmpty();
    }
}

function updateStatus() {
    const el = document.getElementById('statusText');
    if (state.overviewData) {
        const markets = state.overviewData.markets;
        let total = 0;
        for (const m in markets) total += markets[m].count;
        el.textContent = `${state.currentDate} · ${total} 只股票/指数`;
    }
}

// ── 汇总表格渲染 ──────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (!state.overviewData) return;

    const marketData = state.overviewData.markets[state.currentMarket];
    if (!marketData) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5">该日期暂无此市场的报告数据</td></tr>';
        return;
    }

    let stocks = marketData.stocks;

    // 搜索过滤
    if (state.searchQuery) {
        stocks = stocks.filter(s =>
            (s.symbol || '').toLowerCase().includes(state.searchQuery) ||
            (s.name || '').toLowerCase().includes(state.searchQuery)
        );
    }

    // 先展示指数，再展示个股
    const indices = stocks.filter(s => s.is_index);
    const normals = stocks.filter(s => !s.is_index);

    // 个股按评分降序
    normals.sort((a, b) => (b.score || 0) - (a.score || 0));

    const allStocks = [...indices, ...normals];
    state.stocksData = allStocks;

    if (allStocks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5">无匹配结果</td></tr>';
        return;
    }

    // 在指数和个股之间插入分隔行
    let indexRendered = false;

    allStocks.forEach((stock, idx) => {
        // 分隔行
        if (!stock.is_index && indices.length > 0 && !indexRendered) {
            indexRendered = true;
            const sep = document.createElement('tr');
            sep.innerHTML = `<td colspan="7" style="padding: 4px 12px; background: var(--bg-body);">
                <span style="color: var(--text-muted); font-size: 0.78rem; font-weight: 600;">📊 个股分析</span>
            </td>`;
            tbody.appendChild(sep);
        }

        // 错误行
        if (stock.error) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div class="stock-row">
                    <span class="stock-symbol">${stock.symbol}</span>
                    <span class="stock-name">${stock.name}</span>
                    ${marketBadge(stock.market, stock.is_index)}
                </div></td>
                <td colspan="6" class="text-muted">❌ ${stock.error}</td>
            `;
            tbody.appendChild(tr);
            return;
        }

        const close = stock.last_close || 0;
        const ma20 = stock.ma20 || 0;
        const pctToMa20 = ma20 ? ((close - ma20) / ma20 * 100) : 0;
        const macdHist = stock.macd_hist || 0;
        const rsi = stock.rsi || 0;

        // MACD 状态
        const macdStr = macdHist > 0
            ? '<span class="change-positive">金叉📈</span>'
            : '<span class="change-negative">死叉📉</span>';

        // RSI 状态
        let rsiStr;
        if (rsi >= 70) rsiStr = `<span class="change-negative">${rsi.toFixed(0)}🔴</span>`;
        else if (rsi <= 30) rsiStr = `<span class="change-positive">${rsi.toFixed(0)}🟢</span>`;
        else rsiStr = `<span class="change-neutral">${rsi.toFixed(0)}</span>`;

        // 关键信号
        const signals = buildKeySignals(stock);

        // 涨跌颜色
        const pctClass = pctToMa20 >= 0 ? 'change-positive' : 'change-negative';

        const tr = document.createElement('tr');
        tr.className = stock.is_index ? 'is-index' : '';
        if (state.currentSymbol === stock.symbol) tr.classList.add('selected');
        tr.dataset.symbol = stock.symbol;
        tr.innerHTML = `
            <td><div class="stock-row">
                <div>
                    <div class="stock-symbol">${stock.symbol}</div>
                    <div class="stock-name">${stock.name}</div>
                </div>
                ${marketBadge(stock.market, stock.is_index)}
            </div></td>
            <td class="price-val">${close.toFixed(2)} <small class="text-muted">${stock.currency || ''}</small></td>
            <td class="${pctClass}">${pctToMa20 >= 0 ? '+' : ''}${pctToMa20.toFixed(1)}%</td>
            <td>${macdStr}</td>
            <td>${rsiStr}</td>
            <td>${signals}</td>
            <td><span class="score-label">${stock.score_label || '-'}</span></td>
        `;
        tr.addEventListener('click', () => selectStock(stock));
        tbody.appendChild(tr);
    });
}

// ── 渲染辅助函数 ──────────────────────────────────────
function marketBadge(market, isIndex) {
    if (isIndex) return '<span class="stock-market-badge index">指数</span>';
    const labels = { us: 'US', hk: 'HK', a: 'A股' };
    return `<span class="stock-market-badge ${market}">${labels[market] || market}</span>`;
}

function buildKeySignals(stock) {
    const parts = [];

    // 背离信号
    const divs = [
        ...(stock.daily_macd_divs || []).slice(-2),
        ...(stock.daily_rsi_divs || []).slice(-2),
    ];
    divs.forEach(([date, type]) => {
        if (type === 'bottom') {
            parts.push(`<span class="signal-badge bull">底背离🔔(${date})</span>`);
        } else {
            parts.push(`<span class="signal-badge bear">顶背离⚠️(${date})</span>`);
        }
    });

    // 蜡烛形态（简略）
    const dc = stock.d_candles || {};
    if (dc.bull && dc.bull.length > 0) {
        const names = dc.bull.slice(0, 2).map(([n]) => n).join('、');
        parts.push(`<span class="signal-badge bull">📗${names}</span>`);
    }
    if (dc.bear && dc.bear.length > 0) {
        const names = dc.bear.slice(0, 2).map(([n]) => n).join('、');
        parts.push(`<span class="signal-badge bear">📕${names}</span>`);
    }

    return parts.join('') || '<span class="text-muted">-</span>';
}

function classifySignal(text) {
    if (text.includes('✅') || text.includes('📈') || text.includes('🟢') || text.includes('🔔') || text.includes('底背离'))
        return 'bull';
    if (text.includes('⚠️') || text.includes('📉') || text.includes('🔴') || text.includes('❌') || text.includes('顶背离'))
        return 'bear';
    return 'neutral';
}

// ── 股票详情面板 ──────────────────────────────────────
function selectStock(stock) {
    state.currentSymbol = stock.symbol;

    // 高亮行
    document.querySelectorAll('.summary-table tbody tr').forEach(tr => {
        tr.classList.toggle('selected', tr.dataset.symbol === stock.symbol);
    });

    renderDetail(stock);
}

function renderDetail(stock) {
    const panel = document.getElementById('detailPanel');
    panel.style.display = 'block';

    // 标题
    const mkt = stock.market ? stock.market.toUpperCase() : '';
    document.getElementById('detailTitle').innerHTML =
        `${stock.name} <span class="text-secondary">(${stock.symbol}.${mkt})</span> ${stock.score_label || ''}`;

    // 判定语
    const verdictEl = document.getElementById('detailVerdict');
    if (stock.verdict) {
        verdictEl.textContent = stock.verdict;
        verdictEl.style.display = 'block';
    } else {
        verdictEl.style.display = 'none';
    }

    // 价格
    const close = stock.last_close || 0;
    const ma20 = stock.ma20 || 0;
    const pctToMa20 = ma20 ? ((close - ma20) / ma20 * 100) : 0;
    document.getElementById('detailPrice').textContent = `${close.toFixed(2)} ${stock.currency || ''}`;
    const changeEl = document.getElementById('detailChange');
    changeEl.textContent = `MA20偏离 ${pctToMa20 >= 0 ? '+' : ''}${pctToMa20.toFixed(1)}%`;
    changeEl.className = pctToMa20 >= 0 ? 'change-positive' : 'change-negative';

    // 指标网格
    renderIndicators(stock);

    // 信号
    renderSignals(stock);

    // K线形态
    renderCandles(stock);

    // 图表
    renderChart(stock, 'daily');
    // 绑定图表tab事件
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderChart(stock, tab.dataset.chart);
        };
    });
    // 重置为日线
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.toggle('active', t.dataset.chart === 'daily'));

    // 基本面
    renderFundamentals(stock);

    // 新闻
    renderNews(stock);

    // 滚动到详情
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderIndicators(stock) {
    const grid = document.getElementById('indicatorGrid');
    const close = stock.last_close || 0;
    const ma5 = stock.ma5 || 0;
    const ma20 = stock.ma20 || 0;
    const ma60 = stock.ma60;
    const macdHist = stock.macd_hist || 0;
    const rsi = stock.rsi || 0;
    const score = stock.score || 0;

    let items = [
        { label: 'MA5', value: ma5.toFixed(2), color: close >= ma5 ? 'var(--green)' : 'var(--red)' },
        { label: 'MA20', value: ma20.toFixed(2), color: close >= ma20 ? 'var(--green)' : 'var(--red)' },
        { label: 'MA60', value: ma60 != null ? ma60.toFixed(2) : 'N/A', color: (ma60 && close >= ma60) ? 'var(--green)' : (ma60 ? 'var(--red)' : 'var(--text-muted)') },
        { label: 'MACD', value: macdHist > 0 ? '金叉 📈' : '死叉 📉', color: macdHist > 0 ? 'var(--green)' : 'var(--red)' },
        { label: 'RSI(14)', value: rsi.toFixed(1), color: rsi >= 70 ? 'var(--red)' : (rsi <= 30 ? 'var(--green)' : 'var(--text-primary)') },
        { label: '综合评分', value: `${score} 分`, color: score >= 3 ? 'var(--green)' : (score >= 0 ? 'var(--blue)' : 'var(--red)') },
    ];

    grid.innerHTML = items.map(item => `
        <div class="indicator-card">
            <div class="label">${item.label}</div>
            <div class="value" style="color: ${item.color}">${item.value}</div>
        </div>
    `).join('');
}

function renderSignals(stock) {
    const dailyEl = document.getElementById('dailySignals');
    const weeklyEl = document.getElementById('weeklySignals');

    dailyEl.innerHTML = (stock.d_signals || []).map(s => {
        const cls = classifySignal(s);
        return `<span class="signal-badge ${cls}">${s}</span>`;
    }).join('') || '<span class="text-muted">无信号</span>';

    weeklyEl.innerHTML = (stock.w_signals || []).map(s => {
        const cls = classifySignal(s);
        return `<span class="signal-badge ${cls}">${s}</span>`;
    }).join('') || '<span class="text-muted">无信号</span>';
}

function renderCandles(stock) {
    const section = document.getElementById('candleSection');
    const dailyEl = document.getElementById('dailyCandles');
    const weeklyEl = document.getElementById('weeklyCandles');

    const dc = stock.d_candles || {};
    const wc = stock.w_candles || {};

    const hasCandleData = (dc.bull && dc.bull.length) || (dc.bear && dc.bear.length) ||
                          (dc.neutral && dc.neutral.length) || (wc.bull && wc.bull.length) ||
                          (wc.bear && wc.bear.length) || (wc.neutral && wc.neutral.length);

    if (!hasCandleData) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    dailyEl.innerHTML = renderCandleList(dc);
    weeklyEl.innerHTML = renderCandleList(wc);
}

function renderCandleList(candles) {
    let html = '';
    if (candles.bull && candles.bull.length) {
        html += candles.bull.map(([name, date]) =>
            `<span class="candle-pattern bull">📗 ${name}(${date})</span>`
        ).join('');
    }
    if (candles.bear && candles.bear.length) {
        html += candles.bear.map(([name, date]) =>
            `<span class="candle-pattern bear">📕 ${name}(${date})</span>`
        ).join('');
    }
    if (candles.neutral && candles.neutral.length) {
        html += candles.neutral.map(([name, date]) =>
            `<span class="candle-pattern neutral">📋 ${name}(${date})</span>`
        ).join('');
    }
    return html || '<span class="text-muted">无形态</span>';
}

function renderChart(stock, type) {
    const container = document.getElementById('chartContainer');
    const images = stock._images || {};
    const imgFile = images[type];

    if (!imgFile) {
        container.innerHTML = `<div class="no-chart"><i class="fas fa-image" style="font-size:2rem;margin-bottom:10px;display:block;"></i>暂无${type === 'daily' ? '日线' : '周线'}图表</div>`;
        return;
    }

    // 使用相对路径直接加载 data/ 目录下的图片
    const imgUrl = `data/${state.currentDate}/${imgFile}`;
    container.innerHTML = `<img src="${imgUrl}" alt="${stock.symbol} ${type}" loading="lazy" 
        onclick="showImageModal('${imgUrl}')" style="cursor: zoom-in;" 
        title="点击放大">`;
}

function renderFundamentals(stock) {
    const section = document.getElementById('fundamentalSection');
    const dataEl = document.getElementById('fundamentalData');
    const fund = stock.fundamentals || {};

    if (!fund || Object.keys(fund).length === 0 || fund.error) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const labelMap = {
        pe: 'PE', pb: 'PB', eps: 'EPS', roe: 'ROE',
        gross_margin: '毛利率', profit_growth: '净利增速',
        revenue_growth: '营收增速', market_cap: '市值',
        analyst_rating: '分析师评级', price_target: '目标价',
        forward_pe: 'Forward PE', report_date: '报告期',
    };

    let html = '';
    for (const [key, label] of Object.entries(labelMap)) {
        const val = fund[key];
        if (val && String(val) !== 'nan' && String(val) !== 'None' && String(val) !== '') {
            const displayVal = key === 'price_target' ? `$${val}` : val;
            html += `<div class="fundamental-item">
                <span class="f-label">${label}</span>
                <span class="f-value ms-2">${displayVal}</span>
            </div>`;
        }
    }

    // 如果有目标价，计算潜在空间
    if (fund.price_target && stock.last_close) {
        try {
            const target = parseFloat(fund.price_target);
            const upside = ((target - stock.last_close) / stock.last_close * 100).toFixed(1);
            const cls = parseFloat(upside) >= 0 ? 'change-positive' : 'change-negative';
            html += `<div class="fundamental-item">
                <span class="f-label">潜在空间</span>
                <span class="f-value ms-2 ${cls}">${upside}%</span>
            </div>`;
        } catch (e) {}
    }

    dataEl.innerHTML = html || '<span class="text-muted">暂无基本面数据</span>';
}

function renderNews(stock) {
    const section = document.getElementById('newsSection');
    const dataEl = document.getElementById('newsData');
    const news = stock.news || [];

    if (news.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    dataEl.innerHTML = news.slice(0, 5).map(n => `
        <div class="news-item">
            <div class="news-title">${n.title || '无标题'}</div>
            ${n.summary ? `<div class="news-summary">${n.summary}</div>` : ''}
        </div>
    `).join('');
}

// ── UI 工具函数 ──────────────────────────────────────
function showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
}

function showMain() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';
}

function showEmpty() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

function hideDetail() {
    document.getElementById('detailPanel').style.display = 'none';
    state.currentSymbol = null;
}

// ── 图片弹出层 ──────────────────────────────────────
function showImageModal(url) {
    const modal = document.getElementById('imageModal');
    document.getElementById('imageModalImg').src = url;
    modal.classList.add('visible');
}

// ESC 关闭弹出层
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('imageModal').classList.remove('visible');
    }
});
