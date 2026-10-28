"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDemo } from "./demo-provider";
import { COMPANY_TYPE_ZH, type CompanyType } from "@/lib/types";
import { fullDate, valueLabel } from "@/lib/display";
import { assertCustomerVersion, captureCustomerVersion, customerFields, updateCustomer, validateCustomerReview, type CustomerFields, type CustomerVersion } from "@/lib/customer-update";
import type { WebsiteReview } from "@/lib/discovery-types";

const editable = (value: string) => value === "UNKNOWN" ? "" : value;
export function CustomerEditor({ id, onClose, verifyFirst = false }: { id: string; onClose: () => void; verifyFirst?: boolean }) {
  const { state, update } = useDemo();
  const dialog = useRef<HTMLDialogElement>(null), latest = useRef(state);
  const [fields, setFields] = useState(() => customerFields(state, id));
  const [token] = useState(() => captureCustomerVersion(state, id));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<{ review: WebsiteReview; token: CustomerVersion } | null>(null);
  const [applied, setApplied] = useState<WebsiteReview | undefined>();
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const original = state.companies.find(company => company.id === fields.company_id);
  const originalContact = state.contacts.find(contact => contact.id === fields.contact_id);
  useEffect(() => { latest.current = state; }, [state]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  function companyField(key: keyof CustomerFields["company"], value: string) {
    setFields(current => ({ ...current, company: { ...current.company, [key]: value } }));
    if (key === "website") { setPreview(null); setApplied(undefined); setConfirmed(false); }
    setError("");
  }
  function contactField(key: keyof CustomerFields["contact"], value: string) {
    setFields(current => ({ ...current, contact: { ...current.contact, [key]: value } })); setError("");
  }
  async function verify() {
    if (busy) return;
    const website = editable(fields.company.website).trim();
    if (!website || /\.example(?:[/:]|$)/i.test(website)) { setError("请填写真实公司官网后再读取。演示域名没有可核验的公开网页。"); return; }
    setError(""); setBusy(true); setPreview(null); setApplied(undefined); setConfirmed(false);
    try {
      assertCustomerVersion(latest.current, token);
      const response = await fetch("/api/discovery/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: website }), signal: AbortSignal.timeout(45000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "官网读取失败，请稍后重试。");
      const review = validateCustomerReview(result);
      assertCustomerVersion(latest.current, token);
      setPreview({ review, token }); setEmail("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "官网读取失败。原资料已保留。"); }
    finally { setBusy(false); }
  }
  function applyPreview() {
    if (!preview || !confirmed) return;
    try {
      assertCustomerVersion(latest.current, preview.token);
      setFields(current => ({ ...current, company: { ...current.company, website: preview.review.website }, contact: { ...current.contact, ...(email ? { email } : {}) } }));
      setApplied(preview.review); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "资料已变化，请重新打开编辑。"); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (update(current => {
      try { return updateCustomer(current, id, fields, { token, review: applied }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "客户资料保存失败，请检查后重试。"); throw cause; }
    }, "客户资料已保存，关联产品与组合的分析、CRM 和仪表盘已同步。未发送邮件需重新审核。")) onClose();
  }
  return <dialog ref={dialog} className="customer-editor-dialog" aria-label="编辑客户资料" onCancel={onClose}>
    <header className="customer-editor-heading"><div><span className="eyebrow">共享客户档案</span><h2>编辑客户资料</h2><p>一次更新，同步到已关联这家客户的产品和组合。原邮件与销售历史保留。</p></div><button type="button" className="button ghost" onClick={onClose} aria-label="关闭客户资料编辑">×</button></header>
    <form onSubmit={save} className="customer-editor-form">
      <p className="customer-editor-context">{original?.dataset === "public" ? "真实客户 · 人工补充资料不代表已确认采购意愿" : "演示客户 · 修改后仍保留演示来源"}{original?.updated_at && <span>最近更新 {fullDate(original.updated_at)}</span>}</p>
      <fieldset disabled={busy}><legend>公司资料</legend><div className="customer-editor-grid">
        <label className="field">公司名称<input required aria-label="客户公司名称" value={fields.company.company_name} onChange={e => companyField("company_name", e.target.value)} /></label>
        <label className="field">公司官网<input aria-label="客户官网" value={editable(fields.company.website)} placeholder="https://公司官网，未知可留空" onChange={e => companyField("website", e.target.value)} /></label>
        <label className="field">所在国家<input aria-label="客户所在国" value={editable(fields.company.country)} placeholder="例如 United States，未知可留空" onChange={e => companyField("country", e.target.value)} /></label>
        <label className="field">所在城市<input aria-label="客户城市" value={editable(fields.company.city)} onChange={e => companyField("city", e.target.value)} /></label>
        <label className="field">客户类型<select aria-label="客户类型" value={fields.company.company_type} onChange={e => companyField("company_type", e.target.value as CompanyType)}>{Object.entries(COMPANY_TYPE_ZH).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field">企业规模<input aria-label="客户企业规模" value={editable(fields.company.employee_range)} placeholder="例如 10–50，未知可留空" onChange={e => companyField("employee_range", e.target.value)} /></label>
        <label className="field">主营产品<textarea aria-label="客户主营产品" rows={3} value={editable(fields.company.main_products)} onChange={e => companyField("main_products", e.target.value)} /></label>
        <label className="field">经营渠道<textarea aria-label="客户经营渠道" rows={3} value={editable(fields.company.distribution_channel)} onChange={e => companyField("distribution_channel", e.target.value)} /></label>
        <label className="field customer-editor-wide">资料摘要<textarea aria-label="客户资料摘要" rows={3} value={editable(fields.company.research_summary)} onChange={e => companyField("research_summary", e.target.value)} /></label>
      </div></fieldset>
      <details className="customer-refresh-section" open={verifyFirst || !!preview}><summary>重新核验官网 · 读取最新公开来源</summary><p className="field-help">按上方官网地址读取。结果先核对再保存，公司名称、主营产品和经营渠道继续由你确认。</p><button type="button" className="button secondary" disabled={busy} onClick={() => void verify()}>{busy ? "正在读取官网…" : "读取最新官网"}</button>
        {preview && <section className="customer-refresh-preview" aria-label="官网更新预览"><h3>核对新旧资料</h3><dl><dt>原官网</dt><dd>{valueLabel(original?.website ?? "UNKNOWN")}</dd><dt>此次读取官网</dt><dd><a href={preview.review.website} target="_blank" rel="noopener noreferrer">{preview.review.website} ↗</a></dd><dt>原联系入口</dt><dd>{valueLabel(original?.public_contact_url ?? original?.research_evidence?.find(item => /contact|inquiry/i.test(item.url))?.url ?? "UNKNOWN")}</dd><dt>此次公开联系入口</dt><dd>{preview.review.contact_url && preview.review.contact_url !== "UNKNOWN" ? <a href={preview.review.contact_url} target="_blank" rel="noopener noreferrer">查看联系页面 ↗</a> : "未找到，保留原资料"}</dd><dt>原邮箱</dt><dd>{valueLabel(originalContact?.email ?? "UNKNOWN")}</dd><dt>此次公开邮箱</dt><dd>{preview.review.public_emails.length ? preview.review.public_emails.map(item => item.email).join("、") : "未找到，保留原资料"}</dd></dl>
          <details className="customer-refresh-evidence"><summary>本次读取的网页来源（{preview.review.evidence.length}）</summary>{preview.review.evidence.map(item => <div key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title || item.url} ↗</a><small>{fullDate(item.retrieved_at)}</small><blockquote>{item.snippet}</blockquote></div>)}</details>
          <label className="field">确认使用的公开邮箱<select aria-label="核验公开邮箱" value={email} onChange={e => { setEmail(e.target.value); setConfirmed(false); setApplied(undefined); }}><option value="">保留表单中的邮箱</option>{preview.review.public_emails.map(item => <option key={`${item.email}:${item.source_url}`} value={item.email}>{item.email}（未验证投递）</option>)}</select></label>
          <label className="checkbox-label"><input type="checkbox" aria-label="确认官网更新内容" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); if (!e.target.checked) setApplied(undefined); }} />我已核对网站主体和来源，确认应用官网与所选邮箱；未知信息保留原值。</label><button type="button" className="button secondary" disabled={!confirmed || busy} onClick={applyPreview}>应用官网结果到表单</button>{applied && <p role="status" className="field-help">已应用到表单，点击“保存客户资料并同步”后生效。</p>}
        </section>}
      </details>
      <fieldset disabled={busy}><legend>联系人资料</legend><div className="customer-editor-grid">
        <label className="field">名<input aria-label="联系人名" value={editable(fields.contact.first_name)} onChange={e => contactField("first_name", e.target.value)} /></label>
        <label className="field">姓<input aria-label="联系人姓" value={editable(fields.contact.last_name)} onChange={e => contactField("last_name", e.target.value)} /></label>
        <label className="field">职位<input aria-label="联系人职位" value={editable(fields.contact.title)} onChange={e => contactField("title", e.target.value)} /></label>
        <label className="field">邮箱<input type="email" aria-label="联系人邮箱" value={editable(fields.contact.email)} onChange={e => contactField("email", e.target.value)} /></label>
        <label className="field customer-editor-wide">领英地址<input aria-label="联系人领英" value={editable(fields.contact.linkedin_url)} onChange={e => contactField("linkedin_url", e.target.value)} /></label>
      </div><p className="field-help">未知资料可留空。填写职位不会自动确认采购权限；人工填写的邮箱不会标为已验证。</p></fieldset>
      {error && <p role="alert" className="customer-editor-error">{error}</p>}
      <footer className="customer-editor-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={busy}>保存客户资料并同步</button></footer>
    </form>
  </dialog>;
}
