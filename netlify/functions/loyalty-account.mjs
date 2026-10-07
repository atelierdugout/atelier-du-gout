import { db } from './db.mjs';
import { ensureLoyalty, hash } from './loyalty.mjs';
import { publicLoyaltyRewards } from './loyalty-rewards.mjs';
import {
  loyaltyTokenFromRequest,
  loyaltyCookie
} from './loyalty-session-cookie.mjs';

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

export default async req => {
  if (req.method !== 'POST') {
    return reply({ error: 'Méthode non autorisée.' }, 405);
  }

  try {
    const body = await req.json();
    const token = loyaltyTokenFromRequest(req, body);

    if (!token) {
      return reply({ error: 'Session expirée.' }, 401);
    }
    const sql = db();

    await ensureLoyalty(sql);

    const session = (await sql`
      SELECT
        s.account_id,
        a.email,
        a.name,
        a.points
      FROM loyalty_sessions s
      JOIN loyalty_accounts a
        ON a.id = s.account_id
      WHERE s.token_hash = ${hash(token)}
        AND s.expires_at > NOW()
      LIMIT 1
    `)[0];

    if (!session) {
      return reply({ error: 'Session expirée.' }, 401);
    }

    const history = await sql`
      SELECT
        event_type,
        points,
        order_ref,
        note,
        created_at
      FROM loyalty_ledger
      WHERE account_id = ${session.account_id}
      ORDER BY id DESC
      LIMIT 50
    `;

    const orders = await sql`
      SELECT
        id,
        order_ref,
        status,
        fulfillment_status,
        mode,
        zone,
        service_date,
        service_slot,
        customer_name,
        customer_phone,
        customer_address,
        subtotal_cents,
        delivery_cents,
        total_cents,
        gift_card_cents,
        loyalty_points_used,
        loyalty_discount_cents,
        mollie_due_cents,
        created_at,
        paid_at
      FROM orders
      WHERE LOWER(TRIM(customer_email)) = LOWER(TRIM(${session.email}))
        AND status NOT IN (
          'pending_payment',
          'payment_creation_failed',
          'gift_invalid',
          'loyalty_invalid'
        )
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const orderIds = orders.map(order => Number(order.id));
    let items = [];

    if (orderIds.length) {
      items = await sql`
        SELECT
          order_id,
          product_name,
          quantity,
          unit_price_cents,
          line_total_cents
        FROM order_items
        WHERE order_id = ANY(${orderIds})
        ORDER BY id
      `;
    }

    const itemsByOrder = new Map();

    for (const item of items) {
      const key = String(item.order_id);

      if (!itemsByOrder.has(key)) {
        itemsByOrder.set(key, []);
      }

      itemsByOrder.get(key).push({
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        unit_price_cents: Number(item.unit_price_cents || 0),
        line_total_cents: Number(item.line_total_cents || 0)
      });
    }

    const legacyToken = String(body?.token || '').trim();
    const hasCookie = (req.headers.get('cookie') || '')
      .includes('atelier_loyalty_session=');

    const responseBody = {
      ok: true,

      account: {
        email: session.email,
        name: session.name,
        points: Number(session.points || 0)
      },

      history,

      rewards: publicLoyaltyRewards(),

      orders: orders.map(order => ({
        order_ref: order.order_ref,
        status: order.status,
        fulfillment_status: order.fulfillment_status,
        mode: order.mode,
        zone: order.zone,
        service_date: order.service_date,
        service_slot: order.service_slot,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        subtotal_cents: Number(order.subtotal_cents || 0),
        delivery_cents: Number(order.delivery_cents || 0),
        total_cents: Number(order.total_cents || 0),
        gift_card_cents: Number(order.gift_card_cents || 0),
        loyalty_points_used: Number(order.loyalty_points_used || 0),
        loyalty_discount_cents: Number(order.loyalty_discount_cents || 0),
        mollie_due_cents: Number(order.mollie_due_cents || 0),
        created_at: order.created_at,
        paid_at: order.paid_at,
        items: itemsByOrder.get(String(order.id)) || []
      }))
    };

    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };

    if (!hasCookie && legacyToken) {
      headers['Set-Cookie'] = loyaltyCookie(legacyToken);
    }

    return Response.json(responseBody, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error(error);

    return reply({
      error: 'Compte inaccessible.'
    }, 500);
  }
};
