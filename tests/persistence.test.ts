import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/data/demo.ts";
import { migrateState, loadState, STORAGE_KEY, LEGACY_KEY } from "../src/lib/persistence.ts";
import { getMetrics } from "../src/lib/workflow.ts";

const now = new Date("2026-10-13T08:00:00Z");
function legacy() {
  const state = JSON.parse(JSON.stringify(createDemoState(now)));
  delete state.schema_version; delete state.project_revision; delete state.followup_drafts;
  for (const a of state.activities) { delete a.milestone; delete a.stage_from; delete a.stage_to; }
  for (const a of state.activities) if (a.activity_type === "research") a.content = "模拟调研记录 · Demo Dataset" + (Number(a.lead_id.split('-')[1]) <= 10 ? " [stage:Qualified]" : "");
  return state;
}
test("v1 migration preserves drafts and explicit historical facts and is idempotent", () => {
  const old = legacy();
  old.activities.push({ id: "old-followup", lead_id: "lead-4", activity_type: "followup", content: "跟进草稿（尚未发送）\nReview idea\n\nOriginal human text", created_at: now.toISOString() });
  const migrated = migrateState(old);
  assert.equal(migrated.schema_version, 2);
  assert.equal(migrated.drafts[6].status, "approved");
  assert.equal(migrated.followup_drafts[0].body, "Original human text");
  assert.deepEqual(getMetrics(migrated, now).funnel.map(x => x.count), [16, 10, 6, 3, 2, 1, 0]);
  assert.deepEqual(migrateState(migrated), migrated);
});
test("migration does not invent previous milestones from an unsupported old high stage", () => {
  const old = legacy(); old.activities = []; old.leads[12].status = "Won";
  old.activities.push({ id: "untrusted", lead_id: "lead-13", activity_type: "analysis", content: "[stage:Won] 人工更新 CRM 阶段。", created_at: now.toISOString() });
  const state = migrateState(old);
  assert.equal(state.leads[12].status, "Won");
  assert.equal(getMetrics(state, now).contacted, 0);
  assert.equal(getMetrics(state, now).won, 0);
});
test("corrupt and inconsistent storage is rejected rather than passed to the UI", () => {
  for (const value of [null, {}, { ...legacy(), leads: [{}] }, { ...legacy(), contacts: [] }, { ...legacy(), drafts: [{ status: "approved" }] }]) {
    assert.throws(() => migrateState(value));
  }
});
test("upgrade retains v1 and failed writes do not overwrite it", () => {
  const raw = JSON.stringify(legacy()); const entries = new Map([[LEGACY_KEY, raw]]);
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  const loaded = loadState(storage, now);
  assert.equal(loaded.state.schema_version, 2); assert.equal(entries.get(LEGACY_KEY), raw);
  assert.ok(entries.has(STORAGE_KEY));
  const failure = loadState({ ...storage, getItem: (key: string) => key === LEGACY_KEY ? raw : null, setItem: () => { throw new Error("full"); } }, now);
  assert.match(failure.warning, /保存/);
  assert.equal(entries.get(LEGACY_KEY), raw);
});
test("legacy unsupported products cannot retain a precise A priority or approved sending", () => {
  const old = legacy(); old.project.product_name = "Precision bearings"; old.project.product_category = "Industrial Components";
  const state = migrateState(old);
  assert.equal(state.leads[6].score_assessable, false);
  assert.equal(state.leads[6].priority, "Disqualified");
  assert.equal(state.drafts[6].status, "draft");
  assert.equal(state.leads[6].outreach_approved, false);
});
