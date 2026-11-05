import { table, integer, text, real, index } from 'sdk/db';

export const deals = table('deals', {
  dealNumber: integer('deal_number').primaryKey(),
  dealDate: text('deal_date').notNull(), productName: text('product_name').notNull(),
  searchText: text('search_text').notNull(), quantity: integer('quantity').notNull(),
  totalAmount: real('total_amount').notNull(), startPrice: real('start_price'),
  contractNumber: text('contract_number'), contractType: text('contract_type'),
  currency: text('currency'), unit: text('unit'), lot: integer('lot').notNull(),
  region: text('region'), tradeForm: text('trade_form'), productGrade: text('product_grade'),
  status: text('status'), sellerInn: text('seller_inn'), buyerInn: text('buyer_inn'),
  sellerBroker: text('seller_broker'), buyerBroker: text('buyer_broker'),
}, t => ({
  productIdx: index('idx_deals_product').on(t.productName),
  sellerIdx: index('idx_deals_seller').on(t.sellerInn),
  buyerIdx: index('idx_deals_buyer').on(t.buyerInn),
  dateIdx: index('idx_deals_date').on(t.dealDate),
  sellerBrokerIdx: index('idx_deals_seller_broker').on(t.sellerBroker),
  buyerBrokerIdx: index('idx_deals_buyer_broker').on(t.buyerBroker),
}));
export const usdRates = table('usd_rates', { date: text('date').primaryKey(), rate: real('rate').notNull() });
export const contracts = table('contracts', { number: text('number').primaryKey(), currency: text('currency'), data: text('data').notNull() });
export const participants = table('participants', { inn: text('inn').primaryKey(), name: text('name'), data: text('data').notNull() });
export const brokers = table('brokers', { code: text('code').primaryKey(), name: text('name'), data: text('data').notNull() });
export const settings = table('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
