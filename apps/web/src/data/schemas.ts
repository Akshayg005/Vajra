import { z } from 'zod';

/** Zod schemas at the API boundary (the browser never trusts a network response blindly). */
export const HealthSchema = z.object({ ok: z.boolean(), engine: z.boolean(), llm: z.boolean().optional(), seed: z.number().optional(), version: z.string().optional() });
export type Health = z.infer<typeof HealthSchema>;

export const AssistantOutSchema = z.object({ answer: z.string().max(4000), source: z.enum(['llm', 'engine']) });

export const ProbsSchema = z.object({ thunderstorm: z.number(), lightning: z.number(), hail: z.number(), gust50: z.number(), heavyRain: z.number() });

export const PointNowcastSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  leadMin: z.number(),
  probability: z.number().min(0).max(1),
  probs: ProbsSchema,
  nearestStrikeKm: z.number().nullable(),
  nearestCellId: z.string().nullable(),
  etaMin: z.number().nullable(),
  severity: z.enum(['green', 'yellow', 'orange', 'red']),
});

/** Citizen report form (validated before it reaches the engine or the API). */
export const ReportFormSchema = z.object({
  event: z.enum(['lightning', 'hail', 'damage', 'waterlogging']),
  text: z
    .string()
    .trim()
    .min(3, 'Describe what you see (at least 3 characters)')
    .max(280, 'Keep it under 280 characters')
    .transform((s) => s.replace(/[<>{}`$\\]/g, '').replace(/\s+/g, ' ')),
  lng: z.number().min(60).max(100),
  lat: z.number().min(5).max(40),
  photo: z
    .instanceof(File)
    .refine((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type), 'Photo must be JPG, PNG or WebP')
    .refine((f) => f.size <= 5 * 1024 * 1024, 'Photo must be 5 MB or smaller')
    .optional(),
});
export type ReportForm = z.infer<typeof ReportFormSchema>;

/** Assistant input: plain text only. */
export const ChatInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .transform((s) => s.replace(/[<>{}`$\\]/g, ''));
