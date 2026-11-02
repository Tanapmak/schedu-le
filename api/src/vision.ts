import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/**
 * Reads a live dashboard screenshot (TikTok Shop LIVE, Shopee Live, Lazada Live) into
 * numbers. The PD always checks and confirms before anything is saved.
 */
const num = z.number().nullable();
export const ReadingSchema = z.object({
  platform: z.enum(['tiktok', 'shopee', 'lazada', 'unknown']),
  account_name: z.string().nullable().describe('Shop or account name shown, if any'),
  live_started_at: z
    .string()
    .nullable()
    .describe('Live start date and time as shown, formatted YYYY-MM-DD HH:mm (local time). Null if not visible.'),
  duration_min: num.describe('Live duration so far, in whole minutes'),
  gmv: num.describe('GMV / sales amount in baht, as a plain number'),
  orders: num.describe('Number of orders (SKU orders / created orders)'),
  items_sold: num.describe('Items or units sold'),
  views: num.describe('Total views / viewers'),
  avg_view_sec: num.describe('Average viewing duration, converted to seconds'),
  product_clicks: num.describe('Product clicks'),
  buyers: num.describe('Number of buyers / customers'),
  add_to_cart: num.describe('Add-to-cart count'),
  ads_cost: num.describe('Ads spend in baht'),
  extra: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe('Any other metrics on screen, label as shown and value as shown'),
  unsure: z.array(z.string()).describe('Names of fields above that were hard to read or ambiguous'),
  boxes: z
    .array(
      z.object({
        field: z.string().describe('A field name above (e.g. gmv, orders, live_started_at), or "extra:<label>" for an extra metric'),
        x: z.number().describe('Left edge of the value on the image, in pixels'),
        y: z.number().describe('Top edge, in pixels'),
        w: z.number().describe('Width, in pixels'),
        h: z.number().describe('Height, in pixels'),
      }),
    )
    .describe('Where on the image each value you filled was read from: one tight box around the number (and its label if adjacent)'),
});
export type Reading = z.infer<typeof ReadingSchema>;

/** A box on the image, as fractions (0..1) of its width and height so the page can draw it at any size. */
export interface Box { field: string; x: number; y: number; w: number; h: number }

export type ScreenshotReader = (image: { mediaType: ImageMediaType; base64: string; width?: number; height?: number }) => Promise<Reading>;

/** Turns the model's pixel boxes into clamped fractions; drops boxes that fall outside the image or name no field. */
export function normalizeBoxes(boxes: Reading['boxes'] | undefined, width: number, height: number): Box[] {
  const out: Box[] = [];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (const b of boxes ?? []) {
    if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || !b.field) continue;
    const x0 = clamp(b.x / width), y0 = clamp(b.y / height);
    const x1 = clamp((b.x + b.w) / width), y1 = clamp((b.y + b.h) / height);
    if (x1 - x0 < 0.002 || y1 - y0 < 0.002) continue;
    out.push({ field: b.field, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

const PROMPT = `This is a screenshot or phone photo of a livestream-commerce dashboard (TikTok Shop LIVE, Shopee Live or Lazada Live) from a Thai shop. Read the metrics exactly as shown.

- Numbers: expand abbreviations (1.2K = 1200, 3.4M = 3400000, Thai หมื่น/แสน/ล้าน likewise), drop currency signs and thousands separators. Never guess a value that is not on screen: use null.
- Values on these dashboards are cumulative for the whole broadcast; report them as shown.
- live_started_at: the broadcast start date/time from the header, as local time. If only a time is shown, use today's date from the screen if visible, else null.
- Thai, English and Chinese labels all occur. Map them to the closest field; put anything else in extra.
- List in unsure any field you could not read with confidence.
- boxes: for every value you filled (including each extra), give the pixel box where it appears on the image, origin at the top-left.`;

/** Uses the Claude API. Needs ANTHROPIC_API_KEY; returns undefined when it is not set. */
export function claudeReader(env: NodeJS.ProcessEnv = process.env): ScreenshotReader | undefined {
  if (!env.ANTHROPIC_API_KEY) return undefined;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.RESULTS_MODEL ?? 'claude-haiku-5-5';
  return async ({ mediaType, base64, width, height }) => {
    const size = width && height ? `\n\nThe image is ${width}×${height} pixels.` : '';
    const response = await client.messages.parse({
      model,
      max_tokens: 4000,
      output_config: { effort: 'medium', format: zodOutputFormat(ReadingSchema) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: PROMPT + size },
          ],
        },
      ],
    });
    if (!response.parsed_output) throw new Error(`could not read screenshot (stop_reason ${response.stop_reason})`);
    return response.parsed_output;
  };
}
