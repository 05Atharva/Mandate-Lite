import { AppError, ensure } from './errors.js';
import type { Purchase } from '../shared/types.js';

export interface ProviderAmount {
  currency_code: string;
  value: string;
}
export interface ProviderOrder {
  id: string;
  status: string;
  purchase_units: {
    reference_id?: string;
    custom_id?: string;
    amount: ProviderAmount;
    payee?: { merchant_id?: string };
    payments?: {
      captures?: { id: string; status: string; amount: ProviderAmount; final_capture?: boolean }[];
    };
  }[];
  links?: { rel: string; href: string }[];
}
export interface PaymentProvider {
  configured: boolean;
  merchantId: string;
  create(p: Purchase, operationId: string): Promise<ProviderOrder>;
  read(orderId: string): Promise<ProviderOrder>;
  capture(orderId: string, operationId: string): Promise<ProviderOrder>;
}
export class PayPal implements PaymentProvider {
  configured: boolean;
  private token: { value: string; expires: number } | null = null;
  constructor(
    private clientId: string,
    private secret: string,
    public merchantId: string,
    private appUrl: string,
  ) {
    this.configured = Boolean(clientId && secret && merchantId);
  }
  private async accessToken() {
    ensure(
      this.configured,
      503,
      'PAYPAL_NOT_CONFIGURED',
      'Configure the PayPal sandbox seller credentials and merchant ID first.',
    );
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new AppError(
        502,
        'PAYPAL_AUTH',
        'PayPal sandbox authentication failed. Check seller configuration.',
      );
    const data = (await response.json()) as { access_token: string; expires_in: number };
    ensure(
      typeof data.access_token === 'string' && Number.isFinite(data.expires_in),
      502,
      'PAYPAL_AUTH',
      'PayPal returned an invalid access token response.',
    );
    this.token = {
      value: data.access_token,
      expires: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
  private async call(
    path: string,
    method = 'GET',
    body?: unknown,
    key?: string,
  ): Promise<ProviderOrder> {
    const token = await this.accessToken();
    const response = await fetch(`https://api-m.sandbox.paypal.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(key ? { 'PayPal-Request-Id': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new AppError(
        502,
        'PAYPAL_UNVERIFIED',
        `PayPal returned HTTP ${response.status}. Refresh provider state before taking further action.`,
      );
    return (await response.json()) as ProviderOrder;
  }
  create(p: Purchase, key: string) {
    return this.call(
      '/v2/checkout/orders',
      'POST',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: p.id,
            custom_id: p.id,
            payee: { merchant_id: this.merchantId },
            amount: { currency_code: 'USD', value: (p.amountCents / 100).toFixed(2) },
            description: 'Mandate Lite sandbox catalog — pickup, $0 shipping and $0 tax',
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: `${this.appUrl}/checkout/return?request=${encodeURIComponent(p.id)}`,
              cancel_url: `${this.appUrl}/checkout/cancel?request=${encodeURIComponent(p.id)}`,
            },
          },
        },
      },
      key,
    );
  }
  read(id: string) {
    return this.call(`/v2/checkout/orders/${encodeURIComponent(id)}`);
  }
  capture(id: string, key: string) {
    return this.call(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, 'POST', {}, key);
  }
}
export function cents(amount: ProviderAmount) {
  ensure(
    amount && amount.currency_code === 'USD' && /^(0|[1-9]\d*)\.\d{2}$/.test(amount.value),
    502,
    'PROVIDER_AMOUNT',
    'Provider currency or amount is invalid.',
  );
  const [dollars, fraction] = amount.value.split('.');
  const value = Number(dollars) * 100 + Number(fraction);
  ensure(Number.isSafeInteger(value), 502, 'PROVIDER_AMOUNT', 'Provider amount is too large.');
  return value;
}
export function verifyOrder(order: ProviderOrder, p: Purchase, merchantId: string) {
  ensure(
    order && typeof order.id === 'string' && (!p.orderId || p.orderId === order.id),
    502,
    'PROVIDER_ORDER',
    'Provider order does not match the saved order.',
  );
  ensure(
    Array.isArray(order.purchase_units) && order.purchase_units.length === 1,
    502,
    'PROVIDER_BASKET',
    'Expected one frozen purchase unit.',
  );
  const unit = order.purchase_units[0];
  ensure(
    unit.custom_id === p.id &&
      unit.reference_id === p.id &&
      unit.payee?.merchant_id === merchantId &&
      cents(unit.amount) === p.amountCents,
    502,
    'PROVIDER_MISMATCH',
    'Provider basket, amount, currency, or merchant does not match.',
  );
  return unit;
}
export function approvalUrl(order: ProviderOrder): string | null {
  const link = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  if (!link) return null;
  const url = new URL(link.href);
  ensure(
    url.protocol === 'https:' &&
      ['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port,
    502,
    'PAYPAL_REDIRECT',
    'PayPal returned an unexpected checkout address.',
  );
  return url.href;
}
