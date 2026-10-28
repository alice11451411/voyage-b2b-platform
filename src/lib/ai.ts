import { researchFacts } from "../data/demo.ts";
import type { AIAnalysis, Company, Contact, OutreachDraft, Project } from "./types.ts";
import type { Metrics } from "./workflow.ts";
import { scoreBuyer } from "./workflow.ts";
import { channelLabel, cityLabel, companyTypeLabel, countryLabel, jobTitleLabel, productsLabel, priorityLabel, valueLabel } from "./display.ts";

export type AITask = "analysis" | "outreach" | "followup" | "analyst";
export type DraftResult = Pick<OutreachDraft, "subject" | "body" | "parts">;
export interface FollowupHistory { previous_email: string; used_value_keys: string[]; followups: { subject: string; body: string }[] }
export interface FollowupResult { subject: string; body: string; value_key: string }
export interface SalesInsights { facts: string[]; hypotheses: string[]; recommendations: string[] }
export interface AIRequest {
  task: AITask;
  project?: Project;
  company?: Company;
  contact?: Contact;
  metrics?: Metrics;
  icpCriteria?: string;
  history?: FollowupHistory;
}

const known = (value: string) => Boolean(value.trim()) && value.toUpperCase() !== "UNKNOWN";
const normalizeCountry = (value: string) => /^(united states|us|usa|美国)$/i.test(value.trim()) ? "us" : value.trim().toLowerCase();
const sameCountry = (a: string, b: string) => normalizeCountry(a) === normalizeCountry(b);

export function analyzeBuyer(project: Project, company: Company, contact: Contact, icpCriteria?: string): AIAnalysis {
  const isPublic = company.dataset === "public";
  const facts = isPublic ? undefined : researchFacts[company.id];
  const { scores } = scoreBuyer(company, contact, project);
  const marketMatch = sameCountry(project.target_country, company.country);
  const productMatch = scores.product_fit > 0;
  const profile = [
    known(company.main_products) ? `${isPublic ? "人工核对资料" : "模拟资料"}：${company.company_name} 经营 ${productsLabel(company.main_products)}。` : "",
    known(company.distribution_channel) ? `${isPublic ? "人工核对资料" : "模拟资料"}：渠道为 ${channelLabel(company.distribution_channel)}。` : "",
    known(company.city) ? `${isPublic ? "人工核对资料" : "模拟资料"}：位于 ${cityLabel(company.city)}，${countryLabel(company.country)}。` : "",
    ...(isPublic ? (company.research_evidence ?? []).map(evidence => `官网原文（${evidence.url}）：${evidence.snippet}`) : []),
  ].filter(Boolean);
  const intent = facts?.intentEvidence ?? [];
  return {
    icp_fit: !productMatch ? "LOW" : scores.icp_fit >= 30 ? "HIGH" : scores.icp_fit >= 20 ? "MEDIUM" : "LOW",
    icp_reasons: [
      marketMatch ? `客户所在国 ${countryLabel(company.country)} 与目标市场匹配。` : `客户所在国 ${countryLabel(company.country)} 与目标市场 ${countryLabel(project.target_country)} 不匹配。`,
      `客户类型为 ${companyTypeLabel(company.company_type)}，目标类型为 ${companyTypeLabel(project.target_buyer_type)}；等级依据固定匹配规则。`,
      ...(!productMatch ? ["当前产品未形成可核验的品类匹配，需重新评估目标客户匹配度。"] : []),
    ],
    icp_uncertainties: [
      isPublic ? "资料来自公开网站及人工核对，不代表已有商业关系或采购需求。" : "企业与资料均为演示数据，不代表已有商业关系。",
      `职位 ${jobTitleLabel(contact.title)} 的采购决策权限尚未独立核验。`,
      ...(project.selected_products?.length ? ["组合评估用于整体开发排序，仍需逐款核验产品适配、认证、起订量与选品需求。"] : []),
      ...(icpCriteria ? [`补充理想客户条件需逐项人工核验：${icpCriteria}`] : []),
    ],
    product_fit: scores.product_fit >= 20 ? "HIGH" : scores.product_fit >= 10 ? "MEDIUM" : "LOW",
    product_fit_reasons: [productMatch
      ? `经营品类 ${productsLabel(company.main_products)} 与 ${productsLabel(project.product_name)} 存在相关性；实际选品兴趣仍需确认。`
      : `资料尚未证明 ${productsLabel(company.main_products)} 与 ${productsLabel(project.product_name)} 存在品类匹配。`],
    opportunity_reasons: profile.length >= 2 ? [...profile, ...(facts?.evidence ?? []).map(valueLabel)].slice(0, 4) : ["资料不足，补充后再判断"],
    intent_signal: intent.length > 0 && scores.intent > 0
      ? { status: "VERIFIED", evidence: intent.map((item) => `仅为演示模拟证据，未经真实时机核验：${valueLabel(item)}`) }
      : { status: "NO_VERIFIED_SIGNAL", evidence: [] },
    recommended_hook: marketMatch && productMatch
      ? `围绕现有 ${productsLabel(company.main_products)} 品类，询问是否考虑补充 ${productsLabel(project.product_name)}。`
      : "先确认目标市场与产品品类，再决定是否触达。",
    risks: [isPublic ? "公开来源：采购意愿、进口能力与商业关系尚未独立核验，公开邮箱未验证投递。" : "演示数据：未确认真实采购意图或商业关系。", ...(!marketMatch ? ["目标市场不匹配。"] : []), ...(!productMatch ? ["产品品类不匹配。"] : [])],
    missing_information: ["当前品类采购计划", "进口与标签要求", "经核验的采购权限", ...(project.moq === "UNKNOWN" ? ["经确认的起订量"] : []), ...missingEnglishFacts(project).map((item) => `待确认英文表达：${item}`)],
  };
}

const chinese = /[\u3400-\u9fff]/;
/** 对外邮件只引用已有英文资料；未知或中文客户字段不猜测翻译。 */
function publicMailCompany(company: Company): Company {
  if (company.dataset !== "public") return company;
  const english = (value: string) => known(value) && !chinese.test(value);
  return { ...company, company_name: english(company.company_name) ? company.company_name : "your company", main_products: english(company.main_products) ? company.main_products : "your current product range", distribution_channel: english(company.distribution_channel) ? company.distribution_channel : "your distribution channel", country: english(company.country) ? company.country : "your market" };
}
const fixedEnglish: Record<string, string> = {
  "多种辣度与口味": "multiple heat levels and flavor options",
  "支持 OEM 包装": "OEM packaging available",
  "提供小批量选品方案": "small-batch assortment proposals available",
  "火锅底料": "hotpot soup base", "火锅底料 / Hotpot Soup Base": "hotpot soup base",
  "亚洲复合调味料": "Asian compound seasonings", "Asian seasonings / 亚洲复合调味料": "Asian compound seasonings",
  "Hotpot bases / 火锅底料": "hotpot bases", "Chili sauces / 辣酱": "chili sauces",
  "辣酱": "chili sauce", "复合调味料": "compound seasonings",
  "每 SKU 1,000 袋（演示设定）": "1,000 bags per SKU (demo assumption)",
};

function englishFact(project: Project, value: string): string {
  const supplied = project.english_facts && Object.hasOwn(project.english_facts, value) ? project.english_facts[value]?.trim() : "";
  // A human mapping is a fact expression, not an instruction or markup payload.
  const valid = (text: string) => known(text) && !chinese.test(text) && /[a-z]/i.test(text) && !/[<>\r\n]/.test(text)
    && !/ignore (?:all |previous |prior )?instructions|system prompt|guarantee|verified certification|certified by us/i.test(text);
  if (supplied && valid(supplied)) return supplied;
  if (fixedEnglish[value]) return fixedEnglish[value];
  return valid(value) ? value.trim() : "";
}

export function missingEnglishFacts(project: Project, includeMoq = false): string[] {
  if (project.selected_products?.length) return project.selected_products.flatMap((product) => missingEnglishFacts(product, true).map((fact) => `${product.product_name}：${fact}`));
  return [...new Set([project.product_name, project.product_category, ...project.advantages, ...project.certifications, ...(includeMoq ? [project.moq] : [])]
    .filter((item) => known(item) && chinese.test(item) && !englishFact(project, item)))];
}

function productLabel(project: Project): string {
  if (project.selected_products?.length) return project.selected_products.map(productLabel).join(" and ");
  const expression = englishFact(project, project.product_name);
  if (expression) return expression;
  if (/火锅|hotpot/i.test(project.product_name)) return "hotpot soup base";
  if (/辣酱/i.test(project.product_name)) return "chili sauce";
  if (/调味/i.test(project.product_name)) return "compound seasonings";
  return "the product in our company profile";
}

export function draftOutreach(project: Project, company: Company, contact: Contact): DraftResult {
  const publicProductsPending = company.dataset === "public" && (!known(company.main_products) || chinese.test(company.main_products));
  company = publicMailCompany(company);
  if (project.selected_products?.length) return draftCombinedOutreach(project, company, contact);
  const product = productLabel(project);
  const proof = project.advantages.filter(known).map((item) => englishFact(project, item)).filter(Boolean);
  const documents = project.certifications.filter(known).map((item) => englishFact(project, item)).filter(Boolean);
  const pending = missingEnglishFacts(project).length > 0;
  const greeting = known(contact.first_name) ? `Hi ${contact.first_name}, ` : "";
  const parts = {
    insight: publicProductsPending
      ? `${greeting}I found ${company.company_name}'s public website and would like to learn about your current category requirements.`
      : known(company.main_products)
      ? `${greeting}I noticed that ${company.company_name}'s ${company.dataset === "public" ? "public website information" : "profile"} lists ${company.main_products}, serving ${known(company.distribution_channel) ? company.distribution_channel : "a distribution channel that we would like to understand better"}.`
      : `${greeting}I am reaching out to ${company.company_name} to learn whether ${product} is relevant to your current assortment.`,
    relevance: `We produce ${product}. If this category is relevant to your buying plan in ${company.country}, it may be worth reviewing whether it complements your assortment.`,
    proof: [proof.length ? `Our supplied product information lists ${proof.join("; ")}.` : "We would first confirm the product specifications with you.",
      ...(documents.length ? [`The project owner lists ${documents.join("; ")}; the supporting documentation still needs confirmation.`] : []),
      ...(pending ? ["Some owner-supplied details still need a confirmed English expression before they can be shared."] : []),
      "We can review the supporting specifications and documentation before an evaluation."].join(" "),
    cta: `If ${product} is a category you are evaluating, would a brief SKU and indicative pricing discussion be useful? No meeting is needed at this stage.`,
  };
  return { subject: `${product} for ${company.company_name}'s assortment`, body: Object.values(parts).join("\n\n"), parts };
}

function requireCombinedEnglish(project: Project) {
  const missing = missingEnglishFacts(project);
  if (missing.length) throw new Error(`请先为以下产品资料确认英文表达：${missing.join("；")}。`);
}

function combinedProof(project: Project): string {
  return project.selected_products!.map((product) => {
    const advantages = product.advantages.filter(known).map((fact) => englishFact(product, fact)).filter(Boolean);
    const certifications = product.certifications.filter(known).map((fact) => englishFact(product, fact)).filter(Boolean);
    const moq = known(product.moq) ? englishFact(product, product.moq) : "";
    return `${productLabel(product)}: ${[
      advantages.length ? `supplied features: ${advantages.join("; ")}` : "product specifications still need confirmation",
      ...(certifications.length ? [`supplied certification information: ${certifications.join("; ")} (supporting documents and applicability need confirmation)`] : []),
      ...(moq ? [`supplied MOQ: ${moq} (subject to confirmation)`] : []),
    ].join("; ")}.`;
  }).join(" ") + " These details belong to the named product only; each product requires its own specification and documentation review.";
}

function draftCombinedOutreach(project: Project, company: Company, contact: Contact): DraftResult {
  requireCombinedEnglish(project);
  const product = productLabel(project);
  const parts = {
    insight: company.dataset === "public" && company.main_products === "your current product range"
      ? `I found ${company.company_name}'s public website and would like to learn about your current category requirements.`
      : known(company.main_products)
      ? `${known(contact.first_name) ? `Hi ${contact.first_name}, ` : ""}I noticed that ${company.company_name}'s ${company.dataset === "public" ? "public website information" : "profile"} lists ${company.main_products}. I would like to understand your assortment priorities.`
      : `${known(contact.first_name) ? `Hi ${contact.first_name}, ` : ""}I am reaching out to ${company.company_name} to learn about your current category requirements.`,
    relevance: `We produce ${product} and would like to explore whether these products, individually or as a combination, could complement your assortment in ${chinese.test(project.target_country) ? "your target market" : project.target_country}. Each product can be evaluated separately against your buying requirements.`,
    proof: combinedProof(project),
    cta: "Would a brief comparison of these products and your preferred SKUs be useful? We can start with the products most relevant to your assortment, without scheduling a meeting.",
  };
  return { subject: `${product} for ${company.company_name}'s assortment`, body: Object.values(parts).join("\n\n"), parts };
}

function followupValues(project: Project, history?: FollowupHistory): { key: string; paragraph: string }[] {
  if (project.selected_products?.length) {
    const previous = [history?.previous_email || "", ...(history?.followups ?? []).map((item) => item.body)].join("\n").toLowerCase();
    const values = project.selected_products.flatMap((product) => {
      const prefix = `product:${encodeURIComponent(product.id)}:`;
      const used = (history?.used_value_keys ?? []).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
      return followupValues(product, { previous_email: "", followups: [], used_value_keys: used }).filter((value) => value.key !== "timing")
        .map((value) => ({ key: `${prefix}${value.key}`, paragraph: `Regarding ${productLabel(product)}: ${value.paragraph} This evaluation point applies to this product only.` }))
        .filter((value) => !previous.includes(value.paragraph.toLowerCase()));
    });
    return values.length ? values : [{ key: "timing", paragraph: "We do not have additional confirmed information to add for the selected products. We would welcome your preferred evaluation timing and which products are relevant before preparing more detail." }];
  }
  const previous = [history?.previous_email || "", ...(history?.followups ?? []).map((item) => item.body)].join("\n").toLowerCase();
  const used = new Set(history?.used_value_keys ?? []);
  const values = [
    { key: "specifications", supported: known(project.product_name), marker: /ingredient and allergen/, paragraph: "An additional way to assess category fit is to compare ingredient and allergen requirements with your channel's evaluation criteria. We can outline the questions around the requirements you share; specifications and declarations still need confirmation." },
    { key: "packaging", supported: project.advantages.some((item) => /pack|包装|oem/i.test(englishFact(project, item))), marker: /retail unit size|case configuration/, paragraph: "Your channel requirements could guide a pack-format comparison: retail unit size, case configuration and handling requirements. Our supplied information lists packaging options; actual formats and specifications still need confirmation." },
    { key: "flavor", supported: project.advantages.some((item) => /flavor|heat level|口味|辣度/i.test(englishFact(project, item))), marker: /flavor preferences/, paragraph: "The owner-supplied information lists flavor options. A short checklist of your flavor preferences and heat-level requirements could help identify which specifications to confirm before discussing samples." },
    { key: "documentation", supported: project.certifications.some((item) => Boolean(englishFact(project, item))), marker: /document checklist|supporting certification documents/, paragraph: "Your import and labeling requirements could guide a document checklist. The project owner has supplied certification information; supporting certification documents and applicability still need confirmation before evaluation." },
  ].filter((item) => item.supported && !used.has(item.key) && !item.marker.test(previous));
  if (!values.length) return [{ key: "timing", paragraph: "We do not have additional confirmed product information to add at this point. If the category is relevant, we would welcome your preferred timing or evaluation requirements before preparing more detail." }];
  return values;
}

export function draftFollowup(project: Project, company: Company, contact: Contact, history?: FollowupHistory): FollowupResult {
  company = publicMailCompany(company);
  if (project.selected_products?.length) requireCombinedEnglish(project);
  const product = productLabel(project);
  const value = followupValues(project, history)[0];
  return {
    subject: `A category review idea for ${company.company_name}`,
    value_key: value.key,
    body: [
      `${known(contact.first_name) ? `Hi ${contact.first_name}, ` : ""}${history?.previous_email ? "Following our earlier product note, " : "For a product discussion, "}we would like to understand whether ${product} is relevant to your ${company.main_products} assortment.`,
      value.paragraph,
      "Would a short list of your preferred pack formats help us prepare that comparison? Please feel free to let me know if the timing is not suitable.",
    ].join("\n\n"),
  };
}

export function salesInsights(metrics: Metrics): SalesInsights {
  return {
    facts: [
      `共 ${metrics.total} 家客户，已记录联系 ${metrics.contacted} 家、回复 ${metrics.replied} 家、会议安排 ${metrics.meeting} 家、报价 ${metrics.quoted} 家。`,
      metrics.contacted ? `回复率为 ${metrics.replyRate.toFixed(1)}%，分母为 ${metrics.contacted} 家有首次联系记录的客户。` : "尚无首次联系记录，回复率暂无数据。",
      `尚无首次联系记录的客户为 ${Math.max(0, metrics.total - metrics.contacted)} 家；这表示待确认开发进展，不能推定为流失。`,
    ],
    hypotheses: [
      metrics.contacted === 0 ? "尚未记录触达，暂时没有足够证据判断文案效果。" : "产品相关性或触达时机可能影响回复；这是待验证假设，并非已确认原因。",
      "当前模拟样本量较小，不足以判断某一客户类型一定优于其他类型。",
    ],
    recommendations: ["在同一客户类型中测试两种产品相关性切入点。", "补充采购权限与选品计划，再确定下一批联系优先级。", "积累更多回复记录后比较转化，模拟发送前仍须人工审核。"],
  };
}

export type ApprovedOptions = Record<string, string[]>;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function sentencePools(value: unknown, prefix = "", pools: ApprovedOptions = {}): ApprovedOptions {
  if (typeof value === "string") pools[prefix] = [value];
  else if (Array.isArray(value) && value.every((item) => typeof item === "string")) pools[prefix] = [...value];
  else if (record(value)) for (const [key, item] of Object.entries(value)) sentencePools(item, prefix ? `${prefix}.${key}` : key, pools);
  return pools;
}

// Choices are derived from the supplied profile and documented capabilities.
// The model can select and combine them, while factual wording remains auditable.
export function approvedOptions(input: AIRequest): ApprovedOptions {
  const safe = cachedResult(input);
  const options = sentencePools(safe);
  if (input.task === "analyst") {
    const m = input.metrics!;
    options.facts.push(m.total ? `已成交 ${m.won} 家客户，成交占比为 ${m.winRate.toFixed(1)}%；分母为 ${m.total} 家全部客户。`
      : "全部客户数为 0，成交占比暂无数据。");
    for (const p of m.priority) options.facts.push(`${priorityLabel(p.priority)} 共 ${p.total} 家，已联系 ${p.contacted} 家、已回复 ${p.replied} 家。`);
    options.hypotheses.push("采购权限资料缺失可能增加评估难度，尚需更多访谈验证。", "不同渠道的选品周期可能存在差异，当前数据不能确认这一点。");
    options.recommendations.push("将下一轮测试限定在同一市场与同一采购角色，记录不同切入点的回复。", "优先人工检查已经逾期的跟进，补充增值信息后再审核草稿。");
    return options;
  }
  const project = input.project!;
  const company = input.task === "analysis" ? input.company! : publicMailCompany(input.company!);
  const product = productLabel(project);
  if (input.task === "analysis") {
    const analysis = safe as AIAnalysis;
    if (company.dataset !== "public" && !analysis.opportunity_reasons.includes("资料不足，补充后再判断")) options.opportunity_reasons.push(...(researchFacts[company.id]?.evidence ?? []).map(valueLabel));
    options.icp_uncertainties.push("尚未核验实际进口能力与品类预算。", "公司规模不能替代对采购权限的确认。");
    options.risks.push("选品、价格与合规要求仍需与客户确认。");
    options.missing_information.push("目标包装规格", "品类评估与采购时间表");
    options.recommended_hook.push(analysis.icp_fit === "LOW" || analysis.product_fit === "LOW"
      ? "先补齐市场、品类与采购权限证据，再判断是否适合触达。"
      : `从 ${channelLabel(company.distribution_channel)} 渠道的选品需求切入，询问 ${productsLabel(project.product_name)} 的包装与口味要求。`);
    return options;
  }
  if (input.task === "outreach") {
    const draft = safe as DraftResult;
    options.subject.push(`${company.company_name}: a ${product} category question`, `Exploring ${product} assortment fit`);
    if (company.dataset !== "public") options["parts.insight"].push(
      `Your company profile lists ${company.main_products}. I am writing to ${company.company_name} with a category question related to that assortment.`,
      `I noticed that ${company.company_name} serves ${company.distribution_channel}. Would a ${product} category review be relevant to that channel?`,
    );
    options["parts.relevance"].push(
      `Our ${product} could be evaluated alongside your ${company.main_products}. We would first want to understand your category requirements in ${company.country}.`,
      `Before proposing ${product}, we would like to understand whether your current buying plan includes this category and which pack formats matter to your channel.`,
    );
    const capabilities = project.advantages.map((item) => englishFact(project, item)).filter(Boolean);
    if (!project.selected_products?.length) options["parts.proof"].push(capabilities.length
      ? `The product information supplied for this project lists ${capabilities[0]}. Any specification or certification requirement would need to be confirmed before an evaluation.`
      : "There is no customer case study in the supplied information. We would confirm the product documentation and your evaluation requirements before making a proposal.");
    options["parts.cta"].push(
      `If this category is on your radar, could you share one or two assortment requirements? We can start with a brief product information exchange.`,
      `Would a short ${product} SKU discussion be useful for your category review? Please feel free to suggest a more suitable time.`,
    );
    // Keep the default object valid even when it has no factual proof beyond the source profile.
    options["parts.proof"] = [...new Set([draft.parts.proof, ...options["parts.proof"]])];
    return options;
  }
  const followup = safe as FollowupResult;
  const paragraphs = followup.body.split("\n\n");
  options.subject.push(`${company.company_name}: pack format evaluation`, `Another way to assess ${product} category fit`);
  options.reminder = [paragraphs[0], `I previously wrote about reviewing ${product} alongside ${company.company_name}'s ${company.main_products} assortment.`];
  const values = followupValues(project, input.history);
  options.value = values.map((item) => item.paragraph);
  options.value_key = values.map((item) => item.key);
  for (const item of values) options[`value.${item.key}`] = [item.paragraph];
  options.cta = [paragraphs[2], "Would sharing your preferred pack size or a short category checklist be a useful next step? There is no need to schedule a call unless it would help."];
  return options;
}

export function validateAIResult(task: AITask, value: unknown, safe: unknown, choices?: ApprovedOptions): boolean {
  if (!record(value) || !record(safe)) return false;
  const options = choices ?? sentencePools(safe);
  const keysMatch = (candidate: Record<string, unknown>, expected: string[]) => Object.keys(candidate).length === expected.length && expected.every((key) => Object.hasOwn(candidate, key));
  if (!keysMatch(value, Object.keys(safe))) return false;
  const selected = (path: string, candidate: unknown) => typeof candidate === "string" && (options[path] ?? []).includes(candidate);
  const selectedArray = (path: string, candidate: unknown, min = 1, max = 6) => Array.isArray(candidate) && candidate.length >= min && candidate.length <= max
    && new Set(candidate).size === candidate.length && candidate.every((item) => selected(path, item));
  if (task === "analysis") {
    const expected = safe as unknown as AIAnalysis;
    return value.icp_fit === expected.icp_fit && value.product_fit === expected.product_fit
      && selectedArray("icp_reasons", value.icp_reasons) && selectedArray("icp_uncertainties", value.icp_uncertainties)
      && selectedArray("product_fit_reasons", value.product_fit_reasons)
      && selectedArray("opportunity_reasons", value.opportunity_reasons, expected.opportunity_reasons.includes("资料不足，补充后再判断") ? 1 : 2, expected.opportunity_reasons.includes("资料不足，补充后再判断") ? 1 : 4)
      && record(value.intent_signal) && keysMatch(value.intent_signal, ["status", "evidence"])
      && value.intent_signal.status === expected.intent_signal.status
      && selectedArray("intent_signal.evidence", value.intent_signal.evidence, expected.intent_signal.status === "NO_VERIFIED_SIGNAL" ? 0 : 1, expected.intent_signal.status === "NO_VERIFIED_SIGNAL" ? 0 : 4)
      && selected("recommended_hook", value.recommended_hook)
      && selectedArray("risks", value.risks) && selectedArray("missing_information", value.missing_information);
  }
  if (task === "outreach") {
    return selected("subject", value.subject) && record(value.parts) && keysMatch(value.parts, ["insight", "relevance", "proof", "cta"])
      && Object.entries(value.parts).every(([key, part]) => selected(`parts.${key}`, part))
      && value.body === [value.parts.insight, value.parts.relevance, value.parts.proof, value.parts.cta].join("\n\n");
  }
  if (task === "followup") {
    if (!choices) return value.subject === safe.subject && value.body === safe.body && value.value_key === safe.value_key;
    const paragraphs = typeof value.body === "string" ? value.body.split("\n\n") : [];
    return selected("subject", value.subject) && selected("value_key", value.value_key) && paragraphs.length === 3
      && selected("reminder", paragraphs[0]) && selected(`value.${value.value_key}`, paragraphs[1]) && selected("cta", paragraphs[2]);
  }
  return task === "analyst" && selectedArray("facts", value.facts, 1, 4) && selectedArray("hypotheses", value.hypotheses, 1, 3) && selectedArray("recommendations", value.recommendations, 1, 4);
}

export function cachedResult(input: AIRequest) {
  if (input.task === "analyst") return salesInsights(input.metrics!);
  if (input.task === "analysis") return analyzeBuyer(input.project!, input.company!, input.contact!, input.icpCriteria);
  if (input.task === "outreach") return draftOutreach(input.project!, input.company!, input.contact!);
  return draftFollowup(input.project!, input.company!, input.contact!, input.history);
}
