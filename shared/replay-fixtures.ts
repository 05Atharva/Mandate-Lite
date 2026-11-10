export interface ReplayCase {
  id: string;
  title: string;
  amountCents: number;
  state: 'CAPTURED' | 'REVIEW' | 'BLOCKED';
  explanation: string;
  steps: { title: string; detail: string }[];
  orderId: string | null;
  captureId: string | null;
}
// Presentation fixtures, never ledger rows or provider evidence.
export const replayCases: ReplayCase[] = [
  {
    id: 'FIXTURE-COFFEE',
    title: 'Office coffee restock',
    amountCents: 1800,
    state: 'CAPTURED',
    explanation: 'One $18 coffee fits the kitchen category and the automatic permission threshold.',
    orderId: 'FIXTURE-ORDER-COFFEE',
    captureId: 'FIXTURE-CAPTURE-COFFEE',
    steps: [
      {
        title: 'Catalog selection',
        detail: 'Fixture selection: COFFEE-01 × 1. No model was called.',
      },
      {
        title: 'Policy allowed',
        detail: 'Category, order limit and cumulative budget checks pass.',
      },
      {
        title: 'Buyer consent',
        detail: 'Simulated. In live mode the buyer must approve at PayPal.',
      },
      {
        title: 'Fixture payment completed',
        detail: 'This simulated receipt is not an actual PayPal capture.',
      },
    ],
  },
  {
    id: 'FIXTURE-GIFT',
    title: 'Team celebration hamper',
    amountCents: 18000,
    state: 'REVIEW',
    explanation:
      'The $180 gift is within the $200 cap but above the $150 review threshold. $180 is reserved, not paid.',
    orderId: null,
    captureId: null,
    steps: [
      {
        title: 'Catalog selection',
        detail: 'Fixture selection: GIFT-01 × 1. No model was called.',
      },
      {
        title: 'Owner review required',
        detail:
          'The exact basket hash, total, mandate version and expiry must bind the owner decision.',
      },
      {
        title: 'Checkout has not started',
        detail: 'Owner approval and subsequent PayPal buyer consent are still required.',
      },
    ],
  },
  {
    id: 'FIXTURE-ESPRESSO',
    title: 'Espresso machine',
    amountCents: 90000,
    state: 'BLOCKED',
    explanation:
      'Electrical is prohibited and $900 exceeds the $200 whole-basket cap. The owner cannot override these failures.',
    orderId: null,
    captureId: null,
    steps: [
      { title: 'Catalog selection', detail: 'Fixture selection: ESPRESSO-01 × 1.' },
      {
        title: 'Hard rules failed',
        detail: 'CATEGORY_ALLOWED and ORDER_CAP fail before checkout.',
      },
      {
        title: 'No payment operation',
        detail: 'No order, capture or reservation is created for this blocked request.',
      },
    ],
  },
];
