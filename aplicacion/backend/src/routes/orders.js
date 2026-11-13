import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import express from 'express';

import { authRequired, requireRole } from '../middleware/auth.js';
import { initializeStore, store } from '../store.js';
import { buildInvoicePayload, generateEd25519KeyPair, signInvoice, verifySignature } from '../utils/security.js';

const router = express.Router();

// Listado de préstamos y adquisiciones del lector con detalles de cada obra
router.get('/', authRequired, async (req, res) => {
  await initializeStore();
  const userOrders = store.orders.filter((item) => item.user_id === req.user.id);

  // Enriquecer cada orden con la información del libro para renderizar "Mi Estantería"
  const enrichedOrders = userOrders.map((order) => {
    const detailedItems = (order.items || []).map((item) => {
      const book = store.products.find((p) => p.id === item.product_id);
      return {
        ...item,
        book: book
          ? {
              id: book.id,
              title: book.title || book.name,
              author: book.author,
              genre: book.genre,
              isbn: book.isbn,
              pages: book.pages,
              publication_year: book.publication_year,
              cover_accent: book.cover_accent,
              file_hash: book.file_hash,
              file_name: book.file_name,
            }
          : null,
      };
    });

    return {
      ...order,
      items: detailedItems,
    };
  });

  return res.json({ orders: enrichedOrders });
});

// Solicitud de adquisición o préstamo digital con firma criptográfica Ed25519
router.post('/', authRequired, requireRole('CLIENTE'), async (req, res) => {
  await initializeStore();
  const { items = [], loan_type = 'ADQUISICION' } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debes seleccionar al menos un ejemplar de la biblioteca.' });
  }

  const selectedProducts = store.products.filter(
    (product) => product.status === 'ACTIVE' && items.includes(product.id)
  );

  if (selectedProducts.length !== items.length) {
    return res.status(400).json({ error: 'Uno o más libros seleccionados no están disponibles en el catálogo.' });
  }

  const orderId = randomUUID();
  const orderItems = selectedProducts.map((product) => ({
    order_id: orderId,
    product_id: product.id,
    price: Number(product.price),
  }));

  const total = orderItems.reduce((sum, item) => sum + Number(item.price), 0);
  const now = new Date().toISOString();

  const order = {
    id: orderId,
    user_id: req.user.id,
    user_name: req.user.name,
    total,
    status: 'APPROVED',
    loan_type,
    created_at: now,
    items: orderItems,
  };

  const payment = {
    id: randomUUID(),
    order_id: orderId,
    transaction_reference: `BOOKONE-FOLIO-${Date.now()}`,
    amount: total,
    status: 'APPROVED',
    created_at: now,
  };

  const invoicePayload = buildInvoicePayload({
    orderNumber: orderId,
    userId: req.user.id,
    total,
    items: orderItems.map((entry) => entry.product_id),
  });

  // Generación de par de claves Ed25519 y firmado criptográfico del comprobante/Ex Libris
  const keyPair = await generateEd25519KeyPair();
  const signedInvoice = await signInvoice(invoicePayload, keyPair.privateKey);
  const publicKeyBytes = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyBase64 = Buffer.from(publicKeyBytes).toString('base64');
  const signatureValid = await verifySignature(invoicePayload, signedInvoice.signature, keyPair.publicKey);

  store.orders.push(order);
  store.payments.push(payment);

  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'PAYMENT_APPROVED',
    created_at: now,
    result: 'SUCCESS',
    origin: 'BOOKONE_CHECKOUT',
  });
  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'ORDER_CREATED',
    created_at: now,
    result: 'SUCCESS',
    origin: 'BOOKONE_CHECKOUT',
  });
  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'SIGNATURE_CREATED',
    created_at: now,
    result: 'SUCCESS',
    origin: 'ED25519_SIGNER',
  });

  return res.status(201).json({
    message: 'Ejemplar(es) concedido(s) y registrado(s) en su estantería.',
    order,
    payment,
    invoice: {
      ...invoicePayload,
      signature: signedInvoice.signature,
      publicKey: publicKeyBase64,
      verification: signatureValid,
      institution: 'BOOKONE Biblioteca Digital',
      algorithm: 'Ed25519 (RFC 8032)',
    },
  });
});

export default router;
