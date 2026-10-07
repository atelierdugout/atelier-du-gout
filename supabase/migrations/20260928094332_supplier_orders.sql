CREATE TABLE assistant_supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_id uuid NOT NULL
    REFERENCES assistant_suppliers(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'scheduled',
      'sent',
      'confirmed',
      'received',
      'cancelled',
      'failed'
    )),

  reference text,
  notes text,

  scheduled_for timestamptz,
  sent_at timestamptz,
  confirmed_at timestamptz,
  received_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_supplier_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id uuid NOT NULL
    REFERENCES assistant_supplier_orders(id) ON DELETE CASCADE,

  product_name text NOT NULL,

  quantity numeric(12,3) NOT NULL
    CHECK (quantity > 0),

  unit text,

  unit_price_cents integer
    CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0),

  notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_supplier_orders_supplier_idx
  ON assistant_supplier_orders(supplier_id);

CREATE INDEX assistant_supplier_orders_status_idx
  ON assistant_supplier_orders(status);

CREATE INDEX assistant_supplier_orders_scheduled_idx
  ON assistant_supplier_orders(status, scheduled_for);

CREATE INDEX assistant_supplier_order_items_order_idx
  ON assistant_supplier_order_items(order_id);
