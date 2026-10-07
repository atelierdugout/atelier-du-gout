import { sendBrevoEmail, customerEmail, merchantEmail, readyEmail } from './email.mjs';
export async function ensureEmailTable(sql){await sql`CREATE TABLE IF NOT EXISTS email_events (id BIGSERIAL PRIMARY KEY,order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'sending',message_id TEXT,last_error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(order_id,kind))`;}
async function claim(sql,id,kind){const r=await sql`INSERT INTO email_events(order_id,kind,status) VALUES(${id},${kind},'sending') ON CONFLICT(order_id,kind) DO UPDATE SET status='sending',last_error=NULL,updated_at=NOW() WHERE email_events.status='failed' OR (email_events.status='sending' AND email_events.updated_at < NOW()-INTERVAL '10 minutes') RETURNING id`;return r[0];}
async function mark(sql,id,status,msg=null,err=null){await sql`UPDATE email_events SET status=${status},message_id=${msg},last_error=${err},updated_at=NOW() WHERE id=${id}`;}
export async function sendOrderEmails(sql,o){if(!process.env.BREVO_API_KEY)return;const items=await sql`SELECT product_name,quantity,unit_price_cents,line_total_cents FROM order_items WHERE order_id=${o.id} ORDER BY id`;
 if(o.customer_email){const e=await claim(sql,o.id,'customer_confirmation');if(e)try{const m=customerEmail(o,items);const x=await sendBrevoEmail({to:o.customer_email,toName:o.customer_name,subject:m.subject,htmlContent:m.htmlContent,tag:'order-confirmation'});await mark(sql,e.id,'sent',x.messageId||null)}catch(x){await mark(sql,e.id,'failed',null,String(x.message||x).slice(0,2000));}}
 const e=await claim(sql,o.id,'merchant_notification');if(e)try{const m=merchantEmail(o,items);const x=await sendBrevoEmail({to:m.to,toName:'Nicolas',subject:m.subject,htmlContent:m.htmlContent,tag:'new-order'});await mark(sql,e.id,'sent',x.messageId||null)}catch(x){await mark(sql,e.id,'failed',null,String(x.message||x).slice(0,2000));}
}


export async function sendReadyEmail(sql,o){
  if(!process.env.BREVO_API_KEY || !o?.customer_email)return;

  await ensureEmailTable(sql);

  const e=await claim(sql,o.id,'customer_ready');
  if(!e)return;

  try{
    const m=readyEmail(o);
    const x=await sendBrevoEmail({
      to:o.customer_email,
      toName:o.customer_name,
      subject:m.subject,
      htmlContent:m.htmlContent,
      tag:'order-ready'
    });

    await mark(sql,e.id,'sent',x.messageId||null);
  }catch(x){
    await mark(
      sql,
      e.id,
      'failed',
      null,
      String(x.message||x).slice(0,2000)
    );
    throw x;
  }
}
