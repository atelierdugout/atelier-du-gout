import OpenAI from "openai";
import { hasAdminAccess } from "./admin-session.mjs";
import { getBusinessContext } from "./business-context.mjs";
import { ensureAssistantHistoryTables, createConversation, saveMessage, getConversation, getConversationMessages, setConversationTitle } from "./assistant-history.mjs";
import { createContact, createSupplier, createSupplierOrder, sendSupplierOrder, scheduleAssistantAction } from "./assistant-tools.mjs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const tools = [
  {
    type: "function",
    name: "create_contact",
    description:
      "Ajoute une personne, un fournisseur, un client, un salarié, un partenaire ou un autre contact au carnet de contacts de L'Atelier du Goût. Utilise cet outil uniquement lorsque le dirigeant demande réellement d'ajouter ou d'enregistrer un contact.",
    parameters: {
      type: "object",
      properties: {
        contact_type: {
          type: "string",
          enum: [
            "person",
            "supplier",
            "customer",
            "employee",
            "partner",
            "other"
          ]
        },
        first_name: {
          type: ["string", "null"]
        },
        last_name: {
          type: ["string", "null"]
        },
        company_name: {
          type: ["string", "null"]
        },
        email: {
          type: ["string", "null"]
        },
        phone: {
          type: ["string", "null"]
        },
        address: {
          type: ["string", "null"]
        },
        relationship: {
          type: ["string", "null"],
          description:
            "Lien avec le dirigeant ou l'entreprise, par exemple père, comptable, fournisseur de boissons."
        },
        notes: {
          type: ["string", "null"]
        }
      },
      required: [
        "contact_type",
        "first_name",
        "last_name",
        "company_name",
        "email",
        "phone",
        "address",
        "relationship",
        "notes"
      ],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "create_supplier",
    description:
      "Ajoute un fournisseur au système de L'Atelier du Goût. Utilise cet outil lorsque le dirigeant demande explicitement d'ajouter ou d'enregistrer un fournisseur.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        ordering_email: { type: ["string", "null"] },
        ordering_phone: { type: ["string", "null"] },
        ordering_method: {
          type: "string",
          enum: ["email", "phone", "manual"]
        },
        account_reference: { type: ["string", "null"] },
        minimum_order_cents: { type: ["integer", "null"] },
        delivery_days: {
          type: ["array", "null"],
          items: { type: "string" }
        },
        order_deadline: {
          type: ["string", "null"],
          description: "Heure limite de commande au format HH:MM si elle est connue."
        },
        notes: { type: ["string", "null"] }
      },
      required: [
        "name",
        "ordering_email",
        "ordering_phone",
        "ordering_method",
        "account_reference",
        "minimum_order_cents",
        "delivery_days",
        "order_deadline",
        "notes"
      ],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "create_supplier_order",
    description:
      "Crée une commande fournisseur en brouillon. Cet outil enregistre la commande mais ne l'envoie jamais au fournisseur.",
    parameters: {
      type: "object",
      properties: {
        supplier_name: {
          type: "string",
          description: "Nom exact du fournisseur déjà enregistré."
        },
        reference: {
          type: ["string", "null"]
        },
        notes: {
          type: ["string", "null"]
        },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              product_name: {
                type: "string"
              },
              quantity: {
                type: "number"
              },
              unit: {
                type: ["string", "null"]
              },
              unit_price_cents: {
                type: ["integer", "null"]
              },
              notes: {
                type: ["string", "null"]
              }
            },
            required: [
              "product_name",
              "quantity",
              "unit",
              "unit_price_cents",
              "notes"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "supplier_name",
        "reference",
        "notes",
        "items"
      ],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "send_supplier_order",
    description:
      "Envoie une commande fournisseur existante par email. Cette action est externe et irréversible : elle exige une confirmation explicite du dirigeant.",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "Identifiant UUID de la commande fournisseur à envoyer."
        },
        confirmed: {
          type: "boolean",
          description:
            "Doit être true uniquement après une confirmation explicite du dirigeant."
        }
      },
      required: [
        "order_id",
        "confirmed"
      ],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "schedule_assistant_action",
    description:
      "Programme une action future dans le système. Cet outil enregistre uniquement la tâche ; il ne l'exécute pas immédiatement.",
    parameters: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          enum: [
            "supplier_order",
            "reminder",
            "custom"
          ]
        },
        title: {
          type: "string"
        },
        scheduled_for: {
          type: "string",
          description:
            "Date et heure futures au format ISO 8601 avec le décalage Europe/Paris approprié. Ne pas utiliser +00:00 sauf si le dirigeant demande explicitement l'heure UTC."
        },
        payload: {
          type: "string",
          description:
            "Données complémentaires de l'action au format JSON. Pour un simple rappel, utiliser {}."
        },
        requires_confirmation: {
          type: "boolean"
        }
      },
      required: [
        "action_type",
        "title",
        "scheduled_for",
        "payload",
        "requires_confirmation"
      ],
      additionalProperties: false
    },
    strict: true
  }
];

const instructions =
  "RÈGLE DE PERFORMANCE : réponds de façon concise et priorisée. Pour une analyse globale ou une question demandant plusieurs analyses à la fois, limite la réponse à environ 1000 mots maximum. Donne d'abord les chiffres essentiels, puis les constats importants et les actions prioritaires. Évite les répétitions et les longues explications. " +

  "Tu es l'assistant personnel et Business Brain de L'Atelier du Goût. " +
  "Tu aides le dirigeant à analyser son entreprise et à exécuter des tâches opérationnelles. " +
  "Réponds en français, de manière précise et opérationnelle. " +
  "Utilise uniquement les données fournies quand tu affirmes un chiffre ou un fait sur l'entreprise. " +
  "N'invente jamais de chiffre ou d'information manquante. " +
  "Les ventes du contexte correspondent aux commandes enregistrées dans le système en ligne et ne représentent pas nécessairement tout le chiffre d'affaires de l'entreprise. " +
  "Le nombre de clients correspond uniquement aux clients identifiables dans ces commandes. " +
  "Le contexte contient aussi un historique de caisse Kézia depuis l’ouverture. " +
  "Pour analyser l’activité historique, utilise les données mensuelles Kézia comme référence du chiffre d’affaires de caisse. " +
  "Les données hebdomadaires Kézia sont un détail des données mensuelles et ne doivent jamais être additionnées au chiffre d’affaires mensuel. " +
  "Les données par moyen de paiement Kézia constituent un autre axe d’analyse et ne doivent jamais être additionnées au chiffre d’affaires mensuel. " +
  "Ne double-compte jamais les ventes Kézia avec les commandes en ligne lorsqu’il n’est pas possible de déterminer si ces commandes sont déjà incluses dans Kézia. " +
  "Le chiffre d’affaires Kézia ne représente pas le bénéfice. Ne donne jamais de bénéfice, marge nette ou rentabilité comme un fait tant que les coûts et charges nécessaires ne sont pas disponibles. " +
  "Pour le chiffre d’affaires historique global vérifié, utilise trois sources distinctes : Kézia, les factures encaissées hors Kézia et le chiffre d’affaires réel vérifié de la boutique en ligne. " +
  "Les commandes brutes présentes dans la table orders sont actuellement majoritairement des tests : ne les ajoute jamais au chiffre d’affaires historique global. " +
  "Pour la boutique en ligne, utilise uniquement online_sales_history.verified_revenue_cents comme chiffre d’affaires réel vérifié. " +
  "Les factures de invoices_history sont considérées comme encaissées et hors Kézia. " +
  "Lorsque tu calcules un total global, calcule-le à partir des données présentes dans kezia.monthly, invoices_history et online_sales_history ; ne te fie pas à un total écrit dans ces instructions. " +
  "Présente si utile la ventilation par source afin que le dirigeant puisse contrôler le calcul. " +
  "Le contexte expenses_history contient des documents d’achats et de dépenses. Analyse-les par catégorie et par période, mais ne considère jamais automatiquement leur total TTC comme des charges d’exploitation. " +
  "Distingue notamment les achats de matières et marchandises, les services, les frais courants, les investissements et les mouvements de compte courant. " +
  "Un investissement n’est pas une charge d’exploitation courante et ne doit pas être soustrait directement du chiffre d’affaires pour calculer un bénéfice. " +
  "Un mouvement de compte courant n’est pas automatiquement une charge de l’entreprise. " +
  "Le contexte cashflow_history décrit des flux de trésorerie. Les encaissements bancaires ne sont pas automatiquement du chiffre d’affaires et les décaissements ne sont pas automatiquement des charges. " +
  "Ne double-compte jamais une dépense présente à la fois dans les documents comptables et dans les mouvements de trésorerie. " +
  "Le contexte bank_history est une synthèse des transactions bancaires détaillées et sert principalement au rapprochement, à l’analyse des flux et à l’identification de charges ou mouvements absents des documents comptables. " +
  "Ne cumule jamais automatiquement bank_history avec expenses_history : une grande partie des paiements bancaires correspond aux mêmes achats et factures. " +
  "Utilise expenses_history comme source documentaire des achats et bank_history comme source de contrôle des mouvements réellement passés en banque. " +
  "Le contexte sas_marche_history identifie spécifiquement les paiements bancaires réels effectués à SAS MARCHE pour les achats de fruits et légumes. Ces montants sont déjà inclus dans bank_history : utilise sas_marche_history pour analyser le coût fruits et légumes, les fréquences et les périodes d’achat, mais ne l’ajoute jamais une seconde fois aux dépenses, décaissements ou charges globales. Le détail des produits, quantités et prix unitaires SAS MARCHE est inconnu et ne doit jamais être inventé. " +
  "Les salaires, loyers, assurances, frais bancaires, crédit-bail et autres catégories visibles uniquement ou plus complètement dans bank_history peuvent être signalés séparément dans l’analyse. " +
  "Les achats d’investissement doivent rester séparés des charges d’exploitation courantes. " +
  "Les mouvements classés Nicolas MARCHAND ou COMPTE COURANT ne doivent pas être considérés automatiquement comme des charges : leur nature doit être déterminée avant tout calcul de résultat. " +
  "Le capital, les emprunts, apports, remboursements et virements internes ne constituent pas du chiffre d’affaires. " +
  "Lorsqu’une même opération semble apparaître dans plusieurs sources, privilégie le rapprochement plutôt que l’addition et indique l’incertitude si le doublon ne peut pas être établi avec certitude. " +
  "Lorsque le dirigeant demande si l’entreprise va bien, analyse séparément activité commerciale, niveau de dépenses, structure des dépenses, évolution de trésorerie et données manquantes. " +
  "Ne présente un bénéfice ou résultat net comme établi que si toutes les charges nécessaires sont disponibles. Sinon, donne uniquement les indicateurs calculables et précise les postes encore manquants. " +
  "Cherche spontanément les anomalies, dépenses élevées, postes pouvant être réduits, évolution défavorable, opportunités d’amélioration de marge et actions susceptibles d’augmenter le chiffre d’affaires ou la productivité. " +
  "Priorise les recommandations selon leur impact financier probable, leur facilité de mise en œuvre et le temps nécessaire. Ne fabrique jamais un impact financier précis lorsque les données ne permettent pas de le calculer. " +
  "Quand le dirigeant demande une analyse de son entreprise, cherche les évolutions du chiffre d’affaires, du nombre d’opérations et du panier moyen, les anomalies, les périodes fortes ou faibles et les opportunités commerciales démontrables par les données. " +
  "Distingue toujours les faits calculables, les hypothèses et les recommandations. Pour une estimation, explique les hypothèses utilisées. " +
  "Le stock du catalogue correspond au stock produit enregistré dans Supabase et non au stock des ingrédients. " +
  "Si des informations indispensables manquent pour exécuter correctement une action, demande-les au dirigeant au lieu de les inventer. " +
  "Tu peux actuellement créer un contact avec l'outil create_contact et créer un fournisseur avec l'outil create_supplier. " +
  "Quand le dirigeant demande explicitement d'ajouter ou d'enregistrer une personne ou un contact, utilise create_contact. " +
  "Quand le dirigeant demande explicitement d'ajouter ou d'enregistrer une entreprise comme fournisseur, utilise create_supplier et non create_contact. " +
  "Pour create_supplier, n'invente jamais une adresse email, un téléphone, une référence client, des jours de livraison, une heure limite ou un minimum de commande qui n'ont pas été fournis. " +
  "Tu peux créer une commande fournisseur en brouillon avec create_supplier_order lorsque le dirigeant demande de préparer ou créer une commande et fournit le fournisseur, les articles et leurs quantités. " +
  "Une commande créée avec create_supplier_order reste toujours au statut brouillon et n'est jamais envoyée au fournisseur. " +
  "Ne prétends jamais qu'une commande a été envoyée, transmise ou confirmée : aucun outil d'envoi n'est disponible actuellement. " +
  "N'invente jamais un prix d'achat, une quantité, une unité ou une référence manquante. Si une information indispensable à la commande manque, demande-la au dirigeant." +
  "Toutes les dates et heures données par le dirigeant sont interprétées dans le fuseau Europe/Paris, sauf indication explicite contraire. " +
  "Pour schedule_assistant_action, scheduled_for doit toujours être un timestamp ISO 8601 avec le décalage Europe/Paris approprié (+01:00 en heure d'hiver ou +02:00 en heure d'été), jamais UTC par défaut. " +
  "Tu peux programmer un rappel ou une action future avec schedule_assistant_action lorsque le dirigeant donne clairement une date et une heure futures. " +
  "Une action supplier_order programmée sert uniquement à préparer ou traiter une commande fournisseur selon le payload enregistré ; elle ne signifie jamais que la commande sera envoyée automatiquement. " +
  "Ne programme jamais l'envoi d'un email, d'une commande ou d'une autre communication externe sans une confirmation explicite du dirigeant. " +
  "Pour une action custom dont l'effet externe n'est pas clairement défini, demande des précisions avant de la programmer. " +
  "Ne prétends jamais avoir exécuté une action si aucun outil ne l'a réellement exécutée.";

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  if (req.method !== "POST") {
    return reply({
      error: "Méthode non autorisée."
    }, 405);
  }

  if (!process.env.OPENAI_API_KEY) {
    return reply({
      error: "OPENAI_API_KEY non configurée."
    }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();

    if (!message) {
      return reply({
        error: "Message requis."
      }, 400);
    }

    await ensureAssistantHistoryTables();

    let conversationId = String(body.conversation_id || "").trim();
    let storedConversation = null;

    if (conversationId) {
      storedConversation = await getConversation(conversationId);

      if (!storedConversation) {
        return reply({
          error: "Conversation introuvable."
        }, 404);
      }
    } else {
      storedConversation = await createConversation(message.slice(0, 80));
      conversationId = storedConversation.id;
    }

    await saveMessage(conversationId, "user", message);

    const storedMessages = await getConversationMessages(conversationId);
    const previousMessages = storedMessages.slice(0, -1);

    const context = await getBusinessContext(message);

    let response = await openai.responses.create({
      model: "gpt-6-sol",
      reasoning: {
        effort: "low"
      },
      max_output_tokens: 3500,
      instructions,
      tools,
      input:
        "HISTORIQUE ET QUESTION DU DIRIGEANT:\n" +
        previousMessages.slice(-12).map(item => (item.role === "user" ? "DIRIGEANT: " : "ASSISTANT: ") + String(item.content || "")).join("\n") +
        "\n\nNOUVELLE QUESTION OU INSTRUCTION DU DIRIGEANT:\n" +
        message +
        "\n\nDONNÉES ACTUELLES DE L'ENTREPRISE:\n" +
        JSON.stringify(context)
    });

    const actions = [];

    for (let turn = 0; turn < 5; turn++) {
      const calls = response.output.filter(
        item => item.type === "function_call"
      );

      if (!calls.length) break;

      const outputs = [];

      for (const call of calls) {
        const args = JSON.parse(call.arguments);

        let result;
        let action;

        if (call.name === "create_contact") {
          result = await createContact(args);

          action = {
            type: "create_contact",
            result: result._assistant_result,
            id: result.id,
            first_name: result.first_name,
            last_name: result.last_name,
            company_name: result.company_name
          };
        } else if (call.name === "create_supplier") {
          result = await createSupplier(args);

          action = {
            type: "create_supplier",
            result: result._assistant_result,
            id: result.id,
            name: result.name,
            ordering_method: result.ordering_method
          };
        } else if (call.name === "create_supplier_order") {
          result = await createSupplierOrder(args);

          action = {
            type: "create_supplier_order",
            result: result._assistant_result,
            id: result.id,
            supplier_id: result.supplier_id,
            supplier_name: result.supplier?.name || null,
            status: result.status,
            item_count: result.items?.length || 0
          };
        } else if (call.name === "send_supplier_order") {
          result = await sendSupplierOrder(args);

          action = {
            type: "send_supplier_order",
            result: result._assistant_result,
            id: result.id,
            supplier_name: result.supplier?.name || null,
            status: result.status,
            email_message_id: result.email_message_id || null
          };
        } else if (call.name === "schedule_assistant_action") {
          let payload = {};

          try {
            payload = JSON.parse(args.payload);
          } catch {
            throw new Error(
              "Le payload de l'action programmée n'est pas un JSON valide."
            );
          }

          result = await scheduleAssistantAction({
            ...args,
            payload
          });

          action = {
            type: "schedule_assistant_action",
            result: result._assistant_result,
            id: result.id,
            action_type: result.action_type,
            title: result.title,
            scheduled_for: result.scheduled_for,
            requires_confirmation: result.requires_confirmation,
            status: result.status
          };
        } else {
          throw new Error(`Outil non autorisé: ${call.name}`);
        }

        actions.push(action);

        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            success: true,
            action: call.name,
            result
          })
        });
      }

      response = await openai.responses.create({
        model: "gpt-6-sol",
        reasoning: {
          effort: "low"
        },
        max_output_tokens: 3500,
        instructions,
        tools,
        previous_response_id: response.id,
        input: outputs
      });
    }

    const answer = response.output_text || "L'Assistant n'a pas retourné de réponse.";

    await saveMessage(conversationId, "assistant", answer);

    return reply({
      ok: true,
      answer,
      conversation_id: conversationId,
      actions,
      generated_at: context.generated_at
    });

  } catch (error) {
    console.error(
      "admin-ai-assistant:",
      error?.message || error,
      error?.stack || ""
    );

    return reply({
      error: "Impossible de contacter ou d'exécuter le Business Brain."
    }, 500);
  }
};
