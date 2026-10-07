import { db } from "./db.mjs";
import { createClient } from "@supabase/supabase-js";
import keziaHistory from "../data/kezia-history.json" with { type: "json" };
import invoicesHistory from "../data/invoices-history.json" with { type: "json" };
import onlineSalesHistory from "../data/online-sales-history.json" with { type: "json" };
import cashflowHistory from "../data/cashflow-history.json" with { type: "json" };
import expensesHistory from "../data/expenses-history.json" with { type: "json" };
import bankHistory from "../data/bank-history.json" with { type: "json" };
import sasMarcheHistory from "../data/sas-marche-history.json" with { type: "json" };

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_STATUSES = [
  "paid",
  "preparing",
  "ready",
  "completed"
];

export async function getBusinessContext(question = "") {
  const sql = db();

  const q = String(question || "").toLowerCase();

  const wantsCustomers =
    /client|customer|fidél|loyal|email|téléphone|contact/.test(q);

  const wantsProducts =
    /produit|catalogue|stock|inventaire|vente par produit|meilleure vente|article/.test(q);

  const wantsSuppliers =
    /fournisseur|commande fournisseur|approvisionnement|livraison fournisseur/.test(q);

  const wantsFullOperationalContext =
    /toutes les données|analyse globale|globalement|état global/.test(q);

  const includeCustomers = wantsCustomers;
  const includeProducts = wantsProducts;
  const includeSuppliers = wantsSuppliers;

  const context_mode = {
    customers_detail: includeCustomers,
    products_detail: includeProducts,
    suppliers_detail: includeSuppliers,
    global_analysis: wantsFullOperationalContext
  };

  const sales = await sql`
    SELECT
      COUNT(*)::int AS order_count,
      COALESCE(SUM(total_cents), 0)::bigint AS revenue_cents,
      COALESCE(AVG(total_cents), 0)::bigint AS average_order_cents,
      COUNT(DISTINCT NULLIF(LOWER(customer_email), ''))::int
        AS customer_count
    FROM orders
    WHERE status = ANY(${VALID_STATUSES})
  `;

  const products = includeProducts ? await sql`
    SELECT
      oi.product_name,
      COALESCE(SUM(oi.quantity), 0)::int AS quantity,
      COALESCE(SUM(oi.line_total_cents), 0)::bigint AS revenue_cents
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id
    WHERE o.status = ANY(${VALID_STATUSES})
    GROUP BY oi.product_name
    ORDER BY revenue_cents DESC
    LIMIT 100
  ` : [];

  const clients = includeCustomers ? await sql`
    SELECT
      LOWER(TRIM(o.customer_email)) AS email,
      MAX(o.customer_name) AS name,
      MAX(o.customer_phone) AS phone,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(o.total_cents), 0)::bigint AS total_spent_cents,
      MAX(o.created_at) AS last_order_at,
      MAX(o.service_date) AS last_service_date,
      COALESCE(MAX(la.points), 0)::int AS loyalty_points
    FROM orders o
    LEFT JOIN loyalty_accounts la
      ON LOWER(TRIM(la.email)) = LOWER(TRIM(o.customer_email))
    WHERE o.customer_email IS NOT NULL
      AND TRIM(o.customer_email) <> ''
      AND o.status = ANY(${VALID_STATUSES})
    GROUP BY LOWER(TRIM(o.customer_email))
    ORDER BY MAX(o.created_at) DESC
    LIMIT 500
  ` : [];

  const { data: catalogue, error: catalogueError } = includeProducts
    ? await supabase
    .from("products")
    .select("id,name,category,subcategory,price,stock,active,featured")
    .order("name", { ascending: true })
    : { data: [], error: null };

  if (catalogueError) throw catalogueError;

  const {
    data: suppliers,
    error: suppliersError
  } = includeSuppliers
    ? await supabase
    .from("assistant_suppliers")
    .select(
      "id,name,ordering_email,ordering_phone,ordering_method,account_reference,minimum_order_cents,delivery_days,order_deadline,notes,active,created_at,updated_at"
    )
    .order("name", { ascending: true })
    : { data: [], error: null };

  if (suppliersError) throw suppliersError;

  const {
    data: supplierOrders,
    error: supplierOrdersError
  } = includeSuppliers
    ? await supabase
    .from("assistant_supplier_orders")
    .select(`
      id,
      supplier_id,
      status,
      reference,
      notes,
      scheduled_for,
      sent_at,
      confirmed_at,
      received_at,
      created_at,
      updated_at,
      assistant_supplier_order_items (
        id,
        product_name,
        quantity,
        unit,
        unit_price_cents,
        notes,
        created_at
      ),
      assistant_suppliers (
        name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200)
    : { data: [], error: null };

  if (supplierOrdersError) throw supplierOrdersError;

  const normalizedSupplierOrders = (supplierOrders || []).map(order => ({
    ...order,
    supplier_name: order.assistant_suppliers?.name || null,
    items: order.assistant_supplier_order_items || [],
    assistant_suppliers: undefined,
    assistant_supplier_order_items: undefined
  }));

  const reservations = await sql`
    SELECT
      COUNT(*)::int AS reservation_count
    FROM reservations
  `;

  return {
    generated_at: new Date().toISOString(),

    kezia: {
      ...keziaHistory,
      integrated: true
    },

    invoices_history: {
      ...invoicesHistory,
      integrated: true
    },

    online_sales_history: {
      ...onlineSalesHistory,
      integrated: true
    },

    cashflow_history: {
      ...cashflowHistory,
      integrated: true
    },

    expenses_history: {
      ...expensesHistory,
      integrated: true
    },

    bank_history: {
      ...bankHistory,
      integrated: true
    },

    sas_marche_history: {
      ...sasMarcheHistory,
      integrated: true,
      analytical_only: true,
      already_included_in_bank_history: true
    },

    business: {
      name: "L'Atelier du Goût"
    },

    sales: sales[0] || {
      order_count: 0,
      revenue_cents: 0,
      average_order_cents: 0,
      customer_count: 0
    },

    products: includeProducts ? products : [],
    clients: includeCustomers ? clients : [],
    catalogue: includeProducts ? (catalogue || []) : [],
    suppliers: includeSuppliers ? (suppliers || []) : [],
    supplier_orders: includeSuppliers ? normalizedSupplierOrders : [],
    context_mode,

    reservations: reservations[0] || {
      reservation_count: 0
    },

    capabilities: {
      sales: true,
      products: true,
      customers: true,
      reservations: true,
      inventory: true,
      suppliers: true,
      kezia_history: true,
      invoices_history: true,
      online_sales_history: true,
      recipes: false,
      costs: false,
      expenses: true,
      payroll: false,
      cashflow: true,
      bank_transactions: true,
      forecasts: false
    }
  };
}
