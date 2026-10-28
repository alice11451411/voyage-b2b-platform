import type { Project } from "./types.ts";

/** Build a campaign profile while retaining each product's own supplied facts. */
export function buildCombinedProject(projects: Project[], id: string, created_at: string, targetCountry?: string): Project {
  if (!projects.length) throw new Error("请至少选择一款产品。");
  if (projects.some((product) => product.selected_products?.length)) throw new Error("请从产品目录选择单款产品来建立组合。");
  if (new Set(projects.map((product) => product.id)).size !== projects.length) throw new Error("同一款产品不能重复加入组合。");
  if (projects.some((product) => product.company_name !== projects[0].company_name)) throw new Error("产品组合须属于同一家企业。");
  const selected_products = projects.map((product) => ({ ...product, advantages: [...product.advantages], certifications: [...product.certifications], ...(product.english_facts ? { english_facts: { ...product.english_facts } } : {}) }));
  const scoped = (product: Project, fact: string) => `${product.product_name}：${fact}`;
  return {
    id, company_name: projects[0].company_name, company_description: projects[0].company_description,
    product_name: projects.map((product) => product.product_name).join(" + "),
    product_category: [...new Set(projects.map((product) => product.product_category))].join(" / "),
    description: projects.map((product) => scoped(product, product.description)).join("\n"),
    advantages: projects.flatMap((product) => product.advantages.map((fact) => scoped(product, fact))),
    certifications: projects.flatMap((product) => product.certifications.map((fact) => scoped(product, fact))),
    moq: projects.map((product) => scoped(product, product.moq)).join("；"),
    target_country: targetCountry?.trim() || projects[0].target_country,
    target_buyer_type: [...new Set(projects.flatMap((product) => product.target_buyer_type.split(/\s*\/\s*|[,，]/).map((value) => value.trim()).filter(Boolean)))].join(" / "),
    created_at, selected_products, product_confirmed: projects.every((product) => product.product_confirmed === true),
  };
}
