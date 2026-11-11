#!/usr/bin/env python3
"""
零依赖婚恋量化脱敏聚合服务 (Local Privacy-Preserving Aggregation Server)
- 仅接收前端本地脱敏与聚类后的统计向量（不接收姓名、IP、个人原始资产/颜值绝对分）
- 使用本地 SQLite 存储匿名样本，并实时计算全群 Dashboard 聚合分布
"""

import json
import sqlite3
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

DB_PATH = Path(__file__).parent / "anon_cohort.db"
PORT = 8765

VALID_BUCKETS = {
    "severe_down",   # ΔZ <= -2σ (严重向下兼容)
    "mod_down",      # -2σ < ΔZ <= -1σ (明显向下兼容)
    "mild_down",     # -1σ < ΔZ < -0.5σ (轻度向下兼容)
    "balanced",      # |ΔZ| <= 0.5σ (同温层势均力敌)
    "upward",        # ΔZ > +0.5σ (向上兼容)
    "veto"           # 触发底线一票否决
}

DIM_IDS = [
    "net_worth", "cash_flow", "family_risk", "appearance",
    "cognition", "emotional", "alignment", "friction"
]


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            anon_id TEXT PRIMARY KEY,
            persona_cluster TEXT NOT NULL,
            compat_bucket TEXT NOT NULL,
            weights_json TEXT NOT NULL,
            ab_votes_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    # Seed initial anonymous baseline samples if table is empty so Dashboard is rich on first view
    c.execute("SELECT COUNT(*) FROM submissions")
    if c.fetchone()[0] == 0:
        seed_samples = [
            ("seed_01", "务实抗风险派", "mild_down",
             {"net_worth": 18, "cash_flow": 22, "family_risk": 14, "appearance": 10, "cognition": 12, "emotional": 12, "alignment": 6, "friction": 6},
             {"0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "B"}),
            ("seed_02", "情绪&颜控派", "balanced",
             {"net_worth": 9, "cash_flow": 11, "family_risk": 7, "appearance": 23, "cognition": 9, "emotional": 23, "alignment": 11, "friction": 7},
             {"0": "B", "1": "A", "2": "B", "3": "B", "4": "A", "5": "A"}),
            ("seed_03", "智性恋慕强派", "upward",
             {"net_worth": 13, "cash_flow": 19, "family_risk": 8, "appearance": 12, "cognition": 24, "emotional": 11, "alignment": 7, "friction": 6},
             {"0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "A"}),
            ("seed_04", "均衡六边形派", "balanced",
             {"net_worth": 14, "cash_flow": 15, "family_risk": 11, "appearance": 14, "cognition": 13, "emotional": 15, "alignment": 10, "friction": 8},
             {"0": "B", "1": "B", "2": "B", "3": "B", "4": "B", "5": "B"}),
            ("seed_05", "务实抗风险派", "mod_down",
             {"net_worth": 21, "cash_flow": 20, "family_risk": 15, "appearance": 9, "cognition": 11, "emotional": 12, "alignment": 6, "friction": 6},
             {"0": "A", "1": "B", "2": "A", "3": "B", "4": "A", "5": "B"}),
            ("seed_06", "情绪&颜控派", "mild_down",
             {"net_worth": 10, "cash_flow": 12, "family_risk": 8, "appearance": 20, "cognition": 10, "emotional": 22, "alignment": 10, "friction": 8},
             {"0": "B", "1": "B", "2": "B", "3": "B", "4": "B", "5": "A"}),
        ]
        now_str = datetime.now(timezone.utc).isoformat()
        for aid, persona, bucket, w, votes in seed_samples:
            c.execute(
                "INSERT INTO submissions VALUES (?, ?, ?, ?, ?, ?)",
                (aid, persona, bucket, json.dumps(w), json.dumps(votes), now_str)
            )
        conn.commit()
    conn.close()


def aggregate_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT persona_cluster, compat_bucket, weights_json, ab_votes_json FROM submissions")
    rows = c.fetchall()
    conn.close()

    total = len(rows)
    personas = {}
    buckets = {k: 0 for k in VALID_BUCKETS}
    weight_sums = {d: 0.0 for d in DIM_IDS}
    ab_counts = {str(i): {"A": 0, "B": 0, "tie": 0} for i in range(6)}

    for persona, bucket, w_json, ab_json in rows:
        personas[persona] = personas.get(persona, 0) + 1
        if bucket in buckets:
            buckets[bucket] += 1
        try:
            w_map = json.loads(w_json)
            w_total = sum(float(w_map.get(d, 0)) for d in DIM_IDS) or 1.0
            for d in DIM_IDS:
                weight_sums[d] += (float(w_map.get(d, 0)) / w_total) * 100.0
        except Exception:
            pass

        try:
            v_map = json.loads(ab_json)
            for q_idx, choice in v_map.items():
                if q_idx in ab_counts and choice in ("A", "B", "tie"):
                    ab_counts[q_idx][choice] += 1
        except Exception:
            pass

    avg_weights = {
        d: round(weight_sums[d] / total, 1) if total > 0 else 12.5
        for d in DIM_IDS
    }

    return {
        "total_participants": total,
        "personas": personas,
        "compat_buckets": buckets,
        "avg_weights": avg_weights,
        "ab_Choice_stats": ab_counts
    }


class AnonQuantHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)

    def log_message(self, format, *args):
        # Privacy protection: do NOT log client IP addresses
        pass

    def _send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self._send_json({"ok": True})

    def do_GET(self):
        if self.path.startswith("/api/stats"):
            self._send_json(aggregate_stats())
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/submit"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                payload = json.loads(body)
                # Strict schema sanitizer: reject or strip any raw personal scores
                anon_id = str(payload.get("anon_id", ""))[:64]
                persona = str(payload.get("persona_cluster", "均衡六边形派"))[:32]
                bucket = str(payload.get("compat_bucket", "balanced"))
                if bucket not in VALID_BUCKETS:
                    bucket = "balanced"

                raw_w = payload.get("weights", {})
                clean_w = {d: round(float(raw_w.get(d, 12.5)), 1) for d in DIM_IDS}

                raw_ab = payload.get("ab_votes", {})
                clean_ab = {
                    str(i): raw_ab.get(str(i))
                    for i in range(6)
                    if raw_ab.get(str(i)) in ("A", "B", "tie")
                }

                if not anon_id:
                    self._send_json({"error": "Missing anonymous token"}, status=400)
                    return

                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute("""
                    INSERT INTO submissions (anon_id, persona_cluster, compat_bucket, weights_json, ab_votes_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(anon_id) DO UPDATE SET
                        persona_cluster=excluded.persona_cluster,
                        compat_bucket=excluded.compat_bucket,
                        weights_json=excluded.weights_json,
                        ab_votes_json=excluded.ab_votes_json,
                        updated_at=excluded.updated_at
                """, (
                    anon_id,
                    persona,
                    bucket,
                    json.dumps(clean_w),
                    json.dumps(clean_ab),
                    datetime.now(timezone.utc).isoformat()
                ))
                conn.commit()
                conn.close()

                self._send_json({"ok": True, "stats": aggregate_stats()})
            except Exception as e:
                self._send_json({"error": str(e)}, status=400)
            return
        self._send_json({"error": "Not found"}, status=404)


if __name__ == "__main__":
    init_db()
    print(f"✅ 婚恋量化脱敏聚合服务已启动: http://localhost:{PORT}")
    print("🔒 隐私保护模式已开启：不记录访问者 IP，不接收个人原始资产/颜值绝对分，仅聚合脱敏权重与二选一偏好。")
    server = HTTPServer(("0.0.0.0", PORT), AnonQuantHandler)
    server.serve_forever()
