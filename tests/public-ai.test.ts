import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/data/demo.ts";
import { analyzeBuyer, approvedOptions, draftOutreach, draftFollowup, validateAIResult } from "../src/lib/ai.ts";
const state = createDemoState();
const company = { ...state.companies[0], dataset: "public" as const, country: "United States", city: "UNKNOWN", main_products: "hotpot soup bases and chili sauces", distribution_channel: "UNKNOWN", research_evidence: [{ url: "https://public-food.test/about", title: "Public Food", snippet: "We import hotpot soup bases and chili sauces.", retrieved_at: "2026-10-14T00:00:00Z" }] };
const contact = { ...state.contacts[0], first_name: "UNKNOWN", last_name: "UNKNOWN", title: "UNKNOWN", decision_maker_score: 0, email: "info@public-food.test", source_url: "https://public-food.test/contact", email_status: "public_unverified" as const };

test("public analysis cannot borrow demo timing from a matching legacy company id", () => {
  const analysis = analyzeBuyer(state.project, company, contact);
  assert.equal(analysis.intent_signal.status, "NO_VERIFIED_SIGNAL");
  assert.deepEqual(analysis.intent_signal.evidence, []);
  assert.doesNotMatch(JSON.stringify(analysis), /模拟资料|演示数据|演示模拟/);
  assert.match(JSON.stringify(analysis), /公开|核验|核对/);
  assert.match(JSON.stringify(analysis), /public-food\.test/);
  const options = approvedOptions({ task: "analysis", project: state.project, company, contact });
  assert.doesNotMatch(JSON.stringify(options), /模拟资料|演示模拟/);
});
test("public customer mails keep four English paragraphs and never invent a recipient", () => {
  const draft = draftOutreach(state.project, company, contact);
  assert.equal(draft.body.split("\n\n").length, 4);
  assert.doesNotMatch(draft.body, /UNKNOWN|Hi Alex|[\u3400-\u9fff]/);
  assert.match(draft.parts.insight, /public|website/i);
  const options = approvedOptions({ task: "outreach", project: state.project, company, contact });
  assert.equal(validateAIResult("outreach", draft, draft, options), true);
});
test("Chinese or missing public buyer profile is not inserted into an English mail", () => {
  const unknown = { ...company, main_products: "火锅调味品", distribution_channel: "待核实渠道" };
  const draft = draftOutreach(state.project, unknown, contact);
  const followup = draftFollowup(state.project, unknown, contact);
  const options = approvedOptions({ task: "outreach", project: state.project, company: unknown, contact });
  assert.doesNotMatch(draft.body + followup.body + JSON.stringify(options), /[\u3400-\u9fff]|UNKNOWN/);
  assert.match(draft.parts.insight, /would like to learn/);
});
