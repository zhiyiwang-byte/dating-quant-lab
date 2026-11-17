# 🤝 贡献指南 (Contributing to Dating Quant Lab)

非常感谢你对 **Dating Quant Lab（婚恋市场量化评估实验室）** 的关注！无论你是想修正数理公式、补充更真实的相亲画像预设、设计更扎心的「灵魂二选一」题目，还是改进前端交互，我们都热烈欢迎你的 **Issue** 和 **Pull Request (PR)**！

---

## 🌟 最受欢迎的 PR 贡献方向

### 1. 校准「客观填表换算」题库（`DIMENSIONS[i].quant`）
在 `index.html` 的 `DIMENSIONS` 数组中，每个维度通过 `quant` 子问题列表与权重 `w` 自动加权换算至 `[1, 10]`（按 `0.5` 取整）：
- 欢迎结合最新城市薪资、房价估值、学历分布或生活习惯，细化选项区间或微调子题权重 `w`；
- 建议选项措辞保持客观中立，使其同时适用于「我 (Self)」和「评估对象 (Candidate)」双视角切换作答。

### 2. 贡献新的「灵魂二选一」博弈题（`AB_DILEMMAS`）
在 `index.html`（及 `bun_server.ts`）的 `AB_DILEMMAS` 数组中，每道题由 `a` 和 `b` 两个具有强烈权衡张力（Trade-off）的候选人画像组成：
- 好的题目应当具备**帕累托不可比性**（即 A 在某几个正交维度明显领先，而 B 在另外几个核心维度明显领先，避免出现无脑选一边的支配解）。
- 每个选项包含 8 维真实特征向量 `vec`，用于 Bradley-Terry 逻辑回归梯度更新。

### 3. 贡献新的「典型相亲画像预设」（`applyPresetProfile`）
你可以新增具有代表性的群体画像（例如：`金融高薪高频出差派`、`高校青教智识派`、`自由职业体验派`、`江浙沪独生土著` 等），帮助测试者快速锚定分位。

### 4. 改进数理模型与超参数算法
- 引入 **AHP（层次分析法）** 两两维度重要性矩阵与一致性比率（$CR < 0.1$）检验；
- 引入不同城市/年龄段的条件正态分布参数 $\mathcal{N}(\mu_{\text{city}}, \sigma_{\text{city}}^2)$；
- 优化动态加权中的边际替代率（MRS）弹性系数与短板惩罚激活函数。

### 5. 可视化与分享体验升级
- 支持一键导出高清 PNG 雷达图与钟形曲线海报卡片；
- 增加双人扫码「盲盒对拍」模式（双方各自打分后计算双向纳什均衡匹配度）。

---

## 🛠️ 提交 PR 的基本流程

1. **Fork** 本仓库并克隆到本地：
   ```bash
   git clone https://github.com/<your-username>/dating-quant-lab.git
   cd dating-quant-lab
   ```
2. 仅编辑前端真源 **`index.html`**（如有后端调整再修改 `bun_server.ts` / `server.py`），然后执行同步与自测：
   ```bash
   node scripts/sync.mjs          # 自动同步 public/index.html 与 bun_server.ts
   node scripts/sync.mjs --check  # 校验逐字节一致
   node scripts/test.mjs          # 运行冒烟与回归测试
   python3 server.py              # 本地启动 http://localhost:8765 验证交互
   ```
3. 保持「端侧零知识脱敏」原则：**任何新增接口或统计功能均不得收集用户的个人原始资产/外形打分或个人身份信息（PII）**。
4. 提交 Commit 并发起 **Pull Request**，简要说明你的改动点或新设计的数学逻辑即可！
