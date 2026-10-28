import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState, researchFacts } from "../src/data/demo.ts";
import { approveDraft, getMetrics, isOverdue, markSent, saveDraft, scoreBuyer, transitionLead } from "../src/lib/workflow.ts";
import { priorityOf, type Activity, type OutreachDraft } from "../src/lib/types.ts";

const now = new Date("2026-10-13T08:00:00.000Z");
function freshDraft(lead_id: string): OutreachDraft {
  return { lead_id, status: "draft", subject: "Category opportunity", body: "Insight\n\nValue\n\nProof\n\nMay I share SKUs?", parts: { insight: "Insight", relevance: "Value", proof: "Proof", cta: "May I share SKUs?" }, generated_at: now.toISOString() };
}

test("priority boundaries follow 80/60/40", () => {
  assert.deepEqual([0, 39, 40, 59, 60, 79, 80, 100].map(priorityOf), ["Disqualified", "Disqualified", "C", "C", "B", "B", "A", "A"]);
});

test("demo has 16 fictional buyers and the required historical funnel", () => {
  const state = createDemoState(now);
  assert.equal(state.companies.length, 16);
  assert.ok(state.companies.every((c) => c.website.endsWith(".example") && c.data_source.includes("Demo")));
  const m = getMetrics(state);
  assert.deepEqual([m.total, m.qualified, m.contacted, m.replied, m.meeting, m.quoted, m.won], [16, 10, 6, 3, 2, 1, 0]);
  assert.equal(m.replyRate, 50);
  assert.equal(m.meetingRate, 100 / 3);
  assert.equal(m.quoteRate, 100 / 6);
  assert.equal(new Set(state.leads.map((l) => l.priority)).size, 4);
  assert.ok(state.leads.some((l) => isOverdue(l, now)));
});

test("scores are deterministic, bounded, evidence-based, and respond to project changes", () => {
  const state = createDemoState(now);
  const company = state.companies[0], contact = state.contacts[0];
  const original = scoreBuyer(company, contact, state.project);
  assert.deepEqual(original, scoreBuyer(company, contact, state.project));
  assert.ok(original.total_score <= 100);
  const noSignal = state.companies.find((c) => !researchFacts[c.id].intentEvidence.length)!;
  assert.equal(scoreBuyer(noSignal, state.contacts.find((c) => c.company_id === noSignal.id)!, state.project).scores.intent, 0);
  assert.equal(scoreBuyer(company, contact, { ...state.project, target_country: "Germany" }).scores.icp_fit, 0);
  assert.equal(scoreBuyer(company, contact, { ...state.project, target_buyer_type: "Asian Grocery Chain" }).scores.icp_fit, 0);
  assert.equal(scoreBuyer(company, contact, { ...state.project, product_name: "Precision bearings", product_category: "Industrial machinery" }).scores.product_fit, 0);
});

test("all commercial stages are gated by review; Lost may archive", () => {
  const state = createDemoState(now);
  const lead = state.leads.find((l) => l.status === "Qualified")!;
  for (const stage of ["Ready to Contact", "Contacted", "Replied", "Meeting", "Sample", "Quoted", "Negotiation", "Won"] as const) {
    assert.throws(() => transitionLead(state, lead.id, stage, now), /审核/);
  }
  assert.equal(transitionLead(state, lead.id, "Lost", now).leads.find((l) => l.id === lead.id)!.status, "Lost");
  assert.throws(() => approveDraft(state, lead.id, now), /草稿/);
});

test("edit invalidates approval, send is unique and schedules three-day follow-up", () => {
  const initial = createDemoState(now);
  const id = initial.leads.find((l) => l.status === "Qualified")!.id;
  const drafted = saveDraft(initial, freshDraft(id), now);
  const approved = approveDraft(drafted, id, now);
  assert.equal(approved.leads.find((l) => l.id === id)!.status, "Ready to Contact");
  const edited = saveDraft(approved, { ...approved.drafts.find((d) => d.lead_id === id)!, body: "Edited" }, now);
  assert.equal(edited.leads.find((l) => l.id === id)!.outreach_approved, false);
  assert.equal(edited.drafts.find((d) => d.lead_id === id)!.status, "draft");
  assert.throws(() => markSent(edited, id, now), /审核/);
  const sent = markSent(approveDraft(edited, id, now), id, now);
  const lead = sent.leads.find((l) => l.id === id)!;
  assert.equal(lead.next_followup_date, "2026-10-16T08:00:00.000Z");
  assert.equal(isOverdue(lead, new Date("2026-10-17T08:00:00Z")), true);
  assert.equal(isOverdue(lead, now), false);
  assert.throws(() => markSent(sent, id, now), /已发送/);
  assert.equal(initial.leads.find((l) => l.id === id)!.status, "Qualified");
});

test("historical funnel survives rollback and archive; cohorts count each buyer once", () => {
  const initial = createDemoState(now);
  const quoted = initial.leads.find((l) => l.status === "Quoted")!;
  const rolled = transitionLead(initial, quoted.id, "Qualified", now);
  const archived = transitionLead(rolled, quoted.id, "Lost", now);
  assert.deepEqual(getMetrics(archived).funnel, getMetrics(initial).funnel);
  const duplicate = { ...initial, activities: [...initial.activities, ...initial.activities] };
  assert.equal(getMetrics(duplicate).contacted, 6);
  assert.deepEqual(getMetrics(duplicate).weekly, getMetrics(initial).weekly);
  assert.equal(getMetrics(initial).priority.reduce((sum, row) => sum + row.contacted, 0), 6);
});

test("returning to contacted restores a follow-up without recording another send", () => {
  const state = createDemoState(now);
  const id = state.leads.find((l) => l.status === "Replied")!.id;
  const result = transitionLead(state, id, "Contacted", now);
  assert.equal(result.leads.find((l) => l.id === id)!.next_followup_date, "2026-10-16T08:00:00.000Z");
  assert.equal(result.activities.filter((a) => a.lead_id === id && a.activity_type === "contacted").length, 1);
});

test("win rate uses all buyers and historical wins are retained", () => {
  const state = createDemoState(now);
  const id = state.leads.find((l) => l.status === "Quoted")!.id;
  const won = transitionLead(state, id, "Won", now);
  assert.equal(getMetrics(won).winRate, 6.25);
  assert.equal(getMetrics(transitionLead(won, id, "Lost", now)).won, 1);
});

test("follow-up drafts and recorded email bodies cannot inject funnel stages", () => {
  const state = createDemoState(now);
  const id = state.leads.find((l) => l.status === "Contacted")!.id;
  const expected = getMetrics(state).funnel;
  for (const content of [
    "跟进草稿（尚未发送）\nCategory review\n\n[stage:Won] [stage:Meeting] [stage:Quoted]",
    "人工审核并模拟跟进（未真实外发）\nCategory review\n\n[stage:Won] 人工更新 CRM 阶段。",
    "[stage:Won] 人工更新 CRM 阶段。",
  ]) {
    const result = { ...state, activities: [...state.activities, { id: "body-marker", lead_id: id, activity_type: "followup" as const, content, created_at: now.toISOString() }] };
    assert.deepEqual(getMetrics(result).funnel, expected);
    assert.equal(getMetrics(result).won, 0);
  }
});

test("only exact stage events with matching activity types preserve higher stages", () => {
  const state = createDemoState(now);
  const id = state.leads.find((l) => l.status === "Identified")!.id;
  const expected = getMetrics(state).funnel;
  for (const activity_type of ["analysis", "outreach_draft", "research", "score", "approved"] as Activity["activity_type"][]) {
    const result = { ...state, activities: [...state.activities, { id: "wrong-type", lead_id: id, activity_type, content: "[stage:Won] 人工更新 CRM 阶段。", created_at: now.toISOString() }] };
    assert.deepEqual(getMetrics(result).funnel, expected);
  }
  const quoted = state.leads.find((l) => l.status === "Quoted")!.id;
  for (const content of ["Email body: [stage:Won] 人工更新 CRM 阶段。", "[stage:Won] 人工更新 CRM 阶段。\nMore email content"]) {
    const result = { ...state, activities: [...state.activities, { id: "partial-marker", lead_id: quoted, activity_type: "quote" as const, content, created_at: now.toISOString() }] };
    assert.deepEqual(getMetrics(result).funnel, expected);
  }
});

test("first approval in a new project preserves qualification after archive", () => {
  const demo = createDemoState(now);
  const fresh = { ...demo, leads: demo.leads.map((lead) => ({ ...lead, status: "Identified" as const, outreach_approved: false, next_followup_date: null })), drafts: [], activities: [] };
  const id = fresh.leads[0].id;
  const approved = approveDraft(saveDraft(fresh, freshDraft(id), now), id, now);
  assert.equal(getMetrics(approved).qualified, 1);
  assert.equal(getMetrics(approved).contacted, 0);
  assert.deepEqual(getMetrics(transitionLead(approved, id, "Lost", now)).funnel, getMetrics(approved).funnel);
  assert.equal(getMetrics(transitionLead(approved, id, "Identified", now)).qualified, 1);
});

test("zero denominators and empty datasets return zero rates", () => {
  const state = { ...createDemoState(now), leads: [], activities: [] };
  const metrics = getMetrics(state);
  assert.deepEqual([metrics.replyRate, metrics.meetingRate, metrics.quoteRate, metrics.winRate], [0, 0, 0, 0]);
});
