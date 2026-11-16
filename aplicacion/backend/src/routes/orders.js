import { randomUUID } from 'node:crypto';
import express from 'express';

import { initializeDatabase, isValidUUID, logSecurityEvent, query, withTransaction } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  buildInvoicePayload,
  getExternalEd25519Keys,
  signInvoice,
  verifySignature,
} from '../utils/security.js';

const router = express.Router();

// Consultar órdenes del cliente junto con su pago simulado y comprobante firmado
router.get('/', authRequired, async (req, res) => {
  await initializeDatabase();
  const { publicKeyPem } = getExternalEd25519Keys();

  const ordersRes = await query(
    `SELECT o.*, p.transaction_reference, p.payer_name, p.payment_method, p.simulated_last4, p.status AS payment_status
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );

  const enrichedOrders = [];

  for (const order of ordersRes.rows) {
    const itemsRes = await query(
      `SELECT
         oi.order_id,
         oi.product_id,
         oi.price,
         pr.id AS book_id,
         COALESCE(pr.title, pr.name) AS title,
         pr.author,
         pr.genre,
         pr.isbn,
         pr.pages,
         pr.publication_year,
         pr.cover_accent,
         pr.cover_image,
         pr.file_hash,
         pr.file_name
       FROM order_items oi
       LEFT JOIN products pr ON pr.id = oi.product_id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const detailedItems = itemsRes.rows.map((row) => ({
      order_id: row.order_id,
      product_id: row.product_id,
      price: Number(row.price),
      book: row.book_id
        ? {
            id: row.book_id,
            title: row.title,
            author: row.author,
            genre: row.genre,
            isbn: row.isbn,
            pages: row.pages,
            publication_year: row.publication_year,
            cover_accent: row.cover_accent,
            cover_image: row.cover_image,
            file_hash: row.file_hash,
            file_name: row.file_name,
          }
        : null,
    }));

    enrichedOrders.push({
      id: order.id,
      user_id: order.user_id,
      total: Number(order.total),
      status: order.status,
      loan_type: order.loan_type,
      created_at: order.created_at,
      items: detailedItems,
      payment: {
        transaction_reference: order.transaction_reference,
        payer_name: order.payer_name,
        payment_method: order.payment_method,
        simulated_last4: order.simulated_last4,
        amount: Number(order.total),
        status: order.payment_status || 'APPROVED',
      },
      invoice: order.invoice_payload
        ? {
            payload: order.invoice_payload,
            signature: order.invoice_signature,
            publicKey: publicKeyPem,
            algorithm: 'Ed25519 (RFC 8032)',
            institution: 'BOOKONE Biblioteca Digital',
          }
        : null,
    });
  }

  return res.json({ orders: enrichedOrders });
});

// Verificación de firma digital Ed25519 del comprobante (Secciones 5.1, 11 y 19)
router.post('/verify', async (req, res) => {
  const { invoice, payload, signature } = req.body;
  const targetPayload = payload || invoice;

  if (!targetPayload || !signature) {
    return res.status(400).json({ error: 'Se requiere el comprobante (payload) y la firma digital.' });
  }

  const valid = await verifySignature(targetPayload, signature);
  return res.json({
    valid,
    algorithm: 'Ed25519 (RFC 8032)',
    message: valid
      ? 'Firma digital VÁLIDA: el comprobante es íntegro y fue emitido por BOOKONE.'
      : 'Firma digital INVÁLIDA: el comprobante fue modificado o no corresponde a la clave emisora.',
  });
});

// Compra simulada con datos ficticios + orden + comprobante firmado digitalmente (Ed25519)
router.post('/', authRequired, requireRole('CLIENTE'), async (req, res) => {
  await initializeDatabase();
  const { items = [], loan_type = 'ADQUISICION', payment = {} } = req.body;

  if (!Array.isArray(items) || items.length === 0 || !items.every(isValidUUID)) {
    return res.status(400).json({ error: 'El carrito está vacío o contiene identificadores inválidos.' });
  }

  const payerName = String(payment.payer_name || '').trim();
  const paymentMethod = String(payment.payment_method || '').trim();
  const rawCardDigits = String(payment.card_number || payment.simulated_last4 || '').replace(/\D/g, '');

  if (!payerName || !paymentMethod || rawCardDigits.length < 4) {
    return res.status(400).json({
      error: 'Completa los datos ficticios de pago simulado (titular, método y 4 dígitos ficticios de prueba).',
    });
  }

  // Solo conservamos los 4 dígitos ficticios finales (nunca tarjetas o CVV reales - Sección 10)
  const simulatedLast4 = rawCardDigits.slice(-4);

  const uniqueIds = [...new Set(items)];
  const productsRes = await query(
    "SELECT * FROM products WHERE status = 'ACTIVE' AND id = ANY($1::uuid[])",
    [uniqueIds]
  );

  if (productsRes.rows.length !== uniqueIds.length) {
    return res.status(400).json({ error: 'Uno o más libros del carrito ya no están disponibles.' });
  }

  const { privateKey, publicKey, publicKeyPem } = getExternalEd25519Keys();

  const selectedProducts = productsRes.rows;
  const orderId = randomUUID();
  const paymentId = randomUUID();
  const total = Number(selectedProducts.reduce((sum, p) => sum + Number(p.price), 0).toFixed(2));
  const transactionRef = `BOOKONE-SIM-${Date.now()}`;

  const invoicePayload = buildInvoicePayload({
    orderNumber: orderId,
    userId: req.user.id,
    total,
    items: selectedProducts.map((p) => ({
      productId: p.id,
      title: p.title || p.name,
      price: Number(p.price),
    })),
    transactionReference: transactionRef,
  });

  invoicePayload.buyerName = req.user.name;
  invoicePayload.payerName = payerName;
  invoicePayload.paymentMethod = paymentMethod;
  invoicePayload.simulatedCard = `****-****-****-${simulatedLast4}`;

  const signedInvoice = await signInvoice(invoicePayload, privateKey);
  const signatureValid = await verifySignature(invoicePayload, signedInvoice.signature, publicKey);

  const { createdOrder, createdPayment } = await withTransaction(async (client) => {
    const ordRes = await client.query(
      `INSERT INTO orders (id, user_id, total, status, loan_type, invoice_payload, invoice_signature, created_at)
       VALUES ($1, $2, $3, 'APPROVED', $4, $5::jsonb, $6, NOW())
       RETURNING *`,
      [orderId, req.user.id, total, loan_type, JSON.stringify(invoicePayload), signedInvoice.signature]
    );

    for (const product of selectedProducts) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, price)
         VALUES ($1, $2, $3)`,
        [orderId, product.id, Number(product.price)]
      );
    }

    const payRes = await client.query(
      `INSERT INTO payments (
         id, order_id, transaction_reference, payer_name, payment_method, simulated_last4, amount, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'APPROVED', NOW())
       RETURNING *`,
      [paymentId, orderId, transactionRef, payerName, paymentMethod, simulatedLast4, total]
    );

    await logSecurityEvent(req.user.id, 'PAYMENT_APPROVED', 'SUCCESS', 'BOOKONE_SIMULATED_PAY', client);
    await logSecurityEvent(req.user.id, 'ORDER_CREATED', 'SUCCESS', 'BOOKONE_CHECKOUT', client);
    await logSecurityEvent(req.user.id, 'SIGNATURE_CREATED', 'SUCCESS', 'ED25519_SIGNER', client);

    return {
      createdOrder: ordRes.rows[0],
      createdPayment: payRes.rows[0],
    };
  });

  return res.status(201).json({
    message: 'Compra simulada aprobada y comprobante firmado digitalmente.',
    order: {
      ...createdOrder,
      total: Number(createdOrder.total),
      items: selectedProducts.map((p) => ({
        order_id: orderId,
        product_id: p.id,
        price: Number(p.price),
        book: {
          id: p.id,
          title: p.title || p.name,
          author: p.author,
        },
      })),
    },
    payment: {
      ...createdPayment,
      amount: Number(createdPayment.amount),
    },
    invoice: {
      payload: invoicePayload,
      signature: signedInvoice.signature,
      publicKey: publicKeyPem,
      verification: signatureValid,
      institution: 'BOOKONE Biblioteca Digital',
      algorithm: 'Ed25519 (RFC 8032)',
    },
  });
});

export default router;