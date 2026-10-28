"use client";
import { useEffect, useState, type FormEvent } from "react";
import { COMPANY_TYPE_ZH, type Project } from "@/lib/types";
import { saveProduct, selectProduct, saveBusinessProfile, isSupportedProduct } from "@/lib/workflow";
import { missingEnglishFacts } from "@/lib/ai";
import { countryLabel, productsLabel } from "@/lib/display";
import { useDemo } from "./demo-provider";
import { LinkButton, PageHeading } from "./ui";
import { DocumentImport } from "./document-import";

const lines = (value: string) => value.split("\n").map(x => x.trim()).filter(Boolean);
const typeWords: Record<string, string[]> = { Importer: ["importer", "进口商"], Distributor: ["distributor", "经销商"], "Private Label Brand": ["private label", "自有品牌"], "Asian Grocery Chain": ["grocery", "超市"], "Foodservice Distributor": ["foodservice", "餐饮"], Wholesaler: ["wholesaler", "批发"] };
function productForm(project: Project, icpCriteria: string) {
  return { product_name: project.product_name, product_category: project.product_category, description: project.description, advantages: project.advantages.join("\n"), certifications: project.certifications.join("\n"), moq: project.moq === "UNKNOWN" ? "" : project.moq, target_country: project.target_country, target_buyer_type: project.target_buyer_type, icpCriteria, english_facts: project.english_facts ?? {} };
}
type Form = ReturnType<typeof productForm>;
function SectionHeading({ number, title, description }: { number: number; title: string; description: string }) {
  return <div className="setup-section-heading"><span className="setup-section-number">{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>;
}
export function ProjectSettings() {
  const { state, update } = useDemo();
  if (state.project.selected_products) return <div className="workspace-page settings-workspace">
    <PageHeading eyebrow="企业产品和资料" title="先选择要编辑的产品" description="当前正在开发产品组合。产品资料按单款保存，请选择一款来编辑；组合开发记录会保留。"><LinkButton href="/" secondary>返回客户开发</LinkButton></PageHeading>
    <DocumentImport />
    <section className="setup-section"><SectionHeading number={1} title="我的产品目录" description="点击一款产品，进入企业资料、产品资料和目标市场的填写页面。"/><div className="product-library">{state.products.map(product => <div key={product.project.id} className="product-library-card"><h3>{productsLabel(product.project.product_name)}</h3><p>{countryLabel(product.project.target_country)}市场</p><button className="button secondary" onClick={() => update(current => selectProduct(current, product.project.id), "已选择单款产品，组合开发记录保留。")}>编辑这款产品</button></div>)}</div></section>
  </div>;
  return <SettingsEditor key={state.project.id} />;
}
function SettingsEditor() {
  const { state, update, notify, reset } = useDemo();
  const baselineBusiness = { company_name: state.business_profile.confirmed ? state.business_profile.company_name : "", description: state.business_profile.confirmed ? state.business_profile.description : "" };
  const [business, setBusiness] = useState(baselineBusiness);
  const [form, setForm] = useState(() => productForm(state.project, state.icpCriteria));
  const [creating, setCreating] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const businessDirty = JSON.stringify(business) !== JSON.stringify(baselineBusiness);
  const productDirty = creating || JSON.stringify(form) !== JSON.stringify(productForm(state.project, state.icpCriteria));
  const dirty = businessDirty || productDirty;
  const project: Project = { ...state.project, company_name: state.business_profile.company_name, product_name: form.product_name, product_category: form.product_category, description: form.description, target_country: form.target_country, target_buyer_type: form.target_buyer_type, advantages: lines(form.advantages), certifications: lines(form.certifications), moq: form.moq.trim() || "UNKNOWN", english_facts: Object.keys(form.english_facts).length ? form.english_facts : undefined };
  const missing = missingEnglishFacts(project, true);
  const needsEnglish = missingEnglishFacts({ ...project, english_facts: undefined }, true);
  const selectedTypes = Object.keys(typeWords).filter(key => typeWords[key].some(word => form.target_buyer_type.toLowerCase().includes(word)));
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest("a");
      if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey) return;
      const target = new URL(anchor.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm("企业或产品资料有未保存的修改。确定放弃修改并离开吗？")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  function edit<K extends keyof Form>(key: K, value: Form[K]) { setForm(f => ({ ...f, [key]: value })); }
  function discardChanges() { return !dirty || window.confirm("切换会放弃未保存的企业或产品资料。确定继续吗？"); }
  function chooseProduct(id: string) {
    if (!discardChanges()) return;
    const selected = state.products.find(item => item.project.id === id)!;
    if (update(current => selectProduct(current, id), "已选择开发产品，各产品的邮件与进展分别保留。")) {
      setBusiness(baselineBusiness); setForm(productForm(selected.project, selected.icpCriteria)); setCreating(false);
    }
  }
  function addProduct() {
    if (!discardChanges()) return;
    setBusiness(baselineBusiness); setCreating(true);
    setForm({ ...productForm(state.project, state.icpCriteria), product_name: "", product_category: "", description: "", advantages: "", certifications: "", moq: "", english_facts: {} });
    requestAnimationFrame(() => document.getElementById("product-name")?.focus());
  }
  function saveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!business.company_name.trim()) { notify("请先填写你公司的企业名称。"); return; }
    const ok = update(current => saveBusinessProfile(current, business), businessDirty ? "企业资料已保存，所有产品共用这份资料；未发邮件请重新核对。" : "企业资料已确认，所有产品共用这份资料。");
    if (ok) setBusiness({ company_name: business.company_name.trim(), description: business.description.trim() });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.business_profile.confirmed || businessDirty) { notify("请先点击“保存企业资料”，再保存产品。"); document.getElementById("business")?.scrollIntoView(); return; }
    if (![form.product_name, form.product_category, form.description, form.target_country, form.target_buyer_type, form.icpCriteria].every(value => value.trim())) { notify("请填写产品、目标市场、客户类型和客户标准。"); return; }
    let savedForm = form;
    const ok = update(current => { const next = saveProduct(current, project, form.icpCriteria, creating); savedForm = productForm(next.project, next.icpCriteria); return next; }, creating ? "新产品已保存并选为当前开发产品，原产品和记录保留。" : productDirty ? "产品资料已保存，原稿与已发历史保留；未发邮件请重新审核。" : "资料没有变化，原有草稿与审核保持不变。");
    if (ok) { setCreating(false); setForm(savedForm); }
  }
  const workspaces = [...state.products, ...state.product_groups.map(group => group.workspace)];
  const draftCount = workspaces.reduce((total, product) => total + product.drafts.length + product.followup_drafts.length, 0);
  const activityCount = workspaces.reduce((total, product) => total + product.activities.length, 0);
  return <div className="workspace-page settings-workspace">
    <PageHeading eyebrow="资料填写" title="我的企业产品和资料" description="填一次企业资料，保存多款产品；开发时可选一款或任选几款组成组合。"><LinkButton href="/buyers" icon="arrow" secondary>查看当前产品的客户</LinkButton></PageHeading>
    <div className="settings-top-summary"><div><strong>{state.business_profile.confirmed ? state.business_profile.company_name : "先填写你公司的资料"}</strong><p>企业是供应商公司，不是个人账号；资料保存在当前浏览器。</p></div><span className="badge pale-green">已保存 {state.products.length} 款产品</span></div>
    <DocumentImport beforeApply={() => !dirty || window.confirm("当前企业或产品表单有未保存的修改。确认导入会保存导入预览，并放弃当前表单的未保存修改，是否继续？")} />
    <nav className="setup-navigation" aria-label="资料填写步骤"><a href="#business">1 企业资料</a><a href="#products">2 产品目录</a><a href="#market">3 目标市场</a></nav>
    <section id="business" className="setup-section"><SectionHeading number={1} title="企业资料" description="填写你所在公司的信息。所有产品共用这份资料，不需要每添加一款产品就重填。" />
      <form onSubmit={saveBusiness}><div className="product-form-grid"><label className="field">企业名称<input required aria-label="企业名称" value={business.company_name} onChange={event => setBusiness({ ...business, company_name: event.target.value })} placeholder="例如 川味食品有限公司" /></label><label className="field">企业简介（选填）<textarea aria-label="企业简介（选填）" rows={3} value={business.description} onChange={event => setBusiness({ ...business, description: event.target.value })} placeholder="例如 工厂所在地、主营业务、供应能力" /></label></div><div className="product-form-actions"><span className="muted" role="status">{businessDirty ? "企业资料有未保存的修改" : state.business_profile.confirmed ? "企业资料已保存" : "当前展示的是演示企业，请填写你的公司"}</span><button type="submit" className="button primary">保存企业资料</button></div></form>
    </section>
    <form onSubmit={submit}>
      <section id="products" className="setup-section"><SectionHeading number={2} title="产品目录" description="一款产品保存一份资料。添加产品保留已有产品；到客户开发页面，可选一款或任选几款组合开发。" />
        <div className="product-section-layout"><div className="product-library" aria-label="已保存产品">{state.products.map(product => <div key={product.project.id} className={`product-library-card ${state.project.id === product.project.id ? "is-active" : ""}`}>
          <h3>{productsLabel(product.project.product_name)}</h3><p>{countryLabel(product.project.target_country)}市场 · {product.drafts.length + product.followup_drafts.length} 份邮件</p><small>{!product.project.product_confirmed ? "预置示例 · 先填写产品资料" : state.project.id === product.project.id ? "当前开发产品" : "产品与开发记录已保存"}</small>
          <button type="button" className="button secondary" onClick={() => chooseProduct(product.project.id)}>{state.project.id === product.project.id && !creating ? "重新载入已保存资料" : "选择并编辑"}</button>
        </div>)}<button type="button" className="button primary" onClick={addProduct}>＋ 添加产品</button><p className="field-help">如有 N 款产品，重复“添加产品 → 保存新产品”。已有记录随产品分别保留。</p></div>
          <div><h3>{creating ? "填写新产品" : "编辑当前产品"}</h3><p className="product-status-note">{creating ? "这里只填写新产品。保存后可在目录中切换回来。" : !state.project.product_confirmed ? "下方为预置示例，可改成你的第一款产品，也可以点击添加产品。" : "下方资料只属于这款产品。修改后请保存，其他产品的记录不受影响。"}</p>
            <div className="product-form-grid"><label className="field">产品名称<input id="product-name" aria-label="产品名称" required value={form.product_name} onChange={event => edit("product_name", event.target.value)} placeholder="例如 麻辣火锅底料" /></label><label className="field">产品品类<select required aria-label="产品品类" value={form.product_category} onChange={event => edit("product_category", event.target.value)}><option value="" disabled>请选择品类</option>{!["Asian seasonings / 亚洲复合调味料", "Hotpot bases / 火锅底料", "Chili sauces / 辣酱", "Other / 其它品类", ""].includes(form.product_category) && <option value={form.product_category}>{productsLabel(form.product_category)}</option>}<option value="Asian seasonings / 亚洲复合调味料">亚洲复合调味料</option><option value="Hotpot bases / 火锅底料">火锅底料</option><option value="Chili sauces / 辣酱">辣酱</option><option value="Other / 其它品类">其它品类（暂不支持评分）</option></select></label></div>
            <label className="field">产品简介<textarea aria-label="产品简介" required rows={3} value={form.description} onChange={event => edit("description", event.target.value)} placeholder="说明这一款产品的规格、特点与适用渠道" /></label>
            <div className="product-form-grid"><label className="field">产品优势 · 每行一项<textarea aria-label="产品优势 · 每行一项" rows={3} value={form.advantages} onChange={event => edit("advantages", event.target.value)} placeholder={"支持 OEM 包装\n多种辣度与口味"} /></label><label className="field">已有认证 · 每行一项<textarea aria-label="已有认证 · 每行一项" rows={3} value={form.certifications} onChange={event => edit("certifications", event.target.value)} placeholder="仅填写这款产品实际持有的认证" /></label></div>
            <label className="field">起订量（选填）<input aria-label="起订量（选填）" value={form.moq} onChange={event => edit("moq", event.target.value)} placeholder="例如 每款 1,000 袋；待确认可留空" /></label>
            {form.product_name && !isSupportedProduct(project) && <div className="notice">当前演示评分适用于火锅底料、辣酱与复合调味料。其他产品可保存，但暂不可评估客户匹配度。</div>}
            {needsEnglish.length > 0 && <details className="detail-disclosure" open><summary>用于客户邮件的英文表达 · {missing.length ? `${missing.length} 项待确认` : "已填写"}</summary><section className="english-confirmation"><p>中文界面负责填写资料，英文表达供海外客户邮件使用。可先保存产品，起草邮件前再补齐；不要增加原文没有的能力或认证。</p>{needsEnglish.map(item => <label className="field" key={item}>{item}<input aria-label={`英文表达：${item}`} value={form.english_facts[item] ?? ""} placeholder="填写对应英文表达" onChange={event => edit("english_facts", { ...form.english_facts, [item]: event.target.value })} /></label>)}</section></details>}
            {Object.keys(form.english_facts).some(key => !needsEnglish.includes(key)) && <details className="detail-disclosure"><summary>已确认的英文表达</summary>{Object.entries(form.english_facts).filter(([key]) => !needsEnglish.includes(key)).map(([key, value]) => <label className="field" key={key}>{key}<input aria-label={`英文表达：${key}`} value={value} onChange={event => edit("english_facts", { ...form.english_facts, [key]: event.target.value })} /></label>)}</details>}
          </div></div>
      </section>
      <section id="market" className="setup-section"><SectionHeading number={3} title="这款产品的目标市场" description="告诉系统这款产品卖到哪里、希望找哪类客户。每款产品可以选择不同市场和客户类型。" />
        <label className="field">目标市场<select aria-label="目标市场" value={form.target_country} onChange={event => edit("target_country", event.target.value)}><option value="United States">美国（预置客户所在市场）</option>{!["United States", "Canada", "Germany"].includes(form.target_country) && <option value={form.target_country}>{countryLabel(form.target_country)}</option>}<option value="Canada">加拿大（暂无演示客户）</option><option value="Germany">德国（暂无演示客户）</option></select></label>
        <fieldset className="buyer-type-options"><legend>希望开发的客户类型</legend>{Object.keys(typeWords).map(key => <label className="checkbox-label" key={key}><input type="checkbox" checked={selectedTypes.includes(key)} onChange={() => edit("target_buyer_type", (selectedTypes.includes(key) ? selectedTypes.filter(value => value !== key) : [...selectedTypes, key]).join(" / "))}/>{COMPANY_TYPE_ZH[key]}</label>)}</fieldset>
        <label className="field">理想客户标准<textarea aria-label="理想客户标准" required rows={3} value={form.icpCriteria} onChange={event => edit("icpCriteria", event.target.value)} /></label><p className="field-help">客户标准供人工核验参考。固定评分使用市场、客户类型、产品品类与演示证据，文字不会自动变成评分规则。</p>
        <div className="product-form-actions"><span className="muted" role="status">{productDirty ? "产品资料有未保存的修改" : "产品资料已保存"}</span>{creating && <button type="button" className="button secondary" onClick={() => chooseProduct(state.project.id)}>取消添加</button>}<button type="submit" className="button primary">{creating ? "保存新产品" : "保存产品资料"}</button><LinkButton href="/buyers" icon="arrow" secondary>开发当前产品的客户</LinkButton></div>
      </section>
    </form>
    <details className="detail-disclosure"><summary>演示数据管理</summary><p>恢复会清除本浏览器保存的企业资料、全部 {state.products.length} 款产品、{draftCount} 份邮件和 {activityCount} 条活动，重新载入演示数据。</p>{confirmReset ? <div className="heading-actions"><button type="button" className="button danger" onClick={() => { reset(); setConfirmReset(false); }}>确认恢复全部演示数据</button><button type="button" className="button secondary" onClick={() => setConfirmReset(false)}>取消</button></div> : <button type="button" className="button secondary" onClick={() => setConfirmReset(true)}>恢复演示数据</button>}</details>
  </div>;
}
