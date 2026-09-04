import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API receipt scanning using Gemini 3.7 Flash
  app.post("/api/scan-receipt", async (req, res) => {
    try {
      const { fileBase64, mimeType, existingCategories } = req.body;
      
      if (!fileBase64 || !mimeType) {
        return res.status(400).json({ error: "Missing receipt file or mimeType" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }

      // Initialize the GoogleGenAI client with the key and user agent telemetry header
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const categoriesString = existingCategories && Array.isArray(existingCategories) && existingCategories.length > 0
        ? existingCategories.join(", ")
        : "Food & Dining, Groceries, Petrol / Fuel, Parking, Toll, Transportation, Grab / E-Hailing, Shopping, Personal Care, Medical / Pharmacy, Entertainment, Travel, Hotel / Accommodation, Flight, Office Supplies, Business Expense, Marketing / Advertising, Subscription, Utilities, Phone / Internet, Equipment, Repairs & Maintenance, Education, Gifts, Others";

      const systemInstruction = `You are an expert multilingual receipt OCR and expense classification engine specialized in Malaysian, Singaporean, and international receipts, bills, and payment slips.
Your goal is to parse the uploaded receipt photo, credit card slip, screenshot, or PDF document and extract accurate expense details in JSON format.

RECEIPT & SLIP PARSING GUIDELINES:
1. **Multilingual & Multi-format**: Receipts may be in English, Malay (Bahasa Melayu), Chinese, or mixed languages. They may be paper receipts (thermal paper, printed invoices), credit card / EDC terminal slips, e-wallet slips (Touch 'n Go, Grab, ShopeePay, DuitNow, Boost), bank slips, or itemized supermarket/restaurant bills.
2. **Merchant vs Bank**:
   - On credit card / EDC terminal slips (e.g., Hong Leong Bank, Maybank, CIMB, Public Bank, RHB), extract the **actual Store / Merchant Name** (e.g., "WAKI SHOP", "Village Grocer", "Sushi Tei"), NOT the bank name.
   - Clean up common corporate suffixes like "Sdn Bhd", "Bhd", "LLC", "Pte Ltd", "Co." unless necessary for clarity.
   - **Cropped Top / Missing Store Header**: If the store name header at the top of the receipt was cropped out of the photo, deduce a clear description from the visible items (e.g., "Groceries & Sundries", "Stationery & Snacks", "Snacks & Household", or the primary item name) rather than leaving it blank!
3. **Amount (amount)**: Extract the final total amount paid (e.g. "Total", "Grand Total", "Amount Due", "Net Total", "Jumlah", "Total Paid", "RM 63.75", "RM 361.85").
   - If there is a discount or subtotal (e.g., Sub-total 127.50, Disc 63.75, Total: 63.75), always extract the final NET TOTAL paid (63.75).
   - If a credit card slip is pinned on top of a bill, extract the total from the final charged amount (e.g. 361.85).
   - Always output as a clean number (e.g. 63.75, 361.85).
4. **Currency (currency)**: Default to "MYR" (RM). If another currency (SGD, USD, EUR, GBP) is explicitly indicated, output that code.
5. **Date (date)**: Extract the transaction date. Convert all formats (e.g. "04SEP2026", "04/09/2026", "19-Aug-2026", "2026.09.04", "04.09.26") strictly to "YYYY-MM-DD". If date is completely absent from the photo, return an empty string "".
6. **Category (category)**: Match to the best fitting category among: ${categoriesString}. For example:
   - Snacks, drinks, shampoo, laundry basket, stationery, household items -> "Groceries" or "Shopping"
   - Speciality shops, furniture, health equipment (Waki, Osim, etc.) -> "Shopping" or "Personal Care" or "Equipment"
7. **Confidence Ratings**: Provide numbers between 0.0 and 1.0 representing your confidence for merchant, date, amount, and category.
8. **Unreadable Fallback**: Only set is_unreadable: true if the image contains ZERO recognizable text, is completely pitch black/white, or has no financial/receipt data whatsoever. If amount or items are visible, set is_unreadable: false and output whatever can be extracted.`;

      // Structure our request payload parts
      const filePart = {
        inlineData: {
          mimeType: mimeType,
          data: fileBase64
        }
      };

      const promptPart = {
        text: `Analyze this receipt image/document thoroughly. Extract the merchant, total amount paid, transaction date, and best category. Return valid JSON matching the schema.`
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: [filePart, promptPart],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant: { type: Type.STRING, description: "Clean, simplified merchant/company name. Empty if completely unreadable." },
              merchant_raw: { type: Type.STRING, description: "Raw name of the merchant from header. Empty if completely unreadable." },
              date: { type: Type.STRING, description: "The transaction date formatted strictly as 'YYYY-MM-DD'. Empty if completely unreadable." },
              amount: { type: Type.NUMBER, description: "The final total amount actually paid as a float/number. 0 if unreadable." },
              currency: { type: Type.STRING, description: "ISO Currency code, default MYR." },
              category: { type: Type.STRING, description: "Category name matching one of the provided categories." },
              is_unreadable: { type: Type.BOOLEAN, description: "Set to true if the file is blurry, cropped, not a receipt, or otherwise unreadable." },
              confidence: {
                type: Type.OBJECT,
                properties: {
                  merchant: { type: Type.NUMBER },
                  date: { type: Type.NUMBER },
                  amount: { type: Type.NUMBER },
                  category: { type: Type.NUMBER }
                },
                required: ["merchant", "date", "amount", "category"]
              }
            },
            required: ["merchant", "merchant_raw", "date", "amount", "currency", "category", "confidence"]
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("No response text from Gemini API.");
      }

      const parsedData = JSON.parse(resultText);
      res.json(parsedData);
    } catch (err: any) {
      console.error("Error in scan-receipt endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to scan receipt" });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
