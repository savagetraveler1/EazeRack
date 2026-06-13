import assert from "node:assert/strict";
import { parseReceiptText } from "./ocr";

const homeDepotReceipt = `
THE HOME DEPOT
6002 00052 92818 05/07/26 06:39 PM

SUBTOTAL        158.73
SALES TAX         7.94
TOTAL           166.67

XXXXXXXXXXXX1934 DEBIT
USD$ 166.67
`;

const result = parseReceiptText(homeDepotReceipt);

assert.equal(result.amount, 166.67);

console.log("OCR amount fixture passed: Home Depot total beats subtotal.");
