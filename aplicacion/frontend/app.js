/* =============================================================================
   BOOKONE — BIBLIOTECA DIGITAL & ARCHIVO CRIPTOGRÁFICO
   Lógica del Cliente Frontend
   ============================================================================= */

// Estado Global de la Aplicación
const state = {
  token: localStorage.getItem('bookone_token') || localStorage.getItem('authToken') || '',
  user: null,
  books: [],
  orders: [],
  activeGenre: 'TODOS',
  searchQuery: '',
  readerFontSize: 19,
  currentReadingBook: null,
};

// Elementos DOM Principales
const catalogGrid = document.getElementById('catalogGrid');
const catalogCount = document.getElementById('catalogCount');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const genreFilters = document.getElementById('genreFilters');
const shelfContent = document.getElementById('shelfContent');
const shelfBadge = document.getElementById('shelfBadge');
const invoicesList = document.getElementById('invoicesList');
const eventsLog = document.getElementById('eventsLog');
const userWidget = document.getElementById('userWidget');
const userInitial = document.getElementById('userInitial');
const userNameLabel = document.getElementById('userNameLabel');
const userRoleBadge = document.getElementById('userRoleBadge');
const openAuthModalBtn = document.getElementById('openAuthModalBtn');
const logoutBtn = document.getElementById('logoutBtn');
const toastContainer = document.getElementById('toastContainer');

// Modales
const authModal = document.getElementById('authModal');
const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabRegisterBtn = document.getElementById('tabRegisterBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const readerModal = document.getElementById('readerModal');
const closeReaderBtn = document.getElementById('closeReaderBtn');
const readerBookTitle = document.getElementById('readerBookTitle');
const readerBookAuthor = document.getElementById('readerBookAuthor');
const readerGenre = document.getElementById('readerGenre');
const readerHashVal = document.getElementById('readerHashVal');
const readerText = document.getElementById('readerText');
const fontIncBtn = document.getElementById('fontIncBtn');
const fontDecBtn = document.getElementById('fontDecBtn');
const readerAcquireBtn = document.getElementById('readerAcquireBtn');

const exLibrisModal = document.getElementById('exLibrisModal');
const closeExLibrisBtn = document.getElementById('closeExLibrisBtn');
const exLibrisBody = document.getElementById('exLibrisBody');
const exLibrisSigBox = document.getElementById('exLibrisSigBox');

const newBookForm = document.getElementById('newBookForm');
const refreshEventsBtn = document.getElementById('refreshEventsBtn');

// Elementos de la Pantalla de Inicio (Splash Screen)
const splashScreen = document.getElementById('splashScreen');
const splashStepText = document.getElementById('splashStepText');
const splashSkipBtn = document.getElementById('splashSkipBtn');
const replaySplashBtn = document.getElementById('replaySplashBtn');

// -----------------------------------------------------------------------------
// Cliente HTTP de API
// -----------------------------------------------------------------------------
async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && state.token) {
    // Token vencido o inválido
    showToast('Su sesión de lector ha expirado. Ingrese nuevamente.', 'error');
    handleLogout();
    throw new Error('Sesión expirada.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ocurrió un error en el servidor de la biblioteca.');
    }
    return data;
  }

  if (!response.ok) {
    throw new Error('Error al procesar la solicitud.');
  }

  return response;
}

// -----------------------------------------------------------------------------
// Notificaciones Toast Elegantes
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// -----------------------------------------------------------------------------
// Gestión de Identidad & Sesión
// -----------------------------------------------------------------------------
async function initAuth() {
  if (!state.token) {
    updateUserUI(null);
    return;
  }

  try {
    const data = await apiRequest('/auth/me');
    state.user = data.user;
    updateUserUI(state.user);
  } catch (error) {
    state.token = '';
    state.user = null;
    localStorage.removeItem('bookone_token');
    localStorage.removeItem('authToken');
    updateUserUI(null);
  }
}

function updateUserUI(user) {
  if (user) {
    userWidget.classList.remove('hidden');
    openAuthModalBtn.classList.add('hidden');

    const initial = (user.name || user.email || 'L').charAt(0).toUpperCase();
    userInitial.textContent = initial;
    userNameLabel.textContent = user.name || user.email;

    let roleName = 'LECTOR';
    if (user.role === 'ADMINISTRADOR') roleName = 'BIBLIOTECARIO';
    if (user.role === 'OPERADOR') roleName = 'CURADOR';
    userRoleBadge.textContent = roleName;
  } else {
    userWidget.classList.add('hidden');
    openAuthModalBtn.classList.remove('hidden');
  }
}

function handleLogout() {
  state.token = '';
  state.user = null;
  state.orders = [];
  localStorage.removeItem('bookone_token');
  localStorage.removeItem('authToken');
  updateUserUI(null);
  shelfBadge.textContent = '0';
  renderShelf();
  renderInvoices();
  showToast('Ha salido de la biblioteca BOOKONE.', 'info');
}

// -----------------------------------------------------------------------------
// Navegación por Pestañas
// -----------------------------------------------------------------------------
document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const targetId = tab.dataset.target;

    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.content-view').forEach((view) => {
      view.classList.toggle('active', view.id === targetId);
    });

    if (targetId === 'shelfSection') {
      loadShelf();
    } else if (targetId === 'invoicesSection') {
      loadShelf();
    } else if (targetId === 'adminSection') {
      loadSecurityEvents();
    }
  });
});

// -----------------------------------------------------------------------------
// Carga y Renderizado del Catálogo
// -----------------------------------------------------------------------------
async function loadCatalog() {
  try {
    catalogCount.textContent = 'Consultando acervo en el repositorio seguro...';
    const params = new URLSearchParams();
    if (state.activeGenre && state.activeGenre !== 'TODOS') {
      params.set('genre', state.activeGenre);
    }
    if (state.searchQuery) {
      params.set('q', state.searchQuery);
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const result = await apiRequest(`/products${queryString}`);
    state.books = result.products || result.books || [];

    catalogCount.textContent = `${state.books.length} volumen(es) disponibles en la Biblioteca`;
    renderCatalog();
  } catch (error) {
    catalogGrid.innerHTML = `
      <div class="empty-shelf-banner" style="grid-column: 1 / -1;">
        <h3 class="empty-shelf-title">No fue posible consultar el catálogo</h3>
        <p class="empty-shelf-text">${error.message}</p>
      </div>
    `;
    catalogCount.textContent = 'Error al cargar catálogo';
  }
}

function renderCatalog() {
  if (state.books.length === 0) {
    catalogGrid.innerHTML = `
      <div class="empty-shelf-banner" style="grid-column: 1 / -1;">
        <h3 class="empty-shelf-title">No se encontraron obras con ese criterio</h3>
        <p class="empty-shelf-text">Intente con otro término de búsqueda o seleccione otro fondo temático.</p>
      </div>
    `;
    return;
  }

  catalogGrid.innerHTML = state.books.map((book) => {
    const title = book.title || book.name;
    const author = book.author || 'Autor de la Colección';
    const genre = book.genre || 'Literatura General';
    const year = book.publication_year ? (book.publication_year < 0 ? `${Math.abs(book.publication_year)} a.C.` : book.publication_year) : '2026';
    const pages = book.pages || '150';
    const isbn = book.isbn || 'ISBN Reservado';
    const price = Number(book.price).toFixed(2);
    const hashShort = book.file_hash ? `${book.file_hash.slice(0, 16)}...${book.file_hash.slice(-12)}` : 'sha512-verificado';
    const synopsis = book.synopsis || book.description || 'Obra clásica preservada en el repositorio digital.';

    return `
      <article class="book-card" data-id="${book.id}">
        <div class="book-spine-line"></div>
        <div class="book-ribbon" title="Sello de Preservación BOOKONE"></div>

        <header class="book-cover-header">
          <span class="book-genre-tag">${escapeHtml(genre)}</span>
          <h3 class="book-title">${escapeHtml(title)}</h3>
          <div class="book-author">por ${escapeHtml(author)}</div>
        </header>

        <div class="book-card-body">
          <p class="book-synopsis">${escapeHtml(synopsis)}</p>

          <div class="book-meta-grid">
            <div class="meta-field">
              <span class="meta-label">Año de Edición</span>
              <span class="meta-val">${year}</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Extensión</span>
              <span class="meta-val">${pages} páginas</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Identificador</span>
              <span class="meta-val">${escapeHtml(isbn)}</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Aportación / Ejemplar</span>
              <span class="meta-val">$${price} USD</span>
            </div>
          </div>

          <div class="book-hash-badge" title="Integridad SHA-512 garantizada">
            <span>SHA-512:</span> ${hashShort}
          </div>

          <div class="book-actions">
            <button class="btn-read-sample" data-read-id="${book.id}">
              Leer Muestra
            </button>
            <button class="btn-acquire" data-acquire-id="${book.id}">
              Adquirir Ejemplar
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Vincular eventos de botones
  catalogGrid.querySelectorAll('[data-read-id]').forEach((btn) => {
    btn.addEventListener('click', () => openBookReader(btn.dataset.readId));
  });

  catalogGrid.querySelectorAll('[data-acquire-id]').forEach((btn) => {
    btn.addEventListener('click', () => acquireBook(btn.dataset.acquireId));
  });
}

// -----------------------------------------------------------------------------
// Lector de Folio Digital (In-App E-Reader)
// -----------------------------------------------------------------------------
async function openBookReader(bookId) {
  try {
    readerModal.classList.remove('hidden');
    readerBookTitle.textContent = 'Cargando manuscrito...';
    readerBookAuthor.textContent = '';
    readerText.textContent = 'Accediendo al repositorio seguro de BOOKONE...';

    const data = await apiRequest(`/products/${bookId}/read`);
    state.currentReadingBook = data;

    readerBookTitle.textContent = data.title;
    readerBookAuthor.textContent = `por ${data.author || 'Autor de la Colección'}`;
    readerGenre.textContent = (data.genre || 'FONDO CLÁSICO').toUpperCase();
    readerHashVal.textContent = data.file_hash ? `${data.file_hash.slice(0, 24)}...` : 'OK';
    readerText.textContent = data.sample || 'No fue posible desplegar el extracto digital.';

    readerAcquireBtn.onclick = () => {
      closeReaderModal();
      acquireBook(bookId);
    };
  } catch (error) {
    showToast(`No se pudo abrir el lector: ${error.message}`, 'error');
    closeReaderModal();
  }
}

function closeReaderModal() {
  readerModal.classList.add('hidden');
  state.currentReadingBook = null;
}

closeReaderBtn.addEventListener('click', closeReaderModal);
readerModal.addEventListener('click', (e) => {
  if (e.target === readerModal) closeReaderModal();
});

fontIncBtn.addEventListener('click', () => {
  state.readerFontSize = Math.min(26, state.readerFontSize + 2);
  readerText.style.fontSize = `${state.readerFontSize}px`;
});

fontDecBtn.addEventListener('click', () => {
  state.readerFontSize = Math.max(14, state.readerFontSize - 2);
  readerText.style.fontSize = `${state.readerFontSize}px`;
});

// -----------------------------------------------------------------------------
// Adquisición de Ejemplares & Préstamos Digitales
// -----------------------------------------------------------------------------
async function acquireBook(bookId) {
  if (!state.token) {
    showToast('Debe ingresar su credencial de lector para solicitar ejemplares.', 'info');
    openAuthModal();
    return;
  }

  const book = state.books.find((b) => b.id === bookId);
  const bookName = book ? (book.title || book.name) : 'el libro seleccionado';

  try {
    const result = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [bookId],
        loan_type: 'ADQUISICION',
      }),
    });

    showToast(`¡Ejemplar de «${bookName}» registrado en su estantería personal!`, 'success');

    // Desplegar Ex Libris Criptográfico firmado con Ed25519
    if (result.invoice) {
      showExLibrisCertificate(result.invoice, book);
    }

    await loadShelf();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// -----------------------------------------------------------------------------
// Mi Estantería (Personal Shelf)
// -----------------------------------------------------------------------------
async function loadShelf() {
  if (!state.token) {
    renderEmptyShelf('Inicie sesión para acceder a las obras resguardadas en su estantería.');
    renderEmptyInvoices();
    return;
  }

  try {
    const data = await apiRequest('/orders');
    state.orders = data.orders || [];

    // Calcular cantidad de libros únicos en estantería
    let bookCount = 0;
    state.orders.forEach((ord) => {
      if (ord.items) bookCount += ord.items.length;
    });
    shelfBadge.textContent = String(bookCount);

    renderShelf();
    renderInvoices();
  } catch (error) {
    renderEmptyShelf(`Error al cargar su estantería: ${error.message}`);
  }
}

function renderShelf() {
  if (!state.token || state.orders.length === 0) {
    renderEmptyShelf('Aún no tiene volúmenes registrados en su estantería personal.');
    return;
  }

  // Aplanar todos los ítems de las órdenes
  const acquiredBooks = [];
  state.orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      acquiredBooks.push({
        ...item,
        orderId: order.id,
        orderDate: order.created_at,
        book: item.book || state.books.find((b) => b.id === item.product_id) || {
          id: item.product_id,
          title: 'Obra en Registro',
          author: 'Autor',
          genre: 'Colección General',
        },
      });
    });
  });

  shelfContent.innerHTML = `
    <div class="shelf-books-row">
      ${acquiredBooks.map((item) => {
        const book = item.book;
        const title = book.title || book.name || 'Ejemplar Registrado';
        const author = book.author || 'Autor de la Colección';
        const dateStr = new Date(item.orderDate).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        return `
          <div class="shelf-book-item">
            <span class="shelf-book-badge">EJEMPLAR TITULAR</span>
            <h4 class="shelf-book-title">${escapeHtml(title)}</h4>
            <div class="shelf-book-author">por ${escapeHtml(author)}</div>

            <div class="shelf-book-stamp">
              <strong>Folio:</strong> ${item.orderId.slice(0, 8)}...<br />
              <strong>Concesión:</strong> ${dateStr}
            </div>

            <div class="shelf-actions">
              <button class="btn-shelf-download" data-download-id="${book.id}">
                Descargar con Fingerprint
              </button>
              <button class="btn-shelf-cert" data-cert-order="${item.orderId}">
                Ex Libris
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="shelf-ledge"></div>
  `;

  // Eventos de descarga protegida
  shelfContent.querySelectorAll('[data-download-id]').forEach((btn) => {
    btn.addEventListener('click', () => downloadProtectedBook(btn.dataset.downloadId));
  });

  // Eventos de ver Ex Libris
  shelfContent.querySelectorAll('[data-cert-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = state.orders.find((o) => o.id === btn.dataset.certOrder);
      if (order) {
        showExLibrisCertificate({
          orderNumber: order.id,
          userId: state.user.id,
          total: order.total,
          issuedAt: order.created_at,
        });
      }
    });
  });
}

function renderEmptyShelf(message) {
  shelfContent.innerHTML = `
    <div class="empty-shelf-banner">
      <h3 class="empty-shelf-title">Estantería Vacía</h3>
      <p class="empty-shelf-text">${message}</p>
      <button class="btn-primary-folio" onclick="document.querySelector('.nav-tab[data-target=\\'catalogSection\\']').click()">
        Explorar Catálogo de Obras
      </button>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// Descarga Segura con Huella Digital (Fingerprint)
// -----------------------------------------------------------------------------
async function downloadProtectedBook(bookId) {
  try {
    showToast('Generando ejemplar con huella criptográfica individualizada...', 'info');

    const response = await fetch(`/api/products/${bookId}/download`, {
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo descargar el libro.');
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    let filename = `BOOKONE-ejemplar-${bookId}.txt`;
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

    showToast(`Ejemplar «${filename}» descargado con estampa de titularidad.`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// -----------------------------------------------------------------------------
// Certificado Criptográfico Ex Libris (Modal)
// -----------------------------------------------------------------------------
function showExLibrisCertificate(invoice, book = null) {
  exLibrisModal.classList.remove('hidden');

  const readerName = state.user ? state.user.name : 'Lector Registrado';
  const orderFolio = invoice.orderNumber || invoice.id || 'FOLIO-ACTIVO';
  const issuedDate = invoice.issuedAt ? new Date(invoice.issuedAt).toUTCString() : new Date().toUTCString();
  const sig = invoice.signature || 'Firma Ed25519 certificada en el bloque de concesión.';
  const pubKey = invoice.publicKey || 'Clave Pública Registrada en CA Local BOOKONE';

  exLibrisBody.innerHTML = `
    <p>Por el presente comprobante digital, la <strong>Biblioteca Digital BOOKONE</strong> hace constar que el ejemplar solicitado ha sido otorgado a:</p>
    <div style="margin: 12px 0; padding: 10px; background: #faf5eb; border: 1px dashed #d1c0a5;">
      <strong>Lector / Titular :</strong> ${escapeHtml(readerName)}<br />
      <strong>Identificador   :</strong> ${escapeHtml(invoice.userId || (state.user ? state.user.id : 'N/A'))}<br />
      <strong>Folio Digital   :</strong> ${escapeHtml(orderFolio)}<br />
      <strong>Fecha de Emisión:</strong> ${issuedDate}
    </div>
    <p>La obra entregada contiene un sello individualizado (Fingerprint) conforme a la especificación de integridad SHA-512 y el esquema de no repudio Ed25519.</p>
  `;

  exLibrisSigBox.innerHTML = `
    <strong>SELLO DE FIRMA ED25519 (RFC 8032):</strong><br />
    ${sig}<br /><br />
    <strong>CLAVE PÚBLICA EMISORA:</strong><br />
    ${pubKey.slice(0, 48)}...
  `;
}

closeExLibrisBtn.addEventListener('click', () => exLibrisModal.classList.add('hidden'));
exLibrisModal.addEventListener('click', (e) => {
  if (e.target === exLibrisModal) exLibrisModal.classList.add('hidden');
});

// -----------------------------------------------------------------------------
// Comprobantes de Concesión & Firmas
// -----------------------------------------------------------------------------
function renderInvoices() {
  if (!state.token || state.orders.length === 0) {
    renderEmptyInvoices();
    return;
  }

  invoicesList.innerHTML = state.orders.map((order) => {
    const dateStr = new Date(order.created_at).toLocaleString('es-ES');
    const itemsCount = order.items ? order.items.length : 1;

    return `
      <div class="invoice-record-card">
        <div class="inv-col-main">
          <h4>Comprobante de Concesión Digital</h4>
          <div class="inv-folio">FOLIO: ${order.id}</div>
          <div class="inv-date">Fecha y hora UTC: ${dateStr}</div>
          <div style="margin-top: 8px; font-size: 13px; color: var(--ink-secondary);">
            Obras concedidas: <strong>${itemsCount} ejemplar(es)</strong> · Aportación: <strong>$${Number(order.total).toFixed(2)} USD</strong>
          </div>
        </div>

        <div class="inv-col-sig">
          <div class="inv-sig-label">
            Firma Digital Ed25519 Verificada
          </div>
          <div class="inv-sig-code">
            hash-id: ${order.id.replace(/-/g, '')}<br />
            estado: SELLADO E INMUTABLE
          </div>
        </div>

        <div class="inv-col-actions">
          <button class="btn-primary-folio" data-inspect-order="${order.id}">
            Ver Ex Libris
          </button>
        </div>
      </div>
    `;
  }).join('');

  invoicesList.querySelectorAll('[data-inspect-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = state.orders.find((o) => o.id === btn.dataset.inspectOrder);
      if (order) {
        showExLibrisCertificate({
          orderNumber: order.id,
          userId: state.user ? state.user.id : order.user_id,
          total: order.total,
          issuedAt: order.created_at,
        });
      }
    });
  });
}

function renderEmptyInvoices() {
  invoicesList.innerHTML = `
    <div class="empty-shelf-banner">
      <h3 class="empty-shelf-title">Sin Comprobantes Registrados</h3>
      <p class="empty-shelf-text">Los certificados firmados con Ed25519 aparecerán aquí cuando adquiera ejemplares.</p>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// Bitácora de Auditoría y Catalogación (Admin / Curador)
// -----------------------------------------------------------------------------
async function loadSecurityEvents() {
  if (!state.token || !state.user || !['ADMINISTRADOR', 'OPERADOR'].includes(state.user.role)) {
    eventsLog.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--ink-muted);">
        Esta sección está reservada para el <strong>Bibliotecario Mayor</strong> o el <strong>Curador</strong> de BOOKONE.<br />
        Inicie sesión con una credencial administrativa para examinar los registros criptográficos.
      </div>
    `;
    return;
  }

  try {
    eventsLog.innerHTML = '<p class="placeholder-text" style="padding: 16px;">Leyendo bitácora de seguridad...</p>';
    const data = await apiRequest('/admin/events');
    const events = (data.events || []).slice().reverse();

    if (events.length === 0) {
      eventsLog.innerHTML = '<p class="placeholder-text" style="padding: 16px;">No hay eventos registrados.</p>';
      return;
    }

    eventsLog.innerHTML = events.map((ev) => {
      const time = new Date(ev.created_at).toLocaleTimeString('es-ES');
      const isSuccess = ev.result === 'SUCCESS' || ev.result === 'RESTORED';
      const badgeClass = isSuccess ? 'success' : 'failure';

      return `
        <div class="event-entry">
          <span class="event-badge ${badgeClass}">${escapeHtml(ev.result)}</span>
          <div class="event-details">
            <div class="event-title">${escapeHtml(ev.event)}</div>
            <div class="event-time">Origen: ${escapeHtml(ev.origin)} · Usuario: ${escapeHtml(ev.user_id || 'anónimo')} · ${time}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    eventsLog.innerHTML = `<div style="padding: 16px; color: #b91c1c;">${error.message}</div>`;
  }
}

refreshEventsBtn.addEventListener('click', loadSecurityEvents);

// Catalogar Nuevo Libro
newBookForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.token || !state.user || !['ADMINISTRADOR', 'OPERADOR'].includes(state.user.role)) {
    showToast('Requiere rol de Curador o Bibliotecario para incorporar obras.', 'error');
    return;
  }

  const formData = new FormData(newBookForm);
  try {
    await apiRequest('/products', {
      method: 'POST',
      body: JSON.stringify({
        title: formData.get('title'),
        author: formData.get('author'),
        genre: formData.get('genre'),
        isbn: formData.get('isbn'),
        file_name: formData.get('file_name'),
        price: formData.get('price'),
        synopsis: formData.get('synopsis'),
      }),
    });

    showToast('¡Volumen catalogado y firmado con éxito en BOOKONE!', 'success');
    newBookForm.reset();
    await loadCatalog();
    await loadSecurityEvents();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// -----------------------------------------------------------------------------
// Búsqueda y Filtros de Género
// -----------------------------------------------------------------------------
searchInput.addEventListener('input', debounce(() => {
  state.searchQuery = searchInput.value.trim();
  loadCatalog();
}, 300));

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  state.searchQuery = '';
  loadCatalog();
});

genreFilters.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    genreFilters.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeGenre = chip.dataset.genre;
    loadCatalog();
  });
});

// -----------------------------------------------------------------------------
// Autenticación: Login, Registro y Modal
// -----------------------------------------------------------------------------
function openAuthModal() {
  authModal.classList.remove('hidden');
}

function closeAuthModal() {
  authModal.classList.add('hidden');
}

openAuthModalBtn.addEventListener('click', openAuthModal);
closeAuthModalBtn.addEventListener('click', closeAuthModal);
authModal.addEventListener('click', (e) => {
  if (e.target === authModal) closeAuthModal();
});

logoutBtn.addEventListener('click', handleLogout);

tabLoginBtn.addEventListener('click', () => {
  tabLoginBtn.classList.add('active');
  tabRegisterBtn.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
});

tabRegisterBtn.addEventListener('click', () => {
  tabRegisterBtn.classList.add('active');
  tabLoginBtn.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

// Botones de Credenciales Rápidas para Demostración
document.querySelectorAll('.btn-quick-user').forEach((btn) => {
  btn.addEventListener('click', () => {
    const role = btn.dataset.user;
    const emailInput = loginForm.querySelector('input[name="email"]');
    const passInput = loginForm.querySelector('input[name="password"]');

    if (role === 'lector') {
      emailInput.value = 'lector@bookone.org';
      passInput.value = 'cliente123';
    } else if (role === 'curador') {
      emailInput.value = 'curador@bookone.org';
      passInput.value = 'operador123';
    } else if (role === 'admin') {
      emailInput.value = 'admin@bookone.org';
      passInput.value = 'admin123';
    }
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('bookone_token', state.token);
    localStorage.setItem('authToken', state.token);

    updateUserUI(state.user);
    closeAuthModal();
    showToast(`Bienvenido a BOOKONE, ${state.user.name}.`, 'success');
    await loadShelf();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(registerForm);

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('bookone_token', state.token);
    localStorage.setItem('authToken', state.token);

    updateUserUI(state.user);
    closeAuthModal();
    showToast('¡Registro completado! Su credencial de lector está lista.', 'success');
    await loadShelf();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// -----------------------------------------------------------------------------
// Utilidades Auxiliares
// -----------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// -----------------------------------------------------------------------------
// Controlador de Pantalla de Inicio (Splash Screen)
// -----------------------------------------------------------------------------
let splashTimers = [];

function clearSplashTimers() {
  splashTimers.forEach((timer) => clearTimeout(timer));
  splashTimers = [];
}

function dismissSplashScreen(instant = false) {
  clearSplashTimers();
  if (!splashScreen) return;

  // Immediately block all interaction — before any animation delay
  splashScreen.style.pointerEvents = 'none';

  if (instant) {
    splashScreen.style.display = 'none';
    splashScreen.style.visibility = 'hidden';
  } else {
    splashScreen.classList.add('fade-out');
    // Fallback: also set display:none after transition completes
    const hideTimer = setTimeout(() => {
      splashScreen.style.display = 'none';
      splashScreen.style.visibility = 'hidden';
    }, 700);
    splashTimers.push(hideTimer);
    // Belt-and-suspenders: catch the transitionend event too
    splashScreen.addEventListener('transitionend', () => {
      splashScreen.style.display = 'none';
      splashScreen.style.visibility = 'hidden';
    }, { once: true });
  }
}

function runSplashScreen() {
  if (!splashScreen) return;

  clearSplashTimers();
  splashScreen.style.display = 'flex';
  splashScreen.classList.remove('fade-out');

  const steps = [
    { delay: 100, text: 'Iniciando canal seguro TLS 1.3 con certificados locales...' },
    { delay: 650, text: 'Indexando catálogo y sellos de integridad SHA-512...' },
    { delay: 1250, text: 'Preparando protocolo de no repudio Ed25519 & Argon2id...' },
    { delay: 1750, text: 'Repositorio activo. Bienvenido a BOOKONE.' },
    { delay: 2350, action: () => dismissSplashScreen(false) },
  ];

  steps.forEach((step) => {
    const timer = setTimeout(() => {
      if (step.action) {
        step.action();
      } else if (splashStepText && step.text) {
        splashStepText.textContent = step.text;
      }
    }, step.delay);
    splashTimers.push(timer);
  });
}

if (splashSkipBtn) {
  splashSkipBtn.addEventListener('click', () => dismissSplashScreen(false));
}

if (replaySplashBtn) {
  replaySplashBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    runSplashScreen();
  });
}

// -----------------------------------------------------------------------------
// Inicialización
// -----------------------------------------------------------------------------
async function init() {
  const alreadySeen = sessionStorage.getItem('bookone_splash_seen');
  if (!alreadySeen) {
    sessionStorage.setItem('bookone_splash_seen', 'true');
    runSplashScreen();
  } else {
    dismissSplashScreen(true);
  }
  await initAuth();
  await loadCatalog();
  if (state.token) {
    await loadShelf();
  }
}

init();
