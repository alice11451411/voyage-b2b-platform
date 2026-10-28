"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCustomerWorkspace } from "./demo-provider";
import { Icon } from "./icons";
import { LinkButton, PageHeading, percent } from "./ui";
import { getMetrics, getNextAction, hasMilestone, isOverdue } from "@/lib/workflow";
import { companyTypeLabel, countryLabel, fullDate, priorityLabel, productsLabel, relativeDate, valueLabel } from "@/lib/display";
import { salesInsights } from "@/lib/ai";
import { requestAI } from "@/lib/client-ai";

const GUIDE_KEY = "voyage-demo-first-use-dismissed";

export function Dashboard() {
  const { state, notify, datasetMode, setDatasetMode } = useCustomerWorkspace();
  const metrics = getMetrics(state);
  const signature = JSON.stringify([datasetMode, state.project.id, state.project_revision, state.selection_revision, metrics, state.leads.map(lead => [lead.id, lead.revision])]);
  const currentSignature = useRef(signature);
  useEffect(() => { currentSignature.current = signature; }, [signature]);
  const [insights, setInsights] = useState<{ key: string; data: ReturnType<typeof salesInsights>; source: string; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(() => {
    try { return typeof window === "undefined" || localStorage.getItem(GUIDE_KEY) !== "yes"; } catch { return true; }
  });
  const activeInsights = insights?.key === signature ? insights : null;
  const insight = activeInsights?.data ?? salesInsights(metrics);
  const assessable = state.leads.filter(lead => lead.score_assessable !== false);
  const priorityCounts = ["A", "B", "C", "Disqualified"].map(priority => ({ priority, count: assessable.filter(lead => lead.priority === priority).length }));
  const tasks = state.leads.flatMap(lead => {
    if (["Won", "Lost"].includes(lead.status) || lead.score_assessable === false) return [];
    const company = state.companies.find(company => company.id === lead.company_id);
    if (!company) return [];
    const action = getNextAction(state, lead);
    const overdue = isOverdue(lead);
    const rank = overdue ? 0 : action.kind === "review" ? 1 : action.kind === "send" ? 2 : !hasMilestone(state, lead.id, "Contacted") && ["A", "B"].includes(lead.priority) ? 3 : null;
    return rank === null ? [] : [{ lead, company, action, rank, overdue }];
  }).sort((a, b) => a.rank - b.rank || (a.overdue && b.overdue ? Date.parse(a.lead.next_followup_date!) - Date.parse(b.lead.next_followup_date!) : b.lead.total_score - a.lead.total_score));
  const dueCount = tasks.filter(task => task.overdue).length;
  const rate = (value: number, denominator = metrics.contacted) => denominator ? percent(value) : "暂无数据";
  const chartMax = Math.max(...metrics.weekly.map(week => Math.max(week.contacted, week.replied)), 1);
  const weeklyContacts = metrics.weekly.reduce((sum, week) => sum + week.contacted, 0);
  const scheduled = state.leads.filter(lead => !["Won", "Lost"].includes(lead.status) && !!lead.next_followup_date).sort((a, b) => Date.parse(a.next_followup_date!) - Date.parse(b.next_followup_date!));
  const priorityColors = ["#405c8e", "#739d90", "#b79563", "#d6dce2"];

  function dismissGuide() {
    setShowGuide(false);
    try { localStorage.setItem(GUIDE_KEY, "yes"); } catch { notify("指引已关闭，浏览器暂未保存此偏好。"); }
  }
  async function analyze(online = false) {
    setBusy(true);
    try {
      const result = await requestAI({ task: "analyst", metrics }, () => salesInsights(metrics), online);
      if (currentSignature.current !== signature) { notify("销售资料已更新，本次分析未替换当前建议。"); return; }
      setInsights({ key: signature, data: result.data, source: result.source, message: result.message });
      notify(result.source === "live" ? "已完成在线销售分析。" : result.source === "fallback" ? "在线生成未完成，已使用本地建议。" : "已根据当前记录更新本地建议。");
    } finally { setBusy(false); }
  }

  return <div className="showcase-dashboard">
    <PageHeading eyebrow="客户开发 · 全局概览" title="整体仪表盘" description="看清客户开发进展，把精力放在下一步值得推进的机会。">
      <LinkButton href="/settings#products" secondary icon="settings">企业产品和资料</LinkButton>
      <LinkButton href="/buyers" icon="buyers">查看潜在客户</LinkButton>
    </PageHeading>
    {(!state.business_profile.confirmed || !state.products.some(product => product.project.product_confirmed)) && <section className="setup-intro"><div><span className="badge pale-green">{state.business_profile.confirmed ? "企业资料已保存 · 下一步" : "第一次使用 · 从这里开始"}</span><h2>{state.business_profile.confirmed ? "接下来，填写你的第一款产品" : "先填写你的企业与产品"}</h2><p>企业资料只填一次，每款产品分别保存。开发时可选一款，也可任选几款组成组合，再查看客户匹配理由与英文邮件。</p><ol className="setup-steps"><li>{state.business_profile.confirmed ? "企业资料已保存" : "填写企业资料"}</li><li>添加一款或多款产品</li><li>选一款或组合，开发客户</li></ol></div><div className="heading-actions"><LinkButton href={state.business_profile.confirmed ? "/settings#products" : "/settings#business"} icon="arrow">{state.business_profile.confirmed ? "填写产品资料" : "填写企业与产品"}</LinkButton><Link href="/buyers" className="text-link" onClick={() => setDatasetMode("demo")}>先体验演示客户</Link></div></section>}
    <section className="project-banner dashboard-product">
      <div className="project-banner-copy">
        <span className="product-caption">{state.project.product_confirmed ? "当前开发产品" : "预置示例 · 可先体验"}{state.project.selected_products ? ` · ${state.project.selected_products.length} 款组合` : ""}</span>
        <h2>{state.project.selected_products ? state.project.selected_products.map(product => productsLabel(product.product_name)).join(" + ") : productsLabel(state.project.product_name)}</h2>
        <p><span>{countryLabel(state.project.target_country)}市场</span><span>{companyTypeLabel(state.project.target_buyer_type)}</span><span>{state.project.company_name}</span></p>
      </div>
      <div className="dashboard-product-meta"><span className={`badge ${datasetMode === "public" ? "pale-green" : "amber"}`}>{datasetMode === "public" ? "公开来源客户" : "演示客户"}</span><Link href="/settings#products" className="text-link">查看开发资料 <Icon name="arrow" size={15}/></Link></div>
    </section>
    {showGuide && <div className="notice first-use-guide"><Icon name="info" size={19}/><p>{datasetMode === "public" ? "先在潜在客户分析中寻找公开来源公司，核对官网与联系方式，再加入客户工作台。" : `从 ${state.leads.length} 家演示客户中选一家，查看理由，再审核英文邮件。所有发送都只记录模拟事件。`}</p><button className="button ghost" onClick={dismissGuide} aria-label="关闭首次使用指引"><Icon name="close" size={17}/></button></div>}
    <div className="metric-grid">
      {[
        { label: "潜在客户", value: metrics.total, sub: `当前开发选择 · ${datasetMode === "public" ? "公开来源客户" : "演示客户"}`, icon: "buyers" as const },
        { label: "符合目标", value: metrics.qualified, sub: "已记录销售确认", icon: "shield" as const },
        { label: "已联系客户", value: metrics.contacted, sub: "已记录首次模拟发送", icon: "mail" as const },
        { label: "客户回复率", value: rate(metrics.replyRate), sub: metrics.contacted ? `${metrics.contacted} 家首次联系客户中的回复占比` : "首次联系后再计算", icon: "trend" as const },
      ].map((metric, index) => <div className="metric-card" key={metric.label}><div className="metric-title">{metric.label}<span className={`metric-icon metric-icon-${index}`}><Icon name={metric.icon} size={19}/></span></div><div className={`metric-value${index === 3 && !metrics.contacted ? " metric-no-data" : ""}`}>{metric.value}<span>{index < 3 ? "家" : ""}</span></div><div className="metric-sub">{metric.sub}</div></div>)}
    </div>
    <div className="dashboard-main-grid">
      <section className="panel funnel-panel">
        <div className="panel-header"><div><span className="dashboard-kicker">从发现到成交</span><h2>客户开发进展</h2><p>按已记录事件统计，同一客户可出现在多个节点。</p></div><Link href="/pipeline" className="text-link">查看销售进展 <Icon name="arrow" size={15}/></Link></div>
        <div className="funnel-rows">{metrics.funnel.map((item, index) => <div className="funnel-row" key={item.label}><div className="funnel-label"><span className="funnel-number">{String(index + 1).padStart(2, "0")}</span><span>{valueLabel(item.label)}</span></div><div className="funnel-track" aria-hidden="true"><div className={`funnel-bar funnel-color-${index}`} style={{ width: `${metrics.total ? item.count / metrics.total * 100 : 0}%` }}/></div><strong>{item.count}</strong><span className="funnel-percentage">{metrics.total ? percent(item.count / metrics.total * 100) : "—"}</span></div>)}</div>
        {!metrics.total && <p className="dashboard-empty-note">尚无客户，加入客户后即可查看各阶段数量和占比。</p>}
        <div className="pipeline-rates"><div><span>已联系客户会议率</span><strong>{rate(metrics.meetingRate)}</strong></div><div><span>已联系客户报价率</span><strong>{rate(metrics.quoteRate)}</strong></div><div><span>成交占全部客户</span><strong>{rate(metrics.winRate, metrics.total)}</strong></div></div>
        <p className="metric-footnote">部分流程可跳过，不推定前置事件。回复、会议、报价率均以首次联系客户为共同样本。</p>
      </section>
      <section className="panel today-tasks">
        <div className="panel-header"><div><span className="dashboard-kicker">下一步值得推进的事</span><h2>今日待办 <span className="dashboard-count">{tasks.length} 项</span></h2><p>先处理逾期跟进，再审核、发送和研究新客户。</p></div>{dueCount > 0 && <Link href="/pipeline?view=overdue" className="badge amber">{dueCount} 项逾期</Link>}</div>
        <div className="task-list">{tasks.length ? tasks.slice(0, 4).map(({ lead, company, action, overdue }, index) => <div key={lead.id} className={`task-item today-task${overdue ? " task-overdue" : ""}`}><span className="dashboard-task-number">{String(index + 1).padStart(2, "0")}</span><div className="dashboard-task-copy"><strong>{company.company_name}</strong><span>{overdue ? `${relativeDate(lead.next_followup_date)} · ` : ""}{action.reason}</span><Link href={action.href} className="text-link task-next">{action.label}<Icon name="arrow" size={15}/></Link></div></div>) : <div className="tasks-clear"><Icon name="check" size={28}/><strong>目前暂无待办</strong><p>可以查看客户资料或已记录的销售进展。</p><Link href="/buyers" className="text-link">查看潜在客户 <Icon name="arrow" size={15}/></Link></div>}</div>
        {tasks.length > 4 && <Link href="/buyers" className="task-bottom">还有 {tasks.length - 4} 项，查看全部客户的下一步 <Icon name="arrow" size={16}/></Link>}
      </section>
    </div>
    <div className="dashboard-secondary-grid">
      <section className="panel priority-panel">
        <div className="panel-header"><div><span className="dashboard-kicker">安排研究的顺序</span><h2>客户优先级</h2><p>优先级用于研究安排，不等于采购意愿。</p></div></div>
        <div className="dashboard-priority-body">
          <div className="priority-distribution"><div className="donut" role="img" aria-label={`共 ${assessable.length} 家可评估客户；${priorityCounts.map(item => `${priorityLabel(item.priority)} ${item.count} 家`).join("；")}`} style={{ background: assessable.length ? `conic-gradient(${priorityColors[0]} 0 ${priorityCounts[0].count / assessable.length * 100}%, ${priorityColors[1]} 0 ${(priorityCounts[0].count + priorityCounts[1].count) / assessable.length * 100}%, ${priorityColors[2]} 0 ${(priorityCounts[0].count + priorityCounts[1].count + priorityCounts[2].count) / assessable.length * 100}%, ${priorityColors[3]} 0)` : "#e9edf0" }}><div><strong>{assessable.length}</strong><span>可评估客户</span></div></div></div>
          <div className="priority-legend">{priorityCounts.map((item, i) => <Link href={`/buyers?priority=${item.priority}`} key={item.priority}><span><i style={{ background: priorityColors[i] }}/>{priorityLabel(item.priority)}</span><strong>{item.count}<small> 家</small></strong></Link>)}</div>
        </div>
        <div className="priority-note"><Icon name="info" size={17}/><p>{assessable.length < metrics.total ? `${metrics.total - assessable.length} 家暂不可评估，请先确认产品资料。` : datasetMode === "public" ? "公开网站不等于采购意向，未核验的时机证据记零分。" : "时机证据均为演示资料，未经真实核验。"}</p></div>
      </section>
      <section className="panel activity-panel">
        <div className="panel-header"><div><span className="dashboard-kicker">最近 4 周</span><h2>每周首次联系客户及其回复</h2><p>按中国时区的首次联系周分组，回复为截至当前的结果。</p></div></div>
        <div className="dashboard-chart-meta"><span>单位：家 · 日期为周起始日</span><div className="chart-key"><span><i/>首次联系</span><span><i/>已回复</span></div></div>
        <div className="bar-chart">{metrics.weekly.map(item => <div className="chart-day" key={item.label}>
          <div className="chart-bars">
            <div className="dashboard-chart-series contact-bar" style={{ height: `${item.contacted / chartMax * 100}%` }}><strong aria-label={`${item.label}周首次联系 ${item.contacted} 家`}>{item.contacted}</strong></div>
            <div className="dashboard-chart-series reply-bar" style={{ height: `${item.replied / chartMax * 100}%` }}><strong aria-label={`${item.label}周首次联系客户中已回复 ${item.replied} 家`}>{item.replied}</strong></div>
          </div><small title={`${item.label} 起的一周`}>{item.label.slice(5).replace("-", "/")}</small>
        </div>)}</div>
        <div className="chart-summary"><Icon name="info" size={16}/><span>{weeklyContacts ? "回复归入首次联系周，不表示当周回复量。" : "最近 4 周尚无首次联系记录；更早的记录仍计入上方总览。"}</span></div>
      </section>
    </div>
    <section className="panel dashboard-followups">
      <div className="panel-header"><div><h2>已安排的跟进 <span className="dashboard-count">{scheduled.length} 项</span></h2><p>查看日期，并在有新依据时准备跟进邮件。</p></div><Link href="/pipeline?view=contact" className="text-link">管理销售进展与跟进日期 <Icon name="arrow" size={16}/></Link></div>
      <div className="dashboard-followup-list">{scheduled.slice(0, 3).map(lead => { const company = state.companies.find(company => company.id === lead.company_id); return <Link href={getNextAction(state, lead).href} key={lead.id} className={`dashboard-followup-card${isOverdue(lead) ? " is-overdue" : ""}`}><span className="task-icon"><Icon name="clock" size={17}/></span><div><strong>{company?.company_name || "客户资料待补充"}</strong><span>{relativeDate(lead.next_followup_date)}</span><time>{fullDate(lead.next_followup_date)}</time></div><Icon name="chevron" size={16}/></Link>; })}</div>
      {!scheduled.length && <p className="dashboard-followup-empty">尚未安排跟进。首次模拟发送后，默认安排 3 天后跟进。</p>}
      {scheduled.length > 3 && <p className="dashboard-followup-more">按日期显示最近 3 项，共 {scheduled.length} 项已安排跟进。</p>}
    </section>
    <section className="analyst-panel">
      <div className="analyst-heading"><div className="analyst-title"><span className="ai-icon"><Icon name="sparkles" size={23}/></span><div><h2>销售分析与行动建议</h2><p>只依据当前已记录的数据</p></div><span className="badge pale-green">{activeInsights?.source === "live" ? "在线 AI 生成" : activeInsights?.source === "fallback" ? "本地回退建议" : "本地规则建议"}</span></div><div className="heading-actions"><button className="button secondary" onClick={() => analyze()} disabled={busy}>更新本地建议</button><button className="button secondary" onClick={() => analyze(true)} disabled={busy}><Icon name="sparkles" size={16}/>{busy ? "正在分析…" : "在线 AI 分析"}</button></div></div>
      {activeInsights?.message && <p className="notice">{activeInsights.message}</p>}
      <div className="insight-grid">{[{ tag: "fact", title: "已记录事实", rows: insight.facts }, { tag: "hypothesis", title: "待验证判断", rows: insight.hypotheses }, { tag: "recommendation", title: "行动建议", rows: insight.recommendations }].map(column => <div className="insight-column" key={column.tag}><h3 className={`insight-tag tag-${column.tag}`}>{column.title}</h3><ul>{column.rows.map((line, i) => <li key={i}>{valueLabel(line)}</li>)}</ul></div>)}</div>
      <div className="analyst-footnote"><Icon name="shield" size={14}/>判断不等于事实；建议需结合样本数量与后续反馈验证。</div>
    </section>
  </div>;
}
