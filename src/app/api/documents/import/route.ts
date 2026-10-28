import { DocumentImportError, extractImport, importConfiguration, parseDocument, readUpload } from "../../../../lib/document-import.ts";

export async function GET() {
  const config = importConfiguration();
  return Response.json({ configured: Boolean(config.key), provider: config.key ? config.provider : "rules", formats: ["TXT", "CSV", "JSON", "PDF", "DOCX", "XLSX"], max_file_mb: 5 }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const file = await readUpload(request);
    const parsed = await parseDocument(file.name, Buffer.from(await file.arrayBuffer()));
    const result = await extractImport(parsed.text, parsed.format);
    return Response.json({ ...result, ...parsed, file_name: file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, "").slice(0, 160) || "上传资料" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof DocumentImportError ? error.message : "资料提取暂时失败，请重试；已保存资料不会改变。" }, { status: error instanceof DocumentImportError ? error.status : 500 });
  }
}
