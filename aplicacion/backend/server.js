import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './src/routes/auth.js';
import productsRoutes from './src/routes/products.js';
import ordersRoutes from './src/routes/orders.js';
import adminRoutes from './src/routes/admin.js';
import { initializeStore } from './src/store.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');
const projectRoot = path.resolve(__dirname, '../..');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bookone-biblioteca-digital',
    institution: 'BOOKONE Digital Library & Secure Repository',
    version: '2.0.0',
    tls: process.env.HTTPS_ENABLED === 'true',
    cryptography: ['Argon2id', 'SHA-512', 'Ed25519', 'TLS 1.3'],
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/books', productsRoutes); // Alias para la biblioteca digital
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  return res.sendFile(path.join(frontendDir, 'index.html'));
});

const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const PORT = Number(process.env.PORT || 443);
const defaultFullChainPath = path.join(projectRoot, 'certificados', 'server.fullchain.crt');
const defaultLeafCertPath = path.join(projectRoot, 'certificados', 'server.crt');
const TLS_CERT_PATH = process.env.TLS_CERT_PATH
  || (fs.existsSync(defaultFullChainPath) ? defaultFullChainPath : defaultLeafCertPath);
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || path.join(projectRoot, 'certificados', 'server.key');

initializeStore().then(() => {
  if (HTTPS_ENABLED) {
    const cert = fs.readFileSync(TLS_CERT_PATH);
    const key = fs.readFileSync(TLS_KEY_PATH);
    const server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, app);
    server.on('error', (error) => {
      console.error('Error al iniciar HTTPS en BOOKONE', error);
      process.exit(1);
    });
    server.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  BOOKONE - Biblioteca Digital & Repositorio Seguro    `);
      console.log(`  HTTPS activo en: https://localhost:${PORT}           `);
      console.log(`  Certificado TLS: ${TLS_CERT_PATH}                   `);
      console.log(`=======================================================`);
    });
    return;
  }

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  BOOKONE - Biblioteca Digital & Repositorio Seguro    `);
    console.log(`  HTTP activo en: http://localhost:${PORT}             `);
    console.log(`=======================================================`);
  });
}).catch((error) => {
  console.error('No se pudo iniciar el servicio de BOOKONE', error);
  process.exit(1);
});

export default app;
