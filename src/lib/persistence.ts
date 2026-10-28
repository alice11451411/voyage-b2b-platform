import { createDemoState, type DemoState } from "../data/demo.ts";
import { ACTIVITY_ZH, COMPANY_TYPE_ZH, PIPELINE_STAGES, type Activity, type ArtifactMeta, type BusinessProfile, type FollowupDraft, type PipelineStage, type ProductWorkspace, type Project } from "./types.ts";
import { isSupportedProduct, scoreBuyer, synchronizeProduct } from "./workflow.ts";

export const STORAGE_KEY = "voyage-buyer-demo-v2";
export const LEGACY_KEY = "voyage-buyer-demo-v1";
export const CATALOG_BACKUP_KEY = "voyage-buyer-demo-v2-before-products";
export const SCORING_BACKUP_KEY = "voyage-buyer-demo-v2-before-scoring-v2";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, fields: string[]) => record(v) && fields.every(k => typeof v[k] === "string");
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const stringArray = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string");
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
const stage = (v: unknown) => PIPELINE_STAGES.includes(v as PipelineStage);
const meta = (v: unknown) => record(v) && ["local", "live", "fallback", "legacy"].includes(String(v.source)) && date(v.generated_at) && number(v.project_revision) && (v.message === undefined || typeof v.message === "string");
const draftStatus = (v: unknown) => ["none", "draft", "approved", "sent"].includes(String(v));
const webUrl = (v: unknown) => {
  if (typeof v !== "string") return false;
  try { const url = new URL(v); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
};
function validProject(v: unknown, allowSelection = true): v is Project {
  if (!text(v, ["id", "company_name", "product_name", "product_category", "description", "moq", "target_country", "target_buyer_type", "created_at"]) || !record(v) || !stringArray(v.advantages) || !stringArray(v.certifications)) return false;
  if (v.english_facts !== undefined && (!record(v.english_facts) || !Object.values(v.english_facts).every(x => typeof x === "string"))) return false;
  if (v.company_description !== undefined && typeof v.company_description !== "string") return false;
  if (v.product_confirmed !== undefined && typeof v.product_confirmed !== "boolean") return false;
  if (v.selected_products !== undefined && (!allowSelection || !Array.isArray(v.selected_products) || v.selected_products.length < 2 || !v.selected_products.every(p => validProject(p, false)) || new Set(v.selected_products.map(p => p.id)).size !== v.selected_products.length)) return false;
  return true;
}
function validBase(v: unknown): v is DemoState {
  if (!record(v) || (v.schema_version !== undefined && v.schema_version !== 2)) return false;
  if (v.scoring_version !== undefined && v.scoring_version !== 2) return false;
  if (!validProject(v.project) || typeof v.icpCriteria !== "string") return false;
  if (![v.companies, v.contacts, v.leads, v.activities, v.drafts].every(Array.isArray)) return false;
  const companies = v.companies as Record<string, unknown>[], contacts = v.contacts as Record<string, unknown>[], leads = v.leads as Record<string, unknown>[];
  if (!companies.every(c => text(c, ["id", "project_id", "company_name", "website", "country", "city", "company_type", "employee_range", "main_products", "distribution_channel", "research_summary", "data_source"]) && number(c.data_confidence))) return false;
  if (!companies.every(c => (c.dataset === undefined || ["demo", "public"].includes(String(c.dataset))) && Object.hasOwn(COMPANY_TYPE_ZH, String(c.company_type)) && (c.research_evidence === undefined || (Array.isArray(c.research_evidence) && c.research_evidence.every(e => text(e, ["url", "title", "snippet", "retrieved_at"]) && record(e) && webUrl(e.url) && date(e.retrieved_at)))) && (c.dataset !== "public" || ((c.website === "UNKNOWN" || webUrl(c.website)) && Array.isArray(c.research_evidence) && c.research_evidence.length > 0)))) return false;
  if (!companies.every(c => (c.customer_revision === undefined || (number(c.customer_revision) && Number.isInteger(c.customer_revision))) && (c.updated_at === undefined || date(c.updated_at)) && (c.update_source === undefined || ["manual", "website"].includes(String(c.update_source))) && (c.public_contact_url === undefined || webUrl(c.public_contact_url)))) return false;
  if (!contacts.every(c => text(c, ["id", "company_id", "first_name", "last_name", "title", "email", "linkedin_url"]) && number(c.decision_maker_score) && companies.some(x => x.id === c.company_id))) return false;
  if (!contacts.every(c => (c.source_url === undefined || webUrl(c.source_url)) && (c.email_status === undefined || (c.email_status === "public_unverified" && webUrl(c.source_url) && c.email !== "UNKNOWN" && companies.some(company => company.id === c.company_id && company.dataset === "public"))))) return false;
  if (!leads.every(l => text(l, ["id", "company_id", "contact_id"]) && stage(l.status) && ["A", "B", "C", "Disqualified"].includes(String(l.priority)) && number(l.total_score) && record(l.scores) && ["icp_fit", "product_fit", "decision_maker", "intent", "data_confidence"].every(k => number((l.scores as Record<string, unknown>)[k])) && typeof l.outreach_approved === "boolean" && (l.next_followup_date === null || date(l.next_followup_date)) && companies.some(c => c.id === l.company_id) && contacts.some(c => c.id === l.contact_id && c.company_id === l.company_id))) return false;
  const related = (x: Record<string, unknown>) => leads.some(l => l.id === x.lead_id);
  if (!(v.activities as Record<string, unknown>[]).every(a => text(a, ["id", "lead_id", "content"]) && Object.hasOwn(ACTIVITY_ZH, String(a.activity_type)) && date(a.created_at) && related(a) && (a.milestone === undefined || stage(a.milestone)))) return false;
  if (!(v.drafts as Record<string, unknown>[]).every(d => text(d, ["lead_id", "subject", "body"]) && text(d.parts, ["insight", "relevance", "proof", "cta"]) && draftStatus(d.status) && date(d.generated_at) && related(d))) return false;
  for (const list of [companies, contacts, leads, v.activities as Record<string, unknown>[]]) if (new Set(list.map(x => x.id)).size !== list.length) return false;
  if (v.schema_version === 2) {
    if (!number(v.project_revision) || !Array.isArray(v.followup_drafts) || !leads.every(l => number(l.revision))) return false;
    if (!(v.drafts as Record<string, unknown>[]).every(d => number(d.revision) && meta(d.meta))) return false;
    if (!v.followup_drafts.every(d => text(d, ["id", "lead_id", "subject", "body", "value_key"]) && record(d) && related(d) && number(d.revision) && draftStatus(d.status) && meta(d.meta))) return false;
    for (const l of leads) {
      if (l.analysis_meta !== undefined && !meta(l.analysis_meta)) return false;
      if (l.ai_analysis !== undefined && (!record(l.ai_analysis) || !["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(String(l.ai_analysis.icp_fit)) || !["icp_reasons", "icp_uncertainties", "product_fit_reasons", "opportunity_reasons", "risks", "missing_information"].every(k => stringArray((l.ai_analysis as Record<string, unknown>)[k])) || typeof l.ai_analysis.recommended_hook !== "string" || !record(l.ai_analysis.intent_signal) || !stringArray(l.ai_analysis.intent_signal.evidence))) return false;
    }
  }
  return true;
}
function upgradeConfirmation(project: Project, business: BusinessProfile): Project {
  return project.product_confirmed === undefined ? { ...project, product_confirmed: business.confirmed && !business.company_name.includes("演示") } : project;
}
function upgradeScoring(state: DemoState): DemoState {
  if (state.scoring_version === 2) return state;
  const refresh = (workspace: ProductWorkspace): ProductWorkspace => ({ ...workspace, leads: workspace.leads.map(lead => ({ ...lead, ...scoreBuyer(state.companies.find(company => company.id === lead.company_id)!, state.contacts.find(contact => contact.id === lead.contact_id)!, workspace.project) })) });
  const products = state.products.map(refresh), product_groups = state.product_groups.map(group => ({ ...group, workspace: refresh(group.workspace) }));
  const active = products.find(workspace => workspace.project.id === state.project.id) ?? product_groups.find(group => group.workspace.project.id === state.project.id)!.workspace;
  return { ...state, ...active, scoring_version: 2, products, product_groups };
}
function upgradeCatalog(state: DemoState): DemoState {
  if (state.catalog_version === undefined) {
    const business_profile = { company_name: state.project.company_name, description: state.project.company_description ?? "", confirmed: !state.project.company_name.includes("演示") };
    return synchronizeProduct({ ...state, project: upgradeConfirmation(state.project, business_profile), catalog_version: 1, selection_revision: 0, business_profile, products: [], product_groups: [] });
  }
  if (state.catalog_version !== 1 || !text(state.business_profile, ["company_name", "description"]) || typeof state.business_profile.confirmed !== "boolean" || !number(state.selection_revision) || !Array.isArray(state.products) || !state.products.length) throw new Error("保存的产品目录格式不完整，原始数据已保留。");
  const ids = new Set<string>();
  const workspaceKeys = ["project", "project_revision", "icpCriteria", "leads", "drafts", "activities", "followup_drafts"];
  const validWorkspace = (workspace: unknown) => record(workspace) && workspaceKeys.every(key => Object.hasOwn(workspace, key)) && !Object.keys(workspace).some(key => !workspaceKeys.includes(key)) && validBase({ ...state, ...workspace });
  for (const workspace of state.products) {
    if (!validWorkspace(workspace) || workspace.project.selected_products !== undefined || ids.has(workspace.project.id)) throw new Error("保存的产品记录格式不完整，原始数据已保留。");
    ids.add(workspace.project.id);
  }
  const groups = state.product_groups === undefined ? [] : state.product_groups;
  if (!Array.isArray(groups)) throw new Error("保存的产品组合格式不完整，原始数据已保留。");
  const allIds = new Set(ids), combinationKeys = new Set<string>();
  for (const group of groups) {
    if (!record(group) || Object.keys(group).some(key => !["product_ids", "workspace"].includes(key)) || !stringArray(group.product_ids) || group.product_ids.length < 2 || new Set(group.product_ids).size !== group.product_ids.length || !group.product_ids.every(id => ids.has(id)) || !validWorkspace(group.workspace) || !group.workspace.project.selected_products || allIds.has(group.workspace.project.id)) throw new Error("保存的产品组合记录格式不完整，原始数据已保留。");
    const members = [...group.product_ids].sort();
    if (JSON.stringify(group.workspace.project.selected_products.map(p => p.id).sort()) !== JSON.stringify(members)) throw new Error("保存的产品组合成员不一致，原始数据已保留。");
    const country = group.workspace.project.target_country.trim().toLowerCase();
    const key = `${JSON.stringify(members)}:${/^(united states|us|usa|美国)$/.test(country) ? "us" : country}`;
    if (combinationKeys.has(key)) throw new Error("保存的产品组合重复，原始数据已保留。");
    combinationKeys.add(key); allIds.add(group.workspace.project.id);
  }
  if (!allIds.has(state.project.id)) throw new Error("保存的当前产品不存在，原始数据已保留。");
  const activeGroup = groups.find(group => group.workspace.project.id === state.project.id);
  if (activeGroup ? JSON.stringify(state.project.selected_products?.map(p => p.id).sort()) !== JSON.stringify([...activeGroup.product_ids].sort()) : state.project.selected_products !== undefined) throw new Error("保存的当前产品与组合成员不一致，原始数据已保留。");
  const products = state.products.map(workspace => {
    const project = upgradeConfirmation(workspace.project, state.business_profile);
    return project === workspace.project ? workspace : { ...workspace, project };
  });
  return synchronizeProduct({ ...state, project: upgradeConfirmation(state.project, state.business_profile), products, product_groups: groups });
}
const oldStageType: Partial<Record<PipelineStage, Activity["activity_type"]>> = { Researched: "research", Qualified: "research", Contacted: "contacted", Replied: "reply", Meeting: "meeting", Sample: "sample", Quoted: "quote", Negotiation: "quote", Won: "quote" };
const explicitType: Partial<Record<Activity["activity_type"], PipelineStage>> = { contacted: "Contacted", reply: "Replied", meeting: "Meeting", sample: "Sample", quote: "Quoted", won: "Won" };
export function migrateState(value: unknown): DemoState {
  if (!validBase(value)) throw new Error("保存的数据格式不完整，原始数据已保留。");
  if (value.schema_version === 2) return upgradeScoring(upgradeCatalog(value));
  const revision = 0;
  const fallbackMeta = (generated_at: string): ArtifactMeta => ({ source: "legacy", generated_at, project_revision: revision });
  const activities = value.activities.map(a => {
    const marker = a.content.match(/^\[stage:([^\]]+)\] 人工更新 CRM 阶段。$/)?.[1] as PipelineStage | undefined;
    const milestone = marker && oldStageType[marker] === a.activity_type ? marker
      : a.activity_type === "research" && a.content === "模拟调研记录 · Demo Dataset [stage:Qualified]" ? "Qualified"
      : a.activity_type === "approved" && ["演示历史：人工审核通过。", "销售人工审核通过，允许模拟触达。"].includes(a.content) ? "Qualified"
      : explicitType[a.activity_type];
    return { ...a, milestone, activity_type: marker === "Won" && milestone === "Won" ? "won" as const : a.activity_type };
  });
  const followup_drafts: FollowupDraft[] = [];
  for (const lead of value.leads) {
    const latest = value.activities.filter(a => a.lead_id === lead.id && a.activity_type === "followup").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!latest?.content.startsWith("跟进草稿（尚未发送）\n")) continue;
    const lines = latest.content.split("\n");
    followup_drafts.push({ id: `migrated-${latest.id}`, lead_id: lead.id, subject: lines[1] ?? "", body: lines.slice(3).join("\n"), status: "draft", revision: 0, value_key: "legacy", meta: fallbackMeta(latest.created_at) });
  }
  const business_profile = { company_name: value.project.company_name, description: value.project.company_description ?? "", confirmed: !value.project.company_name.includes("演示") };
  return synchronizeProduct({ ...value, project: upgradeConfirmation(value.project, business_profile), schema_version: 2, scoring_version: 2, catalog_version: 1, products: [], product_groups: [], business_profile, selection_revision: 0, project_revision: revision, followup_drafts, activities,
    leads: value.leads.map(l => ({ ...l, ...scoreBuyer(value.companies.find(c => c.id === l.company_id)!, value.contacts.find(c => c.id === l.contact_id)!, value.project), revision: 0, ai_analysis: undefined, analysis_meta: undefined, outreach_approved: isSupportedProduct(value.project) ? l.outreach_approved : false, status: !isSupportedProduct(value.project) && l.status === "Ready to Contact" ? "Qualified" : l.status })),
    drafts: value.drafts.map(d => ({ ...d, status: !isSupportedProduct(value.project) && d.status === "approved" ? "draft" : d.status, revision: 0, meta: fallbackMeta(d.generated_at) })),
  });
}
export function loadState(storage: Storage, now = new Date()): { state: DemoState; warning: string; canPersist: boolean } {
  try {
    const current = storage.getItem(STORAGE_KEY);
    const old = current ? null : storage.getItem(LEGACY_KEY);
    const parsed = current || old ? JSON.parse((current || old)!) : null;
    const state = parsed ? migrateState(parsed) : createDemoState(now);
    let warning = "";
    const upgradingCurrent = !!current && parsed.catalog_version === undefined;
    const upgradingScoring = !!current && parsed.scoring_version !== 2;
    if (upgradingCurrent || upgradingScoring) {
      try {
        for (const key of [...(upgradingCurrent ? [CATALOG_BACKUP_KEY] : []), ...(upgradingScoring ? [SCORING_BACKUP_KEY] : [])]) if (storage.getItem(key) === null) storage.setItem(key, current!);
      }
      catch { return { state, warning: "浏览器未能备份原有产品资料，原始数据未覆盖。当前临时操作刷新后会丢失；可在企业与产品恢复演示。", canPersist: false }; }
    }
    if (!current || upgradingCurrent || upgradingScoring) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch { warning = "浏览器未能保存升级后的数据，原始数据已保留；刷新可能丢失新操作。"; }
    }
    return { state, warning, canPersist: true };
  } catch {
    return { state: createDemoState(now), warning: "浏览器保存的数据不可读取，原始数据未覆盖。当前临时操作刷新后会丢失；可在企业与产品确认恢复演示。", canPersist: false };
  }
}
