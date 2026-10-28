"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useDemo } from "./demo-provider";
import { Icon } from "./icons";
import { PageHeading, PriorityBadge, StageBadge } from "./ui";
import { CustomerEditor } from "./customer-editor";
import { analyzeBuyer, draftOutreach, draftFollowup, missingEnglishFacts, type FollowupResult } from "@/lib/ai";
import { approveDraft, rejectDraft, isOverdue, markSent, saveDraft, saveFollowup, completeFollowup, setFollowupDate, transitionLead, captureVersion, assertVersion, recordAnalysis, hasMilestone, getNextAction } from "@/lib/workflow";
import { requestAI } from "@/lib/client-ai";
import { ACTIVITY_ZH, PIPELINE_STAGES, STAGE_ZH, type AIAnalysis, type ArtifactMeta, type PipelineStage, type OutreachDraft } from "@/lib/types";
import { channelLabel, cityLabel, companyTypeLabel, countryLabel, fitLabel, fullDate, jobTitleLabel, productsLabel, relativeDate, valueLabel } from "@/lib/display";

const subscribeHash = (listener: () => void) => { window.addEventListener("hashchange", listener); window.addEventListener("popstate", listener); return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); }; };
const readHash = () => window.location.hash;
const serverHash = () => "";
const sourceText = (meta?: ArtifactMeta, isPublic = false) => !meta ? isPublic ? "本地规则建议" : "本地演示建议" : meta.source === "live" ? "在线 AI 生成" : meta.source === "fallback" ? "本地建议 · 在线回退" : meta.source === "legacy" ? "已保存结果 · 原来源未记录" : isPublic ? "本地规则建议" : "本地演示建议";

export function BuyerDetail({ id }: { id: string }) {
  const { state } = useDemo();
  return <ProductBuyerDetail key={`${state.project.id}:${state.selection_revision}:${id}`} id={id} />;
}
function ProductBuyerDetail({ id }: { id: string }) {
  const { state, update, notify } = useDemo();
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const tab = hash === "#history" ? "history" : ["#outreach", "#followup"].includes(hash) ? "mail" : "analysis";
  const [busy, setBusy] = useState("");
  const [replaceTask, setReplaceTask] = useState<"outreach" | "followup" | null>(null);
  const [editing, setEditing] = useState<"manual" | "website" | null>(null);
  const lead = state.leads.find(l => l.id === id);
  const company = state.companies.find(c => c.id === lead?.company_id);
  const contact = state.contacts.find(c => c.id === lead?.contact_id);
  if (!lead || !company || !contact) return <section className="panel empty-state"><h1>没有找到这个客户</h1><p>该记录可能已被重置。</p><Link href="/buyers" className="button primary">返回潜在客户</Link></section>;
  const isPublic = company.dataset === "public";
  const contactSourceText = !isPublic ? "演示联系人，采购权限与联系方式尚未独立核验。" : contact.email === "UNKNOWN" ? "邮箱待补充，可先使用官网公开联系入口；采购权限尚未核实。" : contact.email_status === "public_unverified" && contact.source_url ? "邮箱来自公开网页，尚未核验投递与采购权限；不能当作已确认的采购负责人。" : "邮箱由人工补充，尚未核验来源、投递与采购权限；不能当作已确认的采购负责人。";
  const contactPage = isPublic ? company.public_contact_url ? { url: company.public_contact_url } : company.research_evidence?.find(evidence => /contact|inquiry|联系/i.test(evidence.url + " " + evidence.title)) : undefined;
  const artifactSource = (meta?: ArtifactMeta) => sourceText(meta, isPublic);
  const isClosed = ["Won", "Lost"].includes(lead.status);
  const sent = hasMilestone(state, id, "Contacted");
  const draft = state.drafts.find(d => d.lead_id === id);
  const followup = state.followup_drafts.find(d => d.lead_id === id && d.status !== "sent");
  const sentFollowups = state.followup_drafts.filter(d => d.lead_id === id && d.status === "sent");
  const activities = state.activities.filter(a => a.lead_id === id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const analysisCurrent = lead.ai_analysis && lead.analysis_meta?.project_revision === state.project_revision;
  const analysis = analysisCurrent ? lead.ai_analysis! : analyzeBuyer(state.project, company, contact, state.icpCriteria);
  const action = getNextAction(state, lead);
  const missing = missingEnglishFacts(state.project);
  const canGenerate = !isClosed && lead.score_assessable !== false && missing.length === 0;
  const payload = { project: state.project, company, contact, icpCriteria: state.icpCriteria };
  const history = { previous_email: sent ? draft?.body ?? "" : "", used_value_keys: sentFollowups.map(d => d.value_key), followups: sentFollowups.map(d => ({ subject: d.subject, body: d.body })) };
  function open(anchor: string) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${anchor}`);
    window.dispatchEvent(new Event("hashchange"));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(anchor);
      target?.scrollIntoView({ behavior: "instant", block: "start" });
      target?.querySelector<HTMLElement>("h2, input, select")?.focus({ preventScroll: true });
    }));
  }
  async function generate(task: "analysis" | "outreach" | "followup", online = false) {
    if (!lead || !company || !contact || busy) return;
    if (task !== "analysis" && !canGenerate) { notify("请先确认产品范围与缺少的英文资料。"); return; }
    const token = captureVersion(state, id);
    setBusy(task);
    const now = new Date();
    let saved = false;
    if (task === "analysis") {
      const result = await requestAI<AIAnalysis>({ ...payload, task }, () => analyzeBuyer(state.project, company, contact, state.icpCriteria), online);
      saved = update(current => { assertVersion(current, token); return recordAnalysis(current, id, result.data, { source: result.source, generated_at: now.toISOString(), project_revision: token.project_revision, message: result.message }); }, result.message || "客户分析已更新，资料缺口已列明。");
    } else if (task === "outreach") {
      const result = await requestAI({ ...payload, task }, () => draftOutreach(state.project, company, contact), online);
      if (online && result.source === "fallback" && draft) { setBusy(""); setReplaceTask(null); notify("在线生成未完成，已保留人工原稿；如需替换，请明确选择本地建议。"); return; }
      saved = update(current => { assertVersion(current, token); return saveDraft(current, { ...result.data, lead_id: id, status: "draft", generated_at: now.toISOString(), meta: { source: result.source, generated_at: now.toISOString(), project_revision: token.project_revision, message: result.message } }); }, result.message || "首封草稿已保存，请编辑并人工审核。");
    } else {
      const result = await requestAI<FollowupResult>({ ...payload, task, history }, () => draftFollowup(state.project, company, contact, history), online);
      if (online && result.source === "fallback" && followup) { setBusy(""); setReplaceTask(null); notify("在线生成未完成，已保留跟进原稿；如需替换，请明确选择本地建议。"); return; }
      saved = update(current => { assertVersion(current, token); return saveFollowup(current, { ...result.data, id: followup?.id ?? crypto.randomUUID(), lead_id: id, status: "draft", revision: followup?.revision ?? 0, meta: { source: result.source, generated_at: now.toISOString(), project_revision: token.project_revision, message: result.message } }); }, result.message || "跟进草稿已保存，审核后可记录模拟跟进。");
    }
    setBusy(""); setReplaceTask(null);
    if (saved) open(task === "analysis" ? "analysis" : task === "outreach" ? "outreach" : "followup");
  }
  function mainAction() {
    if (action.kind === "send") { if (update(current => markSent(current, id), "已模拟发送，未真实外发；已安排 3 天后跟进。")) open("followup"); }
    else if (action.kind === "outreach") void generate("outreach");
    else if (action.kind === "analysis" && lead?.status === "Identified") void generate("analysis");
    else if (action.kind === "followup" && !followup) void generate("followup");
    else open(action.kind === "history" ? "history" : action.kind === "review" ? "outreach" : action.kind === "followup" ? "followup" : action.kind === "progress" ? "progress" : "analysis");
  }
  function editDraft(patch: Partial<OutreachDraft>) { if (draft) update(current => saveDraft(current, { ...draft, ...patch })); }
  const blockedGeneration = ["outreach", "followup"].includes(action.kind) && !canGenerate && !(action.kind === "followup" && followup);
  const scores = [{ key: "icp_fit" as const, label: "目标客户匹配", max: 30 }, { key: "product_fit" as const, label: "产品相关性", max: 25 }, { key: "decision_maker" as const, label: "采购决策权限", max: 15 }, { key: "intent" as const, label: "采购时机信号", max: 20 }, { key: "data_confidence" as const, label: "资料可信度", max: 10 }];
  return <div className="workspace-page buyer-detail-workspace">
    <Link href="/buyers" className="back-link"><Icon name="back" size={16} />返回潜在客户</Link>
    <PageHeading eyebrow="客户工作台" title={company.company_name} description={`${cityLabel(company.city)} · ${countryLabel(company.country)} · ${companyTypeLabel(company.company_type)}`}><button className="button secondary" onClick={() => setEditing("manual")}>编辑客户资料</button><button className="button ghost" onClick={() => setEditing("website")}>重新核验官网</button></PageHeading>
    {company.updated_at && <p className="customer-refresh-note">资料更新于 {fullDate(company.updated_at)} · {company.update_source === "website" ? "官网核验后人工确认" : "人工更新"} · 已同步关联产品与组合</p>}
    <section className="next-action-panel" aria-label="建议下一步"><div><div className="heading-actions"><PriorityBadge priority={lead.priority} /><StageBadge stage={lead.status} /><span className={`badge ${isPublic ? "source-public" : "amber"}`}>{isPublic ? "公开来源客户 · 已人工加入" : "演示客户"}</span></div><h2>{action.label}</h2><p>{action.reason}</p></div><button className="button primary" onClick={mainAction} disabled={!!busy || blockedGeneration}>{busy ? "正在生成…" : action.label}<Icon name="arrow" size={17} /></button></section>
    {isClosed && <div className="notice">此客户已归档，邮件只读；历史事件继续保留。重新开启可使用下方的进展菜单。</div>}
    {lead.score_assessable === false && <div className="notice">当前产品超出食品调味料演示评分范围，暂不可评估。<Link href="/settings#products" className="text-link">调整产品资料</Link></div>}
    {missing.length > 0 && <div className="notice">以下资料已有中文内容，英文表达待确认：{missing.join("、")}。<Link href="/settings#products" className="text-link">补充英文表达</Link></div>}
    {isPublic && <section className="panel public-evidence-panel"><div className="panel-header"><div><h2>公开来源与核验记录</h2><p>人工加入不代表已建立关系。公开邮箱尚未验证能否投递。</p></div><span className="badge source-public">官网原文</span></div><div className="panel-body">{company.research_evidence?.map(evidence => <div className="source-evidence" key={evidence.url}><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title || evidence.url} ↗</a><small>{fullDate(evidence.retrieved_at)}</small><blockquote>{evidence.snippet}</blockquote></div>)}{contact.source_url && <p className="field-help">邮箱公开来源：<a href={contact.source_url} target="_blank" rel="noopener noreferrer">查看网页 ↗</a></p>}</div></section>}
    <div className="detail-status-bar" id="progress"><span>当前进展 <StageBadge stage={lead.status} /></span><label>记录实际进展<select aria-label="更新客户阶段" value={lead.status} onChange={e => update(current => transitionLead(current, id, e.target.value as PipelineStage), "销售进展已更新。")}>{PIPELINE_STAGES.map(stage => <option key={stage} value={stage}>{STAGE_ZH[stage]}</option>)}</select></label></div>
    <div className="tabs detail-tabs" role="tablist" aria-label="客户详情"><button role="tab" aria-selected={tab === "analysis"} className={`tab-button ${tab === "analysis" ? "active" : ""}`} onClick={() => open("analysis")}>客户分析</button><button role="tab" aria-selected={tab === "mail"} className={`tab-button ${tab === "mail" ? "active" : ""}`} onClick={() => open(sent ? "followup" : "outreach")}>邮件与跟进</button><button role="tab" aria-selected={tab === "history"} className={`tab-button ${tab === "history" ? "active" : ""}`} onClick={() => open("history")}>活动记录 <span>{activities.length}</span></button></div>
    {tab === "analysis" && <div className="task-detail-grid"><section className="panel analysis-panel" id="analysis"><div className="panel-header"><div><h2 tabIndex={-1}>为什么值得联系</h2><p>{analysisCurrent ? artifactSource(lead.analysis_meta) : artifactSource()} · 基于当前产品资料</p></div><div className="heading-actions"><button className="button secondary" disabled={!!busy || isClosed} onClick={() => generate("analysis")}>重新分析</button><button className="button ghost" disabled={!!busy || isClosed} onClick={() => generate("analysis", true)}>在线 AI 分析</button></div></div><div className="panel-body">
      <div className="analysis-two-col"><div><h3>目标客户匹配度 <span className="badge pale-green">{fitLabel(analysis.icp_fit)}</span></h3><ul className="evidence-list">{analysis.icp_reasons.map((r, i) => <li key={i}>{valueLabel(r)}</li>)}</ul></div><div><h3>产品相关性 <span className="badge pale-green">{fitLabel(analysis.product_fit)}</span></h3><ul className="evidence-list">{analysis.product_fit_reasons.map((r, i) => <li key={i}>{valueLabel(r)}</li>)}</ul></div></div>
      <div className="analysis-block"><h3>联系依据</h3><ul className="evidence-list">{analysis.opportunity_reasons.map((r, i) => <li key={i}>{valueLabel(r) === "INSUFFICIENT DATA" ? "资料不足，补充后再判断" : valueLabel(r)}</li>)}</ul></div>
      <div className="intent-box"><Icon name="clock" size={21} /><div><h3>采购时机信号</h3><strong>{analysis.intent_signal.status === "VERIFIED" ? "模拟时机信号 · 未经真实核验" : "暂无已核验的采购时机信号"}</strong><p>{analysis.intent_signal.status === "VERIFIED" ? analysis.intent_signal.evidence.map(valueLabel).join("；") : "当前没有可验证的采购时机证据，该项得分为 0。"}</p></div></div>
      <div className="hook-note"><strong>建议切入点</strong><p>{valueLabel(analysis.recommended_hook)}</p></div><details className="detail-disclosure"><summary>仍需核实的资料</summary><ul>{[...new Set([...analysis.missing_information, ...analysis.icp_uncertainties, ...analysis.risks])].map((r, i) => <li key={i}>{valueLabel(r)}</li>)}</ul></details>
    </div></section><aside><section className="panel"><div className="panel-header"><h2>{isPublic ? "公开联系入口" : "关键联系人"}</h2></div><div className="panel-body"><h3>{contact.first_name === "UNKNOWN" ? "联系人待补充" : `${contact.first_name} ${contact.last_name === "UNKNOWN" ? "" : contact.last_name}`}</h3><p>{jobTitleLabel(contact.title)}</p><dl className="contact-info"><dt>邮箱</dt><dd>{valueLabel(contact.email)}</dd><dt>LinkedIn</dt><dd>{valueLabel(contact.linkedin_url)}</dd></dl>{contactPage && <a href={contactPage.url} target="_blank" rel="noopener noreferrer" className="text-link">官网公开联系页面 ↗</a>}<p className="field-help">{contactSourceText}</p></div></section>
    <details className="panel detail-disclosure"><summary>评分拆解 · {lead.score_assessable === false ? "暂不可评估" : `${lead.total_score} / 100`}</summary><div className="panel-body score-breakdown">{scores.map(s => <div key={s.key}><div><span>{s.label}</span><strong>{lead.scores[s.key]} / {s.max}</strong></div><div className="score-track"><i style={{ width: `${lead.scores[s.key] / s.max * 100}%` }} /></div></div>)}<p className="field-help">固定规则评分；优先级不代表已确认的采购意愿。</p></div></details></aside>
    <details className="panel detail-disclosure full-span"><summary>完整公司资料</summary><div className="panel-body"><p>{valueLabel(company.research_summary)}</p><dl className="profile-grid"><div><dt>网站</dt><dd>{company.website}<small>{isPublic ? "公开网站，主体经用户核对；资料真实性仍需独立核验" : "演示域名，不用于实际联系"}</small></dd></div><div><dt>国家与城市</dt><dd>{countryLabel(company.country)} · {cityLabel(company.city)}</dd></div><div><dt>客户类型</dt><dd>{companyTypeLabel(company.company_type)}</dd></div><div><dt>企业规模</dt><dd>{valueLabel(company.employee_range)}{company.employee_range === "UNKNOWN" ? "" : " 人"}</dd></div><div><dt>主营产品</dt><dd>{productsLabel(company.main_products)}</dd></div><div><dt>分销渠道</dt><dd>{channelLabel(company.distribution_channel)}</dd></div><div><dt>匹配度</dt><dd>{fitLabel(analysis.icp_fit)}</dd></div><div><dt>联系人与职位</dt><dd>{contact.first_name === "UNKNOWN" ? "待补充" : `${contact.first_name} ${contact.last_name}`} · {jobTitleLabel(contact.title)}</dd></div><div><dt>邮箱</dt><dd>{valueLabel(contact.email)}</dd></div><div><dt>LinkedIn</dt><dd>{valueLabel(contact.linkedin_url)}</dd></div></dl><p className="source-line">{isPublic ? "资料来源：公开官网及人工核对，见上方证据链接；未确认采购意愿或商业关系。" : "资料来源：演示数据 · 虚构企业与模拟资料，未经真实核验。"}</p></div></details></div>}
    {tab === "mail" && <>
      {!sent && <section className="panel outreach-panel" id="outreach"><div className="panel-header"><div><h2 tabIndex={-1}>首封开发信</h2><p>英文发给海外客户，审核说明使用中文；不会真实外发</p></div><span className="badge pale-green">{artifactSource(draft?.meta)}</span></div><div className="panel-body">{draft ? <>
        {draft.meta?.project_revision !== state.project_revision && <div className="notice">产品资料已更新，原稿已保留。请重新核对产品信息，再审核。</div>}
        <div className="draft-parts"><span>联系依据</span><span>产品关联</span><span>能力依据</span><span>下一步邀请</span></div><label className="field">邮件主题<input value={draft.subject} onChange={e => editDraft({ subject: e.target.value })} disabled={isClosed} /></label><label className="field">邮件正文<textarea aria-label="邮件正文" className="email-editor" rows={12} value={draft.body} onChange={e => editDraft({ body: e.target.value })} disabled={isClosed} /></label>
        <div className="draft-status" data-status={draft.status}>{draft.status === "approved" ? "审核已通过。再次编辑会撤销审核。" : draft.status === "none" ? "已退回，请编辑后重新审核。" : "内容已保存，等待人工审核。"}</div><div className="outreach-actions"><div><button className="button primary" disabled={isClosed || !!busy || draft.status === "approved" || draft.status === "none" || !draft.subject.trim() || !draft.body.trim()} onClick={() => update(current => approveDraft(current, id), "审核通过，客户已进入待发送。")}>审核通过</button><button className="button secondary" disabled={isClosed || !!busy} onClick={() => update(current => rejectDraft(current, id), "草稿已退回，请修改。")}>退回修改</button><button className="button ghost" disabled={!!busy || !canGenerate} onClick={() => setReplaceTask("outreach")}>重新起草</button><button className="button ghost" disabled={!!busy || !canGenerate} onClick={() => { setReplaceTask("outreach"); }}>在线生成选项</button></div><button className="button dark" disabled={isClosed || !!busy || draft.status !== "approved" || !lead.outreach_approved} onClick={mainAction}>模拟发送</button></div>
        <p className="field-help">{draft.meta ? `生成于 ${fullDate(draft.meta.generated_at)}。` : ""}请核对客户信息、产品能力与语气；未经审核不能发送。</p>
      </> : <div className="empty-state"><h3>{isPublic ? "基于已核对的公开资料，准备一封有依据的邮件" : "基于现有演示资料，准备一封有依据的邮件"}</h3><p>生成后直接在此编辑，审核后才能模拟发送。</p><button className="button primary" disabled={!!busy || !canGenerate} onClick={() => generate("outreach")}>起草首封邮件</button></div>}</div></section>}
      {sent && <details className="panel detail-disclosure"><summary>已模拟发送的首封邮件 · 只读</summary><div className="panel-body"><h3>{draft?.subject ?? "旧触达记录"}</h3><pre className="sent-mail">{draft?.body ?? "原始邮件正文未保存，不能据此推断内容。"}</pre><p className="field-help">{artifactSource(draft?.meta)} · 未真实外发</p></div></details>}
      <section className="panel" id="followup"><div className="panel-header"><div><h2 tabIndex={-1}>跟进邮件</h2><p>提醒联系背景，补充新信息，给出轻量的下一步邀请</p></div>{isOverdue(lead) && <span className="badge amber">跟进已逾期</span>}</div><div className="panel-body">
        <div className="followup-head"><div><span className="muted">下次跟进</span><strong title={lead.next_followup_date ? fullDate(lead.next_followup_date) : ""}>{lead.next_followup_date ? relativeDate(lead.next_followup_date) : isClosed ? "客户已归档" : sent ? "尚未安排" : "模拟发送后安排"}</strong></div>{sent && !isClosed && <label className="field compact-field">调整日期<input aria-label="调整下次跟进日期" type="date" value={lead.next_followup_date ? new Date(Date.parse(lead.next_followup_date) + 8 * 3600000).toISOString().slice(0, 10) : ""} onChange={e => e.target.value && update(current => setFollowupDate(current, id, `${e.target.value}T09:00:00+08:00`), "跟进日期已调整。")}/></label>}</div>
        {followup ? <><div className="draft-status">{artifactSource(followup.meta)} · 草稿已保存，尚未发送{followup.meta.project_revision !== state.project_revision ? " · 产品资料已更新，请重新核对" : ""}</div>{followup.value_key === "timing" && <div className="notice">现有增值角度已用完，本稿仅询问合适时间；建议补充新的产品资料。</div>}<label className="field">跟进主题<input value={followup.subject} disabled={isClosed} onChange={e => update(current => saveFollowup(current, { ...followup, subject: e.target.value }))}/></label><label className="field">跟进正文<textarea aria-label="跟进正文" className="email-editor" rows={10} value={followup.body} disabled={isClosed} onChange={e => update(current => saveFollowup(current, { ...followup, body: e.target.value }))}/></label><div className="heading-actions"><button className="button primary" disabled={isClosed || !!busy || !followup.subject.trim() || !followup.body.trim()} onClick={() => update(current => completeFollowup(current, followup.id), "已审核并模拟跟进，未真实外发；3 天后继续跟进。")}>审核并模拟发送跟进</button><button className="button secondary" disabled={!!busy || !canGenerate} onClick={() => setReplaceTask("followup")}>重新起草</button></div></>
        : <div className="empty-state"><p>{!sent ? "请先审核并模拟发送首封邮件，再准备跟进。" : isClosed ? "此次开发已结束，可在活动记录查看历史。" : "选择尚未使用的角度，准备下一封跟进邮件。"}</p><button className="button secondary" disabled={!sent || !!busy || !canGenerate} onClick={() => generate("followup")}>起草跟进邮件</button><button className="button ghost" disabled={!sent || !!busy || !canGenerate} onClick={() => generate("followup", true)}>在线 AI 起草</button></div>}
        {sentFollowups.length > 0 && <details className="detail-disclosure"><summary>已发送的跟进邮件（{sentFollowups.length}）</summary>{sentFollowups.map(d => <div className="sent-followup" key={d.id}><h3>{d.subject}</h3><p className="field-help">{artifactSource(d.meta)} · {fullDate(d.meta.generated_at)}</p><pre className="sent-mail">{d.body}</pre></div>)}</details>}
      </div></section>
      {replaceTask && <div className="notice replacement-confirm" role="alert"><div>重新起草将替换这份尚未发送的邮件；等待期间若你继续编辑，生成结果不会覆盖修改。</div><div className="heading-actions"><button className="button primary" disabled={!!busy} onClick={() => generate(replaceTask)}>确认使用本地建议</button><button className="button secondary" disabled={!!busy} onClick={() => generate(replaceTask, true)}>确认在线 AI 生成</button><button className="button ghost" onClick={() => setReplaceTask(null)}>取消</button></div></div>}
    </>}
    {tab === "history" && <section className="panel" id="history"><div className="panel-header"><h2 tabIndex={-1}>客户活动记录</h2><span>{activities.length} 条</span></div><div className="activity-timeline">{activities.length ? activities.map(a => <div className="timeline-item" key={a.id}><i /><div><span>{ACTIVITY_ZH[a.activity_type]}<time>{fullDate(a.created_at)}</time></span><p>{valueLabel(a.content)}</p></div></div>) : <div className="empty-state">尚未记录活动，先查看客户资料。</div>}</div>{PIPELINE_STAGES.indexOf(lead.status) > 4 && !sent && <div className="notice">旧记录处于后续阶段，但缺少首次联系事件；历史资料不完整，统计未补造触达事实。</div>}</section>}
    {editing && <CustomerEditor key={editing} id={id} verifyFirst={editing === "website"} onClose={() => setEditing(null)} />}
  </div>;
}
