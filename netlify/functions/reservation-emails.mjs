import { sendBrevoEmail } from "./email.mjs";

const esc = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char])
  );

function formatDate(value) {
  if (!value) return "—";

  const [year, month, day] = String(value).split("-");

  if (!year || !month || !day) return esc(value);

  return `${day}/${month}/${year}`;
}

function formatTime(value) {
  return String(value || "—").slice(0, 5).replace(":", "h");
}

function shell(content) {
  return `<!doctype html>
<html>
<body style="margin:0;background:#f7f4ec;font-family:Arial,sans-serif;color:#263021">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px">
    <div style="background:#33402c;color:#fff;padding:22px 24px;font-family:Georgia,serif;font-size:24px">
      L’Atelier du Goût
    </div>

    <div style="background:#fff;padding:26px 24px">
      ${content}
    </div>

    <div style="padding:18px 4px;font-size:12px;color:#68725c">
      3 place Aristide Briand, 17470 Aulnay-de-Saintonge · 07 44 93 37 19
    </div>
  </div>
</body>
</html>`;
}

export async function sendReservationConfirmation(reservation) {
  if (!reservation?.customer_email) {
    return {
      skipped: true,
      reason: "Aucune adresse e-mail."
    };
  }

  const guests = Number(reservation.party_size || 0);

  const content = `
    <h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 16px">
      Réservation confirmée
    </h1>

    <p>Bonjour ${esc(reservation.customer_name || "")},</p>

    <p>
      Votre réservation à <strong>L’Atelier du Goût</strong>
      est bien enregistrée.
    </p>

    <div style="margin:22px 0;padding:18px;background:#f7f4ec">
      <p style="margin:0 0 8px">
        <strong>Date :</strong>
        ${formatDate(reservation.reservation_date)}
      </p>

      <p style="margin:0 0 8px">
        <strong>Heure :</strong>
        ${formatTime(reservation.reservation_time)}
      </p>

      <p style="margin:0 0 8px">
        <strong>Nombre de personnes :</strong>
        ${guests}
      </p>

      <p style="margin:0">
        <strong>Référence :</strong>
        ${esc(reservation.reservation_ref || "")}
      </p>
    </div>

    ${reservation.allergies ? `
      <p>
        <strong>Allergies signalées :</strong>
        ${esc(reservation.allergies)}
      </p>
    ` : ""}

    ${reservation.notes ? `
      <p>
        <strong>Commentaire :</strong>
        ${esc(reservation.notes)}
      </p>
    ` : ""}

    <p>
      Pour modifier ou annuler votre réservation, contactez-nous
      au <strong>07 44 93 37 19</strong>.
    </p>

    <p>
      À bientôt,<br>
      L’Atelier du Goût
    </p>
  `;

  return sendBrevoEmail({
    to: reservation.customer_email,
    toName: reservation.customer_name || undefined,
    subject: `Réservation confirmée — ${formatDate(reservation.reservation_date)} à ${formatTime(reservation.reservation_time)}`,
    htmlContent: shell(content),
    tag: "reservation-confirmation"
  });
}
