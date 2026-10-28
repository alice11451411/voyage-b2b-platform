import { createDemoState, researchFacts, type DemoState } from "../data/demo.ts";
import { buildCombinedProject } from "./product-groups.ts";
import type { WebsiteReview } from "./discovery-types.ts";
import { COMPANY_TYPE_ZH, PIPELINE_STAGES, STAGE_ZH, priorityOf, type Activity, type ArtifactMeta, type BusinessProfile, type FollowupDraft, type Company, type CompanyType, type Contact, type Lead, type OutreachDraft, type PipelineStage, type Priority, type ProductWorkspace, type Project, type ScoreBreakdown } from "./types.ts";

export interface Metrics {
  total: number; qualified: number; contacted: number; replied: number; meeting: number; quoted: number; won: number;
  replyRate: number; meetingRate: number; quoteRate: number; winRate: number;
  funnel: { label: string; count: number }[];
  priority: { priority: Priority; total: number; contacted: number; replied: number }[];
  weekly: { label: string; contacted: number; replied: number }[];
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
const normalizeCountry = (value: string) => /^(united states|us|usa|美国)$/i.test(value.trim()) ? "us" : value.trim().toLowerCase();
function productMatchScore(company: Company, product: Project): number {
  if (!isSupportedProduct(product)) return 0;
  const catalog = company.main_products.toLowerCase(), name = product.product_name.toLowerCase();
  const cap = company.dataset === "public" ? 25 : clamp(researchFacts[company.id]?.productFit ?? 0, 25);
  const broad = /sauce|seasoning|condiment|调味|酱料/.test(catalog);
  if (/hot\s?pot|火锅/.test(name)) return /hot\s?pot|soup\s+bases?|火锅/.test(catalog) ? cap : broad ? Math.min(cap, 5) : 0;
  if (/chill?i|辣酱|辣椒油|红油/.test(name)) return /chill?i\s+(?:sauces?|oils?)|辣酱|辣椒油|红油/.test(catalog) ? cap : broad ? Math.min(cap, 5) : 0;
  return /sauce|seasoning|condiment|hot\s?pot|soup\s+(?:bases?|mixes?)|调味|火锅|辣酱/.test(catalog) ? cap : 0;
}
export function scoreBuyer(company: Company, contact: Contact, project: Project): { scores: ScoreBreakdown; total_score: number; priority: Priority; score_assessable: boolean } {
  const facts = company.dataset !== "public" && Object.hasOwn(researchFacts, company.id) ? researchFacts[company.id] : undefined;
  const typeWords: Record<string, string[]> = {
    Importer: ["importer", "进口商"], Distributor: ["distributor", "经销商"], "Importer / Distributor": ["importer", "distributor", "进口商", "经销商"],
    "Private Label Brand": ["private label", "自有品牌", "oem"], "Asian Grocery Chain": ["grocery", "超市"], "Foodservice Distributor": ["foodservice", "餐饮"], Wholesaler: ["wholesaler", "wholesale", "批发"],
  };
  const target = project.target_buyer_type.toLowerCase();
  const buyerMatches = (typeWords[company.company_type] ?? []).some((word) => target.includes(word));
  const marketMatches = company.country !== "UNKNOWN" && normalizeCountry(project.target_country) === normalizeCountry(company.country);
  const assessable = isSupportedProduct(project);
  const products = project.selected_products ?? [project];
  const productFit = assessable ? Math.round(products.reduce((sum, product) => sum + productMatchScore(company, product), 0) / products.length) : 0;
  const productsOverlap = productFit > 0;
  const completeness = [company.website, company.country, company.city, company.company_type, company.employee_range, company.main_products, company.distribution_channel, contact.title, contact.email, contact.linkedin_url].filter((value) => value && value !== "UNKNOWN").length;
  const roleCap = /director|head|founder|owner|chief/i.test(contact.title) ? 15 : /manager|buyer/i.test(contact.title) ? 12 : /coordinator/i.test(contact.title) ? 9 : contact.title === "UNKNOWN" ? 0 : 3;
  const scores: ScoreBreakdown = {
    icp_fit: marketMatches && buyerMatches ? company.dataset === "public" ? 30 : ({ Strong: 30, Medium: 20, Weak: 10, "No Fit": 0 }[facts?.icp ?? "No Fit"]) : 0,
    product_fit: productFit,
    decision_maker: company.dataset === "public" ? 0 : Math.min(clamp(contact.decision_maker_score, 15), roleCap),
    intent: productsOverlap && marketMatches && facts?.intentEvidence.length ? clamp(facts.intent, 20) : 0,
    data_confidence: Math.min(clamp(company.data_confidence, 10), completeness),
  };
  const total_score = Object.values(scores).reduce((sum, score) => sum + score, 0);
  return { scores, total_score, priority: assessable ? priorityOf(total_score) : "Disqualified", score_assessable: assessable };
}

export function isSupportedProduct(project: Project): boolean {
  if (project.selected_products) return project.selected_products.length >= 2 && project.selected_products.every(p => !p.selected_products && isSupportedProduct(p));
  const supported = /hotpot|hot pot|seasoning|chili|sauce|火锅|调味|辣酱/i;
  return supported.test(project.product_name) && supported.test(project.product_category);
}
function findLead(state: DemoState, id: string): Lead {
  const lead = state.leads.find(l => l.id === id);
  if (!lead) throw new Error("没有找到该客户。");
  return lead;
}
const closed = (lead: Lead) => ["Won", "Lost"].includes(lead.status);
function requireOpen(lead: Lead) { if (closed(lead)) throw new Error("客户已归档，不能编辑或发送；请先明确重新开启销售进展。"); }
const defaultMeta = (state: DemoState, now: Date): ArtifactMeta => ({ source: "local", generated_at: now.toISOString(), project_revision: state.project_revision });
function changeLead(state: DemoState, id: string, patch: Partial<Lead>): DemoState {
  return { ...state, leads: state.leads.map(l => l.id === id ? { ...l, ...patch, revision: l.revision + 1 } : l) };
}
function activity(state: DemoState, lead_id: string, activity_type: Activity["activity_type"], content: string, now: Date, detail: Partial<Activity> = {}, mergeId?: string): DemoState {
  const item: Activity = { id: mergeId ?? crypto.randomUUID(), lead_id, activity_type, content, created_at: now.toISOString(), ...detail };
  return { ...state, activities: [...state.activities.filter(a => a.id !== item.id), item] };
}
export function hasMilestone(state: DemoState, id: string, stage: PipelineStage): boolean {
  return state.activities.some(a => a.lead_id === id && a.milestone === stage);
}
export function captureVersion(state: DemoState, id: string) {
  return { project_id: state.project.id, project_revision: state.project_revision, selection_revision: state.selection_revision, lead_id: id, revision: findLead(state, id).revision };
}
export function assertVersion(state: DemoState, token: ReturnType<typeof captureVersion>) {
  if (state.project.id !== token.project_id || state.project_revision !== token.project_revision || state.selection_revision !== token.selection_revision || findLead(state, token.lead_id).revision !== token.revision) throw new Error("资料或内容已更新，本次生成结果未覆盖你的修改，请重新生成。");
}
const stageActivity: Partial<Record<PipelineStage, Activity["activity_type"]>> = { Researched: "research", Qualified: "research", Replied: "reply", Meeting: "meeting", Sample: "sample", Quoted: "quote", Won: "won" };
export function transitionLead(state: DemoState, id: string, stage: PipelineStage, now = new Date()): DemoState {
  const lead = findLead(state, id);
  if (!PIPELINE_STAGES.includes(stage)) throw new Error("无效的销售阶段。");
  if (lead.status === stage) return state;
  if (stage !== "Lost" && PIPELINE_STAGES.indexOf(stage) >= 3 && !lead.outreach_approved && !hasMilestone(state, id, "Contacted")) throw new Error("请先完成人工审核，才可进入待发送及后续商业阶段。");
  if (stage === "Contacted" && !hasMilestone(state, id, "Contacted")) return markSent(state, id, now);
  if (stage !== "Lost" && PIPELINE_STAGES.indexOf(stage) > 4 && !hasMilestone(state, id, "Contacted")) throw new Error("请先模拟发送首封邮件，再记录后续销售事件。");
  const next = changeLead(state, id, { status: stage, next_followup_date: closed({ ...lead, status: stage }) ? null : stage === "Contacted" ? lead.next_followup_date ?? new Date(now.getTime() + 3 * 86400000).toISOString() : lead.next_followup_date });
  return activity(next, id, stageActivity[stage] ?? "stage_change", `人工记录：${STAGE_ZH[lead.status]} → ${STAGE_ZH[stage]}。`, now, { stage_from: lead.status, stage_to: stage, milestone: stageActivity[stage] ? stage : undefined });
}
export function saveDraft(state: DemoState, draft: OutreachDraft, now = new Date()): DemoState {
  const lead = findLead(state, draft.lead_id); requireOpen(lead);
  const previous = state.drafts.find(d => d.lead_id === lead.id);
  if (hasMilestone(state, lead.id, "Contacted") || previous?.status === "sent") throw new Error("首封邮件已发送，请使用跟进流程。");
  if (previous && previous.subject === draft.subject && previous.body === draft.body && previous.status !== "none" && JSON.stringify(previous.meta) === JSON.stringify(draft.meta)) return state;
  const saved: OutreachDraft = { ...draft, status: "draft", revision: (previous?.revision ?? -1) + 1, meta: draft.meta ?? defaultMeta(state, now) };
  let next = changeLead(state, lead.id, { outreach_approved: false, status: lead.status === "Ready to Contact" ? "Qualified" : lead.status });
  next = { ...next, drafts: [...next.drafts.filter(d => d.lead_id !== lead.id), saved] };
  return activity(next, lead.id, "outreach_draft", previous ? "首封邮件已编辑并保存，需重新审核。" : "首封邮件草稿已生成，等待人工审核。", now, {}, `draft-edit-${lead.id}-${draft.generated_at}`);
}
export function approveDraft(state: DemoState, id: string, now = new Date()): DemoState {
  const lead = findLead(state, id); requireOpen(lead);
  if (lead.score_assessable === false) throw new Error("当前产品超出演示范围，请先修正项目资料。");
  const draft = state.drafts.find(d => d.lead_id === id);
  if (!draft || !draft.subject.trim() || !draft.body.trim()) throw new Error("请先填写完整邮件草稿。");
  if (draft.status === "sent" || hasMilestone(state, id, "Contacted")) throw new Error("该草稿已发送。");
  if (draft.status === "none") throw new Error("草稿已退回，请编辑后再审核。");
  if (draft.status === "approved" && draft.meta?.project_revision === state.project_revision) return state;
  const next = changeLead(state, id, { outreach_approved: true, status: "Ready to Contact" });
  return activity({ ...next, drafts: next.drafts.map(d => d.lead_id === id ? { ...d, status: "approved", meta: { ...(d.meta ?? defaultMeta(state, now)), project_revision: state.project_revision } } : d) }, id, "approved", "已人工审核首封邮件，可模拟发送。", now, { milestone: "Qualified" });
}
export function rejectDraft(state: DemoState, id: string, now = new Date()): DemoState {
  const lead = findLead(state, id); requireOpen(lead);
  if (hasMilestone(state, id, "Contacted")) throw new Error("首封邮件已发送，不能退回。");
  const next = changeLead(state, id, { outreach_approved: false, status: lead.status === "Ready to Contact" ? "Qualified" : lead.status });
  return activity({ ...next, drafts: next.drafts.map(d => d.lead_id === id ? { ...d, status: "none", revision: (d.revision ?? 0) + 1 } : d) }, id, "outreach_draft", "已退回修改，请编辑或重新起草后审核。", now);
}
export function markSent(state: DemoState, id: string, now = new Date()): DemoState {
  const lead = findLead(state, id); requireOpen(lead);
  if (!isSupportedProduct(state.project) || lead.score_assessable === false) throw new Error("当前产品超出演示评分范围，请先修正项目资料。");
  const draft = state.drafts.find(d => d.lead_id === id);
  if (hasMilestone(state, id, "Contacted") || draft?.status === "sent") throw new Error("该触达已发送，请使用跟进流程。");
  if (!lead.outreach_approved || draft?.status !== "approved" || draft.meta?.project_revision !== state.project_revision || !draft.subject.trim() || !draft.body.trim()) throw new Error("请按当前产品资料完成人工审核，再模拟发送。");
  const next = changeLead(state, id, { status: "Contacted", next_followup_date: new Date(now.getTime() + 3 * 86400000).toISOString() });
  return activity({ ...next, drafts: next.drafts.map(d => d.lead_id === id ? { ...d, status: "sent" } : d) }, id, "contacted", "首封邮件已模拟发送，未真实外发；已安排 3 天后跟进。", now, { milestone: "Contacted" });
}
export function saveFollowup(state: DemoState, draft: FollowupDraft, now = new Date()): DemoState {
  const lead = findLead(state, draft.lead_id); requireOpen(lead);
  if (!hasMilestone(state, lead.id, "Contacted")) throw new Error("请先模拟发送首封邮件。");
  const old = state.followup_drafts.find(d => d.id === draft.id);
  if (old?.status === "sent") throw new Error("这份跟进已发送，请新建跟进。");
  const saved: FollowupDraft = { ...draft, status: "draft", revision: (old?.revision ?? -1) + 1 };
  const next = changeLead(state, lead.id, {});
  return activity({ ...next, followup_drafts: [...next.followup_drafts.filter(d => d.id !== draft.id), saved] }, lead.id, "followup", old ? "跟进邮件已编辑并保存，等待人工审核。" : "跟进草稿已生成，尚未发送。", now, { draft_id: draft.id }, `follow-edit-${draft.id}`);
}
export function completeFollowup(state: DemoState, draftId: string, now = new Date()): DemoState {
  const draft = state.followup_drafts.find(d => d.id === draftId);
  if (!draft) throw new Error("没有找到跟进草稿。");
  requireOpen(findLead(state, draft.lead_id));
  if (!hasMilestone(state, draft.lead_id, "Contacted")) throw new Error("请先模拟发送首封邮件。");
  if (draft.status === "sent") throw new Error("这份跟进已发送，不能重复记录。");
  if (!draft.subject.trim() || !draft.body.trim()) throw new Error("请补全主题与正文。");
  const next = changeLead(state, draft.lead_id, { next_followup_date: new Date(now.getTime() + 3 * 86400000).toISOString() });
  return activity({ ...next, followup_drafts: next.followup_drafts.map(d => d.id === draftId ? { ...d, status: "sent", meta: { ...d.meta, project_revision: state.project_revision } } : d) }, draft.lead_id, "followup", `人工审核并模拟跟进（未真实外发）\n${draft.subject}\n\n${draft.body}`, now, { draft_id: draftId });
}
export function setFollowupDate(state: DemoState, id: string, date: string, now = new Date()): DemoState {
  const lead = findLead(state, id); requireOpen(lead);
  if (!hasMilestone(state, id, "Contacted")) throw new Error("尚未联系，暂不能安排跟进。");
  if (!Number.isFinite(Date.parse(date))) throw new Error("请选择有效的日期。");
  return activity(changeLead(state, id, { next_followup_date: date }), id, "followup", "已人工调整下一次跟进日期。", now);
}
export function recordAnalysis(state: DemoState, id: string, analysis: Lead["ai_analysis"], meta: ArtifactMeta, now = new Date()): DemoState {
  const lead = findLead(state, id); requireOpen(lead);
  const next = changeLead(state, id, { ai_analysis: analysis, analysis_meta: meta, status: lead.status === "Identified" ? "Researched" : lead.status });
  return activity(next, id, "analysis", "客户分析已生成，评分仍由固定规则计算。", now, { milestone: "Researched" });
}
export function saveProject(state: DemoState, project: Project, icpCriteria: string, replace = false, now = new Date()): DemoState {
  const clean = { ...project, advantages: project.advantages.map(x => x.trim()).filter(Boolean), certifications: project.certifications.map(x => x.trim()).filter(Boolean) };
  for (const field of ["company_name", "product_name", "product_category", "description", "moq", "target_country", "target_buyer_type"] as const) clean[field] = clean[field].trim();
  if (clean.company_description !== undefined) clean.company_description = clean.company_description.trim();
  const criteria = icpCriteria.trim();
  if (!clean.company_name || !clean.product_name || !clean.product_category || !clean.description || !clean.target_country || !clean.target_buyer_type || !criteria) throw new Error("请补全企业、产品、目标市场和客户标准。");
  if (!replace && JSON.stringify(clean) === JSON.stringify(state.project) && criteria === state.icpCriteria) return state;
  const nextProject = { ...clean, id: replace ? crypto.randomUUID() : state.project.id, created_at: replace ? now.toISOString() : state.project.created_at };
  return { ...state, project: nextProject, project_revision: state.project_revision + 1, icpCriteria: criteria,
    companies: state.companies.map(c => ({ ...c, project_id: nextProject.id })),
    leads: state.leads.filter(l => !replace || state.companies.find(c => c.id === l.company_id)?.dataset !== "public").map(l => ({ ...l, ...scoreBuyer(state.companies.find(c => c.id === l.company_id)!, state.contacts.find(c => c.id === l.contact_id)!, nextProject), revision: l.revision + 1, status: replace ? "Identified" : l.status === "Ready to Contact" ? "Qualified" : l.status, outreach_approved: replace ? false : hasMilestone(state, l.id, "Contacted") ? l.outreach_approved : false, next_followup_date: replace ? null : l.next_followup_date, ai_analysis: replace ? undefined : l.ai_analysis, analysis_meta: replace ? undefined : l.analysis_meta })),
    drafts: replace ? [] : state.drafts.map(d => d.status === "sent" ? d : { ...d, status: "draft", revision: (d.revision ?? 0) + 1 }),
    followup_drafts: replace ? [] : state.followup_drafts.map(d => d.status === "sent" ? d : { ...d, status: "draft", revision: d.revision + 1 }),
    activities: replace ? [] : state.activities,
  };
}
export function resetDemo(state: DemoState, now = new Date()): DemoState {
  const seed = createDemoState(now), project_id = crypto.randomUUID(), revision = state.project_revision + 1;
  return synchronizeProduct({ ...seed, products: [], selection_revision: state.selection_revision + 1, project: { ...seed.project, id: project_id }, project_revision: revision,
    companies: seed.companies.map(c => ({ ...c, project_id })),
    drafts: seed.drafts.map(d => ({ ...d, meta: { ...d.meta!, project_revision: revision } })),
  });
}

function productWorkspace(state: DemoState): ProductWorkspace {
  const { project, project_revision, icpCriteria, leads, drafts, activities, followup_drafts } = state;
  return { project, project_revision, icpCriteria, leads, drafts, activities, followup_drafts };
}
/** Provider 在保存前同步当前产品；其余产品记录保持原样。 */
export function synchronizeProduct(state: DemoState): DemoState {
  const workspace = productWorkspace(state);
  const group = state.product_groups.find(g => g.workspace.project.id === state.project.id);
  const equal = (saved: ProductWorkspace) => (Object.keys(workspace) as (keyof ProductWorkspace)[]).every(key => saved[key] === workspace[key]);
  if (group) return equal(group.workspace) ? state : { ...state, product_groups: state.product_groups.map(g => g === group ? { ...g, workspace } : g) };
  const current = state.products.find(p => p.project.id === state.project.id);
  if (current && equal(current)) return state;
  return { ...state, products: current ? state.products.map(p => p.project.id === state.project.id ? workspace : p) : [...state.products, workspace] };
}
function activateWorkspace(state: DemoState, workspace: ProductWorkspace): DemoState {
  return { ...state, ...workspace, selection_revision: state.selection_revision + 1, companies: state.companies.map(c => ({ ...c, project_id: workspace.project.id })) };
}
export function selectProduct(state: DemoState, id: string): DemoState {
  if (state.project.id === id) return state;
  const synced = synchronizeProduct(state), workspace = synced.products.find(p => p.project.id === id);
  if (!workspace) throw new Error("没有找到该产品，请重新选择。");
  return activateWorkspace(synced, workspace);
}
const groupCriteria = (products: ProductWorkspace[], country: string) => `此次目标市场：${country}。产品客户标准：\n${products.map(p => `${p.project.product_name}：${p.icpCriteria}`).join("\n")}`;
/** 产品确认属于界面状态，更新确认不能撤回组合的业务审核。 */
function projectFacts(project: Project): unknown {
  const facts = { ...project };
  delete facts.product_confirmed;
  return { ...facts, ...(facts.selected_products ? { selected_products: facts.selected_products.map(projectFacts) } : {}) };
}
function refreshProductGroups(state: DemoState, now: Date): DemoState {
  const product_groups = state.product_groups.map(group => {
    const members = group.product_ids.map(id => state.products.find(p => p.project.id === id)!);
    const previous = group.workspace;
    const project = buildCombinedProject(members.map(p => p.project), previous.project.id, previous.project.created_at, previous.project.target_country);
    const icpCriteria = groupCriteria(members, project.target_country);
    if (JSON.stringify(projectFacts(project)) === JSON.stringify(projectFacts(previous.project)) && icpCriteria === previous.icpCriteria) return JSON.stringify(project) === JSON.stringify(previous.project) ? group : { ...group, workspace: { ...previous, project } };
    return { ...group, workspace: productWorkspace(saveProject({ ...state, ...previous }, project, icpCriteria, false, now)) };
  });
  if (product_groups.every((group, index) => group === state.product_groups[index])) return state;
  const active = product_groups.find(g => g.workspace.project.id === state.project.id);
  return { ...state, ...(active?.workspace ?? {}), product_groups };
}
export function selectProductGroup(state: DemoState, productIds: string[], targetCountry?: string, now = new Date()): DemoState {
  const ids = [...new Set(productIds)].sort();
  if (!ids.length) throw new Error("请至少选择一款产品。");
  if (ids.length === 1) return selectProduct(state, ids[0]);
  const synced = synchronizeProduct(state);
  const members = ids.map(id => synced.products.find(p => p.project.id === id));
  if (members.some(p => !p)) throw new Error("没有找到所选产品，请重新选择。");
  const products = members as ProductWorkspace[];
  const country = (targetCountry ?? synced.project.target_country).trim();
  if (!country) throw new Error("请选择此次开发的目标市场。");
  const refreshed = refreshProductGroups(synced, now);
  const existing = refreshed.product_groups.find(g => JSON.stringify([...g.product_ids].sort()) === JSON.stringify(ids) && normalizeCountry(g.workspace.project.target_country) === normalizeCountry(country));
  if (existing) return refreshed.project.id === existing.workspace.project.id ? refreshed : activateWorkspace(refreshed, existing.workspace);
  const project = buildCombinedProject(products.map(p => p.project), crypto.randomUUID(), now.toISOString(), country);
  const workspace: ProductWorkspace = { project, project_revision: 0, icpCriteria: groupCriteria(products, country), drafts: [], activities: [], followup_drafts: [],
    leads: synced.leads.filter(l => synced.companies.find(c => c.id === l.company_id)?.dataset !== "public").map(l => ({ ...l, revision: 0, ...scoreBuyer(synced.companies.find(c => c.id === l.company_id)!, synced.contacts.find(c => c.id === l.contact_id)!, project), status: "Identified", outreach_approved: false, next_followup_date: null, ai_analysis: undefined, analysis_meta: undefined })),
  };
  return activateWorkspace({ ...refreshed, product_groups: [...refreshed.product_groups, { product_ids: ids, workspace }] }, workspace);
}
export function saveProduct(state: DemoState, project: Project, icpCriteria: string, adding = false, now = new Date()): DemoState {
  const synced = synchronizeProduct(state), business = synced.business_profile;
  if (!adding && synced.project.selected_products) throw new Error("组合资料来自所选产品，请分别编辑产品资料。");
  if (project.selected_products) throw new Error("请先选择一款产品，再添加或编辑产品资料。");
  const candidate = { ...project, product_confirmed: synced.project.product_confirmed, company_name: business.company_name, ...(business.description || project.company_description !== undefined ? { company_description: business.description } : {}) };
  const saved = saveProject(synced, candidate, icpCriteria, adding, now);
  const next = saved.project.product_confirmed ? saved : { ...saved, project: { ...saved.project, product_confirmed: true } };
  return refreshProductGroups(synchronizeProduct(adding ? { ...next, selection_revision: synced.selection_revision + 1 } : next), now);
}
export function saveBusinessProfile(state: DemoState, profile: Pick<BusinessProfile, "company_name" | "description">, now = new Date()): DemoState {
  const business_profile = { company_name: profile.company_name.trim(), description: profile.description.trim(), confirmed: true };
  if (!business_profile.company_name) throw new Error("请填写你的企业名称。");
  const synced = synchronizeProduct(state);
  if (business_profile.company_name === synced.business_profile.company_name && business_profile.description === synced.business_profile.description) return synced.business_profile.confirmed ? synced : { ...synced, business_profile };
  const products = synced.products.map(workspace => productWorkspace(saveProject({ ...synced, ...workspace }, { ...workspace.project, company_name: business_profile.company_name, company_description: business_profile.description }, workspace.icpCriteria, false, now)));
  const active = products.find(p => p.project.id === synced.project.id);
  return refreshProductGroups({ ...synced, ...(active ?? {}), business_profile, products, selection_revision: synced.selection_revision + 1 }, now);
}
function websiteDomain(website: string): string {
  const url = new URL(website);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("请使用企业公开官网地址。");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
export function addPublicBuyer(state: DemoState, review: WebsiteReview, confirmedFields: { company_name: string; country: string; company_type: CompanyType; main_products: string; distribution_channel: string; email?: string }, now = new Date()): DemoState {
  const domain = websiteDomain(review.website);
  if (domain.endsWith(".example") || !Array.isArray(review.evidence) || !review.evidence.length) throw new Error("请先读取真实官网并核对公开来源。");
  if (!confirmedFields.company_name.trim() || !Object.hasOwn(COMPANY_TYPE_ZH, confirmedFields.company_type)) throw new Error("请确认企业名称与客户类型；未知类型可选待确认。");
  const email = confirmedFields.email?.trim() ?? "";
  const emailEvidence = review.public_emails.find(item => item.email.toLowerCase() === email.toLowerCase());
  if (email && !emailEvidence) throw new Error("请从官网实际公开的邮箱中选择，不能将未发现的邮箱标为公开邮箱。");
  if (emailEvidence) websiteDomain(emailEvidence.source_url);
  for (const evidence of review.evidence) {
    websiteDomain(evidence.url);
    if (!Number.isFinite(Date.parse(evidence.retrieved_at))) throw new Error("官网来源记录不完整，请重新读取。");
  }
  const previousCompany = state.companies.find(company => company.dataset === "public" && websiteDomain(company.website) === domain);
  if (previousCompany && state.leads.some(lead => lead.company_id === previousCompany.id)) return state;
  const value = (field: string) => field.trim() || "UNKNOWN";
  const company: Company = previousCompany ?? { id: `public-company-${crypto.randomUUID()}`, project_id: state.project.id, dataset: "public", website: review.website,
    company_name: confirmedFields.company_name.trim(), country: value(confirmedFields.country), company_type: confirmedFields.company_type,
    main_products: value(confirmedFields.main_products), distribution_channel: value(confirmedFields.distribution_channel), city: "UNKNOWN", employee_range: "UNKNOWN",
    research_summary: review.evidence.map(evidence => evidence.snippet).filter(Boolean).join("\n"), research_evidence: review.evidence.map(evidence => ({ ...evidence })),
    data_source: "公开官网 · 人工确认资料；采购意向与联系人身份未核实", data_confidence: [review.website, value(confirmedFields.country), confirmedFields.company_type, value(confirmedFields.main_products), value(confirmedFields.distribution_channel), email].filter(field => !!field && field !== "UNKNOWN").length,
  };
  const previousContact = state.contacts.find(contact => contact.company_id === company.id);
  const contact: Contact = previousContact ?? { id: `public-contact-${company.id}`, company_id: company.id, first_name: "UNKNOWN", last_name: "UNKNOWN", title: "UNKNOWN", email: email || "UNKNOWN", linkedin_url: "UNKNOWN", decision_maker_score: 0,
    ...(emailEvidence ? { source_url: emailEvidence.source_url, email_status: "public_unverified" as const } : {}),
  };
  const lead: Lead = { id: `public-lead-${company.id}`, company_id: company.id, contact_id: contact.id, revision: 0, ...scoreBuyer(company, contact, state.project), status: "Researched", outreach_approved: false, next_followup_date: null };
  const next = { ...state, companies: previousCompany ? state.companies : [...state.companies, company], contacts: previousContact ? state.contacts : [...state.contacts, contact], leads: [...state.leads, lead] };
  return synchronizeProduct(activity(next, lead.id, "research", "已读取企业公开官网并人工核对资料；未核实采购意向或邮箱可投递性。", now, { milestone: "Researched" }));
}
export function isOverdue(lead: Lead, now = new Date()): boolean {
  return !closed(lead) && !!lead.next_followup_date && Date.parse(lead.next_followup_date) < now.getTime();
}
export function getNextAction(state: DemoState, lead: Lead): { kind: "analysis" | "outreach" | "review" | "send" | "followup" | "progress" | "history"; label: string; reason: string; href: string } {
  let kind: ReturnType<typeof getNextAction>["kind"], label: string, reason: string;
  const draft = state.drafts.find(d => d.lead_id === lead.id);
  if (closed(lead)) { kind = "history"; label = "查看历史"; reason = "此次开发已结束，历史记录保留。"; }
  else if (lead.score_assessable === false) { kind = "analysis"; label = "查看待确认项"; reason = "当前产品超出演示评分范围，请先调整产品资料。"; }
  else if (state.followup_drafts.some(d => d.lead_id === lead.id && d.status !== "sent")) { kind = "followup"; label = "继续审核跟进"; reason = "有未发送的跟进草稿。"; }
  else if (hasMilestone(state, lead.id, "Contacted")) {
    kind = PIPELINE_STAGES.indexOf(lead.status) > 4 ? "progress" : "followup";
    label = kind === "progress" ? "更新进展" : "起草跟进邮件"; reason = isOverdue(lead) ? "已到跟进时间，请补充有价值的信息。" : "已联系，继续记录进展或准备跟进。";
  } else if (draft) { kind = draft.status === "approved" && draft.meta?.project_revision === state.project_revision ? "send" : "review"; label = kind === "send" ? "模拟发送" : "继续编辑与审核"; reason = kind === "send" ? "首封已审核，可以记录模拟发送。" : "已有草稿，请核对内容后人工审核。"; }
  else if (lead.priority === "Disqualified") { kind = "analysis"; label = "补充匹配资料"; reason = "当前匹配依据不足，暂不建议联系；先核验产品相关性和目标客户类型。"; }
  else if (lead.status === "Identified") { kind = "analysis"; label = "查看客户分析"; reason = "先了解匹配理由与资料缺口。"; }
  else { kind = "outreach"; label = "起草首封邮件"; reason = "基于现有资料准备英文邮件。"; }
  const anchor = ["outreach", "review", "send"].includes(kind) ? "outreach" : kind === "followup" ? "followup" : kind === "history" ? "history" : kind === "progress" ? "progress" : "analysis";
  return { kind, label, reason, href: `/buyers/${lead.id}#${anchor}` };
}
function mondayChina(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 3600000);
  shifted.setUTCHours(0, 0, 0, 0); shifted.setUTCDate(shifted.getUTCDate() - (shifted.getUTCDay() + 6) % 7);
  return new Date(shifted.getTime() - 8 * 3600000);
}
export function getMetrics(state: DemoState, now = new Date()): Metrics {
  const count = (stage: PipelineStage) => state.leads.filter(l => hasMilestone(state, l.id, stage)).length;
  const total = state.leads.length, qualified = count("Qualified"), contacted = count("Contacted"), replied = count("Replied"), meeting = count("Meeting"), quoted = count("Quoted"), won = count("Won");
  const cohort = state.leads.filter(l => hasMilestone(state, l.id, "Contacted"));
  const rate = (stage: PipelineStage) => contacted ? cohort.filter(l => hasMilestone(state, l.id, stage)).length * 100 / contacted : 0;
  const priority: Metrics["priority"] = (["A", "B", "C", "Disqualified"] as Priority[]).map(p => ({ priority: p, total: state.leads.filter(l => l.priority === p).length, contacted: cohort.filter(l => l.priority === p).length, replied: cohort.filter(l => l.priority === p && hasMilestone(state, l.id, "Replied")).length }));
  const week = mondayChina(now);
  const weekly = Array.from({ length: 4 }, (_, i) => {
    const start = week.getTime() - (3 - i) * 7 * 86400000;
    const buyers = cohort.filter(l => { const first = Math.min(...state.activities.filter(a => a.lead_id === l.id && a.milestone === "Contacted").map(a => Date.parse(a.created_at))); return first >= start && first < start + 7 * 86400000; });
    return { label: new Date(start + 8 * 3600000).toISOString().slice(0, 10), contacted: buyers.length, replied: buyers.filter(l => hasMilestone(state, l.id, "Replied")).length };
  });
  return { total, qualified, contacted, replied, meeting, quoted, won, replyRate: rate("Replied"), meetingRate: rate("Meeting"), quoteRate: rate("Quoted"), winRate: total ? won / total * 100 : 0, priority, weekly,
    funnel: [{ label: "客户总数", count: total }, { label: "符合目标", count: qualified }, { label: "已联系", count: contacted }, { label: "已回复", count: replied }, { label: "已约会议", count: meeting }, { label: "已报价", count: quoted }, { label: "已成交", count: won }],
  };
}

