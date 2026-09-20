/** Reference bar tab from the product plan §12 — used for demo mode & regression. */
export const DEMO_PARSE = {
  restaurant: "The Adler",
  items: [
    { name: "Josephine Old Fashioned", qty: 8, total: 120.0 },
    { name: "Monkey 47", qty: 2, total: 64.0 },
    { name: "Negroni", qty: 1, total: 6.0 },
    { name: "Hemingway's Kir Royale", qty: 6, total: 78.0 },
    { name: "Apple Juice", qty: 1, total: 4.0 },
    { name: "The Botanist", qty: 1, total: 18.0 },
    { name: "Negroni", qty: 1, total: 3.0 },
    { name: "pom noir N/A", qty: 1, total: 10.0 },
    { name: "Altos Reposado Tequila", qty: 2, total: 28.0 },
    { name: "Margarita", qty: 1, total: 6.0 },
    { name: "Sundress Season", qty: 1, total: 15.0 },
    { name: "Pear Pressure", qty: 1, total: 10.0 },
    { name: "BQ Wine Package ($60)", qty: 7, total: 420.0 },
    { name: "Pineapple Juice", qty: 2, total: 10.0 },
    { name: "Espresso", qty: 5, total: 25.0 },
    { name: "Unmett Min Booze", qty: 1, total: 78.8 },
  ],
  fees: [
    { name: "Admin fee (5%)", amount: 44.79 },
    { name: "Gratuity (20%)", amount: 179.16 },
    { name: "Tax", amount: 103.4 },
  ],
};

export type VisionParse = {
  restaurant: string;
  items: { name: string; qty: number; total: number }[];
  fees: { name: string; amount: number }[];
  source: "vision" | "demo";
};

const SYSTEM_PROMPT = `You extract line items from restaurant/bar receipt photos.
Reply with a JSON object only — no prose, no markdown fences.
Schema:
{
  "restaurant": "string or empty string",
  "items": [{ "name": "string", "qty": 1, "total": 0.0 }],
  "fees": [{ "name": "string", "amount": 0.0 }]
}
Rules:
- items = every orderable line (food, drinks) with quantity and LINE TOTAL (not unit price).
- fees = tax, gratuity/service charge, admin fee, delivery fee only. Do NOT include Subtotal or Total lines as fees.
- If no quantity is printed, default to 1.
- Numbers only: no currency symbols, no thousands separators.`;

function salvageJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model reply was not JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function validateParse(raw: unknown): Omit<VisionParse, "source"> {
  if (!raw || typeof raw !== "object") throw new Error("Invalid parse shape");
  const obj = raw as Record<string, unknown>;
  const restaurant = typeof obj.restaurant === "string" ? obj.restaurant : "";
  const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
  const feesRaw = Array.isArray(obj.fees) ? obj.fees : [];
  const items = itemsRaw.map((it) => {
    const row = it as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const qty = Math.max(1, Math.round(Number(row.qty) || 1));
    const total = Number(row.total);
    if (!name || !Number.isFinite(total)) throw new Error("Bad item row");
    return { name, qty, total };
  });
  const fees = feesRaw.map((f) => {
    const row = f as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const amount = Number(row.amount);
    if (!name || !Number.isFinite(amount)) throw new Error("Bad fee row");
    return { name, amount };
  });
  if (items.length === 0) throw new Error("No items extracted");
  return { restaurant, items, fees };
}

async function callAnthropic(imageBase64: string, mime: string): Promise<Omit<VisionParse, "source">> {
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.VISION_MODEL_API_KEY;
  if (!key) throw new Error("NO_VISION_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.VISION_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            {
              type: "image",
              source: { type: "base64", media_type: mime, data: imageBase64 },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vision API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = salvageJson(text);
  }
  return validateParse(parsed);
}

async function callOpenAI(imageBase64: string, mime: string): Promise<Omit<VisionParse, "source">> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("NO_VISION_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI vision error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = salvageJson(text);
  }
  return validateParse(parsed);
}

export function hasVisionKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.VISION_MODEL_API_KEY ||
      process.env.OPENAI_API_KEY
  );
}

export async function parseReceiptImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<VisionParse> {
  const mime =
    mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/jpeg"
      ? mimeType
      : "image/jpeg";
  const b64 = imageBuffer.toString("base64");

  if (!hasVisionKey()) {
    return { ...DEMO_PARSE, source: "demo" };
  }

  try {
    if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.VISION_MODEL_API_KEY) {
      const result = await callOpenAI(b64, mime);
      return { ...result, source: "vision" };
    }
    const result = await callAnthropic(b64, mime);
    return { ...result, source: "vision" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NO_VISION_KEY") {
      return { ...DEMO_PARSE, source: "demo" };
    }
    throw err;
  }
}
