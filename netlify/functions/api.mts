import type { Config, Context } from "@netlify/functions";
import { getDeployStore } from "@netlify/blobs";

const VALID_PERSONAS = new Set([
  "务实抗风险派",
  "情绪&颜控派",
  "智性恋慕强派",
  "均衡六边形派",
]);

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
] as const;

interface SubmissionRecord {
  anon_id: string;
  persona_cluster: string;
  compat_bucket: string;
  weights: Record<string, number>;
  ab_votes: Record<string, string>;
  updated_at: string;
}

const SEED_SAMPLES: SubmissionRecord[] = [
  {
    anon_id: "seed_01",
    persona_cluster: "务实抗风险派",
    compat_bucket: "mild_down",
    weights: { net_worth: 18, cash_flow: 22, family_risk: 14, appearance: 10, cognition: 12, emotional: 12, alignment: 6, friction: 6 },
    ab_votes: { "0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "B" },
    updated_at: "2026-11-11T00:00:00Z",
  },
  {
    anon_id: "seed_02",
    persona_cluster: "情绪&颜控派",
    compat_bucket: "balanced",
    weights: { net_worth: 9, cash_flow: 11, family_risk: 7, appearance: 23, cognition: 9, emotional: 23, alignment: 11, friction: 7 },
    ab_votes: { "0": "B", "1": "A", "2": "B", "3": "B", "4": "A", "5": "A" },
    updated_at: "2026-11-11T00:00:00Z",
  },
  {
    anon_id: "seed_03",
    persona_cluster: "智性恋慕强派",
    compat_bucket: "upward",
    weights: { net_worth: 13, cash_flow: 19, family_risk: 8, appearance: 12, cognition: 24, emotional: 11, alignment: 7, friction: 6 },
    ab_votes: { "0": "B", "1": "B", "2": "B", "3": "A", "4": "B", "5": "A" },
    updated_at: "2026-11-11T00:00:00Z",
  },
  {
    anon_id: "seed_04",
    persona_cluster: "均衡六边形派",
    compat_bucket: "balanced",
    weights: { net_worth: 14, cash_flow: 15, family_risk: 11, appearance: 14, cognition: 13, emotional: 15, alignment: 10, friction: 8 },
    ab_votes: { "0": "B", "1": "B", "2": "B", "3": "B", "4": "B", "5": "B" },
    updated_at: "2026-11-11T00:00:00Z",
  },
  {
    anon_id: "seed_05",
    persona_cluster: "务实抗风险派",
    compat_bucket: "mod_down",
    weights: { net_worth: 21, cash_flow: 20, family_risk: 15, appearance: 9, cognition: 11, emotional: 12, alignment: 6, friction: 6 },
    ab_votes: { "0": "A", "1": "B", "2": "A", "3": "B", "4": "A", "5": "B" },
    updated_at: "2026-11-11T00:00:00Z",
  },
  {
    anon_id: "seed_06",
    persona_cluster: "情绪&颜控派",
    compat_bucket: "mild_down",
    weights: { net_worth: 10, cash_flow: 12, family_risk: 8, appearance: 20, cognition: 10, emotional: 22, alignment: 10, friction: 8 },
    ab_votes: { "0": "B", "1": "B", "2": "B", "3": "B", "4": "B", "5": "A" },
    updated_at: "2026-11-11T00:00:00Z",
  },
];

async function computeAggregatedStats() {
  const store = getDeployStore("anon-cohort-submissions");
  const { blobs } = await store.list();

  const recordsMap = new Map<string, SubmissionRecord>();
  for (const s of SEED_SAMPLES) {
    recordsMap.set(s.anon_id, s);
  }

  for (const b of blobs) {
    const item = (await store.get(b.key, { type: "json" })) as SubmissionRecord | null;
    if (item && item.anon_id) {
      recordsMap.set(item.anon_id, item);
    }
  }

  const rows = Array.from(recordsMap.values());
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
    const wTotal = DIM_IDS.reduce((acc, d) => acc + Number(r.weights?.[d] || 0), 0) || 1;
    for (const d of DIM_IDS) {
      weightSums[d] += (Number(r.weights?.[d] || 0) / wTotal) * 100;
    }
    for (let i = 0; i < 6; i++) {
      const k = String(i);
      const ch = r.ab_votes?.[k];
      if (ch === "A" || ch === "B" || ch === "tie") {
        abCounts[k][ch] += 1;
      }
    }
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

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/api/stats") {
    const stats = await computeAggregatedStats();
    return Response.json(stats);
  }

  if (req.method === "POST" && url.pathname === "/api/submit") {
    const body = await req.json();
    const anonId = String(body?.anon_id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!anonId) {
      return Response.json({ error: "Missing anon_id" }, { status: 400 });
    }

    const rawPersona = String(body?.persona_cluster || "均衡六边形派");
    const persona = VALID_PERSONAS.has(rawPersona) ? rawPersona : "均衡六边形派";
    const rawBucket = String(body?.compat_bucket || "balanced");
    const bucket = VALID_BUCKETS.has(rawBucket) ? rawBucket : "balanced";

    const cleanWeights: Record<string, number> = {};
    for (const d of DIM_IDS) {
      const parsed = Number(body?.weights?.[d]);
      const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 12.5;
      cleanWeights[d] = Number(bounded.toFixed(1));
    }

    const cleanAb: Record<string, string> = {};
    for (let i = 0; i < 6; i++) {
      const k = String(i);
      const v = body?.ab_votes?.[k];
      if (v === "A" || v === "B" || v === "tie") {
        cleanAb[k] = v;
      }
    }

    const store = getDeployStore("anon-cohort-submissions");
    const record: SubmissionRecord = {
      anon_id: anonId,
      persona_cluster: persona,
      compat_bucket: bucket,
      weights: cleanWeights,
      ab_votes: cleanAb,
      updated_at: new Date().toISOString(),
    };

    await store.setJSON(anonId, record);
    const stats = await computeAggregatedStats();
    return Response.json({ ok: true, stats });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config: Config = {
  path: ["/api/stats", "/api/submit"],
};
