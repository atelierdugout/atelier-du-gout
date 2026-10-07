CREATE TABLE assistant_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  contact_type text NOT NULL DEFAULT 'person'
    CHECK (contact_type IN ('person', 'supplier', 'customer', 'employee', 'partner', 'other')),

  first_name text,
  last_name text,
  company_name text,

  email text,
  phone text,
  address text,

  relationship text,
  notes text,

  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    first_name IS NOT NULL
    OR last_name IS NOT NULL
    OR company_name IS NOT NULL
  )
);

CREATE INDEX assistant_contacts_type_idx
  ON assistant_contacts(contact_type);

CREATE INDEX assistant_contacts_email_idx
  ON assistant_contacts(lower(email));

CREATE INDEX assistant_contacts_company_idx
  ON assistant_contacts(lower(company_name));

CREATE TABLE assistant_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  contact_id uuid REFERENCES assistant_contacts(id) ON DELETE SET NULL,

  name text NOT NULL,

  ordering_email text,
  ordering_phone text,

  ordering_method text NOT NULL DEFAULT 'email'
    CHECK (ordering_method IN ('email', 'phone', 'manual')),

  account_reference text,
  minimum_order_cents integer,
  delivery_days text[],
  order_deadline time,

  notes text,
  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_suppliers_name_idx
  ON assistant_suppliers(lower(name));

CREATE INDEX assistant_suppliers_contact_idx
  ON assistant_suppliers(contact_id);

CREATE TABLE assistant_scheduled_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  action_type text NOT NULL,
  title text NOT NULL,

  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  scheduled_for timestamptz NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled'
    )),

  requires_confirmation boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,

  attempts integer NOT NULL DEFAULT 0,
  last_error text,

  executed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_scheduled_actions_due_idx
  ON assistant_scheduled_actions(status, scheduled_for);

CREATE INDEX assistant_scheduled_actions_type_idx
  ON assistant_scheduled_actions(action_type);
