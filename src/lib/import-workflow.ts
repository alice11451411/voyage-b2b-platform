import type { DemoState } from "../data/demo.ts";
import { saveBusinessProfile, saveProduct, synchronizeProduct } from "./workflow.ts";

export interface ImportedProductInput {
  product_name: string;
  product_category: string;
  description: string;
  advantages: string[];
  certifications: string[];
  moq: string;
  target_country: string;
  target_buyer_type: string;
  icpCriteria: string;
  english_facts?: Record<string, string>;
}
export interface ImportedCompanyInput {
  company_name: string;
  company_description: string;
  products: ImportedProductInput[];
}

/** Validate the entire confirmed preview, then save it in one Provider update. */
export function applyImportedCompany(state: DemoState, input: ImportedCompanyInput, now = new Date()): DemoState {
  if (typeof input.company_name !== "string" || !input.company_name.trim()) throw new Error("请先填写导入的企业名称。");
  if (!Array.isArray(input.products) || !input.products.length) throw new Error("请至少选择一款产品导入。");
  if (input.products.length > 50) throw new Error("一次最多导入 50 款产品，请分批导入。");
  const required: [keyof ImportedProductInput, string][] = [
    ["product_name", "产品名称"], ["product_category", "产品品类"], ["description", "产品简介"],
    ["target_country", "目标市场"], ["target_buyer_type", "客户类型"], ["icpCriteria", "理想客户标准"],
  ];
  for (const [index, product] of input.products.entries()) {
    for (const [key, label] of required) if (typeof product[key] !== "string" || !(product[key] as string).trim()) throw new Error(`第 ${index + 1} 款产品请补充${label}。`);
    if (![product.advantages, product.certifications].every(values => Array.isArray(values) && values.every(value => typeof value === "string"))) throw new Error(`第 ${index + 1} 款产品的优势或认证格式不正确。`);
    if (typeof product.moq !== "string") throw new Error(`第 ${index + 1} 款产品的起订量格式不正确。`);
    if (product.english_facts && Object.values(product.english_facts).some(value => typeof value !== "string")) throw new Error(`第 ${index + 1} 款产品的英文表达格式不正确。`);
  }
  let next = saveBusinessProfile(state, { company_name: input.company_name, description: input.company_description }, now);
  for (const product of input.products) {
    const project = { ...next.project };
    delete project.selected_products;
    next = saveProduct(next, {
      ...project,
      product_name: product.product_name,
      product_category: product.product_category,
      description: product.description,
      advantages: [...product.advantages],
      certifications: [...product.certifications],
      moq: product.moq,
      target_country: product.target_country,
      target_buyer_type: product.target_buyer_type,
      english_facts: { ...(product.english_facts ?? {}) },
    }, product.icpCriteria, true, now);
  }
  return synchronizeProduct(next);
}
