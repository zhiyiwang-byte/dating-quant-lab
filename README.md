# 📊 Dating Quant Lab · 婚恋市场量化评估与超参标定实验室

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](./LICENSE)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Railway_App-success)](https://dating-quant-web-production.up.railway.app)
[![Math Model](https://img.shields.io/badge/Model-Cobb--Douglas_%2B_Bradley--Terry-blue)](#核心数理模型)
[![Privacy](https://img.shields.io/badge/Privacy-Client--Side_Sanitized-emerald)](#端侧脱敏与群体聚合架构)

> 💡 **如果你觉得这个项目的量化建模思路很有趣，欢迎在右上角点一颗 ⭐ Star 支持！**  
> 如果你有更犀利的**维度设计、典型画像预设、灵魂二选一题库（A/B Dilemmas）或回归算法改进**，非常欢迎直接提交 **Issue** 或 **Pull Request (PR)** 一起共建整活！

🌐 **在线体验与全群脱敏实时看板**：**[https://dating-quant-web-production.up.railway.app](https://dating-quant-web-production.up.railway.app)**

---

## 🎯 为什么要做这个项目？

婚恋市场长期缺乏一套**既符合微观经济学直觉、又能防“名义资产幻觉”与“口嫌体正直”**的量化评估框架。传统的加减分表格（线性加权 $\sum w_i x_i$）存在三个致命缺陷：

1. **忽略边际效用递减**：年入 10 万到 50 万带来的生活质量提升，远大于 500 万到 540 万；线性打分会被极端长尾资产带偏。
2. **掩盖木桶短板效应**：在线性模型里，“身价极高”可以掩盖“情绪极度不稳定”或“边界感为 0”。
3. **权重言行不一（Stated vs. Revealed Preference）**：人们嘴上说的择偶权重（“我看重性格”）与身体诚实的二选一结果往往大相径庭。

本项目通过 **对数几何加权效用 + 动态短板惩罚 + Bradley-Terry 成对比较逻辑回归 + 端侧零知识脱敏看板**，提供了一套可交互、可群内测试比拼的开源量化工具。

---

## 🧮 核心数理模型

### 1. 柯布-道格拉斯对数效用函数（Cobb-Douglas Log-Utility）

对 8 个正交维度的原始评分 $x_i \in [1, 10]$ 先取自然对数 $\ln(x_i)$，再按动态权重 $\tilde{w}_i$ 加权平均并映射回几何均值量纲：

$$U(\mathbf{x}) = I_{\text{veto}} \cdot \exp\left(\sum_{i=1}^{8} \tilde{w}_i \ln(x_i)\right) = I_{\text{veto}} \cdot \prod_{i=1}^{8} x_i^{\tilde{w}_i}$$

- **边际效用递减**：天然压缩右偏的对数正态分布（Log-normal）指标。
- **自带木桶效应**：当任一核心维度 $x_i \to 1$（即 $\ln x_i \to 0$），几何均值被显著拉低；配合底线风控乘数 $I_{\text{veto}} \in \{0, 1\}$ 实现一票否决。

### 2. 四大正交维度簇（防多重共线性与名义资产泡沫）

| 一级维度簇 | 二级正交指标 | 量化避坑指南 |
| :--- | :--- | :--- |
| **1. 经济与资源禀赋** | • `net_worth` 净资产底盘<br>• `cash_flow` 可持续自由现金流<br>• `family_risk` 原生家庭抗风险与养老敞口 | **剔除名义资产幻觉**：如“高位接盘的高杠杆房产”，需按 `当前可变现净值 - 剩余房贷` 计入净资产，并将高额月供对现金流的吞噬计入现金流折价。 |
| **2. 自然与社会资本** | • `appearance` 外形与健康资本<br>• `cognition` 认知与教育带宽 | 按目标择偶池人群分位数映射至 $[1, 10]$ 分，避免学历与收入重复计分。 |
| **3. 关系与情绪价值** | • `emotional` 情绪稳定度与共情<br>• `alignment` 消费观与三观对齐 | 衡量双向交互效用（低内耗、非冷暴力、储蓄/消费偏好契合度）。 |
| **4. 长期协同成本** | • `friction` 协同成本与边界感 | 通勤定居半径、家务育儿参与意愿、原生家庭边界感（决定婚后长期交易成本）。 |

### 3. 动态加权机制（Dynamic Weighting）

- **短板惩罚放大器（Piecewise Bottleneck Penalty）**：当任一维度得分跌破安全阈值（$x_i < 4.5$），该维度的有效权重自动按严重程度放大：
  $$\tilde{w}_i = w_i \cdot \left(1 + 1.2 \times \frac{4.5 - x_i}{3.5}\right)$$
- **自身禀赋边际替代率（MRS Adjustment）**：当评估者自身的经济维度均值 $\ge 8.0$ 时，伴侣边际经济贡献递减，系统自动微调下调伴侣经济权重（$\times 0.85$），并上调情绪价值与外形权重（$\times 1.15$）。

### 4. 标准差（Z-Score）与“向上/向下兼容”界定

将个人与候选人的综合几何效用分置于目标择偶池分布 $\mathcal{N}(\mu=6.20, \sigma=1.15^2)$ 中计算标准差分位差 $\Delta Z = Z_{\text{cand}} - Z_{\text{self}}$：

- **$|\Delta Z| \le 0.5\sigma$**：🎯 **同温层势均力敌**（纳什均衡区，博弈最稳定）
- **$\Delta Z \in [-1.0\sigma, -0.5\sigma)$**：⚖️ **稍微向下兼容**（现实中最常见的温和缓冲带）
- **$\Delta Z \in (-2.0\sigma, -1.0\sigma)$**：⚠️ **明显向下兼容**（超过 1 个标准差，需核查对方在你最高权重维度上是否有长板帕累托补偿）
- **$\Delta Z \le -2.0\sigma$**：🚨 **严重向下兼容**（跨越 2 个标准差，长期关系极易失衡）
- **$\Delta Z > +0.5\sigma$**：🚀 **向上兼容 / 越级匹配**

### 5. Bradley-Terry 二选一逻辑回归反推超参（Hyperparameter Calibration）

人类不擅长给候选人打绝对分，但极擅长做 **A/B 二选一**。系统内置 6 道典型婚恋困境卡片，使用 **Bradley-Terry 成对比较模型** 拟合对数特征差：

$$P(A \succ B) = \frac{1}{1 + \exp\left(-\tau \sum_{i=1}^{8} w_i (\ln x_{A,i} - \ln x_{B,i})\right)}$$

根据用户的每次直觉抉择，通过在线最大似然梯度更新实时反推出用户**潜意识里的真实权重分布 $\mathbf{w}$**。

---

## 🔒 端侧脱敏与群体聚合架构（Privacy-Preserving Cohort Dashboard）

为了支持微信小群或社群匿名比拼，项目采用**端侧零知识脱敏流水线**：

1. **本地拦截敏感数据**：用户的 8 维原始分、评估对象的原始分、精确 $Z\text{-Score}$ 以及 IP 地址**完全在浏览器本地剥离丢弃**，绝不上传服务端。
2. **端侧聚类与分桶**：浏览器仅计算并上传：
   - `persona_cluster`：四大择偶流派标签（`务实抗风险派` / `情绪&颜控派` / `智性恋慕强派` / `均衡六边形派`）
   - `compat_bucket`：模糊化标准差区间桶（如 `mild_down`）
   - `weights`：归一化超参百分比向量
   - `ab_votes`：6 道二选一题目的 A/B 投票选项
3. **实时全群看板**：聚合展示全群择偶流派占比、全群身体最诚实的权重排行、6 道灵魂二选一胜率榜以及向下兼容度分布。

---

## 🚀 本地运行与快速部署

### 方式 1：Python 零依赖本地运行（内置 SQLite）
无需安装任何第三方包，直接使用 macOS / Linux 自带的 `python3` 启动：

```bash
git clone https://github.com/zhiyiwang-byte/dating-quant-lab.git
cd dating-quant-lab
python3 server.py
# 访问 http://localhost:8765
```

### 方式 2：Bun 高性能单文件运行（Railway 同款架构）
```bash
bun run bun_server.ts
```

### 方式 3：纯静态单文件体验
直接用浏览器双击打开 `index.html` 即可离线使用所有打分、二选一标定与战报生成功能。

---

## 🤝 欢迎贡献（How to Contribute & PR Ideas）

非常欢迎大家提交 PR 或 Issue 一起把这个量化实验室做得更有趣！以下是一些极佳的 PR 方向（详见 [CONTRIBUTING.md](./CONTRIBUTING.md)）：

- 🔥 **扩充「灵魂二选一」题库（`AB_DILEMMAS`）**：添加更扎心、更贴近真实的相亲博弈困境卡片。
- 🏙️ **分城市 / 分圈层基准分布校准（$\mu, \sigma$）**：增加「京沪深大厂圈」、「体制内相亲局」、「海外留学圈」等不同分位基准切换。
- 🧮 **新增 AHP 层次分析法矩阵或贝叶斯岭回归（Bayesian Ridge）先验校准器**。
- 🎨 **生成精美的 Canvas / SVG 海报战报图**，方便直接保存图片发朋友圈或群聊。

如果这个项目博你一笑或给你带来了一点启发，**请不吝赐予一颗 ⭐ Star！**

---

## 📄 License

本项目采用 [MIT License](./LICENSE) 开源。
