import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBuyer, approvedOptions, draftFollowup, draftOutreach, missingEnglishFacts, validateAIResult } from "../src/lib/ai.ts";
import { buildCombinedProject } from "../src/lib/product-groups.ts";
import { createDemoState } from "../src/data/demo.ts";
import { POST } from "../src/app/api/ai/route.ts";
import type { Project } from "../src/lib/types.ts";

const state = createDemoState(new Date("2026-10-14T00:00:00Z"));
const company = state.companies[0];
const contact = state.contacts.find((person) => person.company_id === company.id)!;
const first: Project = { ...state.project, id: "base", product_name: "Hotpot soup base", advantages: ["OEM packaging available"], certifications: ["BRC documentation"], moq: "500 cases", target_buyer_type: "Distributor" };
const second: Project = { ...state.project, id: "sauce", product_name: "Chili sauce", product_category: "Chili sauces / 辣酱", advantages: ["multiple heat levels"], certifications: [], moq: "200 cases", target_country: "Germany", target_buyer_type: "Private Label Brand" };
const group = () => buildCombinedProject([first, second], "combo", "2026-10-14", "United States");

test("combination retains product-specific facts and an explicit campaign market", () => {
  const combined = group();
  assert.equal(combined.target_country, "United States");
  assert.match(combined.target_buyer_type, /Distributor/);
  assert.match(combined.target_buyer_type, /Private Label Brand/);
  assert.deepEqual(combined.selected_products?.map((product) => product.id), [first.id, second.id]);
  assert.match(combined.moq, /Hotpot soup base.*500 cases/);
  assert.match(combined.moq, /Chili sauce.*200 cases/);
  assert.equal(combined.certifications.length, 1);
  assert.match(combined.certifications[0], /Hotpot soup base.*BRC documentation/);
  assert.notEqual(combined.selected_products?.[0], first);
  assert.equal(buildCombinedProject([first, second], "combo", "2026-10-14").target_country, first.target_country);
  assert.throws(() => buildCombinedProject([], "empty", "2026-10-14"), /选择.*产品/);
});

test("combination outreach uses four English paragraphs and scopes certification, advantages and MOQ", () => {
  const draft = draftOutreach(group(), company, contact);
  assert.equal(draft.body.split("\n\n").length, 4);
  assert.doesNotMatch(draft.body, /[\u3400-\u9fff]/);
  assert.match(draft.parts.relevance, /Hotpot soup base.*Chili sauce/i);
  assert.match(draft.parts.proof, /Hotpot soup base:.*OEM packaging available.*BRC documentation.*500 cases/);
  assert.match(draft.parts.proof, /Chili sauce:.*multiple heat levels.*200 cases/);
  const sauceFacts = draft.parts.proof.split("Chili sauce:")[1];
  assert.doesNotMatch(sauceFacts, /BRC|500 cases/);
  assert.doesNotMatch(draft.body, /certified|guarantee|certification applies to all/i);
});

test("each product's unresolved English facts remain visible and block combination drafts", () => {
  const unresolved = { ...second, product_name: "鲜椒辣酱", advantages: ["低盐配方"], certifications: ["食品安全认证"], moq: "每款二百箱" };
  const combined = buildCombinedProject([first, unresolved], "combo", "2026-10-14");
  const missing = missingEnglishFacts(combined);
  for (const fact of ["鲜椒辣酱", "低盐配方", "食品安全认证", "每款二百箱"]) assert.ok(missing.some((item) => item.includes("鲜椒辣酱") && item.includes(fact)));
  assert.throws(() => draftOutreach(combined, company, contact), /英文.*鲜椒辣酱/);
  assert.throws(() => draftFollowup(combined, company, contact), /英文.*鲜椒辣酱/);
  const confirmed = { ...unresolved, english_facts: { "鲜椒辣酱": "fresh chili sauce", "低盐配方": "low-sodium recipe", "食品安全认证": "food safety documentation", "每款二百箱": "200 cases per SKU" } };
  const ready = buildCombinedProject([first, confirmed], "combo", "2026-10-14");
  assert.deepEqual(missingEnglishFacts(ready), []);
  assert.match(draftOutreach(ready, company, contact).parts.proof, /fresh chili sauce:.*low-sodium recipe.*food safety documentation.*200 cases per SKU/);
});

test("combination options retain product attribution and reject invented broad proof", () => {
  const combined = group();
  const safe = draftOutreach(combined, company, contact);
  const options = approvedOptions({ task: "outreach", project: combined, company, contact });
  assert.equal(validateAIResult("outreach", safe, safe, options), true);
  for (const proof of options["parts.proof"]) {
    assert.match(proof, /Hotpot soup base:/);
    assert.match(proof, /Chili sauce:/);
    assert.doesNotMatch(proof.split("Chili sauce:")[1], /BRC|500 cases/);
  }
  const parts = { ...safe.parts, proof: "All our products are BRC certified with a 500-case MOQ." };
  assert.equal(validateAIResult("outreach", { ...safe, parts, body: Object.values(parts).join("\n\n") }, safe, options), false);
});

test("combination followup values are tied to a product and rotate without copying proof across products", () => {
  const combined = group();
  const firstDraft = draftFollowup(combined, company, contact);
  assert.match(firstDraft.value_key, /^product:/);
  assert.match(firstDraft.body, /Hotpot soup base/);
  const history = { previous_email: draftOutreach(combined, company, contact).body, used_value_keys: [firstDraft.value_key], followups: [firstDraft] };
  const next = draftFollowup(combined, company, contact, history);
  assert.notEqual(next.value_key, firstDraft.value_key);
  const options = approvedOptions({ task: "followup", project: combined, company, contact, history });
  assert.equal(validateAIResult("followup", next, next, options), true);
  for (const key of options.value_key) assert.ok(options[`value.${key}`]?.length);
  const exhausted = draftFollowup(combined, company, contact, { previous_email: "", used_value_keys: ["base", "sauce"].flatMap((id) => ["specifications", "packaging", "flavor", "documentation"].map((key) => `product:${encodeURIComponent(id)}:${key}`)), followups: [] });
  assert.equal(exhausted.value_key, "timing");
});

test("combination analysis exposes unresolved facts and does not treat the union as verified fit for every product", () => {
  const analysis = analyzeBuyer(group(), company, contact);
  assert.ok(analysis.icp_uncertainties.some((item) => item.includes("逐款") && item.includes("组合")));
});

test("single-product settings can confirm MOQ without changing the legacy mail requirement", () => {
  const product = { ...first, moq: "每款二百箱" };
  assert.deepEqual(missingEnglishFacts(product), []);
  assert.deepEqual(missingEnglishFacts(product, true), ["每款二百箱"]);
  assert.deepEqual(missingEnglishFacts(state.project, true), []);
  assert.doesNotMatch(draftOutreach(buildCombinedProject([state.project, second], "demo-group", "2026-10-14", "美国"), company, contact).body, /[\u3400-\u9fff]/);
});

test("AI API rejects malformed or nested combination members before generating", async () => {
  for (const selected_products of [null, [], [null, second], [first], [first, { ...second, advantages: [null] }], [first, { ...second, english_facts: { "低盐配方": 123 } }], [first, { ...second, selected_products: [first, second] }]]) {
    const response = await POST(new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify({ task: "analysis", project: { ...group(), selected_products }, company, contact }) }));
    assert.equal(response.status, 400);
  }
});

test("same Chinese source text can retain a different confirmed expression for each product", () => {
  const a = { ...first, advantages: ["低盐配方"], english_facts: { "低盐配方": "low-sodium recipe" } };
  const b = { ...second, advantages: ["低盐配方"], english_facts: { "低盐配方": "reduced-salt formula" } };
  const draft = draftOutreach(buildCombinedProject([a, b], "combo", "2026-10-14"), company, contact);
  const [baseFacts, sauceFacts] = draft.parts.proof.split("Chili sauce:");
  assert.match(baseFacts, /low-sodium recipe/);
  assert.doesNotMatch(baseFacts, /reduced-salt formula/);
  assert.match(sauceFacts, /reduced-salt formula/);
  assert.doesNotMatch(sauceFacts, /low-sodium recipe/);
});


test("AI API rejects unresolved combination English with a useful response", async () => {
  const project = buildCombinedProject([first, { ...second, advantages: ["尚未确认的产品优势"] }], "unresolved", "2026-10-14");
  for (const task of ["outreach", "followup"]) {
    const response = await POST(new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify({ task, project, company, contact }) }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /英文表达/);
  }
});
