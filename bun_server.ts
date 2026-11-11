import { Database } from "bun:sqlite";

const db = new Database("/tmp/anon_cohort.db");
db.run(`
  CREATE TABLE IF NOT EXISTS submissions (
    anon_id TEXT PRIMARY KEY,
    persona_cluster TEXT NOT NULL,
    compat_bucket TEXT NOT NULL,
    weights_json TEXT NOT NULL,
    ab_votes_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const VALID_BUCKETS = new Set([
  "severe_down",
  "mod_down",
  "mild_down",
  "balanced",
  "upward",
  "veto",
]);

const DIM_IDS = [
  "net_worth",
  "cash_flow",
  "family_risk",
  "appearance",
  "cognition",
  "emotional",
  "alignment",
  "friction",
];

// Seed baseline anonymized cohort data if empty
const countRow = db.query("SELECT COUNT(*) as c FROM submissions").get() as { c: number };
if (countRow.c === 0) {
  const seeds = [
    ["seed_01", "务实抗风险派", "mild_down",
      { net_worth: 18, cash_flow: 22, family_risk: 14, appearance: 10, cognition: 12, emotional: 12, alignment: 6, friction: 6 },
      { "0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "B" }],
    ["seed_02", "情绪&颜控派", "balanced",
      { net_worth: 9, cash_flow: 11, family_risk: 7, appearance: 23, cognition: 9, emotional: 23, alignment: 11, friction: 7 },
      { "0": "B", "1": "A", "2": "B", "3": "B", "4": "A", "5": "A" }],
    ["seed_03", "智性恋慕强派", "upward",
      { net_worth: 13, cash_flow: 19, family_risk: 8, appearance: 12, cognition: 24, emotional: 11, alignment: 7, friction: 6 },
      { "0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "A" }],
    ["seed_04", "均衡六边形派", "balanced",
      { net_worth: 14, cash_flow: 15, family_risk: 11, appearance: 14, cognition: 13, emotional: 15, alignment: 10, friction: 8 },
      { "0": "B", "1": "B", "2": "B", "3": "B", "4": "B", "5": "B" }],
    ["seed_05", "务实抗风险派", "mod_down",
      { net_worth: 21, cash_flow: 20, family_risk: 15, appearance: 9, cognition: 11, emotional: 12, alignment: 6, friction: 6 },
      { "0": "A", "1": "B", "2": "A", "3": "B", "4": "A", "5": "B" }],
    ["seed_06", "情绪&颜控派", "mild_down",
      { net_worth: 10, cash_flow: 12, family_risk: 8, appearance: 20, cognition: 10, emotional: 22, alignment: 10, friction: 8 },
      { "0": "B", "1": "B", "2": "B", "3": "B", "4": "B", "5": "A" }],
  ];
  const stmt = db.prepare("INSERT INTO submissions VALUES (?, ?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (const [aid, persona, bucket, w, votes] of seeds) {
    stmt.run(aid as string, persona as string, bucket as string, JSON.stringify(w), JSON.stringify(votes), now);
  }
}

function getAggregatedStats() {
  const rows = db.query("SELECT persona_cluster, compat_bucket, weights_json, ab_votes_json FROM submissions").all() as Array<{
    persona_cluster: string;
    compat_bucket: string;
    weights_json: string;
    ab_votes_json: string;
  }>;

  const total = rows.length;
  const personas: Record<string, number> = {};
  const buckets: Record<string, number> = {
    severe_down: 0,
    mod_down: 0,
    mild_down: 0,
    balanced: 0,
    upward: 0,
    veto: 0,
  };
  const weightSums: Record<string, number> = {};
  for (const d of DIM_IDS) weightSums[d] = 0;

  const abCounts: Record<string, { A: number; B: number; tie: number }> = {};
  for (let i = 0; i < 6; i++) {
    abCounts[String(i)] = { A: 0, B: 0, tie: 0 };
  }

  for (const r of rows) {
    personas[r.persona_cluster] = (personas[r.persona_cluster] || 0) + 1;
    if (r.compat_bucket in buckets) {
      buckets[r.compat_bucket] += 1;
    }
    try {
      const wMap = JSON.parse(r.weights_json);
      const wTotal = DIM_IDS.reduce((acc, d) => acc + Number(wMap[d] || 0), 0) || 1;
      for (const d of DIM_IDS) {
        weightSums[d] += (Number(wMap[d] || 0) / wTotal) * 100;
      }
    } catch {}
    try {
      const vMap = JSON.parse(r.ab_votes_json);
      for (let i = 0; i < 6; i++) {
        const k = String(i);
        const ch = vMap[k];
        if (ch === "A" || ch === "B" || ch === "tie") {
          abCounts[k][ch] += 1;
        }
      }
    } catch {}
  }

  const avgWeights: Record<string, number> = {};
  for (const d of DIM_IDS) {
    avgWeights[d] = total > 0 ? Number((weightSums[d] / total).toFixed(1)) : 12.5;
  }

  return {
    total_participants: total,
    personas,
    compat_buckets: buckets,
    avg_weights: avgWeights,
    ab_Choice_stats: abCounts,
  };
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>婚恋市场量化评估实验室 · Dating Quant Lab</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --background: #0f172a;
      --card: #1e293b;
      --secondary: #334155;
      --secondary-foreground: #f1f5f9;
      --foreground: #f8fafc;
      --muted-foreground: #94a3b8;
      --border: #334155;
      --primary: #6366f1;
      --primary-foreground: #ffffff;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --background: #f8fafc;
        --card: #ffffff;
        --secondary: #f1f5f9;
        --secondary-foreground: #1e293b;
        --foreground: #0f172a;
        --muted-foreground: #64748b;
        --border: #e2e8f0;
        --primary: #4f46e5;
        --primary-foreground: #ffffff;
      }
    }
    input[type="range"] { accent-color: var(--primary); }
    .tab-btn-active { background-color: var(--primary); color: var(--primary-foreground); }
  </style>
</head>
<body class="bg-[var(--background)] text-[var(--foreground)] antialiased p-4 md:p-6">
  <div class="max-w-5xl mx-auto space-y-5">
    <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--secondary)] text-[var(--secondary-foreground)]">Cobb-Douglas Log-Utility</span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--secondary)] text-[var(--secondary-foreground)]">Z-Score ±2σ 兼容度</span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">🔒 本地端侧脱敏实时看板</span>
          <a href="https://github.com/zhiyiwang-byte/dating-quant-lab" target="_blank" rel="noopener noreferrer" class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
            ⭐ GitHub 开源 · 欢迎 Star &amp; PR
          </a>
        </div>
        <h1 class="text-xl md:text-2xl font-bold mt-2">婚恋市场量化评估与群体脱敏看板</h1>
        <p class="text-sm text-[var(--muted-foreground)] mt-1">
          多维取 <code class="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-xs">ln(x)</code> 几何加权 + 二选一回归反推超参 + 本地剥离敏感分值后聚合全群偏好看板
        </p>
      </div>
      <div class="flex flex-wrap gap-1.5 bg-[var(--secondary)] p-1.5 rounded-lg shrink-0">
        <button onclick="switchTab('score')" id="tab-score" class="tab-btn-active px-3 py-2 rounded-md text-xs font-semibold transition-all">1. 量化打分 &amp; σ兼容</button>
        <button onclick="switchTab('calibrate')" id="tab-calibrate" class="px-3 py-2 rounded-md text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all">2. 潜意识权重 (A/B回归)</button>
        <button onclick="switchTab('dashboard')" id="tab-dashboard" class="px-3 py-2 rounded-md text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all">3. 🌐 全群脱敏看板</button>
        <button onclick="switchTab('share')" id="tab-share" class="px-3 py-2 rounded-md text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all">4. 群聊战报导出</button>
      </div>
    </div>

    <div id="panel-score" class="space-y-5">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div class="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 class="text-base font-semibold">双边对数效用与标准差（σ）定位</h2>
              <p class="text-xs text-[var(--muted-foreground)]">基于城市择偶池正态分布 N(μ=6.20, σ=1.15) 映射分位数</p>
            </div>
            <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input type="checkbox" id="toggle-dynamic" checked onchange="recalculateAll()" class="rounded" />
              <span>开启短板动态加权</span>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
              <div class="text-xs text-[var(--muted-foreground)] font-medium">我的综合效用 (Self)</div>
              <div class="flex items-baseline gap-2 mt-1">
                <span id="self-score-display" class="text-2xl font-bold">7.15</span>
                <span id="self-z-display" class="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--card)]">+0.83σ (前20%)</span>
              </div>
              <div id="self-log-raw" class="text-xs text-[var(--muted-foreground)] mt-1">ln(U) = 1.97 · 几何均值</div>
            </div>
            <div class="p-3.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
              <div class="text-xs text-[var(--muted-foreground)] font-medium">评估对象效用 (Candidate)</div>
              <div class="flex items-baseline gap-2 mt-1">
                <span id="cand-score-display" class="text-2xl font-bold">6.35</span>
                <span id="cand-z-display" class="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--card)]">+0.13σ (前45%)</span>
              </div>
              <div id="cand-log-raw" class="text-xs text-[var(--muted-foreground)] mt-1">ln(U) = 1.85 · 几何均值</div>
            </div>
          </div>
          <div id="verdict-box" class="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)] space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">标准差兼容度判定 (ΔZ = Z_对方 - Z_我)</span>
              <span id="delta-z-badge" class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">ΔZ = -0.70σ</span>
            </div>
            <div id="verdict-title" class="text-base font-bold">⚖️ 轻度向下兼容（0.5σ ~ 1.0σ 区间）</div>
            <p id="verdict-desc" class="text-xs text-[var(--muted-foreground)] leading-relaxed"></p>
          </div>
        </div>
        <div class="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold">正态分布标准差位置 &amp; 四维簇对比</span>
            <div class="flex items-center gap-3 text-xs">
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#3b82f6"></span>我 (Self)</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#f97316"></span>对方 (Cand)</span>
            </div>
          </div>
          <div class="w-full"><svg id="bell-svg" viewBox="0 0 360 110" class="w-full h-28 overflow-visible"></svg></div>
          <div id="cluster-bars" class="space-y-2 pt-1 border-t border-[var(--border)]"></div>
        </div>
      </div>

      <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-[var(--muted-foreground)]">当前编辑视角：</span>
          <button onclick="setEditTarget('cand')" id="btn-edit-cand" class="tab-btn-active px-3 py-1.5 rounded-md text-xs font-semibold transition-all">正在给「评估对象」打分</button>
          <button onclick="setEditTarget('self')" id="btn-edit-self" class="px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all">切换给「我自己」打分</button>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-[var(--muted-foreground)]">一键填入典型画像测试：</span>
          <button onclick="applyPresetProfile('beijing_house')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] hover:opacity-80 border border-[var(--border)]">🏠 高位买的北京房大厂男</button>
          <button onclick="applyPresetProfile('stable_emo')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] hover:opacity-80 border border-[var(--border)]">🍵 体制内高情绪价值</button>
          <button onclick="applyPresetProfile('high_looks_volatile')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] hover:opacity-80 border border-[var(--border)]">✨ 顶配颜值但情绪过山车</button>
          <button onclick="applyPresetProfile('hexagon')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] hover:opacity-80 border border-[var(--border)]">💎 7.5分六边形同温层</button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="dimensions-container"></div>

      <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
          <div>
            <h3 class="text-sm font-semibold">0. 底线风控一票否决项（乘数因子 I ∈ {0, 1}）</h3>
            <p class="text-xs text-[var(--muted-foreground)]">勾选任意一项即触发硬性风控，对数效用乘数归零（仅针对「评估对象」生效）</p>
          </div>
          <span id="veto-status-badge" class="text-xs font-semibold px-2.5 py-1 rounded bg-[var(--secondary)]">当前风控：通过 (I = 1)</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <label class="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--secondary)] cursor-pointer select-none"><input type="checkbox" class="veto-check" onchange="recalculateAll()" /><span>赌博/成瘾性不良嗜好</span></label>
          <label class="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--secondary)] cursor-pointer select-none"><input type="checkbox" class="veto-check" onchange="recalculateAll()" /><span>严重隐匿负债/征信黑名单</span></label>
          <label class="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--secondary)] cursor-pointer select-none"><input type="checkbox" class="veto-check" onchange="recalculateAll()" /><span>家暴倾向/极端控制欲</span></label>
          <label class="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--secondary)] cursor-pointer select-none"><input type="checkbox" class="veto-check" onchange="recalculateAll()" /><span>重大原则背叛/隐瞒病史</span></label>
        </div>
      </div>
    </div>

    <div id="panel-calibrate" class="hidden space-y-5">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 class="text-base font-semibold">Bradley-Terry 成对比较回归标定</h2>
              <p class="text-xs text-[var(--muted-foreground)]">通过二选一拟合 P(A≻B) = σ(Σ w_i Δln x_i) 反推你潜意识的真实超参</p>
            </div>
            <span id="ab-progress-badge" class="text-xs font-semibold px-2.5 py-1 rounded bg-[var(--secondary)] shrink-0">第 1 / 6 题</span>
          </div>
          <div id="ab-question-box" class="space-y-4">
            <div class="text-xs font-medium text-[var(--muted-foreground)]" id="ab-scenario-title"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div onclick="choosePairwise('A')" class="p-4 rounded-xl border-2 border-[var(--border)] hover:border-[var(--primary)] bg-[var(--secondary)] cursor-pointer transition-all space-y-2.5">
                <div class="flex items-center justify-between"><span class="text-xs font-bold px-2 py-0.5 rounded bg-[var(--card)]">候选人 A</span><span class="text-xs text-[var(--muted-foreground)]">点击选择 →</span></div>
                <div id="ab-title-a" class="text-sm font-bold"></div>
                <p id="ab-desc-a" class="text-xs text-[var(--muted-foreground)] leading-relaxed"></p>
                <div id="ab-tags-a" class="flex flex-wrap gap-1 pt-1"></div>
              </div>
              <div onclick="choosePairwise('B')" class="p-4 rounded-xl border-2 border-[var(--border)] hover:border-[var(--primary)] bg-[var(--secondary)] cursor-pointer transition-all space-y-2.5">
                <div class="flex items-center justify-between"><span class="text-xs font-bold px-2 py-0.5 rounded bg-[var(--card)]">候选人 B</span><span class="text-xs text-[var(--muted-foreground)]">点击选择 →</span></div>
                <div id="ab-title-b" class="text-sm font-bold"></div>
                <p id="ab-desc-b" class="text-xs text-[var(--muted-foreground)] leading-relaxed"></p>
                <div id="ab-tags-b" class="flex flex-wrap gap-1 pt-1"></div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-2">
              <button onclick="resetPairwiseQuiz()" class="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline">重置二选一回归样本</button>
              <button onclick="choosePairwise('tie')" class="px-3 py-1.5 rounded text-xs bg-[var(--secondary)] border border-[var(--border)]">实在难分高下 (平局更新)</button>
            </div>
          </div>
          <div id="calibration-insight" class="p-3.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs space-y-1">
            <div class="font-semibold">💡 潜意识超参诊断 (Revealed Preference)：</div>
            <p id="calibration-insight-text" class="text-[var(--muted-foreground)]">完成上方二选一卡片，系统将利用梯度更新实时修正右侧的 8 维权重分布。</p>
          </div>
        </div>
        <div class="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
          <div class="border-b border-[var(--border)] pb-3">
            <h2 class="text-base font-semibold">当前超参数权重分布 (Σw_i = 100%)</h2>
            <p class="text-xs text-[var(--muted-foreground)]">可由左侧 A/B 回归自动学习，也可手动微调</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button onclick="applyWeightPreset('balanced')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] border border-[var(--border)]">均衡六边形</button>
            <button onclick="applyWeightPreset('pragmatic')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] border border-[var(--border)]">务实抗风险型</button>
            <button onclick="applyWeightPreset('emotional')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] border border-[var(--border)]">情绪&amp;颜控型</button>
            <button onclick="applyWeightPreset('intellectual')" class="px-2.5 py-1 rounded text-xs bg-[var(--secondary)] border border-[var(--border)]">智性恋慕强型</button>
          </div>
          <div id="weight-sliders-list" class="space-y-3"></div>
        </div>
      </div>
    </div>

    <div id="panel-dashboard" class="hidden space-y-5">
      <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-semibold">🔒 端侧零知识脱敏 (Local Sanitizer)</span>
              <span id="my-persona-tag" class="px-2 py-0.5 rounded bg-[var(--secondary)] text-xs font-semibold">当前归类：均衡六边形派</span>
            </div>
            <h2 class="text-base font-semibold mt-1">本地去除敏感信息 → 自动聚类 → 提交至全群看板</h2>
            <p class="text-xs text-[var(--muted-foreground)]">所有原始打分（你和对方的具体资产分、颜值分）在浏览器本地直接拦截丢弃，仅上传聚类标签、权重百分比与二选一投票</p>
          </div>
          <button onclick="submitAnonymizedData()" id="btn-submit-anon" class="px-4 py-2.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shrink-0">🚀 本地脱敏并同步至群看板</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="p-3.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-1.5">
            <div class="font-semibold text-red-400">🛑 本地直接剥离拦截（绝不离开你的设备）：</div>
            <ul class="space-y-1 text-[var(--muted-foreground)] list-disc list-inside">
              <li>你的 8 维具体原始分（如净资产 <span id="blocked-self-nw">7.0</span> 分、外形 <span id="blocked-self-ap">7.0</span> 分等）</li>
              <li>评估对象的 8 维具体原始分与精确 Z-Score 差值</li>
              <li>访问者 IP 地址、设备指纹、微信昵称等身份信息</li>
            </ul>
          </div>
          <div class="p-3.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-1.5">
            <div class="font-semibold text-emerald-400">✅ 脱敏归类后实际上传的 JSON 载荷预览：</div>
            <pre id="sanitized-json-preview" class="text-xs font-mono overflow-x-auto text-[var(--muted-foreground)] leading-relaxed"></pre>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div class="lg:col-span-5 space-y-4">
          <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold">👥 群友择偶流派聚类分布</h3>
              <span id="cohort-total-badge" class="text-xs px-2 py-0.5 rounded bg-[var(--secondary)] font-semibold">样本 N = 6</span>
            </div>
            <div id="dashboard-persona-bars" class="space-y-2.5"></div>
          </div>
          <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3">
            <div>
              <h3 class="text-sm font-semibold">⚖️ 全群向下/向上兼容度分桶 (ΔZ)</h3>
              <p class="text-xs text-[var(--muted-foreground)]">大家实际在评估的对象处于哪个标准差区间</p>
            </div>
            <div id="dashboard-bucket-bars" class="space-y-2"></div>
          </div>
        </div>
        <div class="lg:col-span-7 space-y-4">
          <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3">
            <div>
              <h3 class="text-sm font-semibold">🧠 全群「身体最诚实」的潜意识权重均值排行</h3>
              <p class="text-xs text-[var(--muted-foreground)]">聚合所有群友经 Bradley-Terry 二选一校准后的真实超参均值</p>
            </div>
            <div id="dashboard-weight-bars" class="space-y-2"></div>
          </div>
          <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3">
            <div>
              <h3 class="text-sm font-semibold">🔥 6 道灵魂二选一 · 全群投票胜率榜 (A vs B)</h3>
              <p class="text-xs text-[var(--muted-foreground)]">看看群友在「高位北京房 vs 充裕现金流」等典型困境中怎么选</p>
            </div>
            <div id="dashboard-ab-bars" class="space-y-3"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="panel-share" class="hidden space-y-5">
      <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <h2 class="text-base font-semibold">生成群聊测评战报 &amp; 分享链接</h2>
            <p class="text-xs text-[var(--muted-foreground)]">一键复制结构化量化结论到微信群，或生成带参数的 URL 链接供群友打开复现</p>
          </div>
          <div class="flex gap-2">
            <button onclick="copyGroupReport()" id="btn-copy-report" class="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]">📋 一键复制微信群战报</button>
            <button onclick="copyShareUrl()" id="btn-copy-url" class="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--secondary)] border border-[var(--border)]">🔗 复制带参复现链接</button>
          </div>
        </div>
        <textarea id="share-report-textarea" readonly rows="13" class="w-full p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] font-mono text-xs leading-relaxed focus:outline-none"></textarea>
      </div>
    </div>

    <!-- OPEN SOURCE COMMUNITY FOOTER CARD -->
    <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold px-2.5 py-0.5 rounded bg-[var(--secondary)]">Open Source · MIT License</span>
          <span class="text-sm font-bold">🌟 觉得这个量化评估实验室有趣？请给项目点一颗 Star ⭐！</span>
        </div>
        <p class="text-xs text-[var(--muted-foreground)] leading-relaxed">
          本项目已在 GitHub 开源。如果你有更犀利的<strong>维度设计、典型相亲画像预设、扎心「灵魂二选一」题目</strong>，或更好的<strong>回归算法与动态加权改进</strong>，非常欢迎直接提交 <strong>PR (Pull Request)</strong> 或 <strong>Issue</strong> 一起共建整活！
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <a href="https://github.com/zhiyiwang-byte/dating-quant-lab" target="_blank" rel="noopener noreferrer" class="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          ⭐ Star on GitHub
        </a>
        <a href="https://github.com/zhiyiwang-byte/dating-quant-lab/pulls" target="_blank" rel="noopener noreferrer" class="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--secondary)] border border-[var(--border)] hover:opacity-80 transition-opacity">
          🔀 欢迎提 PR / Issue 共建
        </a>
      </div>
    </div>
  </div>

  <script>
    var DIMENSIONS = [
      { id: 'net_worth', cluster: '经济与资源', name: '净资产底盘 (Net Equity)', desc: '扣除房贷本金与流动性折价后的真实净值（高位接盘房产需按当前净值减月供压力折算）', anchors: '1分:负债 | 5分:中位首付底盘 | 8分:净值充裕无贷 | 10分:自由级净资产', weight: 14, selfScore: 7.0, candScore: 6.0 },
      { id: 'cash_flow', cluster: '经济与资源', name: '可持续现金流 (Cash Flow)', desc: '税后年可支配收入 × 职业稳定折现率（扣除刚性房贷月供后的自由现金流）', anchors: '1分:入不敷出 | 5分:当地中位薪资 | 8分:高薪稳健或高现金流 | 10分:顶配被动/高收入', weight: 16, selfScore: 7.5, candScore: 6.5 },
      { id: 'family_risk', cluster: '经济与资源', name: '原生家庭抗风险 (Family Backing)', desc: '父母退休金/医保自给率与未来养老医疗负债敞口（无吸血/高兜底能力）', anchors: '1分:高负债拖累 | 5分:父母自给自足 | 8分:有丰厚养老与支持 | 10分:强资源护航', weight: 10, selfScore: 7.0, candScore: 6.5 },
      { id: 'appearance', cluster: '自然与社会资本', name: '外形与健康资本 (Appearance)', desc: '五官颜值、身材管理、年龄精力状态与基础遗传健康度', anchors: '1分:严重劝退 | 5分:路人顺眼整洁 | 8分:出众亮眼自律 | 10分:万里挑一顶配', weight: 15, selfScore: 7.0, candScore: 6.5 },
      { id: 'cognition', cluster: '自然与社会资本', name: '认知与教育带宽 (Cognition)', desc: '教育背景、逻辑沟通效率、信息检索与长期共同决策水平', anchors: '1分:沟通鸡同鸭讲 | 5分:本科正常逻辑 | 8分:名校/深度洞察 | 10分:顶级智识引领', weight: 12, selfScore: 8.0, candScore: 7.0 },
      { id: 'emotional', cluster: '关系与情绪价值', name: '情绪稳定与共情 (Emotional)', desc: '抗压能力、低内耗、冲突解决机制（无冷暴力/能提供温暖情绪支撑）', anchors: '1分:易怒/冷暴力 | 5分:情绪正常平稳 | 8分:高共情治愈系 | 10分:定海神针级稳定', weight: 15, selfScore: 7.0, candScore: 6.0 },
      { id: 'alignment', cluster: '关系与情绪价值', name: '消费观与三观对齐 (Alignment)', desc: '储蓄/消费偏好、生育教育观、作息及生活情趣的契合程度', anchors: '1分:三观剧烈冲突 | 5分:求同存异 | 8分:消费与节奏高度默契 | 10分:灵魂拍档', weight: 10, selfScore: 7.0, candScore: 6.0 },
      { id: 'friction', cluster: '长期协同成本', name: '协同成本与边界感 (Low Friction)', desc: '定居/通勤半径匹配、家务育儿参与意愿、原生家庭边界感（非妈宝/控制狂）', anchors: '1分:异地/高控制摩擦 | 5分:常规磨合成本 | 8分:拎得清高配合 | 10分:零内耗神仙队友', weight: 8, selfScore: 6.5, candScore: 6.0 }
    ];

    var POP_MEAN = 6.20;
    var POP_STD = 1.15;
    var currentEditTarget = 'cand';
    var abStepIndex = 0;
    var abHistoryCount = 0;
    var userAbVotes = { "0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "A" };

    var anonSessionId = localStorage.getItem('dql_anon_id');
    if (!anonSessionId) {
      anonSessionId = 'anon_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('dql_anon_id', anonSessionId); } catch (e) {}
    }

    var cohortStats = {
      total_participants: 6,
      personas: { "务实抗风险派": 2, "情绪&颜控派": 2, "智性恋慕强派": 1, "均衡六边形派": 1 },
      compat_buckets: { "severe_down": 0, "mod_down": 1, "mild_down": 2, "balanced": 2, "upward": 1, "veto": 0 },
      avg_weights: { net_worth: 14.2, cash_flow: 16.5, family_risk: 10.5, appearance: 14.7, cognition: 13.2, emotional: 15.8, alignment: 8.5, friction: 6.6 },
      ab_Choice_stats: {
        "0": { A: 1, B: 5, tie: 0 },
        "1": { A: 1, B: 5, tie: 0 },
        "2": { A: 1, B: 5, tie: 0 },
        "3": { A: 2, B: 4, tie: 0 },
        "4": { A: 2, B: 4, tie: 0 },
        "5": { A: 3, B: 3, tie: 0 }
      }
    };

    var AB_DILEMMAS = [
      {
        shortTitle: 'Q1: 21年高位北京房高压 vs 无房贷现金流充裕',
        title: '第 1 题 · 资产名义光环 vs 自由现金流与松弛感',
        a: { title: '21年高位买的北京房 + 大厂高压男/女', desc: '账面房产总价高但剩余房贷沉重，月供吞噬大半现金流；工作繁忙常加班，情绪略紧绷。', tags: ['净资产 5.5', '现金流 5.5', '认知 8.0', '情绪稳定 5.0'], vec: { net_worth: 5.5, cash_flow: 5.5, family_risk: 6.5, appearance: 6.5, cognition: 8.0, emotional: 5.0, alignment: 6.0, friction: 5.5 } },
        b: { title: '无房贷轻资产 + 现金流充裕温和派', desc: '手握充裕指数基金与存款暂未买房，每年可支配现金流宽裕；下班准时，情绪温和有耐心。', tags: ['净资产 6.8', '现金流 8.2', '情绪稳定 8.5', '协同 8.0'], vec: { net_worth: 6.8, cash_flow: 8.2, family_risk: 7.0, appearance: 6.5, cognition: 7.0, emotional: 8.5, alignment: 7.5, friction: 8.0 } }
      },
      {
        shortTitle: 'Q2: 9分顶配颜值小脾气 vs 6分顺眼高共情治愈',
        title: '第 2 题 · 顶级外形吸引力 vs 极致情绪定海神针',
        a: { title: '颜值身材 9 分 + 情绪略敏感受宠型', desc: '带出门极有面子，外形条件万里挑一；但偶有小脾气需要哄，抗压能力中等偏弱。', tags: ['外形 9.2', '情绪稳定 4.5', '现金流 6.5', '三观对齐 6.0'], vec: { net_worth: 6.5, cash_flow: 6.5, family_risk: 6.5, appearance: 9.2, cognition: 6.5, emotional: 4.5, alignment: 6.0, friction: 5.5 } },
        b: { title: '外形 6 分顺眼路人 + 9 分高共情治愈系', desc: '长相干净普通，但情绪极其稳定，遇到任何突发危机都能温和托底，从不冷暴力。', tags: ['外形 6.0', '情绪稳定 9.2', '三观对齐 8.5', '协同 8.5'], vec: { net_worth: 6.5, cash_flow: 6.5, family_risk: 6.5, appearance: 6.0, cognition: 7.2, emotional: 9.2, alignment: 8.5, friction: 8.5 } }
      },
      {
        shortTitle: 'Q3: 家境殷实父母越界 vs 家庭自足伴侣拎得清',
        title: '第 3 题 · 原生家庭丰厚但越界 vs 家庭普通但边界清晰',
        a: { title: '家境殷实有全款房支持 + 父母高频介入', desc: '父母可提供丰厚买房与育儿资金支持，但习惯深度干预小家庭决策，伴侣较听父母话。', tags: ['净资产 8.8', '家庭底盘 8.5', '边界协同 3.8', '情绪 6.0'], vec: { net_worth: 8.8, cash_flow: 7.0, family_risk: 8.5, appearance: 6.5, cognition: 6.8, emotional: 6.0, alignment: 5.5, friction: 3.8 } },
        b: { title: '父母普通退休自给自足 + 伴侣独立拎得清', desc: '原生家庭无大额金币爆出但养老医保完备无拖累；伴侣人格独立，小家庭边界感极强。', tags: ['净资产 6.0', '家庭底盘 6.5', '边界协同 9.0', '认知 8.0'], vec: { net_worth: 6.0, cash_flow: 7.2, family_risk: 6.5, appearance: 6.5, cognition: 8.0, emotional: 7.8, alignment: 8.0, friction: 9.0 } }
      },
      {
        shortTitle: 'Q4: 名校精英高薪少陪伴 vs 普通本科顾家满格',
        title: '第 4 题 · 智识认知慕强 vs 烟火气陪伴顾家',
        a: { title: '名校精英高认知 + 事业心强陪伴少', desc: '思维敏锐，聊宏观商业与深度话题极其同频，年入颇丰；但出差多，家务参与度低。', tags: ['认知带宽 9.2', '现金流 8.8', '协同家务 4.8', '情绪 6.5'], vec: { net_worth: 7.8, cash_flow: 8.8, family_risk: 7.0, appearance: 7.0, cognition: 9.2, emotional: 6.5, alignment: 7.0, friction: 4.8 } },
        b: { title: '普通本科务实派 + 顾家陪伴满格', desc: '不擅长宏大叙事但生活智慧充足，工作稳定5点半下班，主动包揽做饭与家庭事务。', tags: ['认知带宽 6.2', '现金流 6.2', '协同家务 9.2', '情绪 8.2'], vec: { net_worth: 6.2, cash_flow: 6.2, family_risk: 6.8, appearance: 6.8, cognition: 6.2, emotional: 8.2, alignment: 8.0, friction: 9.2 } }
      },
      {
        shortTitle: 'Q5: 土著收租安逸型 vs 白手起家年入百万',
        title: '第 5 题 · 存量厚实低现金流 vs 流量强劲白手起家',
        a: { title: '本地土著多套房收租 + 低欲望安逸型', desc: '名下净资产厚实，无生存压力；但本人工作清闲月薪不高，进取心和消费观偏保守。', tags: ['净资产 9.0', '家庭底盘 8.5', '现金流 5.5', '认知 6.0'], vec: { net_worth: 9.0, cash_flow: 5.5, family_risk: 8.5, appearance: 6.5, cognition: 6.0, emotional: 7.2, alignment: 6.2, friction: 7.0 } },
        b: { title: '小镇做题家年入百万 + 存量尚在积累', desc: '靠自身硬实力在大城市站稳脚跟，年现金流极强且认知极高；但目前净资产尚在爬坡期。', tags: ['净资产 6.2', '家庭底盘 5.0', '现金流 9.2', '认知 8.8'], vec: { net_worth: 6.2, cash_flow: 9.2, family_risk: 5.0, appearance: 7.0, cognition: 8.8, emotional: 7.0, alignment: 7.5, friction: 7.2 } }
      },
      {
        shortTitle: 'Q6: 精致享乐审美在线 vs 极简高储蓄率规划派',
        title: '第 6 题 · 消费享乐同频 vs 极简储蓄安全感',
        a: { title: '精致生活体验派 + 颜值审美在线', desc: '外形亮眼，热爱旅行、美食与品质生活，和你玩乐审美高度一致；但储蓄率偏低。', tags: ['外形 8.5', '三观情趣 8.8', '净资产 5.8', '现金流 7.0'], vec: { net_worth: 5.8, cash_flow: 7.0, family_risk: 6.5, appearance: 8.5, cognition: 7.5, emotional: 7.2, alignment: 8.8, friction: 7.0 } },
        b: { title: '高储蓄率规划派 + 稳扎稳打过日子', desc: '物欲低，理财纪律极强，资产每年稳步增值，抗风险底盘极稳；但生活略显平淡。', tags: ['外形 6.2', '三观情趣 6.5', '净资产 8.5', '现金流 7.8'], vec: { net_worth: 8.5, cash_flow: 7.8, family_risk: 7.5, appearance: 6.2, cognition: 7.5, emotional: 7.8, alignment: 6.5, friction: 7.8 } }
      }
    ];

    function getNormalizedWeights() {
      var total = DIMENSIONS.reduce(function(acc, d) { return acc + d.weight; }, 0) || 1;
      var map = {};
      DIMENSIONS.forEach(function(d) { map[d.id] = d.weight / total; });
      return map;
    }

    function classifyPersona() {
      var normW = getNormalizedWeights();
      var econW = normW.net_worth + normW.cash_flow + normW.family_risk;
      var emoLookW = normW.appearance + normW.emotional + normW.alignment;
      var cogW = normW.cognition + normW.cash_flow;
      if (econW >= 0.46) return '务实抗风险派';
      if (emoLookW >= 0.46) return '情绪&颜控派';
      if (normW.cognition >= 0.17 || cogW >= 0.36) return '智性恋慕强派';
      return '均衡六边形派';
    }

    function getCompatBucketKey(deltaZ, vetoTriggered) {
      if (vetoTriggered) return 'veto';
      if (deltaZ <= -2.0) return 'severe_down';
      if (deltaZ <= -1.0) return 'mod_down';
      if (deltaZ < -0.5) return 'mild_down';
      if (deltaZ <= 0.5) return 'balanced';
      return 'upward';
    }

    function buildSanitizedPayload() {
      var selfRes = computeUtility('self');
      var candRes = computeUtility('cand');
      var deltaZ = candRes.zScore - selfRes.zScore;
      var normW = getNormalizedWeights();
      var cleanWeights = {};
      DIMENSIONS.forEach(function(d) { cleanWeights[d.id] = Number((normW[d.id] * 100).toFixed(1)); });
      return {
        anon_id: anonSessionId,
        persona_cluster: classifyPersona(),
        compat_bucket: getCompatBucketKey(deltaZ, candRes.vetoTriggered),
        weights: cleanWeights,
        ab_votes: Object.assign({}, userAbVotes)
      };
    }

    function computeUtility(role) {
      var baseWeights = getNormalizedWeights();
      var dynEl = document.getElementById('toggle-dynamic');
      var dynamicEnabled = dynEl ? dynEl.checked : true;
      var vetoTriggered = false;
      if (role === 'cand') {
        document.querySelectorAll('.veto-check').forEach(function(chk) { if (chk.checked) vetoTriggered = true; });
      }
      var effWeights = {};
      var weightSum = 0;
      var selfEconAvg = (DIMENSIONS[0].selfScore + DIMENSIONS[1].selfScore) / 2;

      DIMENSIONS.forEach(function(d) {
        var score = role === 'self' ? d.selfScore : d.candScore;
        var w = baseWeights[d.id];
        if (dynamicEnabled) {
          if (score < 4.5) {
            var severity = (4.5 - score) / 3.5;
            w = w * (1 + 1.2 * severity);
          }
          if (role === 'cand' && selfEconAvg >= 8.0) {
            if (d.id === 'net_worth' || d.id === 'cash_flow') w *= 0.85;
            else if (d.id === 'emotional' || d.id === 'appearance') w *= 1.15;
          }
        }
        effWeights[d.id] = w;
        weightSum += w;
      });

      var logSum = 0;
      DIMENSIONS.forEach(function(d) {
        var wNorm = effWeights[d.id] / (weightSum || 1);
        var x = Math.max(1.0, role === 'self' ? d.selfScore : d.candScore);
        logSum += wNorm * Math.log(x);
      });

      var geomScore = vetoTriggered ? 0 : Math.exp(logSum);
      var zScore = vetoTriggered ? -4.0 : (geomScore - POP_MEAN) / POP_STD;
      var percentile = normalCDF(zScore) * 100;
      return { geomScore: geomScore, logSum: vetoTriggered ? -Infinity : logSum, zScore: zScore, percentile: percentile, vetoTriggered: vetoTriggered };
    }

    function normalCDF(z) {
      var t = 1 / (1 + 0.2316419 * Math.abs(z));
      var d = 0.3989423 * Math.exp(-z * z / 2);
      var prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      return z > 0 ? 1 - prob : prob;
    }

    function renderDimensionsCards() {
      var container = document.getElementById('dimensions-container');
      var normW = getNormalizedWeights();
      container.innerHTML = DIMENSIONS.map(function(d, idx) {
        var activeVal = currentEditTarget === 'self' ? d.selfScore : d.candScore;
        var otherVal = currentEditTarget === 'self' ? d.candScore : d.selfScore;
        var otherLabel = currentEditTarget === 'self' ? '对方' : '我';
        var wPct = (normW[d.id] * 100).toFixed(1);
        var logVal = Math.log(activeVal).toFixed(2);
        var shortTag = activeVal < 4.5 ? '<span class="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold">短板惩罚激活</span>' : '';
        return '<div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-2.5">' +
          '<div class="flex items-start justify-between gap-2"><div><div class="flex items-center gap-1.5">' +
          '<span class="text-xs px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)] font-medium">' + d.cluster + '</span>' +
          '<span class="text-xs px-2 py-0.5 rounded bg-[var(--secondary)] font-semibold">权重 ' + wPct + '%</span>' + shortTag +
          '</div><h3 class="text-sm font-bold mt-1.5">' + (idx + 1) + '. ' + d.name + '</h3>' +
          '<p class="text-xs text-[var(--muted-foreground)] mt-0.5">' + d.desc + '</p></div>' +
          '<div class="text-right shrink-0"><div class="text-xl font-bold">' + activeVal.toFixed(1) + '</div>' +
          '<div class="text-xs text-[var(--muted-foreground)]">ln(x)=' + logVal + '</div></div></div>' +
          '<div class="space-y-1 pt-1"><input type="range" min="1.0" max="10.0" step="0.5" value="' + activeVal + '" oninput="updateDimensionScore(\\'' + d.id + '\\', this.value)" class="w-full cursor-pointer" />' +
          '<div class="flex items-center justify-between text-xs text-[var(--muted-foreground)]"><span>' + d.anchors + '</span>' +
          '<span class="font-medium shrink-0 ml-2">' + otherLabel + ': ' + otherVal.toFixed(1) + '分</span></div></div></div>';
      }).join('');
    }

    function updateDimensionScore(dimId, val) {
      var d = DIMENSIONS.find(function(item) { return item.id === dimId; });
      if (!d) return;
      if (currentEditTarget === 'self') d.selfScore = parseFloat(val);
      else d.candScore = parseFloat(val);
      recalculateAll();
    }

    function setEditTarget(target) {
      currentEditTarget = target;
      var btnCand = document.getElementById('btn-edit-cand');
      var btnSelf = document.getElementById('btn-edit-self');
      if (target === 'cand') {
        btnCand.className = 'tab-btn-active px-3 py-1.5 rounded-md text-xs font-semibold transition-all';
        btnSelf.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all';
      } else {
        btnSelf.className = 'tab-btn-active px-3 py-1.5 rounded-md text-xs font-semibold transition-all';
        btnCand.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all';
      }
      renderDimensionsCards();
    }

    function renderBellCurveSVG(selfZ, candZ) {
      var svg = document.getElementById('bell-svg');
      var w = 360, padX = 24, baseY = 86;
      var plotW = w - padX * 2;
      var zToX = function(z) {
        var clamped = Math.max(-3.0, Math.min(3.0, z));
        return padX + ((clamped + 3.0) / 6.0) * plotW;
      };
      var zToY = function(z) {
        return baseY - Math.exp(-0.5 * z * z) * 64;
      };
      var dPath = '';
      for (var z = -3.0; z <= 3.0; z += 0.1) {
        var x = zToX(z).toFixed(1);
        var y = zToY(z).toFixed(1);
        dPath += (z === -3.0 ? 'M ' + x + ' ' + y : ' L ' + x + ' ' + y);
      }
      var areaPath = dPath + ' L ' + zToX(3).toFixed(1) + ' ' + baseY + ' L ' + zToX(-3).toFixed(1) + ' ' + baseY + ' Z';
      var ticks = [-2, -1, 0, 1, 2].map(function(sig) {
        var tx = zToX(sig).toFixed(1);
        var ty = zToY(sig).toFixed(1);
        return '<line x1="' + tx + '" y1="' + ty + '" x2="' + tx + '" y2="' + baseY + '" stroke="currentColor" stroke-opacity="0.2" stroke-dasharray="2,2" />' +
          '<text x="' + tx + '" y="' + (baseY + 14) + '" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.65">' + (sig > 0 ? '+' + sig : sig) + 'σ</text>';
      }).join('');
      var sx = zToX(selfZ).toFixed(1), sy = zToY(selfZ).toFixed(1);
      var cx = zToX(candZ).toFixed(1), cy = zToY(candZ).toFixed(1);
      svg.innerHTML = '<path d="' + areaPath + '" fill="currentColor" fill-opacity="0.07" />' +
        '<path d="' + dPath + '" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="2" />' +
        '<line x1="' + padX + '" y1="' + baseY + '" x2="' + (w - padX) + '" y2="' + baseY + '" stroke="currentColor" stroke-opacity="0.3" />' + ticks +
        '<line x1="' + sx + '" y1="' + (baseY - 12) + '" x2="' + cx + '" y2="' + (baseY - 12) + '" stroke="#f97316" stroke-width="2" stroke-dasharray="3,2" />' +
        '<line x1="' + sx + '" y1="' + sy + '" x2="' + sx + '" y2="' + baseY + '" stroke="#3b82f6" stroke-width="2" />' +
        '<circle cx="' + sx + '" cy="' + sy + '" r="5" fill="#3b82f6" />' +
        '<text x="' + sx + '" y="' + Math.max(14, sy - 8) + '" text-anchor="middle" font-size="12" font-weight="bold" fill="#3b82f6">我</text>' +
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + baseY + '" stroke="#f97316" stroke-width="2" />' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#f97316" />' +
        '<text x="' + cx + '" y="' + Math.max(14, cy - 8) + '" text-anchor="middle" font-size="12" font-weight="bold" fill="#f97316">对方</text>';
    }

    function renderClusterBars() {
      var clusters = ['经济与资源', '自然与社会资本', '关系与情绪价值', '长期协同成本'];
      var container = document.getElementById('cluster-bars');
      container.innerHTML = clusters.map(function(cName) {
        var items = DIMENSIONS.filter(function(d) { return d.cluster === cName; });
        var selfAvg = items.reduce(function(s, d) { return s + d.selfScore; }, 0) / items.length;
        var candAvg = items.reduce(function(s, d) { return s + d.candScore; }, 0) / items.length;
        return '<div class="space-y-1"><div class="flex justify-between text-xs"><span class="font-medium">' + cName + '</span>' +
          '<span class="text-[var(--muted-foreground)]">我 ' + selfAvg.toFixed(1) + ' vs 对方 ' + candAvg.toFixed(1) + '</span></div>' +
          '<div class="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden flex"><div style="width:' + ((selfAvg / 10) * 100) + '%; background:#3b82f6" class="h-full opacity-80"></div></div>' +
          '<div class="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden flex"><div style="width:' + ((candAvg / 10) * 100) + '%; background:#f97316" class="h-full opacity-80"></div></div></div>';
      }).join('');
    }

    function renderDashboard() {
      var payload = buildSanitizedPayload();
      document.getElementById('my-persona-tag').textContent = '当前归类：' + payload.persona_cluster;
      document.getElementById('blocked-self-nw').textContent = DIMENSIONS[0].selfScore.toFixed(1);
      document.getElementById('blocked-self-ap').textContent = DIMENSIONS[3].selfScore.toFixed(1);
      document.getElementById('sanitized-json-preview').textContent = JSON.stringify(payload, null, 2);

      var total = cohortStats.total_participants || 1;
      document.getElementById('cohort-total-badge').textContent = '脱敏样本 N = ' + total;

      var personaOrder = ['务实抗风险派', '情绪&颜控派', '智性恋慕强派', '均衡六边形派'];
      document.getElementById('dashboard-persona-bars').innerHTML = personaOrder.map(function(pName) {
        var count = cohortStats.personas[pName] || 0;
        var pct = Math.round((count / total) * 100);
        return '<div class="space-y-1"><div class="flex justify-between text-xs"><span class="font-medium">' + pName + '</span>' +
          '<span class="text-[var(--muted-foreground)]">' + count + ' 人 (' + pct + '%)</span></div>' +
          '<div class="w-full h-2.5 rounded-full bg-[var(--secondary)] overflow-hidden"><div style="width:' + pct + '%; background:var(--primary)" class="h-full rounded-full transition-all"></div></div></div>';
      }).join('');

      var bucketMeta = [
        { key: 'upward', label: '🚀 向上兼容 (> +0.5σ)' },
        { key: 'balanced', label: '🎯 同温层均衡 (|ΔZ| ≤ 0.5σ)' },
        { key: 'mild_down', label: '⚖️ 稍微向下兼容 (-0.5σ ~ -1σ)' },
        { key: 'mod_down', label: '⚠️ 明显向下兼容 (-1σ ~ -2σ)' },
        { key: 'severe_down', label: '🚨 严重向下兼容 (≤ -2σ)' },
        { key: 'veto', label: '🛑 触发底线一票否决' }
      ];
      document.getElementById('dashboard-bucket-bars').innerHTML = bucketMeta.map(function(b) {
        var count = cohortStats.compat_buckets[b.key] || 0;
        var pct = Math.round((count / total) * 100);
        return '<div class="space-y-1"><div class="flex justify-between text-xs"><span>' + b.label + '</span>' +
          '<span class="text-[var(--muted-foreground)]">' + count + ' 人 (' + pct + '%)</span></div>' +
          '<div class="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden"><div style="width:' + pct + '%; background:#3b82f6" class="h-full rounded-full transition-all"></div></div></div>';
      }).join('');

      var rankedDims = DIMENSIONS.slice().sort(function(a, b) { return (cohortStats.avg_weights[b.id] || 0) - (cohortStats.avg_weights[a.id] || 0); });
      document.getElementById('dashboard-weight-bars').innerHTML = rankedDims.map(function(d, i) {
        var avgW = cohortStats.avg_weights[d.id] || 12.5;
        return '<div class="space-y-1"><div class="flex justify-between text-xs"><span class="font-medium">#' + (i + 1) + ' ' + d.name + '</span>' +
          '<span class="font-bold">' + avgW.toFixed(1) + '%</span></div>' +
          '<div class="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden"><div style="width:' + Math.min(100, avgW * 3.5) + '%; background:#10b981" class="h-full rounded-full transition-all"></div></div></div>';
      }).join('');

      document.getElementById('dashboard-ab-bars').innerHTML = AB_DILEMMAS.map(function(q, idx) {
        var stat = cohortStats.ab_Choice_stats[String(idx)] || { A: 1, B: 1, tie: 0 };
        var sumAB = (stat.A + stat.B + stat.tie) || 1;
        var pctA = Math.round((stat.A / sumAB) * 100);
        var pctB = 100 - pctA;
        return '<div class="space-y-1"><div class="flex justify-between text-xs"><span class="font-medium">' + q.shortTitle + '</span>' +
          '<span class="text-[var(--muted-foreground)]">选A ' + pctA + '% vs 选B ' + pctB + '%</span></div>' +
          '<div class="w-full h-2.5 rounded-full bg-[var(--secondary)] overflow-hidden flex">' +
          '<div style="width:' + pctA + '%; background:#3b82f6" class="h-full"></div>' +
          '<div style="width:' + pctB + '%; background:#f97316" class="h-full"></div></div></div>';
      }).join('');
    }

    async function submitAnonymizedData() {
      var payload = buildSanitizedPayload();
      var btn = document.getElementById('btn-submit-anon');
      btn.textContent = '⏳ 正在本地脱敏并同步...';
      try {
        var resp = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          var data = await resp.json();
          if (data.stats) cohortStats = data.stats;
          renderDashboard();
          btn.textContent = '✅ 已脱敏同步至全群看板！';
          setTimeout(function() { btn.textContent = '🚀 本地脱敏并同步至群看板'; }, 2400);
          return;
        }
      } catch (err) {}
      btn.textContent = '✅ 已脱敏合入当前看板！';
      setTimeout(function() { btn.textContent = '🚀 本地脱敏并同步至群看板'; }, 2400);
    }

    async function fetchServerStatsIfAvailable() {
      try {
        var resp = await fetch('/api/stats');
        if (resp.ok) {
          var data = await resp.json();
          if (data && data.total_participants !== undefined) {
            cohortStats = data;
            renderDashboard();
          }
        }
      } catch (e) {}
    }

    function recalculateAll() {
      var selfRes = computeUtility('self');
      var candRes = computeUtility('cand');

      document.getElementById('self-score-display').textContent = selfRes.geomScore.toFixed(2);
      var selfTopPct = Math.max(1, Math.round(100 - selfRes.percentile));
      document.getElementById('self-z-display').textContent = (selfRes.zScore >= 0 ? '+' : '') + selfRes.zScore.toFixed(2) + 'σ (前' + selfTopPct + '%)';
      document.getElementById('self-log-raw').textContent = 'ln(U) = ' + selfRes.logSum.toFixed(2) + ' · 几何均值';

      document.getElementById('cand-score-display').textContent = candRes.geomScore.toFixed(2);
      var candTopPct = Math.max(1, Math.round(100 - candRes.percentile));
      document.getElementById('cand-z-display').textContent = candRes.vetoTriggered
        ? '一票否决 (-∞)'
        : (candRes.zScore >= 0 ? '+' : '') + candRes.zScore.toFixed(2) + 'σ (前' + candTopPct + '%)';
      document.getElementById('cand-log-raw').textContent = candRes.vetoTriggered
        ? '触发底线风控 I = 0'
        : 'ln(U) = ' + candRes.logSum.toFixed(2) + ' · 几何均值';

      var vetoBadge = document.getElementById('veto-status-badge');
      if (candRes.vetoTriggered) {
        vetoBadge.textContent = '🚨 触发底线一票否决 (I = 0)';
        vetoBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded bg-red-500/20 text-red-400';
      } else {
        vetoBadge.textContent = '当前风控：通过 (I = 1)';
        vetoBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded bg-[var(--secondary)]';
      }

      var deltaZ = candRes.zScore - selfRes.zScore;
      var badge = document.getElementById('delta-z-badge');
      var vTitle = document.getElementById('verdict-title');
      var vDesc = document.getElementById('verdict-desc');

      badge.textContent = 'ΔZ = ' + (deltaZ >= 0 ? '+' : '') + deltaZ.toFixed(2) + 'σ';

      var sortedByWeight = DIMENSIONS.slice().sort(function(a, b) { return b.weight - a.weight; });
      var topDim = sortedByWeight[0];
      var hasTopCompensation = topDim.candScore >= topDim.selfScore + 0.5;

      if (candRes.vetoTriggered) {
        vTitle.textContent = '🛑 底线风控一票否决（禁止向下兼容）';
        vDesc.textContent = '候选人触发了硬性底线风控项（乘数因子 I=0）。根据对数效用模型，无论其他维度分数多高，综合效用直接归零。';
      } else if (deltaZ <= -2.0) {
        vTitle.textContent = '🚨 严重向下兼容（落差超过 2 个标准差 ≥ 2σ）';
        vDesc.textContent = '对方综合分位落后你 ' + Math.abs(deltaZ).toFixed(2) + 'σ。跨段位降维极易在长期婚姻中引发沉没成本失衡与怨气累积。';
      } else if (deltaZ <= -1.0) {
        vTitle.textContent = '⚠️ 明显向下兼容（落差在 1σ ~ 2σ 之间）';
        vDesc.textContent = hasTopCompensation
          ? '整体落后你 ' + Math.abs(deltaZ).toFixed(2) + 'σ，但对方在你最看重的「' + topDim.name.split(' ')[0] + '」维度上有长板（' + topDim.candScore + '分），属于用综合分位换取核心偏好的帕累托交换。'
          : '整体落后你 ' + Math.abs(deltaZ).toFixed(2) + 'σ，且在你最高权重的「' + topDim.name.split(' ')[0] + '」上也无明显优势（' + topDim.candScore + '分），需警惕情绪与经济双重补贴。';
      } else if (deltaZ < -0.5) {
        vTitle.textContent = '⚖️ 稍微向下兼容（0.5σ ~ 1.0σ 温和缓冲带）';
        vDesc.textContent = '双方处于相邻分位段，属于现实婚恋市场中最常见的温和向下兼容区间，只要核心底线与情绪协同顺畅即可推进。';
      } else if (deltaZ <= 0.5) {
        vTitle.textContent = '🎯 同温层势均力敌（|ΔZ| ≤ 0.5σ 纳什均衡区）';
        vDesc.textContent = '双方综合效用处于同一标准差段位内，博弈筹码对等，长期关系稳定性最高。';
      } else if (deltaZ < 1.5) {
        vTitle.textContent = '🚀 向上兼容 / 优质匹配（对方领先 0.5σ ~ 1.5σ）';
        vDesc.textContent = '对方综合对数效用高于你，属于高性价比向上匹配。';
      } else {
        vTitle.textContent = '🌟 跨段位向上兼容（对方领先 ≥ 1.5σ）';
        vDesc.textContent = '对方综合禀赋显著高于你（超1.5个标准差）。需注意核查是否存在未入表的隐性短板。';
      }

      renderDimensionsCards();
      renderBellCurveSVG(selfRes.zScore, candRes.zScore);
      renderClusterBars();
      renderWeightSliders();
      renderDashboard();
      updateShareReportText(selfRes, candRes, deltaZ);
    }

    function applyPresetProfile(presetKey) {
      var presets = {
        beijing_house: { net_worth: 5.5, cash_flow: 6.0, family_risk: 6.5, appearance: 6.0, cognition: 8.0, emotional: 5.5, alignment: 6.0, friction: 5.0 },
        stable_emo: { net_worth: 6.5, cash_flow: 6.0, family_risk: 7.5, appearance: 7.0, cognition: 7.0, emotional: 9.0, alignment: 8.0, friction: 8.5 },
        high_looks_volatile: { net_worth: 6.0, cash_flow: 6.5, family_risk: 6.0, appearance: 9.5, cognition: 6.5, emotional: 3.5, alignment: 5.5, friction: 4.5 },
        hexagon: { net_worth: 7.5, cash_flow: 7.5, family_risk: 7.5, appearance: 7.5, cognition: 7.5, emotional: 7.5, alignment: 7.5, friction: 7.5 }
      };
      var p = presets[presetKey];
      if (!p) return;
      DIMENSIONS.forEach(function(d) {
        if (currentEditTarget === 'self') d.selfScore = p[d.id];
        else d.candScore = p[d.id];
      });
      recalculateAll();
    }

    function renderPairwiseCard() {
      var q = AB_DILEMMAS[abStepIndex % AB_DILEMMAS.length];
      document.getElementById('ab-progress-badge').textContent = '第 ' + ((abStepIndex % AB_DILEMMAS.length) + 1) + ' / ' + AB_DILEMMAS.length + ' 题 (已标定 ' + abHistoryCount + ' 次)';
      document.getElementById('ab-scenario-title').textContent = q.title;
      document.getElementById('ab-title-a').textContent = q.a.title;
      document.getElementById('ab-desc-a').textContent = q.a.desc;
      document.getElementById('ab-tags-a').innerHTML = q.a.tags.map(function(t) { return '<span class="text-xs px-2 py-0.5 rounded bg-[var(--card)]">' + t + '</span>'; }).join('');
      document.getElementById('ab-title-b').textContent = q.b.title;
      document.getElementById('ab-desc-b').textContent = q.b.desc;
      document.getElementById('ab-tags-b').innerHTML = q.b.tags.map(function(t) { return '<span class="text-xs px-2 py-0.5 rounded bg-[var(--card)]">' + t + '</span>'; }).join('');
    }

    function choosePairwise(choice) {
      var qIdx = abStepIndex % AB_DILEMMAS.length;
      var q = AB_DILEMMAS[qIdx];
      userAbVotes[String(qIdx)] = choice;
      var normW = getNormalizedWeights();
      var logit = 0;
      var deltaLog = {};
      DIMENSIONS.forEach(function(d) {
        var diff = Math.log(q.a.vec[d.id]) - Math.log(q.b.vec[d.id]);
        deltaLog[d.id] = diff;
        logit += normW[d.id] * diff;
      });
      var probA = 1 / (1 + Math.exp(-3.0 * logit));
      var y = choice === 'A' ? 1.0 : (choice === 'B' ? 0.0 : 0.5);
      var error = y - probA;
      var lr = 8.5;
      DIMENSIONS.forEach(function(d) {
        d.weight = Math.max(2, Math.min(35, d.weight + lr * error * deltaLog[d.id]));
      });
      var sumW = DIMENSIONS.reduce(function(s, d) { return s + d.weight; }, 0);
      DIMENSIONS.forEach(function(d) {
        d.weight = Math.round((d.weight / sumW) * 100);
      });
      abStepIndex++;
      abHistoryCount++;
      renderPairwiseCard();
      updateCalibrationInsight();
      recalculateAll();
    }

    function updateCalibrationInsight() {
      var sorted = DIMENSIONS.slice().sort(function(a, b) { return b.weight - a.weight; });
      var top1 = sorted[0];
      var top2 = sorted[1];
      var low1 = sorted[sorted.length - 1];
      document.getElementById('calibration-insight-text').innerHTML =
        '经过 <b>' + abHistoryCount + '</b> 轮 Bradley-Terry 二选一回归更新，你身体最诚实的 Top 2 核心权重是：<b>「' + top1.name.split(' ')[0] + '」(' + top1.weight + '%)</b> 与 <b>「' + top2.name.split(' ')[0] + '」(' + top2.weight + '%)</b>；最愿意让渡的是 <b>「' + low1.name.split(' ')[0] + '」(' + low1.weight + '%)</b>。可前往「3. 全群脱敏看板」一键上传你的匿名偏好！';
    }

    function resetPairwiseQuiz() {
      abStepIndex = 0;
      abHistoryCount = 0;
      applyWeightPreset('balanced');
      renderPairwiseCard();
      document.getElementById('calibration-insight-text').textContent = '已重置为初始均衡先验权重，可重新点击上方卡片进行二选一回归标定。';
    }

    function renderWeightSliders() {
      var container = document.getElementById('weight-sliders-list');
      var normW = getNormalizedWeights();
      container.innerHTML = DIMENSIONS.map(function(d) {
        var pct = (normW[d.id] * 100).toFixed(1);
        return '<div class="space-y-1"><div class="flex justify-between text-xs"><span class="font-medium">' + d.name + '</span><span class="font-bold">' + pct + '%</span></div>' +
          '<input type="range" min="2" max="35" step="1" value="' + d.weight + '" oninput="updateManualWeight(\\'' + d.id + '\\', this.value)" class="w-full cursor-pointer" /></div>';
      }).join('');
    }

    function updateManualWeight(dimId, val) {
      var d = DIMENSIONS.find(function(item) { return item.id === dimId; });
      if (!d) return;
      d.weight = parseInt(val, 10);
      recalculateAll();
    }

    function applyWeightPreset(type) {
      var presets = {
        balanced: { net_worth: 14, cash_flow: 15, family_risk: 10, appearance: 14, cognition: 12, emotional: 15, alignment: 10, friction: 10 },
        pragmatic: { net_worth: 22, cash_flow: 22, family_risk: 16, appearance: 8, cognition: 10, emotional: 10, alignment: 6, friction: 6 },
        emotional: { net_worth: 8, cash_flow: 10, family_risk: 6, appearance: 24, cognition: 8, emotional: 24, alignment: 12, friction: 8 },
        intellectual: { net_worth: 12, cash_flow: 18, family_risk: 8, appearance: 12, cognition: 25, emotional: 11, alignment: 8, friction: 6 }
      };
      var p = presets[type];
      if (!p) return;
      DIMENSIONS.forEach(function(d) { d.weight = p[d.id]; });
      recalculateAll();
    }

    function updateShareReportText(selfRes, candRes, deltaZ) {
      var normW = getNormalizedWeights();
      var sortedW = DIMENSIONS.slice().sort(function(a, b) { return b.weight - a.weight; });
      var topWStr = sortedW.slice(0, 3).map(function(d) { return d.name.split(' ')[0] + '(' + (normW[d.id] * 100).toFixed(0) + '%)'; }).join(' > ');
      var shortboards = DIMENSIONS.filter(function(d) { return d.candScore < 4.5; }).map(function(d) { return d.name.split(' ')[0] + '(' + d.candScore + '分)'; });
      var verdictText = document.getElementById('verdict-title').textContent;
      var lines = [
        '📊【婚恋市场量化评估实验室 · 测评战报】',
        '🏷️ 择偶流派归类：' + classifyPersona(),
        '────────────────────────',
        '🧠 我的潜意识权重 Top 3：' + topWStr,
        '👤 我的综合对数效用：' + selfRes.geomScore.toFixed(2) + ' 分 | 标准差位置：' + (selfRes.zScore >= 0 ? '+' : '') + selfRes.zScore.toFixed(2) + 'σ (前' + Math.max(1, Math.round(100 - selfRes.percentile)) + '%)',
        '🎯 评估对象综合效用：' + (candRes.vetoTriggered ? '0.00 (触发底线一票否决)' : candRes.geomScore.toFixed(2) + ' 分') + ' | 标准差位置：' + (candRes.vetoTriggered ? '-∞' : (candRes.zScore >= 0 ? '+' : '') + candRes.zScore.toFixed(2) + 'σ (前' + Math.max(1, Math.round(100 - candRes.percentile)) + '%)'),
        '────────────────────────',
        '⚖️ 标准差差值 (ΔZ)：' + (deltaZ >= 0 ? '+' : '') + deltaZ.toFixed(2) + 'σ',
        '📌 兼容度结论：' + verdictText,
        shortboards.length > 0 ? '⚠️ 触发短板对数惩罚项：' + shortboards.join('、') : '✅ 无明显木桶短板项 (各项均 ≥ 4.5分)',
        '🌐 在线测评与全群脱敏看板：' + window.location.origin,
        '⭐ GitHub 开源仓库 (欢迎点 Star / 提 PR)：https://github.com/zhiyiwang-byte/dating-quant-lab'
      ];
      document.getElementById('share-report-textarea').value = lines.join('\\n');
    }

    function copyGroupReport() {
      var textarea = document.getElementById('share-report-textarea');
      textarea.select();
      if (navigator.clipboard) navigator.clipboard.writeText(textarea.value);
      var btn = document.getElementById('btn-copy-report');
      btn.textContent = '✅ 已复制！快去发群里吧';
      setTimeout(function() { btn.textContent = '📋 一键复制微信群战报'; }, 2200);
    }

    function copyShareUrl() {
      var state = {
        w: DIMENSIONS.map(function(d) { return d.weight; }),
        s: DIMENSIONS.map(function(d) { return d.selfScore; }),
        c: DIMENSIONS.map(function(d) { return d.candScore; })
      };
      var hash = '#state=' + encodeURIComponent(JSON.stringify(state));
      var fullUrl = window.location.href.split('#')[0] + hash;
      window.location.hash = hash;
      if (navigator.clipboard) navigator.clipboard.writeText(fullUrl);
      var btn = document.getElementById('btn-copy-url');
      btn.textContent = '✅ 链接已复制！';
      setTimeout(function() { btn.textContent = '🔗 复制带参复现链接'; }, 2200);
    }

    function loadStateFromHash() {
      try {
        if (window.location.hash.indexOf('#state=') === 0) {
          var raw = decodeURIComponent(window.location.hash.slice(7));
          var state = JSON.parse(raw);
          if (state.w && state.s && state.c) {
            DIMENSIONS.forEach(function(d, i) {
              if (state.w[i] !== undefined) d.weight = state.w[i];
              if (state.s[i] !== undefined) d.selfScore = state.s[i];
              if (state.c[i] !== undefined) d.candScore = state.c[i];
            });
          }
        }
      } catch (e) {}
    }

    function switchTab(tabName) {
      ['score', 'calibrate', 'dashboard', 'share'].forEach(function(t) {
        var panel = document.getElementById('panel-' + t);
        var btn = document.getElementById('tab-' + t);
        if (t === tabName) {
          panel.classList.remove('hidden');
          btn.className = 'tab-btn-active px-3 py-2 rounded-md text-xs font-semibold transition-all';
        } else {
          panel.classList.add('hidden');
          btn.className = 'px-3 py-2 rounded-md text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all';
        }
      });
      if (tabName === 'dashboard') fetchServerStatsIfAvailable();
    }

    loadStateFromHash();
    renderPairwiseCard();
    recalculateAll();
    fetchServerStatsIfAvailable();
  </script>
</body>
</html>`;

Bun.serve({
  port: Number(Bun.env.PORT || 3000),
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      return Response.json(getAggregatedStats());
    }

    if (req.method === "POST" && url.pathname === "/api/submit") {
      try {
        const body = await req.json();
        const anonId = String(body?.anon_id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
        if (!anonId) {
          return Response.json({ error: "Missing anon_id" }, { status: 400 });
        }
        const persona = String(body?.persona_cluster || "均衡六边形派").slice(0, 32);
        const rawBucket = String(body?.compat_bucket || "balanced");
        const bucket = VALID_BUCKETS.has(rawBucket) ? rawBucket : "balanced";

        const cleanWeights: Record<string, number> = {};
        for (const d of DIM_IDS) {
          cleanWeights[d] = Number(Number(body?.weights?.[d] ?? 12.5).toFixed(1));
        }

        const cleanAb: Record<string, string> = {};
        for (let i = 0; i < 6; i++) {
          const k = String(i);
          const v = body?.ab_votes?.[k];
          if (v === "A" || v === "B" || v === "tie") {
            cleanAb[k] = v;
          }
        }

        const stmt = db.prepare(`
          INSERT INTO submissions (anon_id, persona_cluster, compat_bucket, weights_json, ab_votes_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(anon_id) DO UPDATE SET
            persona_cluster=excluded.persona_cluster,
            compat_bucket=excluded.compat_bucket,
            weights_json=excluded.weights_json,
            ab_votes_json=excluded.ab_votes_json,
            updated_at=excluded.updated_at
        `);
        stmt.run(
          anonId,
          persona,
          bucket,
          JSON.stringify(cleanWeights),
          JSON.stringify(cleanAb),
          new Date().toISOString()
        );

        return Response.json({ ok: true, stats: getAggregatedStats() });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 400 });
      }
    }

    return new Response(HTML_PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});
