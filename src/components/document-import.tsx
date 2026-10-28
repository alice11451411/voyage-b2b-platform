"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { applyImportedCompany } from "@/lib/import-workflow";
import { blankDocumentProduct, type DocumentImportResult, type DocumentProduct } from "@/lib/document-import-types";
import { useDemo } from "./demo-provider";
import "./document-import.css";

const fieldLabels: [keyof Pick<DocumentProduct, "product_name" | "product_category" | "description" | "moq" | "target_country" | "target_buyer_type" | "icpCriteria">, string][] = [
  ["product_name", "产品名称"], ["product_category", "产品品类"], ["description", "产品简介"], ["moq", "起订量"], ["target_country", "目标市场"], ["target_buyer_type", "客户类型"], ["icpCriteria", "理想客户标准"],
];
const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);
export function DocumentImport({ beforeApply }: { beforeApply?: () => boolean }) {
  const { update } = useDemo();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configuration, setConfiguration] = useState<"loading" | "ai" | "rules" | "unknown">("loading");
  const [preview, setPreview] = useState<DocumentImportResult | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const activeRequest = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/documents/import", { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json(); setConfiguration(data.configured ? "ai" : "rules");
    }).catch(() => { if (!abort.signal.aborted) setConfiguration("unknown"); });
    return () => { abort.abort(); activeRequest.current?.abort(); };
  }, []);
  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) { setError("请先选择企业介绍、产品目录或规格资料文件。"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("单个文件不能超过 5 MB。"); return; }
    setBusy(true); setError("");
    const abort = new AbortController(); activeRequest.current = abort;
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/documents/import", { method: "POST", body: form, signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "资料提取失败，请重新上传。");
      if (!result.data?.products?.length || typeof result.text !== "string") throw new Error("服务返回的资料不完整，请重新上传。");
      setPreview(result); setSelected(result.data.products.map(() => true));
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "文件提取未完成，请重试；已有资料保留。");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  function editProduct(index: number, key: keyof DocumentProduct, value: string | string[]) {
    setPreview(current => current && ({ ...current, data: { ...current.data, products: current.data.products.map((product, i) => i === index ? { ...product, [key]: value } : product) } }));
  }
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!preview || busy) return;
    const products = preview.data.products.filter((_, index) => selected[index]);
    if (!products.length) { setError("请至少勾选一款产品导入。"); return; }
    if (beforeApply && !beforeApply()) return;
    const ok = update(current => applyImportedCompany(current, { ...preview.data, products }), `企业资料和 ${products.length} 款产品已确认保存；已有产品与开发记录保留。`);
    if (ok) { setPreview(null); setFile(null); setError(""); if (fileInput.current) fileInput.current.value = ""; }
  }
  return <section className="setup-section document-import" aria-label="文件导入企业与产品资料">
    <div className="document-import-heading"><span className="document-import-mark" aria-hidden="true">↑</span><div><h2>上传资料，批量建立产品目录</h2><p>上传企业介绍、产品目录或规格表。先核对提取结果，再一次保存企业与多款产品。</p></div><span className="badge amber">{configuration === "loading" ? "正在检查提取服务" : configuration === "ai" ? "后台在线 AI 已配置" : configuration === "rules" ? "标签与表格提取" : "服务状态待检查"}</span></div>
    <form className="document-upload-form" onSubmit={extract}>
      <div className="field"><span>上传企业与产品资料</span><div className="document-file-picker"><button type="button" className="button secondary" disabled={busy} onClick={() => fileInput.current?.click()}>选择文件</button><span aria-live="polite">{file?.name || "尚未选择文件"}</span><input className="document-file-input" ref={fileInput} type="file" accept=".txt,.csv,.json,.pdf,.docx,.xlsx" aria-label="上传企业与产品资料" tabIndex={-1} disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></div></div>
      <button type="submit" className="button primary" disabled={busy || !file}>{busy ? "正在提取文件资料…" : "提取文件资料"}</button>
    </form>
    <p className="field-help">支持 TXT、CSV、JSON、文字 PDF、DOCX、XLSX，单个文件最多 5 MB、30 页 PDF、20 款产品。原始文件仅本次读取，不保存；确认后的资料保存在当前浏览器。扫描件需先识别文字。</p>
    {configuration === "rules" && <p className="field-help">无需在前端填写 API。管理员可在后台配置在线 AI；当前按“企业名称、产品名称、产品简介”等标签或表头提取，不明内容留空供你补充。</p>}
    <details className="document-template"><summary>查看推荐文件格式</summary><p>CSV 每行一款产品，企业资料可以重复填写；TXT 每款产品从“产品名称”开始。建议表头：</p><code>企业名称,企业简介,产品名称,产品品类,产品简介,产品优势,认证,起订量,目标市场,客户类型,理想客户标准</code><p>目标市场可填“美国 / Canada / Germany”，客户类型可填“Importer / Distributor”等。认证和优势只填写实际资料。</p></details>
    {error && <div role="alert" className="notice document-import-error">{error}{preview && " 上一份提取预览仍保留，可继续核对。"}</div>}
    {preview && <div className="document-preview">
      <div className="document-preview-summary"><div><h3>核对导入资料</h3><p><strong>{preview.file_name}</strong> · {preview.format.toUpperCase()} · {preview.source === "ai" ? "在线 AI 提取" : "规则提取"} · {preview.text.length.toLocaleString()} 字符</p></div><button className="button secondary" type="button" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>取消这次导入</button></div>
      <div role="status" className="product-status-note">{preview.message}</div>
      <details className="document-original"><summary>查看文件原文，核对提取依据</summary><pre>{preview.text}</pre></details>
      <form onSubmit={confirm}><fieldset disabled={busy} className="document-preview-form-fields">
        <div className="product-form-grid"><label className="field">导入企业名称<input required aria-label="导入企业名称" value={preview.data.company_name} onChange={event => setPreview({ ...preview, data: { ...preview.data, company_name: event.target.value } })} placeholder="资料未识别时请填写你的企业名称" /></label><label className="field">导入企业简介<textarea aria-label="导入企业简介" rows={2} value={preview.data.company_description} onChange={event => setPreview({ ...preview, data: { ...preview.data, company_description: event.target.value } })} /></label></div>
        <p className="field-help">企业名称与简介会成为所有产品共用的资料。勾选产品将追加到现有目录；重复导入同一款也会新增，请取消勾选不需要的产品。</p>
        <div className="document-product-previews">{preview.data.products.map((product, index) => <fieldset key={index} className={`document-product-preview ${selected[index] ? "is-selected" : ""}`}>
          <legend><label className="checkbox-label"><input type="checkbox" aria-label={`导入第 ${index + 1} 款产品`} checked={Boolean(selected[index])} onChange={event => setSelected(values => values.map((value, i) => i === index ? event.target.checked : value))} />第 {index + 1} 款 · {product.product_name || "待填写产品名称"}</label></legend>
          <div className="document-product-fields">{fieldLabels.map(([key, label]) => <label key={key} className={`field ${["description", "icpCriteria"].includes(key) ? "document-wide-field" : ""}`}>{label}{key === "moq" ? "（选填）" : " *"}{["description", "icpCriteria"].includes(key) ? <textarea required={selected[index]} disabled={!selected[index]} aria-label={`第 ${index + 1} 款${label}`} rows={2} value={product[key]} onChange={event => editProduct(index, key, event.target.value)} /> : <input required={selected[index] && key !== "moq"} disabled={!selected[index]} aria-label={`第 ${index + 1} 款${label}`} value={product[key]} placeholder={key === "target_country" ? "例如 United States / 美国" : key === "target_buyer_type" ? "例如 Importer / Distributor" : "原文未知，请核对后补充"} onChange={event => editProduct(index, key, event.target.value)} />}</label>)}
            {(["advantages", "certifications"] as const).map(key => <label className="field" key={key}>{key === "advantages" ? "产品优势" : "已有认证"}（选填，每行一项）<textarea disabled={!selected[index]} rows={2} aria-label={`第 ${index + 1} 款${key === "advantages" ? "产品优势" : "已有认证"}`} value={product[key].join("\n")} onChange={event => editProduct(index, key, lines(event.target.value))} /></label>)}
          </div>
        </fieldset>)}</div>
        <div className="document-confirm-actions"><span className="field-help">已勾选 {selected.filter(Boolean).length} 款。保存前请补齐带 * 的字段。</span>{preview.data.products.length < 20 && <button type="button" disabled={busy} className="button secondary" onClick={() => { setPreview({ ...preview, data: { ...preview.data, products: [...preview.data.products, blankDocumentProduct()] } }); setSelected([...selected, true]); }}>补充一款产品</button>}<button className="button primary" type="submit" disabled={busy || !selected.some(Boolean)}>确认导入资料</button></div>
      </fieldset></form>
    </div>}
  </section>;
}
