/** Схемы запросов. Из них же генерируется /api/openapi.json. */
import { z } from 'zod';
import { EXAM_SUBJECTS, INTEREST_IDS } from '@cursus/core';

export const EVENT_NAMES = [
  'onboarding_start',
  'onboarding_step',
  'onboarding_complete',
  'plan_view',
  'plan_edit',
  'program_open',
  'compare_open',
  'planb_open',
  'vacancies_loaded',
  'plan_share',
] as const;

export const eventNameSchema = z.enum(EVENT_NAMES);

/** Значения свойств строго примитивные: ничего, похожего на персональные данные. */
const propValue = z.union([z.string().max(200), z.number(), z.boolean()]);

export const eventSchema = z.object({
  name: eventNameSchema,
  props: z.record(z.string().max(40), propValue).optional(),
  ts: z.number().int().nonnegative().optional(),
});

export const eventsBodySchema = z.object({
  sessionId: z.string().min(4).max(64),
  events: z.array(eventSchema).min(1).max(50),
});

export const periodSchema = z.enum(['24h', '7d', 'all']).default('7d');

export const vacanciesQuerySchema = z.object({
  q: z.string().min(2).max(120),
  region: z
    .string()
    .regex(/^\d{13}$/, 'код региона API «Работа России» — 13 цифр')
    .optional(),
});

export const programsQuerySchema = z.object({
  region: z.string().min(2).max(80).optional(),
  code: z
    .string()
    .regex(/^\d{2}(\.\d{2}(\.\d{2})?)?$/, 'код направления или его префикс')
    .optional(),
  universityId: z.string().regex(/^Q\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const planBodySchema = z.object({
  scores: z.record(z.enum(EXAM_SUBJECTS), z.number().int().min(0).max(100)),
  scoresAreExpected: z.boolean().default(false),
  achievementsBonus: z.number().min(0).max(10).default(0),
  achievements: z.array(z.string().max(80)).max(10).default([]),
  interests: z.array(z.enum(INTEREST_IDS)).max(3).default([]),
  regionMode: z.enum(['home', 'several', 'any']).default('any'),
  homeRegion: z.string().max(80).nullable().default(null),
  regions: z.array(z.string().max(80)).max(10).default([]),
});

export type PlanBody = z.infer<typeof planBodySchema>;
export type EventsBody = z.infer<typeof eventsBodySchema>;
