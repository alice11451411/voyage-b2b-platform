import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/data/demo.ts";
import { applyImportedCompany, type ImportedCompanyInput } from "../src/lib/import-workflow.ts";
import { migrateState } from "../src/lib/persistence.ts";
import { saveBusinessProfile, saveProduct, selectProduct, selectProductGroup, synchronizeProduct } from "../src/lib/workflow.ts";

const now = new Date("2026-10-14T10:00:00Z");
function input(company_name: string): ImportedCompanyInput {
  return { company_name, company_description: "", products: [
    { product_name: "Hotpot soup base", product_category: "Hotpot bases", description: "Foodservice soup base", advantages: [], certifications: [], moq: "", target_country: "United States", target_buyer_type: "Importer", icpCriteria: "Food importers" },
    { product_name: "Chili sauce", product_category: "Chili sauces", description: "Retail chili sauce", advantages: ["Retail packaging"], certifications: [], moq: "", target_country: "Canada", target_buyer_type: "Distributor", icpCriteria: "Food distributors" },
  ] };
}

test("confirmed document import appends all products and retains existing history and approvals when enterprise is unchanged", () => {
  const seed = createDemoState(now);
  const existing = saveBusinessProfile(seed, { company_name: seed.project.company_name, description: "" }, now);
  const imported = applyImportedCompany(existing, input(existing.business_profile.company_name), now);
  assert.equal(imported.products.length, existing.products.length + 2);
  assert.equal(new Set(imported.products.map(item => item.project.id)).size, 3);
  assert.equal(imported.project.product_name, "Chili sauce");
  assert.equal(imported.project.target_country, "Canada");
  assert.deepEqual(imported.project.certifications, []);
  assert.equal(imported.project.moq, "");
  assert.equal(imported.project.product_confirmed, true);
  assert.equal(imported.drafts.length, 0);
  assert.equal(imported.activities.length, 0);
  const restored = selectProduct(migrateState(JSON.parse(JSON.stringify(synchronizeProduct(imported)))), existing.project.id);
  assert.equal(JSON.stringify(restored.drafts), JSON.stringify(existing.drafts));
  assert.equal(JSON.stringify(restored.activities), JSON.stringify(existing.activities));
  assert.equal(JSON.stringify(restored.leads), JSON.stringify(existing.leads));
});

test("all imported products are validated before any enterprise or product state is saved", () => {
  const seed = createDemoState(now), before = JSON.stringify(seed), invalid = input("Changed supplier");
  invalid.products[1].target_country = "";
  assert.throws(() => applyImportedCompany(seed, invalid, now), /第 2 款|目标市场/);
  assert.equal(JSON.stringify(seed), before);
  assert.throws(() => applyImportedCompany(seed, { ...input("Supplier"), products: [] }, now), /至少/);
  assert.throws(() => applyImportedCompany(seed, input(""), now), /企业/);
});

test("confirmed shared enterprise changes retain human text and sent history while invalidating unsent approvals", () => {
  const seed = createDemoState(now), old = seed.drafts.find(draft => draft.status === "approved")!;
  const next = applyImportedCompany(seed, { ...input("Real supplier"), company_description: "Owner supplied company facts" }, now);
  const original = selectProduct(next, seed.project.id);
  const draft = original.drafts.find(item => item.lead_id === old.lead_id)!;
  assert.equal(draft.body, old.body);
  assert.equal(draft.status, "draft");
  assert.deepEqual(original.drafts.filter(item => item.status === "sent"), seed.drafts.filter(item => item.status === "sent"));
  assert.deepEqual(original.activities, seed.activities);
  assert.ok(next.products.every(item => item.project.company_name === "Real supplier"));
  assert.ok(next.products.every(item => item.project.company_description === "Owner supplied company facts"));
});

test("import from an active combination creates single products without changing the saved combination", () => {
  const seed = createDemoState(now);
  const second = saveProduct(seed, { ...seed.project, product_name: "Chili sauce" }, seed.icpCriteria, true, now);
  const combined = selectProductGroup(second, [seed.project.id, second.project.id], "United States", now);
  const savedGroup = combined.product_groups[0];
  const next = applyImportedCompany(combined, input(combined.business_profile.company_name), now);
  assert.equal(next.products.length, 4);
  assert.equal(next.product_groups.length, 1);
  assert.deepEqual(next.product_groups[0], savedGroup);
  assert.equal(next.project.selected_products, undefined);
  assert.equal(next.project.product_name, "Chili sauce");
});
