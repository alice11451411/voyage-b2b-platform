"use client";
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "./demo-provider";
import { selectProduct, selectProductGroup } from "@/lib/workflow";
import { countryLabel, productsLabel } from "@/lib/display";

export function ProductSelection() {
  const { state, update } = useDemo();
  const group = state.product_groups.find(item => item.workspace.project.id === state.project.id);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[]>(group?.product_ids ?? [state.project.id]);
  const [market, setMarket] = useState(state.project.target_country);
  function apply() {
    if (update(current => selectProductGroup(current, selected, selected.length > 1 ? market : undefined), selected.length > 1 ? `已选择 ${selected.length} 款产品组合，各组合的开发记录分别保留。` : "已选择单款产品，开发记录分别保留。")) setExpanded(false);
  }
  return <div className="current-product-bar"><label>当前开发产品{group ? "组合" : ""}<select aria-label="当前开发产品" value={state.project.id} onChange={event => {
    const id = event.target.value, selectedGroup = state.product_groups.find(item => item.workspace.project.id === id);
    update(current => selectedGroup ? selectProductGroup(current, selectedGroup.product_ids, selectedGroup.workspace.project.target_country) : selectProduct(current, id), "已切换开发选择，邮件与进展分别保留。");
  }}>{state.products.map(product => <option key={product.project.id} value={product.project.id}>{productsLabel(product.project.product_name)}{product.project.product_confirmed ? "" : "（预置示例）"}</option>)}{state.product_groups.map(item => <option key={item.workspace.project.id} value={item.workspace.project.id}>组合：{item.workspace.project.selected_products?.map(product => productsLabel(product.product_name)).join(" + ")} · {countryLabel(item.workspace.project.target_country)}</option>)}</select></label>
    <div className="heading-actions"><button className="button secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>选择一款或组合开发</button><Link href="/settings#products">添加或编辑产品 →</Link></div>
    {expanded && <section className="product-selection-panel" aria-label="选择开发产品"><h3>这次用哪些产品开发客户？</h3><p>可选一款，也可以选多款组成一个组合。每个组合分别保留邮件、活动与进展。</p><fieldset><legend>选择产品 · 已选 {selected.length} 款</legend>{state.products.map(product => <label className="checkbox-label" key={product.project.id}><input type="checkbox" aria-label={`组合选择：${productsLabel(product.project.product_name)}`} checked={selected.includes(product.project.id)} onChange={event => setSelected(event.target.checked ? [...selected, product.project.id] : selected.filter(id => id !== product.project.id))}/>{productsLabel(product.project.product_name)}</label>)}</fieldset>
      {selected.length > 1 && <label className="field">此次组合开发的目标市场<select aria-label="组合目标市场" value={market} onChange={event => setMarket(event.target.value)}><option value="United States">美国</option><option value="Canada">加拿大（暂无演示客户）</option><option value="Germany">德国（暂无演示客户）</option>{!["United States", "Canada", "Germany"].includes(market) && <option value={market}>{countryLabel(market)}</option>}</select><span className="field-help">只设置本次组合的市场，各产品单独保存的目标市场保留。</span></label>}
      <div className="product-form-actions"><button className="button secondary" onClick={() => setExpanded(false)}>取消选择</button><button className="button primary" disabled={!selected.length} onClick={apply}>应用开发选择</button></div>
    </section>}
  </div>;
}
