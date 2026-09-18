import OpenAI from 'openai';
import convertHeic from 'heic-convert';

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: 'string', description: 'Recognized clean merchant or store name. Empty if unreadable.' },
    merchant_raw: { type: 'string', description: 'Raw text of merchant from header. Empty if unreadable.' },
    date: { type: 'string', description: 'Transaction date formatted as YYYY-MM-DD or empty string.' },
    amount: { type: 'number', description: 'Final total amount paid as a number. Zero if unreadable.' },
    currency: { type: 'string', description: 'ISO currency code, default MYR.' },
    category: { type: 'string', description: 'Best matching category name.' },
    is_unreadable: { type: 'boolean', description: 'True only if there is no recognizable financial or receipt data.' },
    confidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        merchant: { type: 'number', minimum: 0, maximum: 1 },
        date: { type: 'number', minimum: 0, maximum: 1 },
        amount: { type: 'number', minimum: 0, maximum: 1 },
        category: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['merchant', 'date', 'amount', 'category'],
    },
  },
  required: ['merchant', 'merchant_raw', 'date', 'amount', 'currency', 'category', 'is_unreadable', 'confidence'],
};

// Guard the existing frontend contract, including when a configurable model returns bad output.
function isReceiptData(value: any): boolean {
  return value !== null && typeof value === 'object'
    && ['merchant', 'merchant_raw', 'date', 'currency', 'category'].every(key => typeof value[key] === 'string')
    && (value.date === '' || /^\d{4}-\d{2}-\d{2}$/.test(value.date))
    && typeof value.amount === 'number' && Number.isFinite(value.amount)
    && typeof value.is_unreadable === 'boolean'
    && value.confidence !== null && typeof value.confidence === 'object'
    && ['merchant', 'date', 'amount', 'category'].every(key =>
      typeof value.confidence[key] === 'number'
      && Number.isFinite(value.confidence[key])
      && value.confidence[key] >= 0 && value.confidence[key] <= 1);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  // Support CORS if needed
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileBase64, mimeType, existingCategories } = req.body || {};
    if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) {
      return res.status(400).json({ error: 'Missing receipt file data or mimeType' });
    }
    // Avoid repeated regex groups: normal multi-MB PDFs can exhaust the regex stack.
    if (fileBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64)) {
      return res.status(400).json({ error: 'Receipt file data must be valid base64.' });
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'].includes(mimeType)) {
      return res.status(400).json({ error: 'Please upload a JPEG, PNG, WebP, GIF, HEIC, HEIF, or PDF receipt.' });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    }

    let imageData = fileBase64;
    let imageMime = mimeType;
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      try {
        const jpeg = await convertHeic({ buffer: Buffer.from(fileBase64, 'base64'), format: 'JPEG', quality: 0.95 });
        imageData = Buffer.from(jpeg).toString('base64');
        imageMime = 'image/jpeg';
      } catch {
        return res.status(400).json({ error: 'This HEIC/HEIF photo could not be read. Please try exporting it as JPEG.' });
      }
    }

    // Keep the request within the existing API duration, without automatic duplicate attempts.
    const ai = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 0 });

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

    const filePart = mimeType === 'application/pdf'
      ? { type: 'input_file' as const, filename: 'receipt.pdf', file_data: `data:application/pdf;base64,${fileBase64}` }
      : { type: 'input_image' as const, image_url: `data:${imageMime};base64,${imageData}`, detail: 'high' as const };

    const response = await ai.responses.create({
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna',
      reasoning: { effort: 'low' },
      store: false,
      instructions: systemInstruction,
      input: [{
        role: 'user',
        content: [filePart, {
          type: 'input_text',
          text: 'Analyze this receipt image/document thoroughly. Extract the merchant, total amount paid, transaction date, and best category. Return valid JSON matching the schema.',
        }],
      }],
      text: { format: { type: 'json_schema', name: 'receipt', strict: true, schema: receiptSchema } },
    });

    if (response.status !== 'completed') {
      return res.status(500).json({ error: 'OpenAI could not complete the receipt scan. Please try again.' });
    }
    const refused = response.output.some(item => item.type === 'message'
      && item.content.some(part => part.type === 'refusal'));
    if (refused) {
      return res.status(500).json({ error: 'OpenAI could not process this receipt. Please try a different photo.' });
    }
    if (!response.output_text) {
      return res.status(500).json({ error: 'No receipt data returned from OpenAI. Please try again.' });
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(response.output_text);
    } catch {
      return res.status(500).json({ error: 'OpenAI returned invalid receipt data. Please try again.' });
    }
    if (!isReceiptData(parsedData)) {
      return res.status(500).json({ error: 'OpenAI returned incomplete or invalid receipt fields. Please try again.' });
    }
    return res.status(200).json(parsedData);
  } catch (err: unknown) {
    // Do not log uploaded receipts, provider response bodies, or credentials.
    console.error('Error in scan-receipt API:', err instanceof Error ? err.name : 'Unknown error');
    const error = err instanceof OpenAI.APIConnectionTimeoutError
      ? 'Receipt scanning timed out. Please try again.'
      : err instanceof OpenAI.APIError && err.status === 429
        ? 'Receipt scanning is busy or the API limit was reached. Please try again later.'
        : 'Failed to scan receipt with OpenAI. Please try again.';
    return res.status(500).json({ error });
  }
}
