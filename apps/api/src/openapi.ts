/** Спецификация OpenAPI, собранная из zod-схем. Отдаётся на /api/openapi.json. */
import { z } from 'zod';
import {
  eventsBodySchema,
  periodSchema,
  planBodySchema,
  programsQuerySchema,
  vacanciesQuerySchema,
} from './schemas';

type JsonSchema = Record<string, unknown>;

/**
 * Минимальный конвертер zod -> JSON Schema. Полноценная библиотека тут лишняя:
 * схем немного, а зависимость в прод-образ тянуть не хочется.
 */
export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  if (schema instanceof z.ZodDefault) {
    return { ...toJsonSchema(schema._def.innerType), default: schema._def.defaultValue() };
  }
  if (schema instanceof z.ZodOptional) return toJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodNullable) {
    return { ...toJsonSchema(schema._def.innerType), nullable: true };
  }
  if (schema instanceof z.ZodEffects) return toJsonSchema(schema._def.schema);
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema._def.values };
  if (schema instanceof z.ZodLiteral) return { const: schema._def.value };
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: toJsonSchema(schema._def.type) };
  }
  if (schema instanceof z.ZodUnion) {
    return { oneOf: schema._def.options.map((o: z.ZodTypeAny) => toJsonSchema(o)) };
  }
  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: toJsonSchema(schema._def.valueType) };
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape() as Record<string, z.ZodTypeAny>;
    const properties: JsonSchema = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toJsonSchema(value);
      const optional = value instanceof z.ZodOptional || value instanceof z.ZodDefault;
      if (!optional) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }
  return {};
}

function queryParams(schema: z.ZodObject<z.ZodRawShape>, required: string[] = []): unknown[] {
  const shape = schema._def.shape() as Record<string, z.ZodTypeAny>;
  return Object.entries(shape).map(([name, value]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: toJsonSchema(value),
  }));
}

const jsonBody = (schema: z.ZodTypeAny) => ({
  required: true,
  content: { 'application/json': { schema: toJsonSchema(schema) } },
});

const ok = (description: string) => ({ description });

export function buildOpenApi(version: string, snapshotDate: string): JsonSchema {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Cursus API',
      version,
      description: [
        'API навигатора поступления Cursus.',
        `Снимок данных: ${snapshotDate}.`,
        'Проходные баллы в прототипе — тестовые (isDemo: true).',
        'Фронт считает план в браузере, поэтому при недоступном API работает всё,',
        'кроме живых вакансий и аналитики.',
      ].join(' '),
      license: { name: 'MIT' },
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Проверка живости процесса',
          responses: { 200: ok('status, version, snapshotDate, uptime') },
        },
      },
      '/api/meta': {
        get: {
          summary: 'Даты кампании, пороги зон, дата снимка',
          responses: { 200: ok('Метаданные продукта') },
        },
      },
      '/api/regions': {
        get: { summary: 'Регионы', responses: { 200: ok('Список регионов') } },
      },
      '/api/directions': {
        get: {
          summary: 'Справочник направлений, поиск по коду и названию',
          parameters: [
            { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: { 200: ok('Список направлений') },
        },
      },
      '/api/universities': {
        get: {
          summary: 'Вузы, опционально по региону',
          parameters: [{ name: 'region', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { 200: ok('Список вузов') },
        },
      },
      '/api/programs': {
        get: {
          summary: 'Программы: демо-снимок с реальными значениями поверх',
          parameters: queryParams(programsQuerySchema),
          responses: { 200: ok('Список программ'), 400: ok('Некорректные параметры') },
        },
      },
      '/api/programs/{id}': {
        get: {
          summary: 'Программа с вузом, контентом и зарплатами выпускников',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: ok('Программа'), 404: ok('Не найдена') },
        },
      },
      '/api/salaries/{code}': {
        get: {
          summary: 'Зарплаты выпускников с фолбэком на данные по России',
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'region', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { 200: ok('Зарплаты'), 404: ok('Нет данных по коду') },
        },
      },
      '/api/vacancies': {
        get: {
          summary: 'Прокси к API «Работа России». Никогда не отдаёт 5xx',
          parameters: queryParams(vacanciesQuerySchema, ['q']),
          responses: {
            200: ok('source: live | cache | snapshot'),
            400: ok('Некорректные параметры'),
          },
        },
      },
      '/api/plan': {
        post: {
          summary: 'Сборка плана на сервере той же функцией buildPlan из core',
          requestBody: jsonBody(planBodySchema),
          responses: { 200: ok('План'), 400: ok('Некорректный профиль') },
        },
      },
      '/api/events': {
        post: {
          summary: 'Приём обезличенных событий аналитики, до 50 за раз',
          requestBody: jsonBody(eventsBodySchema),
          responses: {
            202: ok('Принято'),
            400: ok('Некорректное тело'),
            429: ok('Превышен лимит запросов'),
          },
        },
      },
      '/api/admin/stats': {
        get: {
          summary: 'Агрегаты для экрана аналитики',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'period', in: 'query', required: false, schema: toJsonSchema(periodSchema) },
            { name: 'synthetic', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { 200: ok('Статистика'), 401: ok('Нужен ADMIN_TOKEN') },
        },
      },
      '/api/admin/seed': {
        post: {
          summary: 'Синтетические события (только демо-режим)',
          responses: { 201: ok('Создано'), 403: ok('Доступно только в демо-режиме') },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}
