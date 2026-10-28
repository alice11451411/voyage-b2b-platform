import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/data/demo.ts";
import { approveDraft, markSent, saveDraft, saveProject, saveFollowup, completeFollowup, captureVersion, assertVersion, transitionLead, getMetrics, getNextAction, resetDemo, recordAnalysis, scoreBuyer } from "../src/lib/workflow.ts";
import { analyzeBuyer } from "../src/lib/ai.ts";
import type { FollowupDraft } from "../src/lib/types.ts";
import { countryLabel, companyTypeLabel } from "../src/lib/display.ts";
const now = new Date("2026-10-13T08:00:00Z");

test("known selectable markets and buyer type combinations stay Chinese", () => {
  assert.equal(countryLabel("Canada"), "加拿大");
  assert.equal(countryLabel("Germany"), "德国");
  assert.equal(companyTypeLabel("Importer / Distributor / Private Label Brand"), "进口商、经销商、自有品牌商");
  assert.equal(companyTypeLabel("Asian Grocery Chain / Foodservice Distributor / Wholesaler"), "亚洲超市连锁、餐饮供应链、批发商");
  assert.match(companyTypeLabel("Unverified Buyer Type"), /待确认/);
});
test("unchanged save preserves approved and edited drafts; changed information retains text but withdraws review", () => {
  const seed = createDemoState(now);
  assert.equal(saveProject(seed, { ...seed.project }, seed.icpCriteria), seed);
  const changed = saveProject(seed, { ...seed.project, description: "新的产品简介" }, seed.icpCriteria);
  assert.equal(changed.drafts[6].body, seed.drafts[6].body);
  assert.equal(changed.drafts[6].status, "draft");
  assert.equal(changed.leads[6].status, "Qualified");
  assert.equal(changed.drafts[0].status, "sent");
  assert.equal(changed.project_revision, 1);
});
test("replace project creates an independent identity and resets associated work", () => {
  const seed = createDemoState(now);
  const next = saveProject(seed, { ...seed.project, company_name: "另一家食品企业" }, seed.icpCriteria, true, now);
  assert.notEqual(next.project.id, seed.project.id);
  assert.ok(next.companies.every(c => c.project_id === next.project.id));
  assert.equal(next.activities.length, 0); assert.equal(next.drafts.length, 0);
});
test("old AI result cannot overwrite human edit or a newly replaced project", () => {
  const seed = createDemoState(now), token = captureVersion(seed, "lead-7");
  const edited = saveDraft(seed, { ...seed.drafts[6], body: "Human text" }, now);
  assert.throws(() => assertVersion(edited, token), /未覆盖/);
  assert.throws(() => assertVersion(saveProject(seed, seed.project, seed.icpCriteria, true, now), token), /未覆盖/);
  let typed = seed;
  for (let i=0;i<20;i++) typed = saveDraft(typed, { ...typed.drafts[6], body: "x".repeat(i+1) }, now);
  assert.ok(typed.activities.length - seed.activities.length <= 1);
});
test("followup changes persist and closed/duplicate submissions cannot write", () => {
  const seed = createDemoState(now);
  const draft: FollowupDraft = { id: "follow-1", lead_id: "lead-4", subject: "Category review", body: "Human confirmed text", status: "draft", revision: 0, value_key: "allergens", meta: { source: "local", generated_at: now.toISOString(), project_revision: 0 } };
  const saved = saveFollowup(seed, draft, now);
  const edited = saveFollowup(saved, { ...saved.followup_drafts[0], body: "Latest human edit" }, now);
  assert.equal(JSON.parse(JSON.stringify(edited)).followup_drafts[0].body, "Latest human edit");
  assert.throws(() => completeFollowup(transitionLead(edited, "lead-4", "Lost", now), draft.id, now), /归档/);
  const sent = completeFollowup(edited, draft.id, now);
  assert.throws(() => completeFollowup(sent, draft.id, now), /已发送/);
  assert.equal(sent.leads[3].next_followup_date, "2026-10-16T08:00:00.000Z");
});
test("unsent approved lead cannot jump to won; contact to quote does not invent replies or meetings", () => {
  const seed = createDemoState(now);
  assert.throws(() => transitionLead(seed, "lead-7", "Won", now), /先.*发送/);
  const sent = markSent(seed, "lead-7", now), quoted = transitionLead(sent, "lead-7", "Quoted", now);
  const before = getMetrics(seed, now), after = getMetrics(quoted, now);
  assert.equal(after.contacted, before.contacted + 1); assert.equal(after.quoted, before.quoted + 1);
  assert.equal(after.replied, before.replied); assert.equal(after.meeting, before.meeting);
  assert.equal(getNextAction(seed, seed.leads[6]).label, "模拟发送");
  assert.equal(getNextAction(seed, seed.leads[15]).label, "查看历史");
});
test("closed lead cannot edit or approve the initial email", () => {
  const seed = createDemoState(now), archived = transitionLead(seed, "lead-7", "Lost", now);
  assert.throws(() => saveDraft(archived, seed.drafts[6], now), /归档/);
  assert.throws(() => approveDraft(archived, "lead-7", now), /归档/);
});
test("reset creates a new identity so initial in-flight AI cannot repopulate reset data", () => {
  const seed = createDemoState(now), token = captureVersion(seed, "lead-8");
  const fresh = resetDemo(seed, now);
  assert.throws(() => assertVersion(fresh, token), /未覆盖/);
  assert.ok(fresh.companies.every(c => c.project_id === fresh.project.id));
  assert.equal(fresh.drafts[6].meta?.project_revision, fresh.project_revision);
  assert.equal(markSent(fresh, "lead-7", now).leads[6].status, "Contacted");
});
test("viewing a candidate analysis records research and advances the next recommended task", () => {
  const seed = createDemoState(now);
  seed.leads[7] = { ...seed.leads[7], status: "Identified" };
  const lead = seed.leads[7];
  const next = recordAnalysis(seed, lead.id, analyzeBuyer(seed.project, seed.companies[7], seed.contacts[7]), { source: "local", generated_at: now.toISOString(), project_revision: 0 }, now);
  assert.equal(next.leads[7].status, "Researched");
  assert.equal(getNextAction(next, next.leads[7]).kind, "outreach");
});
test("changing only the product name does not inherit a food product A priority", () => {
  const seed = createDemoState(now);
  const scores = scoreBuyer(seed.companies[0], seed.contacts[0], { ...seed.project, product_name: "精密轴承" });
  assert.equal(scores.score_assessable, false); assert.equal(scores.priority, "Disqualified");
});
test("low-match uncontacted clients are directed to research rather than premature outreach", () => {
  const seed = createDemoState(now);
  const lead = seed.leads.find(l => l.priority === "Disqualified" && l.status !== "Lost")!;
  assert.equal(getNextAction(seed, lead).kind, "analysis");
  assert.equal(getNextAction(seed, seed.leads[6]).kind, "send");
});
test("first-contact weekly cohorts use the China Monday boundary", () => {
  const seed = createDemoState(now);
  const activities = seed.activities.filter(a => a.milestone !== "Contacted").concat([
    { id: "week-before", lead_id: "lead-1", activity_type: "contacted", milestone: "Contacted", content: "模拟首次联系", created_at: "2026-10-11T15:59:00Z" },
    { id: "week-after", lead_id: "lead-2", activity_type: "contacted", milestone: "Contacted", content: "模拟首次联系", created_at: "2026-10-11T16:01:00Z" },
  ]);
  const metrics = getMetrics({ ...seed, activities }, now);
  assert.equal(metrics.weekly.at(-2)?.contacted, 1); assert.equal(metrics.weekly.at(-1)?.contacted, 1);
});
