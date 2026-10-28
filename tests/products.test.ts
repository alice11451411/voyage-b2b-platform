import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/data/demo.ts";
import { addPublicBuyer, approveDraft, assertVersion, captureVersion, markSent, resetDemo, saveBusinessProfile, saveDraft, saveProduct, scoreBuyer, selectProduct, selectProductGroup, synchronizeProduct } from "../src/lib/workflow.ts";
import { CATALOG_BACKUP_KEY, SCORING_BACKUP_KEY, STORAGE_KEY, loadState, migrateState } from "../src/lib/persistence.ts";
import type { WebsiteReview } from "../src/lib/discovery-types.ts";

const now = new Date("2026-10-14T08:00:00Z");
function secondProduct() {
  const first = createDemoState(now);
  return saveProduct(first, { ...first.project, product_name: "辣酱 / Chili Sauce" }, first.icpCriteria, true, now);
}
function legacyV2() {
  const value = JSON.parse(JSON.stringify(createDemoState(now)));
  delete value.catalog_version; delete value.business_profile; delete value.products; delete value.selection_revision;
  delete value.project.product_confirmed;
  return value;
}
test("new products retain the first product and start independent development records", () => {
  const seed = createDemoState(now), next = secondProduct();
  assert.equal(next.products.length, 2);
  assert.notEqual(next.project.id, seed.project.id);
  assert.equal(next.project.product_confirmed, true);
  assert.equal(next.drafts.length, 0); assert.equal(next.activities.length, 0);
  assert.ok(next.leads.every(l => l.status === "Identified" && !l.outreach_approved));
  const original = selectProduct(next, seed.project.id);
  assert.deepEqual(original.drafts, seed.drafts); assert.deepEqual(original.activities, seed.activities);
  assert.deepEqual(original.leads, seed.leads);
  assert.ok(original.companies.every(c => c.project_id === seed.project.id));
});
test("human drafts persist across switching and reload, and product edits affect only their own review", () => {
  const seed = createDemoState(now);
  const edited = saveDraft(seed, { ...seed.drafts[6], body: "Original human draft" }, now);
  const added = saveProduct(edited, { ...seed.project, product_name: "Chili sauce" }, seed.icpCriteria, true, now);
  const changed = saveProduct(added, { ...added.project, description: "新的辣酱说明" }, added.icpCriteria, false, now);
  const restored = selectProduct(migrateState(JSON.parse(JSON.stringify(synchronizeProduct(changed)))), seed.project.id);
  assert.equal(restored.drafts[6].body, "Original human draft");
  assert.equal(restored.project_revision, seed.project_revision);
  assert.equal(restored.drafts[0].status, "sent");
});
test("switch A to B to A rejects an old in-flight result without invalidating saved approvals", () => {
  const seed = createDemoState(now), token = captureVersion(seed, "lead-7");
  const restored = selectProduct(secondProduct(), seed.project.id);
  assert.throws(() => assertVersion(restored, token), /未覆盖/);
  assert.equal(restored.drafts[6].status, "approved");
  assert.equal(restored.drafts[6].meta?.project_revision, restored.project_revision);
});
test("shared enterprise changes retain texts and sent history, while unchanged confirmation preserves approvals", () => {
  const seed = createDemoState(now);
  const confirmed = saveBusinessProfile(seed, { company_name: seed.project.company_name, description: "" }, now);
  assert.equal(confirmed.business_profile.confirmed, true);
  assert.equal(confirmed.project.product_confirmed, false);
  assert.equal(confirmed.project_revision, 0); assert.equal(confirmed.drafts[6].status, "approved");
  assert.equal(Object.hasOwn(confirmed.project, "company_description"), false);
  assert.equal(saveBusinessProfile(confirmed, { company_name: confirmed.project.company_name, description: "" }, now), confirmed);
  const added = saveProduct(confirmed, { ...confirmed.project, product_name: "Chili sauce" }, confirmed.icpCriteria, true, now);
  const renamed = saveBusinessProfile(added, { company_name: "真实食品公司", description: "供应商简介" }, now);
  assert.ok(renamed.products.every(p => p.project.company_name === "真实食品公司" && p.project.company_description === "供应商简介"));
  const first = selectProduct(renamed, seed.project.id);
  assert.equal(first.drafts[6].status, "draft"); assert.equal(first.drafts[6].body, seed.drafts[6].body);
  assert.equal(first.drafts[0].status, "sent"); assert.deepEqual(first.activities, seed.activities);
});
test("unchanged product save after JSON reload preserves approval and revision", () => {
  const state = migrateState(JSON.parse(JSON.stringify(createDemoState(now))));
  const saved = saveProduct(state, { ...state.project }, state.icpCriteria, false, now);
  assert.equal(state.project.product_confirmed, false);
  assert.equal(saved.project.product_confirmed, true);
  assert.equal(saved.drafts[6].status, "approved"); assert.equal(saved.project_revision, 0);
  assert.deepEqual(saved.drafts, state.drafts); assert.deepEqual(saved.activities, state.activities);
  assert.equal(saveProduct(saved, { ...saved.project }, saved.icpCriteria, false, now), saved);
});
test("legacy confirmation is inferred without changing history or review", () => {
  const old = legacyV2();
  assert.equal(migrateState(old).project.product_confirmed, false);
  old.project.company_name = "实际食品供应商";
  assert.equal(migrateState(old).project.product_confirmed, true);
  const catalog = JSON.parse(JSON.stringify(createDemoState(now)));
  delete catalog.project.product_confirmed; delete catalog.products[0].project.product_confirmed;
  assert.equal(migrateState(catalog).project.product_confirmed, false);
  catalog.business_profile = { company_name: "实际食品供应商", description: "", confirmed: true };
  assert.equal(migrateState(catalog).products[0].project.product_confirmed, true);
});
test("legacy v2 upgrade preserves work and backs up the original before saving a catalog", () => {
  const old = legacyV2(); old.drafts[6].body = "Human legacy text";
  const raw = JSON.stringify(old), entries = new Map([[STORAGE_KEY, raw]]);
  const loaded = loadState({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } }, now);
  assert.equal(entries.get(CATALOG_BACKUP_KEY), raw); assert.equal(loaded.state.products.length, 1);
  assert.equal(loaded.state.products[0].drafts[6].body, "Human legacy text");
  assert.equal(JSON.parse(entries.get(STORAGE_KEY)!).catalog_version, 1);
});
test("failed legacy backup leaves the sole original untouched and disables persistence", () => {
  const raw = JSON.stringify(legacyV2()), entries = new Map([[STORAGE_KEY, raw]]);
  const loaded = loadState({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { if (key === CATALOG_BACKUP_KEY) throw new Error("full"); entries.set(key, value); } }, now);
  assert.equal(entries.get(STORAGE_KEY), raw); assert.equal(loaded.canPersist, false);
  assert.match(loaded.warning, /备份/);
});
test("invalid catalogs are rejected rather than silently dropping saved products", () => {
  const state = secondProduct();
  for (const patch of [{ products: [] }, { products: [state.products[0], state.products[0]] }, { business_profile: null }, { selection_revision: -1 }]) assert.throws(() => migrateState({ ...state, ...patch }));
  const broken = JSON.parse(JSON.stringify(state)); delete broken.products[0].drafts;
  assert.throws(() => migrateState(broken));
  assert.throws(() => migrateState({ ...state, products: [{ ...state.products[0], business_profile: state.business_profile }, state.products[1]] }));
  assert.throws(() => selectProduct(state, "missing"));
});
test("reset restores one unconfirmed demo product with the new identity and matching revision", () => {
  const reset = resetDemo(secondProduct(), now);
  assert.equal(reset.products.length, 1); assert.equal(reset.business_profile.confirmed, false);
  assert.equal(reset.project.product_confirmed, false);
  assert.equal(reset.products[0].project.id, reset.project.id);
  assert.deepEqual(reset.products[0].drafts, reset.drafts);
  assert.equal(reset.products[0].project_revision, reset.project_revision);
  assert.deepEqual(reset.product_groups, []);
});

test("single products and their reusable combination keep independent records through reload", () => {
  const seed = createDemoState(now), second = secondProduct(), ids = second.products.map(p => p.project.id);
  const group = selectProductGroup(second, ids, "United States", now), token = captureVersion(group, "lead-7");
  assert.equal(group.product_groups.length, 1); assert.equal(group.products.length, 2);
  assert.equal(group.project_revision, 0); assert.equal(group.activities.length, 0);
  assert.ok(group.leads.every(l => l.status === "Identified" && l.revision === 0));
  assert.equal(group.project.selected_products?.length, 2);
  const drafted = saveDraft(group, { ...seed.drafts[6], status: "draft", body: "Combination human text" }, now);
  const approved = approveDraft(drafted, "lead-7", now);
  const sent = markSent(approved, "lead-7", now);
  const a = selectProduct(sent, seed.project.id);
  assert.deepEqual(a.activities, seed.activities); assert.deepEqual(a.drafts, seed.drafts);
  const b = selectProduct(a, ids.find(id => id !== seed.project.id)!);
  assert.equal(b.activities.length, 0); assert.equal(b.drafts.length, 0);
  const reloaded = migrateState(JSON.parse(JSON.stringify(synchronizeProduct(b))));
  const restored = selectProductGroup(reloaded, [...ids].reverse().concat(ids[0]), "United States", now);
  assert.equal(restored.project.id, group.project.id); assert.equal(restored.product_groups.length, 1);
  assert.equal(restored.drafts[0].body, "Combination human text"); assert.equal(restored.drafts[0].status, "sent");
  assert.throws(() => assertVersion(restored, token), /未覆盖/);
});
test("updating a selected product revokes combination review while preserving drafted and sent texts", () => {
  const seed = createDemoState(now), second = secondProduct(), ids = second.products.map(p => p.project.id);
  let group = selectProductGroup(second, ids, "United States", now);
  group = approveDraft(saveDraft(group, { ...seed.drafts[6], body: "Unsent combination" }, now), "lead-7", now);
  group = markSent(approveDraft(saveDraft(group, { ...seed.drafts[0], status: "draft", body: "Sent combination" }, now), "lead-1", now), "lead-1", now);
  const b = selectProduct(group, second.project.id);
  const edited = saveProduct(b, { ...b.project, description: "新的辣酱资料" }, b.icpCriteria, false, now);
  const restored = selectProductGroup(edited, ids, "United States", now);
  assert.equal(restored.project.id, group.project.id); assert.equal(restored.project_revision, 1);
  assert.equal(restored.drafts.find(d => d.lead_id === "lead-7")?.status, "draft");
  assert.equal(restored.drafts.find(d => d.lead_id === "lead-7")?.body, "Unsent combination");
  assert.equal(restored.drafts.find(d => d.lead_id === "lead-1")?.status, "sent");
  assert.deepEqual(restored.activities, group.activities);
});
test("confirming a member without changing its facts preserves combination approval and repeated selection", () => {
  const seed = createDemoState(now), second = secondProduct(), ids = second.products.map(p => p.project.id);
  const initial = selectProductGroup(second, ids, "United States", now);
  const approved = approveDraft(saveDraft(initial, { ...seed.drafts[6], body: "Already reviewed combination" }, now), "lead-7", now);
  const a = selectProduct(approved, seed.project.id);
  const confirmed = saveProduct(a, { ...a.project }, a.icpCriteria, false, now);
  const restored = selectProductGroup(confirmed, ids, "United States", now);
  assert.equal(restored.project_revision, 0); assert.equal(restored.drafts[0].status, "approved");
  assert.equal(restored.project.product_confirmed, true);
  assert.equal(selectProductGroup(restored, ids.reverse(), "United States", now), restored);
  const reloaded = migrateState(JSON.parse(JSON.stringify(restored)));
  assert.equal(selectProductGroup(reloaded, ids, "United States", now).project_revision, 0);
});
test("enterprise changes update active combinations and their members without losing history", () => {
  const seed = createDemoState(now), second = secondProduct(), ids = second.products.map(p => p.project.id);
  const group = selectProductGroup(second, ids, "Canada", now);
  const drafted = saveDraft(group, { ...seed.drafts[6], body: "Keep this combination text" }, now);
  const renamed = saveBusinessProfile(drafted, { company_name: "新供应商", description: "企业介绍" }, now);
  assert.equal(renamed.project.id, group.project.id); assert.equal(renamed.project.company_name, "新供应商");
  assert.ok(renamed.project.selected_products?.every(p => p.company_name === "新供应商"));
  assert.equal(renamed.project.target_country, "Canada");
  assert.equal(renamed.drafts[0].body, "Keep this combination text");
});
test("each combination target market has independent records and survives member market changes", () => {
  const second = secondProduct(), ids = second.products.map(p => p.project.id);
  const us = selectProductGroup(second, ids, "United States", now);
  const canada = selectProductGroup(us, ids, "Canada", now);
  assert.notEqual(canada.project.id, us.project.id); assert.equal(canada.product_groups.length, 2);
  const b = selectProduct(canada, second.project.id);
  const edited = saveProduct(b, { ...b.project, target_country: "Germany" }, b.icpCriteria, false, now);
  const restored = selectProductGroup(edited, ids, "Canada", now);
  assert.equal(restored.project.id, canada.project.id); assert.equal(restored.project.target_country, "Canada");
  assert.equal(selectProductGroup(restored, [second.project.id], "Canada", now).project.target_country, "Germany");
});
test("migration defaults previous catalogs to no combinations and rejects invalid group identities or members", () => {
  const old = JSON.parse(JSON.stringify(secondProduct())); delete old.product_groups;
  assert.deepEqual(migrateState(old).product_groups, []);
  const single = secondProduct(), group = selectProductGroup(single, [single.products[0].project.id]);
  assert.equal(group.product_groups.length, 0);
  const second = secondProduct(), ids = second.products.map(p => p.project.id), state = selectProductGroup(second, ids, "United States", now);
  const valid = state.product_groups[0];
  for (const invalid of [{ ...valid, product_ids: [ids[0]] }, { ...valid, product_ids: [ids[0], ids[0]] }, { ...valid, product_ids: [ids[0], "missing"] }, { ...valid, workspace: { ...valid.workspace, project: { ...valid.workspace.project, id: ids[0] } } }]) assert.throws(() => migrateState({ ...state, product_groups: [invalid] }));
  assert.throws(() => selectProductGroup(state, []));
  assert.throws(() => selectProductGroup(state, [ids[0], "missing"]));
});

const publicReview: WebsiteReview = {
  website: "https://pantry-imports.com/", company_name: "Public Pantry Imports", country: "United States", company_type: "Importer",
  main_products: "Hotpot bases and Asian seasonings", distribution_channel: "Retail stores", contact_url: "https://pantry-imports.com/contact",
  public_emails: [{ email: "sales@pantry-imports.com", source_url: "https://pantry-imports.com/contact" }],
  evidence: [{ url: "https://pantry-imports.com/", title: "Product categories", snippet: "Importer of hotpot bases for retail stores in the United States.", retrieved_at: now.toISOString() }], reviewed_at: now.toISOString(),
};
const confirmedPublic = { company_name: publicReview.company_name, country: "United States", company_type: "Importer" as const, main_products: publicReview.main_products, distribution_channel: publicReview.distribution_channel, email: "sales@pantry-imports.com" };
test("public website customers are shared once but join only the selected product or combination", () => {
  const seed = createDemoState(now), added = addPublicBuyer(seed, publicReview, confirmedPublic, now);
  assert.equal(added.companies.length, 17); assert.equal(added.contacts.length, 17); assert.equal(added.leads.length, 17);
  const publicLead = added.leads.find(l => added.companies.find(c => c.id === l.company_id)?.dataset === "public")!;
  assert.equal(publicLead.status, "Researched"); assert.equal(publicLead.scores.intent, 0); assert.equal(publicLead.scores.decision_maker, 0);
  assert.equal(addPublicBuyer(added, { ...publicReview, website: "https://www.pantry-imports.com/catalog" }, confirmedPublic, now), added);
  const b = saveProduct(added, { ...seed.project, product_name: "Chili sauce" }, seed.icpCriteria, true, now);
  assert.equal(b.leads.length, 16); assert.ok(!b.leads.some(l => l.id === publicLead.id));
  const bAdded = addPublicBuyer(b, publicReview, confirmedPublic, now);
  assert.equal(bAdded.companies.length, 17); assert.equal(bAdded.contacts.length, 17); assert.equal(bAdded.leads.length, 17);
  const ids = bAdded.products.map(p => p.project.id);
  const group = selectProductGroup(bAdded, ids, "United States", now);
  assert.equal(group.leads.length, 16);
  const groupAdded = addPublicBuyer(group, publicReview, confirmedPublic, now);
  assert.equal(groupAdded.leads.length, 17); assert.equal(groupAdded.companies.length, 17);
  const restored = selectProduct(migrateState(JSON.parse(JSON.stringify(synchronizeProduct(groupAdded)))), seed.project.id);
  assert.equal(restored.leads.length, 17);
  assert.equal(restored.contacts.find(c => c.company_id === publicLead.company_id)?.email_status, "public_unverified");
  assert.equal(restored.contacts.find(c => c.company_id === publicLead.company_id)?.source_url, publicReview.public_emails[0].source_url);
});
test("public customers never inherit demo intent or role scores, and unknown fields stay unknown", () => {
  const added = addPublicBuyer(createDemoState(now), publicReview, { ...confirmedPublic, country: "UNKNOWN", company_type: "UNKNOWN", email: undefined }, now);
  const company = added.companies.find(c => c.dataset === "public")!, contact = added.contacts.find(c => c.company_id === company.id)!;
  assert.equal(contact.email, "UNKNOWN"); assert.equal(contact.email_status, undefined);
  const score = scoreBuyer({ ...company, id: "company-1" }, { ...contact, title: "Head of Purchasing", decision_maker_score: 15 }, added.project);
  assert.equal(score.scores.icp_fit, 0); assert.equal(score.scores.intent, 0); assert.equal(score.scores.decision_maker, 0);
  assert.throws(() => addPublicBuyer(createDemoState(now), publicReview, { ...confirmedPublic, email: "invented@pantry-imports.com" }, now), /邮箱/);
});
test("deterministic product matching distinguishes hotpot from chili without inventing flavor-specific customers", () => {
  const seed = createDemoState(now), hotpot = seed.project, chili = { ...seed.project, product_name: "Chili sauce", product_category: "Chili sauces / 辣酱" };
  const hotpotBuyer = seed.companies[3], chiliBuyer = seed.companies[2];
  const hotpotContact = seed.contacts[3], chiliContact = seed.contacts[2];
  assert.ok(scoreBuyer(hotpotBuyer, hotpotContact, hotpot).scores.product_fit > scoreBuyer(hotpotBuyer, hotpotContact, chili).scores.product_fit);
  assert.ok(scoreBuyer(chiliBuyer, chiliContact, chili).scores.product_fit > scoreBuyer(chiliBuyer, chiliContact, hotpot).scores.product_fit);
  assert.ok(scoreBuyer(seed.companies[12], seed.contacts[12], chili).scores.product_fit < 20);
  assert.equal(scoreBuyer(hotpotBuyer, hotpotContact, hotpot).scores.product_fit, scoreBuyer(hotpotBuyer, hotpotContact, { ...hotpot, product_name: "麻辣火锅底料" }).scores.product_fit);
  assert.deepEqual(seed.leads.map(l => l.id), createDemoState(now).leads.map(l => l.id));
});
test("scoring upgrade backs up previous catalog records and preserves approved text and history", () => {
  const previous = JSON.parse(JSON.stringify(createDemoState(now))); delete previous.scoring_version;
  previous.leads[2].scores.product_fit = 25; previous.leads[2].total_score = 75;
  previous.products[0].leads = previous.leads;
  const raw = JSON.stringify(previous), originalBackup = "earlier raw enterprise information";
  const entries = new Map([[STORAGE_KEY, raw], [CATALOG_BACKUP_KEY, originalBackup]]);
  const loaded = loadState({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } }, now);
  assert.equal(entries.get(CATALOG_BACKUP_KEY), originalBackup); assert.equal(entries.get(SCORING_BACKUP_KEY), raw);
  assert.equal(loaded.state.leads[2].scores.product_fit, 5);
  assert.deepEqual(loaded.state.activities, previous.activities); assert.deepEqual(loaded.state.drafts, previous.drafts);
  assert.equal(loaded.state.project_revision, previous.project_revision); assert.equal(loaded.state.drafts[6].status, "approved");
  const failure = loadState({ getItem: key => key === STORAGE_KEY ? raw : null, setItem: () => { throw new Error("quota"); } }, now);
  assert.equal(failure.canPersist, false); assert.match(failure.warning, /备份/);
});
test("public evidence and unverified email metadata are validated before restoring saved records", () => {
  const state = addPublicBuyer(createDemoState(now), publicReview, confirmedPublic, now);
  for (const patch of [{ research_evidence: [{ ...publicReview.evidence[0], retrieved_at: "invalid" }] }, { dataset: "unknown" }, { research_evidence: [{ ...publicReview.evidence[0], url: "javascript:bad" }] }]) {
    const broken = JSON.parse(JSON.stringify(state)); Object.assign(broken.companies.find((c: { dataset?: string }) => c.dataset === "public"), patch);
    assert.throws(() => migrateState(broken));
  }
  const broken = JSON.parse(JSON.stringify(state)); broken.contacts.at(-1).source_url = "javascript:bad";
  assert.throws(() => migrateState(broken));
});
