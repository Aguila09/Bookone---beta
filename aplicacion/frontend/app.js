/* =============================================================================
   BOOKONE — BIBLIOTECA DIGITAL & ARCHIVO CRIPTOGRÁFICO
   Lógica del Cliente Frontend (Flujo completo con Carrito, Pago Simulado,
   Comprobante Firmado Ed25519 y Descarga con Fingerprinting)
   ============================================================================= */

// Almacenamiento seguro con fallback en memoria si el navegador bloquea cookies/storage
const memoryStorage = {};
const safeStorage = {
  get(key, session = false) {
    try {
      return (session ? window.sessionStorage : window.localStorage).getItem(key);
    } catch {
      return memoryStorage[key] || null;
    }
  },
  set(key, value, session = false) {
    memoryStorage[key] = value;
    try {
      (session ? window.sessionStorage : window.localStorage).setItem(key, value);
    } catch {
      // Ignorar si el navegador bloquea el almacenamiento persistente
    }
  },
  remove(key, session = false) {
    delete memoryStorage[key];
    try {
      (session ? window.sessionStorage : window.localStorage).removeItem(key);
    } catch {
      // Ignorar si el navegador bloquea el almacenamiento persistente
    }
  },
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
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

// Estado Global de la Aplicación
const state = {
  token: safeStorage.get('bookone_token') || safeStorage.get('authToken') || '',
  user: null,
  books: [],
  cart: JSON.parse(safeStorage.get('bookone_cart') || '[]'),
  orders: [],
  activeGenre: 'TODOS',
  searchQuery: '',
  readerFontSize: 19,
  currentReadingBook: null,
  activeReceipt: null,
};

// Elementos DOM Principales
const catalogGrid = document.getElementById('catalogGrid');
const catalogCount = document.getElementById('catalogCount');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const genreFilters = document.getElementById('genreFilters');
const shelfContent = document.getElementById('shelfContent');
const shelfBadge = document.getElementById('shelfBadge');
const cartBadge = document.getElementById('cartBadge');
const invoicesList = document.getElementById('invoicesList');
const eventsLog = document.getElementById('eventsLog');
const adminTabBtn = document.getElementById('adminTabBtn');
const adminSection = document.getElementById('adminSection');
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
const tabRecoverBtn = document.getElementById('tabRecoverBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const recoverForm = document.getElementById('recoverForm');
const resetStepBox = document.getElementById('resetStepBox');
const resetTokenInput = document.getElementById('resetTokenInput');
const resetNewPasswordInput = document.getElementById('resetNewPasswordInput');
const confirmResetBtn = document.getElementById('confirmResetBtn');

const cartModal = document.getElementById('cartModal');
const openCartModalBtn = document.getElementById('openCartModalBtn');
const closeCartModalBtn = document.getElementById('closeCartModalBtn');
const cartItemsList = document.getElementById('cartItemsList');
const cartTotalAmount = document.getElementById('cartTotalAmount');
const simulatedPaymentForm = document.getElementById('simulatedPaymentForm');
const checkoutSubmitBtn = document.getElementById('checkoutSubmitBtn');

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
const verifyOriginalBtn = document.getElementById('verifyOriginalBtn');
const verifyTamperedBtn = document.getElementById('verifyTamperedBtn');
const verifyStatusMsg = document.getElementById('verifyStatusMsg');
const exLibrisDownloads = document.getElementById('exLibrisDownloads');

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
    showToast('Su sesión de lector ha expirado o fue revocada. Ingrese nuevamente.', 'error');
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
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
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
    safeStorage.remove('bookone_token');
    safeStorage.remove('authToken');
    updateUserUI(null);
  }
}

function updateUserUI(user) {
  // El Registro de Auditoría Criptográfica permanece oculto salvo cuenta con permiso explícito
  const hasAuditPermission = Boolean(user && ['ADMINISTRADOR', 'OPERADOR'].includes(user.role));
  if (adminTabBtn) adminTabBtn.classList.toggle('hidden', !hasAuditPermission);
  if (adminSection && !hasAuditPermission) {
    adminSection.classList.add('hidden');
    adminSection.classList.remove('active');
  }

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

async function handleLogout() {
  if (state.token) {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignorar error de red al cerrar sesión
    }
  }
  state.token = '';
  state.user = null;
  state.orders = [];
  safeStorage.remove('bookone_token');
  safeStorage.remove('authToken');
  updateUserUI(null);
  shelfBadge.textContent = '0';
  renderShelf();
  renderInvoices();
  showToast('Ha salido de la biblioteca BOOKONE.', 'info');
}

// -----------------------------------------------------------------------------
// Navegación por Pestañas
// -----------------------------------------------------------------------------
document.querySelectorAll('.nav-tab[data-target]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const targetId = tab.dataset.target;

    if (targetId === 'adminSection' && (!state.user || !['ADMINISTRADOR', 'OPERADOR'].includes(state.user.role))) {
      showToast('Acceso denegado: no cuenta con permisos de auditoría.', 'error');
      return;
    }

    document.querySelectorAll('.nav-tab[data-target]').forEach((t) => t.classList.remove('active'));
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
// Gestión del Carrito & Módulo de Pago Simulado
// -----------------------------------------------------------------------------
function persistCart() {
  safeStorage.set('bookone_cart', JSON.stringify(state.cart));
  if (cartBadge) {
    cartBadge.textContent = String(state.cart.length);
  }
}

function addToCart(bookId) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;

  if (state.cart.some((item) => item.id === bookId)) {
    showToast('Este volumen ya se encuentra en su carrito.', 'info');
    return;
  }

  state.cart.push({
    id: book.id,
    title: book.title || book.name,
    author: book.author || 'Autor de la Colección',
    price: Number(book.price),
  });

  persistCart();
  renderCatalog();
  showToast(`«${book.title || book.name}» agregado al carrito.`, 'success');
}

function removeFromCart(bookId) {
  state.cart = state.cart.filter((item) => item.id !== bookId);
  persistCart();
  renderCatalog();
  renderCartModal();
}

function renderCartModal() {
  if (state.cart.length === 0) {
    cartItemsList.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--ink-muted); background: #faf5eb; border-radius: 6px;">
        Su carrito está vacío. Agregue ejemplares desde el catálogo para continuar.
      </div>
    `;
    cartTotalAmount.textContent = '$0.00 USD';
    checkoutSubmitBtn.disabled = true;
    return;
  }

  checkoutSubmitBtn.disabled = false;
  const total = state.cart.reduce((sum, item) => sum + Number(item.price), 0);
  cartTotalAmount.textContent = `$${total.toFixed(2)} USD`;

  cartItemsList.innerHTML = state.cart.map((item) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #e6dccb;">
      <div>
        <strong style="display: block; font-size: 14px;">${escapeHtml(item.title)}</strong>
        <span style="font-size: 12px; color: var(--ink-muted);">${escapeHtml(item.author)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <strong>$${Number(item.price).toFixed(2)}</strong>
        <button type="button" class="btn-icon-subtle" data-remove-cart="${escapeHtml(item.id)}">Quitar</button>
      </div>
    </div>
  `).join('');

  cartItemsList.querySelectorAll('[data-remove-cart]').forEach((btn) => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.removeCart));
  });
}

openCartModalBtn.addEventListener('click', () => {
  renderCartModal();
  cartModal.classList.remove('hidden');
});

closeCartModalBtn.addEventListener('click', () => cartModal.classList.add('hidden'));
cartModal.addEventListener('click', (e) => {
  if (e.target === cartModal) cartModal.classList.add('hidden');
});

simulatedPaymentForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!state.token) {
    cartModal.classList.add('hidden');
    showToast('Debe iniciar sesión como lector para procesar el pago simulado.', 'info');
    openAuthModal();
    return;
  }

  if (state.cart.length === 0) {
    showToast('Agregue al menos un ejemplar al carrito.', 'error');
    return;
  }

  const formData = new FormData(simulatedPaymentForm);
  try {
    checkoutSubmitBtn.disabled = true;
    const result = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: state.cart.map((item) => item.id),
        loan_type: 'ADQUISICION',
        payment: {
          payer_name: formData.get('payer_name'),
          payment_method: formData.get('payment_method'),
          card_number: formData.get('card_number'),
        },
      }),
    });

    state.cart = [];
    persistCart();
    renderCatalog();
    simulatedPaymentForm.reset();
    cartModal.classList.add('hidden');

    showToast('¡Pago simulado aprobado y comprobante firmado con Ed25519!', 'success');
    await loadShelf();

    if (result.invoice) {
      showExLibrisCertificate(result.invoice, result.payment, result.order);
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    checkoutSubmitBtn.disabled = false;
  }
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
        <p class="empty-shelf-text">${escapeHtml(error.message)}</p>
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
    const coverAccent = book.cover_accent || '#2B3A42';
    const coverImage = book.cover_image || '';
    const inCart = state.cart.some((item) => item.id === book.id);

    const coverHtml = coverImage ? `
      <div class="book-cover-media" style="background: linear-gradient(180deg, ${escapeHtml(coverAccent)}22 0%, ${escapeHtml(coverAccent)}08 100%);">
        <img
          src="${escapeHtml(coverImage)}"
          alt="Portada de ${escapeHtml(title)}"
          loading="lazy"
          onerror="this.closest('.book-cover-media').style.display='none'"
        />
      </div>
    ` : '';

    return `
      <article class="book-card" data-id="${escapeHtml(book.id)}">
        <div class="book-spine-line"></div>
        <div class="book-ribbon" title="Sello de Preservación BOOKONE"></div>

        ${coverHtml}

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
            <button class="btn-read-sample" data-read-id="${escapeHtml(book.id)}">
              Leer Muestra
            </button>
            <button class="btn-acquire" data-acquire-id="${escapeHtml(book.id)}" ${inCart ? 'disabled' : ''}>
              ${inCart ? 'En el Carrito' : 'Agregar al Carrito'}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  catalogGrid.querySelectorAll('[data-read-id]').forEach((btn) => {
    btn.addEventListener('click', () => openBookReader(btn.dataset.readId));
  });

  catalogGrid.querySelectorAll('[data-acquire-id]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.acquireId));
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
      addToCart(bookId);
      renderCartModal();
      cartModal.classList.remove('hidden');
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
              <strong>Folio:</strong> ${escapeHtml(item.orderId.slice(0, 8))}...<br />
              <strong>Concesión:</strong> ${dateStr}
            </div>

            <div class="shelf-actions">
              <button class="btn-shelf-download" data-download-id="${escapeHtml(book.id)}">
                Descargar con Fingerprint
              </button>
              <button class="btn-shelf-cert" data-cert-order="${escapeHtml(item.orderId)}">
                Comprobante
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="shelf-ledge"></div>
  `;

  shelfContent.querySelectorAll('[data-download-id]').forEach((btn) => {
    btn.addEventListener('click', () => downloadProtectedBook(btn.dataset.downloadId));
  });

  shelfContent.querySelectorAll('[data-cert-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = state.orders.find((o) => o.id === btn.dataset.certOrder);
      if (order) {
        showExLibrisCertificate(
          order.invoice || {
            orderNumber: order.id,
            userId: state.user.id,
            total: order.total,
            issuedAt: order.created_at,
          },
          order.payment,
          order
        );
      }
    });
  });
}

function renderEmptyShelf(message) {
  shelfContent.innerHTML = `
    <div class="empty-shelf-banner">
      <h3 class="empty-shelf-title">Estantería Vacía</h3>
      <p class="empty-shelf-text">${escapeHtml(message)}</p>
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
// Comprobante de Pago & Certificado Criptográfico Ed25519 (Modal)
// -----------------------------------------------------------------------------
function showExLibrisCertificate(invoice, payment = null, order = null) {
  exLibrisModal.classList.remove('hidden');
  state.activeReceipt = invoice;
  verifyStatusMsg.textContent = '';

  const payload = invoice.payload || invoice;
  const readerName = payload.buyerName || (state.user ? state.user.name : 'Lector Registrado');
  const orderFolio = payload.orderNumber || (order ? order.id : 'FOLIO-ACTIVO');
  const issuedDate = payload.issuedAt ? new Date(payload.issuedAt).toUTCString() : new Date().toUTCString();
  const totalAmount = Number(payload.total ?? (order ? order.total : 0)).toFixed(2);
  const sig = invoice.signature || 'Firma Ed25519 certificada en el bloque de concesión.';
  const pubKey = invoice.publicKey || 'Clave Pública Registrada en CA Local BOOKONE';

  const txRef = payment?.transaction_reference || payload.transactionReference || 'N/A';
  const payerName = payment?.payer_name || payload.payerName || readerName;
  const payMethod = payment?.payment_method || payload.paymentMethod || 'SIMULADO';
  const last4 = payment?.simulated_last4 || (payload.simulatedCard ? payload.simulatedCard.slice(-4) : '0000');

  exLibrisBody.innerHTML = `
    <p>Por el presente comprobante digital, <strong>BOOKONE</strong> certifica la compra simulada y concesión de ejemplares a:</p>
    <div style="margin: 12px 0; padding: 10px; background: #faf5eb; border: 1px dashed #d1c0a5; font-size: 13px;">
      <strong>Lector / Comprador :</strong> ${escapeHtml(readerName)}<br />
      <strong>Folio de Orden UUID  :</strong> ${escapeHtml(orderFolio)}<br />
      <strong>Ref. Pago Simulado   :</strong> ${escapeHtml(txRef)}<br />
      <strong>Titular Ficticio     :</strong> ${escapeHtml(payerName)} (${escapeHtml(payMethod)} · ****-${escapeHtml(last4)})<br />
      <strong>Total Pagado         :</strong> $${totalAmount} USD<br />
      <strong>Fecha de Emisión UTC :</strong> ${escapeHtml(issuedDate)}
    </div>
    <p style="font-size: 13px;">Cada ejemplar descargado incorpora un identificador individualizado (Fingerprint) vinculado a este usuario y orden.</p>
  `;

  exLibrisSigBox.innerHTML = `
    <strong>SELLO DE FIRMA ED25519 (RFC 8032):</strong><br />
    ${escapeHtml(sig)}<br /><br />
    <strong>CLAVE PÚBLICA EMISORA:</strong><br />
    ${escapeHtml(pubKey)}
  `;

  const items = order?.items || payload.items || [];
  if (items.length > 0) {
    exLibrisDownloads.innerHTML = `
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e6dccb;">
        <strong style="display: block; font-size: 12px; margin-bottom: 6px;">DESCARGAR EJEMPLARES CON FINGERPRINT:</strong>
        ${items.map((entry) => {
          const prodId = entry.product_id || entry.productId;
          const title = entry.book?.title || entry.title || 'Ejemplar Digital';
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 13px;">${escapeHtml(title)}</span>
              <button type="button" class="btn-shelf-download" data-receipt-dl="${escapeHtml(prodId)}">
                Descargar Copia Personalizada
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    exLibrisDownloads.querySelectorAll('[data-receipt-dl]').forEach((btn) => {
      btn.addEventListener('click', () => downloadProtectedBook(btn.dataset.receiptDl));
    });
  } else {
    exLibrisDownloads.innerHTML = '';
  }
}

verifyOriginalBtn.addEventListener('click', async () => {
  if (!state.activeReceipt) return;
  const payload = state.activeReceipt.payload || state.activeReceipt;
  try {
    const res = await apiRequest('/orders/verify', {
      method: 'POST',
      body: JSON.stringify({
        payload,
        signature: state.activeReceipt.signature,
      }),
    });
    verifyStatusMsg.style.color = '#15803d';
    verifyStatusMsg.textContent = `✔ ${res.message}`;
  } catch (error) {
    verifyStatusMsg.style.color = '#b91c1c';
    verifyStatusMsg.textContent = error.message;
  }
});

verifyTamperedBtn.addEventListener('click', async () => {
  if (!state.activeReceipt) return;
  const originalPayload = state.activeReceipt.payload || state.activeReceipt;
  const tamperedPayload = { ...originalPayload, total: 0.01 };
  try {
    const res = await apiRequest('/orders/verify', {
      method: 'POST',
      body: JSON.stringify({
        payload: tamperedPayload,
        signature: state.activeReceipt.signature,
      }),
    });
    verifyStatusMsg.style.color = res.valid ? '#15803d' : '#b91c1c';
    verifyStatusMsg.textContent = `✖ Prueba de alteración (total modificado a $0.01): ${res.message}`;
  } catch (error) {
    verifyStatusMsg.style.color = '#b91c1c';
    verifyStatusMsg.textContent = error.message;
  }
});

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
    const payInfo = order.payment
      ? `${escapeHtml(order.payment.payment_method || 'SIMULADO')} (****-${escapeHtml(order.payment.simulated_last4 || '0000')})`
      : 'Pago Simulado';

    return `
      <div class="invoice-record-card">
        <div class="inv-col-main">
          <h4>Comprobante de Pago & Concesión Digital</h4>
          <div class="inv-folio">FOLIO: ${escapeHtml(order.id)}</div>
          <div class="inv-date">Fecha y hora: ${dateStr} · Método: ${payInfo}</div>
          <div style="margin-top: 8px; font-size: 13px; color: var(--ink-secondary);">
            Obras concedidas: <strong>${itemsCount} ejemplar(es)</strong> · Total: <strong>$${Number(order.total).toFixed(2)} USD</strong>
          </div>
        </div>

        <div class="inv-col-sig">
          <div class="inv-sig-label">
            Firma Digital Ed25519 Sellada
          </div>
          <div class="inv-sig-code">
            ref: ${escapeHtml(order.payment?.transaction_reference || order.id.slice(0, 12))}<br />
            estado: SELLADO E INMUTABLE
          </div>
        </div>

        <div class="inv-col-actions">
          <button class="btn-primary-folio" data-inspect-order="${escapeHtml(order.id)}">
            Ver y Verificar Comprobante
          </button>
        </div>
      </div>
    `;
  }).join('');

  invoicesList.querySelectorAll('[data-inspect-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = state.orders.find((o) => o.id === btn.dataset.inspectOrder);
      if (order) {
        showExLibrisCertificate(
          order.invoice || {
            orderNumber: order.id,
            userId: state.user ? state.user.id : order.user_id,
            total: order.total,
            issuedAt: order.created_at,
          },
          order.payment,
          order
        );
      }
    });
  });
}

function renderEmptyInvoices() {
  invoicesList.innerHTML = `
    <div class="empty-shelf-banner">
      <h3 class="empty-shelf-title">Sin Comprobantes Registrados</h3>
      <p class="empty-shelf-text">Los comprobantes firmados con Ed25519 aparecerán aquí cuando complete una compra simulada desde el carrito.</p>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// Bitácora de Auditoría y Catalogación (Solo cuentas con permiso)
// -----------------------------------------------------------------------------
async function loadSecurityEvents() {
  if (!state.token || !state.user || !['ADMINISTRADOR', 'OPERADOR'].includes(state.user.role)) {
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
    eventsLog.innerHTML = `<div style="padding: 16px; color: #b91c1c;">${escapeHtml(error.message)}</div>`;
  }
}

if (refreshEventsBtn) {
  refreshEventsBtn.addEventListener('click', loadSecurityEvents);
}

if (newBookForm) {
  newBookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.token || !state.user || !['ADMINISTRADOR', 'OPERADOR'].includes(state.user.role)) {
      showToast('Acceso denegado.', 'error');
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
          cover_image: formData.get('cover_image')?.trim() || '',
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
}

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
// Autenticación: Login, Registro y Recuperación (Solo CLIENTE)
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

function setAuthTab(activeTabBtn, activeForm) {
  [tabLoginBtn, tabRegisterBtn, tabRecoverBtn].forEach((btn) => btn?.classList.remove('active'));
  [loginForm, registerForm, recoverForm].forEach((form) => form?.classList.add('hidden'));
  activeTabBtn?.classList.add('active');
  activeForm?.classList.remove('hidden');
}

tabLoginBtn.addEventListener('click', () => setAuthTab(tabLoginBtn, loginForm));
tabRegisterBtn.addEventListener('click', () => setAuthTab(tabRegisterBtn, registerForm));
tabRecoverBtn.addEventListener('click', () => setAuthTab(tabRecoverBtn, recoverForm));

document.querySelectorAll('.btn-quick-user').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.user === 'lector') {
      setAuthTab(tabLoginBtn, loginForm);
      loginForm.querySelector('input[name="email"]').value = 'lector@bookone.org';
      loginForm.querySelector('input[name="password"]').value = 'cliente123';
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
    safeStorage.set('bookone_token', state.token);
    safeStorage.set('authToken', state.token);

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
    safeStorage.set('bookone_token', state.token);
    safeStorage.set('authToken', state.token);

    updateUserUI(state.user);
    closeAuthModal();
    showToast('¡Registro completado! Su credencial de lector está lista.', 'success');
    await loadShelf();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

recoverForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(recoverForm);

  try {
    const data = await apiRequest('/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify({ email: formData.get('email') }),
    });
    resetTokenInput.value = data.token;
    resetStepBox.classList.remove('hidden');
    showToast(data.message, 'info');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

confirmResetBtn.addEventListener('click', async () => {
  try {
    const data = await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: resetTokenInput.value,
        newPassword: resetNewPasswordInput.value,
      }),
    });
    resetStepBox.classList.add('hidden');
    resetNewPasswordInput.value = '';
    showToast(data.message, 'success');
    setAuthTab(tabLoginBtn, loginForm);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

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

  splashScreen.style.pointerEvents = 'none';

  if (instant) {
    splashScreen.style.display = 'none';
    splashScreen.style.visibility = 'hidden';
  } else {
    splashScreen.classList.add('fade-out');
    const hideTimer = setTimeout(() => {
      splashScreen.style.display = 'none';
      splashScreen.style.visibility = 'hidden';
    }, 700);
    splashTimers.push(hideTimer);
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
  splashScreen.style.visibility = 'visible';
  splashScreen.style.pointerEvents = 'auto';
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
  persistCart();
  const alreadySeen = safeStorage.get('bookone_splash_seen', true);
  if (!alreadySeen) {
    safeStorage.set('bookone_splash_seen', 'true', true);
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