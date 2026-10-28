"use client";
import { usePathname, useRouter } from "next/navigation";
import { useDemo } from "./demo-provider";
export function CustomerSource() {
  const { state, datasetMode, setDatasetMode } = useDemo();
  const pathname = usePathname(), router = useRouter();
  function select(mode: "public" | "demo") { setDatasetMode(mode); if (pathname.startsWith("/buyers/")) router.push("/buyers"); }
  const publicCount = state.leads.filter(lead => state.companies.find(company => company.id === lead.company_id)?.dataset === "public").length;
  return <div className="customer-source-bar"><div role="tablist" aria-label="客户数据来源"><button role="tab" aria-label="真实客户" aria-selected={datasetMode === "public"} className={`source-tab ${datasetMode === "public" ? "active" : ""}`} onClick={() => select("public")}>真实客户 <span>{publicCount}</span></button><button role="tab" aria-label="演示客户" aria-selected={datasetMode === "demo"} className={`source-tab ${datasetMode === "demo" ? "active" : ""}`} onClick={() => select("demo")}>演示客户 <span>{state.leads.length - publicCount}</span></button></div><p>{datasetMode === "public" ? "只展示你已核对并加入当前开发选择的公开来源客户。" : "预置虚构客户用于体验流程，不是搜索发现的客户。"}</p></div>;
}
