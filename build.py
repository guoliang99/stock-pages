"""
数据预处理脚本 — 从 data/ 目录下已有的分析结果 JSON
重新生成 overview.json 和 dates.json，供前端页面渲染使用。

用法：python build.py [日期]
  - 不指定日期：扫描 data/ 下所有日期目录，全部重新生成
  - 指定日期：只重新生成该日期的 overview.json（如 python build.py 2026-03-12）
"""

import json
import os
import sys

# ── 路径配置 ──────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')

# 已知的指数信息（与 app.py 保持一致）
# 需要从界面中排除的股票（symbol 列表）
EXCLUDED_SYMBOLS = {'00085'}  # 中电华大

KNOWN_INDICES = {
    # CN 指数
    'sh000001': {'name': '上证指数', 'market': 'cn', 'currency': 'CNY'},
    'sz399001': {'name': '深成指数', 'market': 'cn', 'currency': 'CNY'},
    'sz399006': {'name': '创业板指', 'market': 'cn', 'currency': 'CNY'},
    'HSTECH':   {'name': '恒生科技', 'market': 'cn', 'currency': 'HKD'},
    # US 指数
    'IXIC':     {'name': '纳斯达克',  'market': 'us', 'currency': 'USD'},
    'INX':      {'name': '标普500',   'market': 'us', 'currency': 'USD'},
    '日经225':   {'name': '日经225',   'market': 'us', 'currency': 'JPY'},
}


# ── 工具函数 ──────────────────────────────────────────

def get_available_dates():
    """扫描 data/ 目录，返回可用日期列表（降序）"""
    if not os.path.isdir(DATA_DIR):
        return []
    dates = []
    for name in os.listdir(DATA_DIR):
        full = os.path.join(DATA_DIR, name)
        if os.path.isdir(full) and len(name) == 10 and name[4] == '-':
            dates.append(name)
    dates.sort(reverse=True)
    return dates


def get_chart_images(date_dir, symbol):
    """获取指定日期目录中某股票/指数的图表图片文件名"""
    images = {}
    for suffix in ['daily', 'weekly']:
        fname = f'{symbol}_{suffix}.png'
        fpath = os.path.join(date_dir, fname)
        if os.path.exists(fpath):
            images[suffix] = fname
    return images


def get_available_markets(date_dir):
    """获取指定日期目录下可用的市场类型"""
    markets = set()
    if os.path.exists(os.path.join(date_dir, 'cn_results.json')):
        markets.add('cn')
    if os.path.exists(os.path.join(date_dir, 'us_results.json')):
        markets.add('us')
    # 扫描指数图表也可以发现市场
    for symbol, info in KNOWN_INDICES.items():
        if info['market'] not in markets:
            images = get_chart_images(date_dir, symbol)
            if images:
                markets.add(info['market'])
    return sorted(markets)


def load_results(date_dir, market_type):
    """加载指定日期目录中某市场的分析结果 JSON"""
    fname = f'{market_type}_results.json'
    fpath = os.path.join(date_dir, fname)
    if not os.path.exists(fpath):
        return None
    with open(fpath, 'r', encoding='utf-8') as f:
        return json.load(f)


def scan_index_charts(date_dir):
    """扫描日期目录中的指数图表，返回 {market: [index_entry, ...]}"""
    found = {}  # market -> list of index entries
    for symbol, info in KNOWN_INDICES.items():
        images = get_chart_images(date_dir, symbol)
        if images:
            entry = {
                'symbol': symbol,
                'name': info['name'],
                'market': info['market'],
                'is_index': True,
                'currency': info['currency'],
                'last_close': 0,
                'ma5': 0, 'ma20': 0, 'ma60': None,
                'macd_hist': 0, 'rsi': 0,
                'score': 0, 'score_label': '',
                'verdict': '',
                'd_signals': [], 'w_signals': [],
                'd_candles': {}, 'w_candles': {},
                'fundamentals': {}, 'news': [],
                'daily_macd_divs': [], 'daily_rsi_divs': [],
                'weekly_macd_divs': [], 'weekly_rsi_divs': [],
                '_images': images,
            }
            mkt = info['market']
            found.setdefault(mkt, []).append(entry)

    return found


def build_overview(date_str, date_dir):
    """构建指定日期的概览数据（与 app.py 中 api_overview 逻辑一致）"""
    overview = {
        'date': date_str,
        'markets': {},
    }

    # 先扫描指数图表
    index_by_market = scan_index_charts(date_dir)

    stock_count = 0

    for market in ['cn', 'us']:
        results = load_results(date_dir, market)
        stocks = []

        # 先添加指数条目
        if market in index_by_market:
            stocks.extend(index_by_market[market])

        # 再添加个股
        if results:
            for r in results:
                # 跳过排除列表中的股票
                if r.get('symbol', '') in EXCLUDED_SYMBOLS:
                    continue
                if r.get('error'):
                    stocks.append({
                        'symbol': r.get('symbol', ''),
                        'name': r.get('name', ''),
                        'market': r.get('market', market),
                        'error': r.get('error'),
                    })
                    continue

                daily = r.get('daily', {})
                weekly = r.get('weekly', {})
                images = get_chart_images(date_dir, r.get('symbol', ''))

                stock_info = {
                    'symbol': r.get('symbol', ''),
                    'name': r.get('name', ''),
                    'market': r.get('market', market),
                    'is_index': r.get('is_index', False),
                    'currency': r.get('currency', ''),
                    'last_close': daily.get('last_close', 0),
                    'ma5': daily.get('ma5', 0),
                    'ma20': daily.get('ma20', 0),
                    'ma60': daily.get('ma60'),
                    'macd_hist': daily.get('hist', 0),
                    'rsi': daily.get('rsi', 0),
                    'score': r.get('score', 0),
                    'score_label': r.get('score_label', ''),
                    'verdict': r.get('verdict', ''),
                    'd_signals': r.get('d_signals', []),
                    'w_signals': r.get('w_signals', []),
                    'd_candles': r.get('d_candles', {}),
                    'w_candles': r.get('w_candles', {}),
                    'fundamentals': r.get('fundamentals', {}),
                    'news': r.get('news', []),
                    'daily_macd_divs': daily.get('macd_divs', []),
                    'daily_rsi_divs': daily.get('rsi_divs', []),
                    'weekly_macd_divs': weekly.get('macd_divs', []),
                    'weekly_rsi_divs': weekly.get('rsi_divs', []),
                    '_images': images,
                }
                stocks.append(stock_info)

        if stocks:
            overview['markets'][market] = {
                'stocks': stocks,
                'count': len(stocks),
            }
            stock_count += len(stocks)

    return overview, stock_count


# ── 主流程 ──────────────────────────────────────────

def main():
    print("📊 股票分析仪表盘 — 静态数据构建工具")
    print(f"   数据目录: {DATA_DIR}")
    print()

    # 检查数据目录
    if not os.path.isdir(DATA_DIR):
        print(f"⚠️  数据目录不存在: {DATA_DIR}")
        sys.exit(1)

    # 判断是否指定了单个日期
    target_date = None
    if len(sys.argv) > 1:
        target_date = sys.argv[1]
        target_dir = os.path.join(DATA_DIR, target_date)
        if not os.path.isdir(target_dir):
            print(f"⚠️  指定的日期目录不存在: {target_dir}")
            sys.exit(1)
        print(f"   🎯 指定日期: {target_date}")
        print()

    # 获取所有可用日期（用于生成 dates.json）
    all_dates = get_available_dates()
    if not all_dates:
        print("⚠️  数据目录为空，无可用日期数据")
        sys.exit(0)

    # 确定需要处理的日期列表
    dates_to_process = [target_date] if target_date else all_dates

    print(f"   发现 {len(all_dates)} 个日期: {all_dates[0]} ~ {all_dates[-1]}")
    print(f"   本次处理 {len(dates_to_process)} 个日期")
    print()

    # 统计
    total_stocks = 0

    # 逐日期处理 overview.json
    for d in dates_to_process:
        date_dir = os.path.join(DATA_DIR, d)

        # 生成 overview.json
        overview, stock_count = build_overview(d, date_dir)
        overview_path = os.path.join(date_dir, 'overview.json')
        with open(overview_path, 'w', encoding='utf-8') as f:
            json.dump(overview, f, ensure_ascii=False, indent=2)
        total_stocks += stock_count

        # 每日摘要
        market_keys = list(overview.get('markets', {}).keys())
        print(f"   📁 {d}: {stock_count} 只股票/指数, 市场: {','.join(market_keys) or '无'}")

    # 重新生成 dates.json（始终基于全量日期）
    dates_list = []
    for d in all_dates:
        date_dir = os.path.join(DATA_DIR, d)
        markets = get_available_markets(date_dir)
        dates_list.append({'date': d, 'markets': markets})

    dates_json_path = os.path.join(DATA_DIR, 'dates.json')
    with open(dates_json_path, 'w', encoding='utf-8') as f:
        json.dump(dates_list, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 生成 dates.json ({len(all_dates)} 个日期)")

    # 构建摘要
    print()
    print("═" * 50)
    print(f"🎉 构建完成!")
    print(f"   📅 处理天数: {len(dates_to_process)}")
    print(f"   📈 股票/指数总数: {total_stocks}")
    print(f"   📂 数据目录: {DATA_DIR}")


if __name__ == '__main__':
    main()
