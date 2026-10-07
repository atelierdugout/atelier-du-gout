import { db } from "./db.mjs";

export async function ensureAssistantHistoryTables() {
  const sql = db();

  await sql`
    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS assistant_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL
        REFERENCES assistant_conversations(id)
        ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx
    ON assistant_messages (conversation_id, created_at)
  `;
}

export async function createConversation(title = "Nouvelle conversation") {
  const sql = db();

  const rows = await sql`
    INSERT INTO assistant_conversations (title)
    VALUES (${title})
    RETURNING id, title, created_at, updated_at
  `;

  return rows[0];
}

export async function saveMessage(conversationId, role, content) {
  const sql = db();

  const rows = await sql`
    INSERT INTO assistant_messages (conversation_id, role, content)
    VALUES (${conversationId}, ${role}, ${content})
    RETURNING id, conversation_id, role, content, created_at
  `;

  await sql`
    UPDATE assistant_conversations
    SET updated_at = NOW()
    WHERE id = ${conversationId}
  `;

  return rows[0];
}

export async function getConversations() {
  const sql = db();

  return sql`
    SELECT id, title, created_at, updated_at
    FROM assistant_conversations
    ORDER BY updated_at DESC
    LIMIT 100
  `;
}

export async function getConversationMessages(conversationId) {
  const sql = db();

  return sql`
    SELECT id, role, content, created_at
    FROM assistant_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC, id ASC
  `;
}

export async function getConversation(conversationId) {
  const sql = db();

  const rows = await sql`
    SELECT id, title, created_at, updated_at
    FROM assistant_conversations
    WHERE id = ${conversationId}
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function setConversationTitle(conversationId, title) {
  const sql = db();

  const cleanTitle = String(title || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);

  if (!cleanTitle) return;

  await sql`
    UPDATE assistant_conversations
    SET title = ${cleanTitle},
        updated_at = NOW()
    WHERE id = ${conversationId}
  `;
}
