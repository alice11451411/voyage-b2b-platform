import type { ImportedCompanyInput, ImportedProductInput } from "./import-workflow";

export type DocumentProduct = ImportedProductInput;
export type DocumentCompany = ImportedCompanyInput;
export interface DocumentImportResult {
  data: DocumentCompany;
  source: "ai" | "rules";
  message: string;
  file_name: string;
  format: string;
  text: string;
}
export const blankDocumentProduct = (): DocumentProduct => ({ product_name: "", product_category: "", description: "", advantages: [], certifications: [], moq: "", target_country: "", target_buyer_type: "", icpCriteria: "" });
