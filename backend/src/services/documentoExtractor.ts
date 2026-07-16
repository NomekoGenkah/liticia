import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

export type TipoParser = "pdf" | "docx" | "xlsx";

const NUL_BYTE = new RegExp(String.fromCharCode(0), "g");

function sanear(texto: string): string {
  // Postgres rechaza el byte NUL en columnas text ("unsupported Unicode escape sequence \u0000");
  // PDFs/DOCX/XLSX mal codificados a veces lo emiten.
  return texto.replace(NUL_BYTE, "").trim();
}

export async function extraerTexto(buffer: Buffer, tipo: TipoParser): Promise<string> {
  switch (tipo) {
    case "pdf": {
      const parser = new PDFParse({ data: buffer });
      try {
        const resultado = await parser.getText();
        return sanear(resultado.text ?? "");
      } finally {
        await parser.destroy();
      }
    }
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer });
      return sanear(value ?? "");
    }
    case "xlsx": {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const partes: string[] = [];
      workbook.eachSheet((sheet) => {
        partes.push(`=== ${sheet.name} ===`);
        sheet.eachRow((row) => {
          const celdas = (row.values as unknown[])
            .slice(1) // ExcelJS indexa las columnas desde 1; el índice 0 queda undefined
            .map((v) => (v === null || v === undefined ? "" : String(v)));
          partes.push(celdas.join("\t"));
        });
      });
      return sanear(partes.join("\n"));
    }
  }
}
