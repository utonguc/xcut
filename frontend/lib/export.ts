/**
 * Export helpers — Excel (xlsx) and CSV download.
 */

/** Download data as an Excel (.xlsx) file */
export async function exportExcel(
  rows: Record<string, unknown>[],
  filename: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Download data as a CSV file */
export function exportCsv(
  rows: Record<string, unknown>[],
  filename: string
): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvContent =
    headers.join(",") +
    "\n" +
    rows
      .map(row =>
        headers
          .map(h => {
            const v = String(row[h] ?? "");
            return v.includes(",") || v.includes('"') || v.includes("\n")
              ? `"${v.replace(/"/g, '""')}"`
              : v;
          })
          .join(",")
      )
      .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
