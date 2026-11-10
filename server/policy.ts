import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BasketLine, Mandate, Product, Rule } from '../shared/types.js';
import { ensure } from './errors.js';
export const selectionSchema = z.strictObject({
  sku: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(20),
});
export const intentSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  currency: z.literal('USD'),
  items: z.array(selectionSchema).min(1).max(10),
  planId: z.string().uuid().optional(),
});
export const mandateSchema = z
  .strictObject({
    budgetCents: z.number().int().min(1).max(10000000),
    maxOrderCents: z.number().int().min(1),
    ownerReviewAboveCents: z.number().int().min(0),
    allowedCategories: z
      .array(z.enum(['kitchen', 'office', 'gifts', 'electrical']))
      .min(1)
      .max(4),
    expiresAt: z.iso.datetime(),
  })
  .superRefine((value, ctx) => {
    if (
      value.ownerReviewAboveCents > value.maxOrderCents ||
      value.maxOrderCents > value.budgetCents
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Review threshold must be at most the order cap, and the order cap at most the budget.',
      });
  });
export function canonicalBasket(
  items: { sku: string; quantity: number }[],
  products: Product[],
): BasketLine[] {
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.sku, (merged.get(item.sku) ?? 0) + item.quantity);
  return [...merged]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sku, quantity]) => {
      const product = products.find((p) => p.sku === sku);
      ensure(product, 400, 'UNKNOWN_SKU', `Unknown catalog SKU: ${sku}`);
      ensure(quantity <= 20, 400, 'QUANTITY_LIMIT', 'Merged quantity cannot exceed 20 per SKU.');
      return { ...product, quantity };
    });
}
export const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const total = (basket: BasketLine[]) =>
  basket.reduce((sum, p) => sum + p.unitCents * p.quantity, 0);
export function evaluate(m: Mandate, basket: BasketLine[], committed: number, now: string): Rule[] {
  const amount = total(basket);
  return [
    {
      id: 'MANDATE_ACTIVE',
      passed: !m.revokedAt && m.expiresAt > now,
      message: m.revokedAt
        ? 'The mandate has been revoked.'
        : m.expiresAt <= now
          ? 'The mandate has expired.'
          : 'Published mandate is active.',
    },
    {
      id: 'CATEGORY_ALLOWED',
      passed: basket.every((p) => m.allowedCategories.includes(p.category)),
      message: basket.every((p) => m.allowedCategories.includes(p.category))
        ? 'Every item is in an allowed category.'
        : 'The basket contains a prohibited category.',
    },
    {
      id: 'ORDER_CAP',
      passed: amount <= m.maxOrderCents,
      message:
        amount <= m.maxOrderCents
          ? 'Basket is within the order limit.'
          : `Basket exceeds the $${(m.maxOrderCents / 100).toFixed(2)} order limit.`,
    },
    {
      id: 'PILOT_BUDGET',
      passed: amount + committed <= m.budgetCents,
      message:
        amount + committed <= m.budgetCents
          ? 'Pilot budget can cover this basket.'
          : 'Insufficient available pilot budget.',
    },
  ];
}
