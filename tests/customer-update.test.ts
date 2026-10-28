import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/data/demo.ts";
import { addPublicBuyer, approveDraft, saveDraft, saveProduct, scoreBuyer, selectProduct, selectProductGroup, synchronizeProduct } from "../src/lib/workflow.ts";
import { migrateState } from "../src/lib/persistence.ts";
import { captureCustomerVersion, assertCustomerVersion, customerFields, updateCustomer, validateCustomerReview } from "../src/lib/customer-update.ts";
import type { WebsiteReview } from "../src/lib/discovery-types.ts";
import type { FollowupDraft } from "../src/lib/types.ts";

const now = new Date("2026-10-14T08:00:00Z");
const review: WebsiteReview = { website: "https://buyer.test/", company_name: "Website title must not replace human name", country: "UNKNOWN", company_type: "UNKNOWN", main_products: "UNKNOWN", distribution_channel: "UNKNOWN", public_emails: [{ email: "hello@buyer.test", source_url: "https://buyer.test/contact" }], contact_url: "https://buyer.test/contact", evidence: [{ url: "https://buyer.test/", title: "Buyer", snippet: "Sauces and seasonings", retrieved_at: now.toISOString() }], reviewed_at: now.toISOString() };

test("customer updates rescore associated products and combinations, revoke unsent approvals and preserve human text", () => {
  const seed = createDemoState(now);
  let state = saveProduct(seed, { ...seed.project, product_name: "Chili Sauce" }, seed.icpCriteria, true, now);
  state = selectProductGroup(state, state.products.map(p => p.project.id), "United States", now);
  state = approveDraft(saveDraft(state, { ...seed.drafts[6], status: "draft", body: "Human combination draft" }, now), "lead-7", now);
  const before = synchronizeProduct(state), fields = customerFields(before, "lead-7");
  const changed = updateCustomer(before, "lead-7", { ...fields, company: { ...fields.company, country: "Canada", main_products: "Chili Sauce" } }, { token: captureCustomerVersion(before, "lead-7") }, now);
  for (const workspace of [...changed.products, ...changed.product_groups.map(g => g.workspace)]) {
    const prior = [...before.products, ...before.product_groups.map(g => g.workspace)].find(p => p.project.id === workspace.project.id)!;
    const lead = workspace.leads.find(l => l.id === "lead-7")!, old = prior.leads.find(l => l.id === lead.id)!;
    assert.equal(lead.revision, old.revision + 1);
    assert.deepEqual(lead.scores, scoreBuyer(changed.companies.find(c => c.id === lead.company_id)!, changed.contacts.find(c => c.id === lead.contact_id)!, workspace.project).scores);
    assert.equal(lead.outreach_approved, false);
    assert.equal(lead.ai_analysis, undefined); assert.equal(lead.analysis_meta, undefined);
    const draft = workspace.drafts.find(d => d.lead_id === lead.id);
    if (draft) { assert.equal(draft.status, "draft"); assert.equal(draft.body, prior.drafts.find(d => d.lead_id === lead.id)!.body); }
    assert.deepEqual(workspace.activities.slice(0, prior.activities.length), prior.activities);
    assert.equal(workspace.leads.find(l => l.id === "lead-8"), prior.leads.find(l => l.id === "lead-8"));
  }
  assert.equal(changed.drafts[0].body, "Human combination draft");
  assert.equal(changed.companies.find(c => c.id === fields.company_id)!.dataset, before.companies.find(c => c.id === fields.company_id)!.dataset);
});

test("sent email history, milestones, followup dates and closed statuses survive shared updates", () => {
  let state = createDemoState(now);
  const lead = state.leads.find(l => l.id === "lead-1")!;
  state = { ...state, leads: state.leads.map(l => l === lead ? { ...l, status: "Won", next_followup_date: "2026-10-20T00:00:00Z", ai_analysis: state.leads[0].ai_analysis } : l) };
  const fields = customerFields(state, lead.id), sent = state.drafts.find(d => d.lead_id === lead.id)!;
  const changed = updateCustomer(state, lead.id, { ...fields, contact: { ...fields.contact, title: "" } }, {}, now);
  assert.equal(changed.leads[0].status, "Won"); assert.equal(changed.leads[0].next_followup_date, "2026-10-20T00:00:00Z");
  assert.equal(changed.drafts.find(d => d.lead_id === lead.id), sent);
  assert.deepEqual(changed.activities.slice(0, state.activities.length), state.activities);
  assert.equal(changed.contacts.find(c => c.id === lead.contact_id)!.decision_maker_score, 0);
});

test("unchanged saves are an exact no-op and do not create metadata or revoke approvals", () => {
  const state = createDemoState(now);
  assert.equal(updateCustomer(state, "lead-7", customerFields(state, "lead-7"), {}, now), state);
});

test("blank fields become UNKNOWN, do not invent authority and round-trip through persistence", () => {
  const state = createDemoState(now), fields = customerFields(state, "lead-7");
  const changed = updateCustomer(state, "lead-7", { ...fields, company: { ...fields.company, country: "", company_type: "UNKNOWN", website: "", city: "" }, contact: { ...fields.contact, first_name: "", last_name: "", title: "", email: "" } }, {}, now);
  assert.equal(changed.companies.find(c => c.id === fields.company_id)!.country, "UNKNOWN");
  assert.equal(changed.contacts.find(c => c.id === fields.contact_id)!.decision_maker_score, 0);
  assert.equal(changed.leads.find(l => l.id === "lead-7")!.scores.decision_maker, 0);
  const restored = migrateState(JSON.parse(JSON.stringify(changed)));
  assert.equal(restored.companies.find(c => c.id === fields.company_id)!.updated_at, now.toISOString());
  assert.equal(restored.leads.find(l => l.id === "lead-7")!.scores.icp_fit, 0);
});

test("editing one shared company does not add it to products where no lead exists", () => {
  let state = addPublicBuyer(createDemoState(now), review, { company_name: "Human name", country: "United States", company_type: "Importer", main_products: "Hotpot soup base", distribution_channel: "Wholesale" }, now);
  const firstId = state.project.id, leadId = state.leads.at(-1)!.id;
  state = saveProduct(state, { ...state.project, product_name: "Chili Sauce" }, state.icpCriteria, true, now);
  assert.equal(state.leads.some(l => l.id === leadId), false);
  state = selectProduct(state, firstId);
  const fields = customerFields(state, leadId);
  const changed = updateCustomer(state, leadId, { ...fields, company: { ...fields.company, city: "New York" } }, {}, now);
  assert.equal(changed.products.find(p => p.project.id !== firstId)!.leads.some(l => l.id === leadId), false);
  assert.equal(changed.leads.find(l => l.id === leadId)!.scores.decision_maker, 0);
});

test("website refresh is explicit, preserves human company name and email remains unverified", () => {
  const state = addPublicBuyer(createDemoState(now), review, { company_name: "Human name", country: "United States", company_type: "Importer", main_products: "Hotpot soup base", distribution_channel: "Wholesale" }, now);
  const id = state.leads.at(-1)!.id, fields = customerFields(state, id), token = captureCustomerVersion(state, id);
  const checked = validateCustomerReview(review);
  assert.equal(state.companies.at(-1)!.company_name, "Human name");
  const changed = updateCustomer(state, id, { ...fields, contact: { ...fields.contact, email: "hello@buyer.test" } }, { token, review: checked }, now);
  assert.equal(changed.companies.at(-1)!.company_name, "Human name");
  assert.equal(changed.contacts.at(-1)!.email_status, "public_unverified");
  assert.equal(changed.contacts.at(-1)!.source_url, "https://buyer.test/contact");
  assert.equal(changed.contacts.at(-1)!.decision_maker_score, 0);
  assert.equal(changed.companies.at(-1)!.public_contact_url, review.contact_url);
  assert.doesNotThrow(() => migrateState(JSON.parse(JSON.stringify(changed))));
});

test("old review and old form cannot overwrite changed facts or A-B-A selection", () => {
  const seed = createDemoState(now), token = captureCustomerVersion(seed, "lead-7"), fields = customerFields(seed, "lead-7");
  const changed = updateCustomer(seed, "lead-7", { ...fields, company: { ...fields.company, city: "Changed" } }, {}, now);
  assert.throws(() => assertCustomerVersion(changed, token), /已变化/);
  assert.throws(() => updateCustomer(changed, "lead-7", fields, { token, review }, now), /已变化/);
  const two = saveProduct(seed, { ...seed.project, product_name: "Chili Sauce" }, seed.icpCriteria, true, now);
  const returned = selectProduct(two, seed.project.id);
  assert.throws(() => updateCustomer(returned, "lead-7", fields, { token }, now), /已变化/);
});

test("invalid review, website or editable fields fail without changing state", () => {
  const state = createDemoState(now), fields = customerFields(state, "lead-7");
  assert.throws(() => validateCustomerReview({ error: "failed" }), /核验/);
  assert.throws(() => validateCustomerReview({ ...review, evidence: [] }), /核验/);
  assert.throws(() => validateCustomerReview({ ...review, contact_url: "javascript:alert(1)" }), /核验/);
  assert.throws(() => updateCustomer(state, "lead-7", { ...fields, company: { ...fields.company, website: "javascript:alert(1)" } }, {}, now), /官网/);
  assert.throws(() => updateCustomer(state, "lead-7", { ...fields, company: { ...fields.company, company_name: "" } }, {}, now), /名称/);
  assert.throws(() => updateCustomer(state, "lead-7", { ...fields, contact: { ...fields.contact, email: "not an email" } }, {}, now), /邮箱/);
});

test("manually replacing a previously public email removes its old source claim", () => {
  const state = addPublicBuyer(createDemoState(now), review, { company_name: "Human name", country: "United States", company_type: "Importer", main_products: "Hotpot soup base", distribution_channel: "Wholesale", email: "hello@buyer.test" }, now);
  const id = state.leads.at(-1)!.id, fields = customerFields(state, id);
  const next = updateCustomer(state, id, { ...fields, contact: { ...fields.contact, email: "manual@buyer.test" } }, {}, now);
  assert.equal(next.contacts.at(-1)!.email_status, undefined); assert.equal(next.contacts.at(-1)!.source_url, undefined);
  assert.equal(next.contacts.at(-1)!.decision_maker_score, 0);
  assert.doesNotThrow(() => migrateState(JSON.parse(JSON.stringify(next))));
});

test("related unsent followups lose review while sent followups remain identical", () => {
  const seed = createDemoState(now), fields = customerFields(seed, "lead-1");
  const followup: FollowupDraft = { id: "human-followup", lead_id: "lead-1", subject: "Subject", body: "Human followup body", status: "approved", revision: 8, value_key: "human", meta: { source: "local", generated_at: now.toISOString(), project_revision: seed.project_revision } };
  const sent: FollowupDraft = { ...followup, id: "sent-followup", status: "sent" };
  const state = { ...seed, followup_drafts: [followup, sent] };
  const changed = updateCustomer(state, "lead-1", { ...fields, company: { ...fields.company, main_products: "Chili Sauce" } }, {}, now);
  assert.equal(changed.followup_drafts[0].status, "draft"); assert.equal(changed.followup_drafts[0].revision, 9);
  assert.equal(changed.followup_drafts[0].body, followup.body); assert.equal(changed.followup_drafts[1], sent);
  assert.equal(changed.drafts.find(d => d.lead_id === "lead-1"), seed.drafts.find(d => d.lead_id === "lead-1"));
});

test("all company leads rescore against their own contact and unaffected workspaces keep their revisions", () => {
  let state = createDemoState(now);
  const fields = customerFields(state, "lead-7");
  const otherContact = { ...state.contacts.find(c => c.id === fields.contact_id)!, id: "other-contact", title: "UNKNOWN", decision_maker_score: 0 };
  const otherLead = { ...state.leads.find(l => l.id === "lead-7")!, id: "other-lead", contact_id: otherContact.id, outreach_approved: false, status: "Researched" as const };
  state = { ...state, contacts: [...state.contacts, otherContact], leads: [...state.leads, otherLead] };
  const changed = updateCustomer(state, "lead-7", { ...fields, company: { ...fields.company, main_products: "Unknown product" } }, {}, now);
  const updated = changed.leads.find(l => l.id === otherLead.id)!;
  assert.equal(updated.scores.decision_maker, 0); assert.equal(updated.revision, otherLead.revision + 1);
  assert.equal(changed.contacts.find(c => c.id === otherContact.id), otherContact);
  const trimmed = synchronizeProduct({ ...changed, leads: changed.leads.filter(l => l.company_id !== fields.company_id), drafts: changed.drafts.filter(d => d.lead_id !== "lead-7"), activities: changed.activities.filter(a => !["lead-7", "other-lead"].includes(a.lead_id)) });
  // Snapshot without this customer is not silently populated on another product's edit.
  const two = saveProduct(trimmed, { ...trimmed.project, product_name: "Chili Sauce" }, trimmed.icpCriteria, true, now);
  assert.equal(two.products[0].leads.some(l => l.company_id === fields.company_id), false);
});

test("optional customer metadata is validated while existing records remain compatible", () => {
  const state = createDemoState(now);
  for (const patch of [{ customer_revision: -1 }, { customer_revision: 1.5 }, { updated_at: "invalid" }, { update_source: "verified" }, { public_contact_url: "javascript:alert(1)" }]) {
    assert.throws(() => migrateState({ ...state, companies: state.companies.map((c, index) => index ? c : { ...c, ...patch }) }));
  }
  assert.doesNotThrow(() => migrateState(JSON.parse(JSON.stringify(state))));
});

test("unknown website results preserve manually confirmed facts and cannot relabel demo customers", () => {
  const state = createDemoState(now), fields = customerFields(state, "lead-7");
  const next = updateCustomer(state, "lead-7", { ...fields, company: { ...fields.company, website: review.website }, contact: { ...fields.contact, email: "hello@buyer.test" } }, { token: captureCustomerVersion(state, "lead-7"), review }, now);
  const company = next.companies.find(c => c.id === fields.company_id)!, contact = next.contacts.find(c => c.id === fields.contact_id)!;
  assert.equal(company.country, fields.company.country); assert.equal(company.main_products, fields.company.main_products); assert.equal(company.company_name, fields.company.company_name);
  assert.equal(company.dataset, state.companies.find(c => c.id === fields.company_id)!.dataset);
  assert.equal(contact.email_status, undefined); assert.equal(contact.decision_maker_score, 0);
  assert.doesNotThrow(() => migrateState(JSON.parse(JSON.stringify(next))));
});
