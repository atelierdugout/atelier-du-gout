import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONTACT_TYPES = new Set([
  "person",
  "supplier",
  "customer",
  "employee",
  "partner",
  "other"
]);

const clean = value => {
  const text = String(value ?? "").trim();
  return text || null;
};

export async function createContact(input = {}) {
  const firstName = clean(input.first_name);
  const lastName = clean(input.last_name);
  const companyName = clean(input.company_name);
  const email = clean(input.email);
  const phone = clean(input.phone);

  if (!firstName && !lastName && !companyName) {
    throw new Error(
      "Le prénom, le nom ou le nom de l'entreprise est obligatoire."
    );
  }

  const contactType = CONTACT_TYPES.has(input.contact_type)
    ? input.contact_type
    : "person";

  let existing = null;

  if (email) {
    const { data, error } = await supabase
      .from("assistant_contacts")
      .select("*")
      .ilike("email", email)
      .limit(1);

    if (error) throw error;
    existing = data?.[0] || null;
  }

  if (!existing && firstName && lastName) {
    const { data, error } = await supabase
      .from("assistant_contacts")
      .select("*")
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(1);

    if (error) throw error;
    existing = data?.[0] || null;
  }

  if (!existing && companyName) {
    const { data, error } = await supabase
      .from("assistant_contacts")
      .select("*")
      .ilike("company_name", companyName)
      .limit(1);

    if (error) throw error;
    existing = data?.[0] || null;
  }

  if (existing) {
    return {
      ...existing,
      _assistant_result: "already_exists"
    };
  }

  const contact = {
    contact_type: contactType,
    first_name: firstName,
    last_name: lastName,
    company_name: companyName,
    email,
    phone,
    address: clean(input.address),
    relationship: clean(input.relationship),
    notes: clean(input.notes),
    active: input.active !== false
  };

  const { data, error } = await supabase
    .from("assistant_contacts")
    .insert(contact)
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    _assistant_result: "created"
  };
}

const ORDERING_METHODS = new Set([
  "email",
  "phone",
  "manual"
]);

export async function createSupplier(input = {}) {
  const name = clean(input.name);

  if (!name) {
    throw new Error("Le nom du fournisseur est obligatoire.");
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("assistant_suppliers")
    .select("*")
    .ilike("name", name)
    .limit(1);

  if (existingError) throw existingError;

  const existing = existingRows?.[0] || null;

  if (existing) {
    return {
      ...existing,
      _assistant_result: "already_exists"
    };
  }

  const orderingMethod = ORDERING_METHODS.has(input.ordering_method)
    ? input.ordering_method
    : "email";

  const supplier = {
    name,
    ordering_email: clean(input.ordering_email),
    ordering_phone: clean(input.ordering_phone),
    ordering_method: orderingMethod,
    account_reference: clean(input.account_reference),
    minimum_order_cents:
      input.minimum_order_cents === null ||
      input.minimum_order_cents === undefined
        ? null
        : Number(input.minimum_order_cents),
    delivery_days: Array.isArray(input.delivery_days)
      ? input.delivery_days.map(clean).filter(Boolean)
      : null,
    order_deadline: clean(input.order_deadline),
    notes: clean(input.notes),
    active: input.active !== false
  };

  const { data, error } = await supabase
    .from("assistant_suppliers")
    .insert(supplier)
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    _assistant_result: "created"
  };
}

export async function createSupplierOrder(input = {}) {
  const supplierName = clean(input.supplier_name);

  if (!supplierName) {
    throw new Error("Le nom du fournisseur est obligatoire.");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("La commande doit contenir au moins un article.");
  }

  const { data: supplierRows, error: supplierError } = await supabase
    .from("assistant_suppliers")
    .select("*")
    .ilike("name", supplierName)
    .limit(1);

  if (supplierError) throw supplierError;

  const supplier = supplierRows?.[0] || null;

  if (!supplier) {
    throw new Error(
      `Fournisseur introuvable: ${supplierName}. Ajoute d'abord le fournisseur au système.`
    );
  }

  const items = input.items.map((item, index) => {
    const productName = clean(item.product_name);
    const quantity = Number(item.quantity);

    if (!productName) {
      throw new Error(`Article ${index + 1}: nom obligatoire.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(
        `Article ${index + 1}: quantité invalide.`
      );
    }

    return {
      product_name: productName,
      quantity,
      unit: clean(item.unit),
      unit_price_cents:
        item.unit_price_cents === null ||
        item.unit_price_cents === undefined
          ? null
          : Number(item.unit_price_cents),
      notes: clean(item.notes)
    };
  });

  const { data: order, error: orderError } = await supabase
    .from("assistant_supplier_orders")
    .insert({
      supplier_id: supplier.id,
      status: "draft",
      reference: clean(input.reference),
      notes: clean(input.notes)
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItems = items.map(item => ({
    order_id: order.id,
    ...item
  }));

  const { data: savedItems, error: itemsError } = await supabase
    .from("assistant_supplier_order_items")
    .insert(orderItems)
    .select();

  if (itemsError) {
    await supabase
      .from("assistant_supplier_orders")
      .delete()
      .eq("id", order.id);

    throw itemsError;
  }

  return {
    ...order,
    supplier,
    items: savedItems || [],
    _assistant_result: "draft_created"
  };
}

const SCHEDULED_ACTION_TYPES = new Set([
  "supplier_order",
  "reminder",
  "custom"
]);

export async function scheduleAssistantAction(input = {}) {
  const actionType = clean(input.action_type);

  if (!SCHEDULED_ACTION_TYPES.has(actionType)) {
    throw new Error(
      "Type d'action programmé non autorisé."
    );
  }

  const title = clean(input.title);

  if (!title) {
    throw new Error("Le titre de l'action est obligatoire.");
  }

  if (!input.scheduled_for) {
    throw new Error("La date et l'heure d'exécution sont obligatoires.");
  }

  const scheduledFor = new Date(input.scheduled_for);

  if (Number.isNaN(scheduledFor.getTime())) {
    throw new Error("La date et l'heure d'exécution sont invalides.");
  }

  if (scheduledFor.getTime() <= Date.now()) {
    throw new Error(
      "L'action programmée doit être prévue dans le futur."
    );
  }

  const payload =
    input.payload &&
    typeof input.payload === "object" &&
    !Array.isArray(input.payload)
      ? input.payload
      : {};

  const requiresConfirmation =
    input.requires_confirmation === true;

  const { data, error } = await supabase
    .from("assistant_scheduled_actions")
    .insert({
      action_type: actionType,
      title,
      payload,
      scheduled_for: scheduledFor.toISOString(),
      status: "pending",
      requires_confirmation: requiresConfirmation
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    _assistant_result: "scheduled"
  };
}

export async function sendSupplierOrder(input = {}) {
  const orderId = String(input.order_id || "").trim();

  if (!orderId) {
    throw new Error("L'identifiant de la commande fournisseur est obligatoire.");
  }

  if (input.confirmed !== true) {
    throw new Error(
      "Confirmation explicite requise avant l'envoi de la commande fournisseur."
    );
  }

  const { data: order, error: orderError } = await supabase
    .from("assistant_supplier_orders")
    .select(`
      *,
      assistant_suppliers (
        id,
        name,
        ordering_email,
        ordering_method,
        active
      ),
      assistant_supplier_order_items (
        id,
        product_name,
        quantity,
        unit,
        unit_price_cents,
        notes
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderError) throw orderError;

  if (!order) {
    throw new Error("Commande fournisseur introuvable.");
  }

  if (order.status !== "draft") {
    throw new Error(
      `Cette commande ne peut pas être envoyée : statut « ${order.status } ».`
    );
  }

  const supplier = order.assistant_suppliers;

  if (!supplier || supplier.active === false) {
    throw new Error("Fournisseur introuvable ou inactif.");
  }

  if (supplier.ordering_method !== "email") {
    throw new Error(
      `Le fournisseur utilise le mode « ${supplier.ordering_method } », pas l'email.`
    );
  }

  if (!supplier.ordering_email) {
    throw new Error(
      "Aucune adresse email de commande n'est renseignée pour ce fournisseur."
    );
  }

  const items = order.assistant_supplier_order_items || [];

  if (items.length === 0) {
    throw new Error("La commande fournisseur ne contient aucun article.");
  }

  const email = supplierOrderEmail({
    supplier,
    order,
    items
  });

  try {
    const result = await sendBrevoEmail({
      to: supplier.ordering_email,
      toName: supplier.name,
      subject: email.subject,
      htmlContent: email.htmlContent,
      tag: "supplier-order"
    });

    const sentAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("assistant_supplier_orders")
      .update({
        status: "sent",
        sent_at: sentAt,
        updated_at: sentAt
      })
      .eq("id", orderId)
      .eq("status", "draft")
      .select()
      .single();

    if (updateError) throw updateError;

    return {
      ...updated,
      supplier,
      items,
      email_message_id: result?.messageId || null,
      _assistant_result: "sent"
    };
  } catch (error) {
    const message = error?.message || String(error);

    await supabase
      .from("assistant_supplier_orders")
      .update({
        status: "failed",
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId)
      .eq("status", "draft");

    throw new Error(
      `Échec de l'envoi de la commande fournisseur : ${message}`
    );
  }
}
