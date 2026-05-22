/* ===========================================================
   script.js — Benih Candi
   Fitur CRUD:
   - Beli produk → INSERT ke tabel orders (/buy)
   - Checkout keranjang → INSERT semua item (/checkout)
   - Hapus item di keranjang → DELETE dari DB (/delete-order)
   - Ubah qty di keranjang → UPDATE qty & total di DB (/edit-order)
   - Batalkan order → UPDATE status='cancelled' (/cancel-order)
   =========================================================== */

/* =========================
   1. KONFIGURASI
   ========================= */
const CART_KEY = 'benihcandi_cart_v1';

/* =========================
   2. HELPERS
   ========================= */

function formatRp(n) {
  if (!n && n !== 0) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(n);
}

function showToast(message, type = 'success', timeout = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, timeout);
}

/* =========================
   3. API FUNCTIONS (CRUD)
   ========================= */

/**
 * INSERT order baru ke DB saat tombol "Beli" diklik.
 * Mengembalikan Promise<{ ok, order_id, total }>
 */
function apiInsertOrder(product) {
  return fetch('/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  }).then(res => res.json());
}

/**
 * INSERT semua item keranjang sekaligus saat checkout.
 * Mengembalikan Promise<{ ok, order_ids }>
 */
function apiCheckout(items) {
  return fetch('/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  }).then(res => res.json());
}

/**
 * DELETE order dari DB berdasarkan order_id.
 * Mengembalikan Promise<{ ok, message }>
 */
function apiDeleteOrder(orderId) {
  return fetch('/delete-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId })
  }).then(res => res.json());
}

/**
 * UPDATE qty dan total di DB berdasarkan order_id.
 * Mengembalikan Promise<{ ok, new_qty, new_total }>
 */
function apiEditOrder(orderId, qty) {
  return fetch('/edit-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, qty })
  }).then(res => res.json());
}

/* =========================
   4. CART SYSTEM (localStorage)
   ========================= */

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : { items: [] };
  } catch (e) {
    console.error('Gagal load cart:', e);
    return { items: [] };
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();
}

function findCartItemIndex(cart, id) {
  return cart.items.findIndex(it => String(it.id) === String(id));
}

function cartTotals(cart) {
  let total = 0;
  let count = 0;
  cart.items.forEach(it => {
    total += Number(it.price || 0) * Number(it.qty || 1);
    count += Number(it.qty || 1);
  });
  return { total, count };
}

/**
 * Tambah produk ke keranjang (localStorage) DAN kirim INSERT ke DB.
 * order_id dari DB disimpan di item.order_id agar bisa dipakai untuk
 * DELETE dan EDIT nanti.
 */
async function addToCart(productInfo) {
  const cart = loadCart();
  const idx  = findCartItemIndex(cart, productInfo.id);

  if (idx > -1) {
    // Produk sudah ada — naikkan qty di localStorage
    cart.items[idx].qty += 1;
    saveCart(cart);
    showToast(`${productInfo.name} berhasil ditambahkan ke keranjang!`);
  } else {
    // Produk baru — INSERT ke DB dulu, simpan order_id ke localStorage
    try {
      const numericId = parseInt(productInfo.id, 10);
      const result = await apiInsertOrder({
        id   : numericId,
        name : productInfo.name,
        price: productInfo.price,
        qty  : 1
      });

      cart.items.push({
        id      : productInfo.id,
        name    : productInfo.name,
        price   : Number(productInfo.price || 0),
        qty     : 1,
        img     : productInfo.img || '',
        order_id: result.ok ? result.order_id : null   // simpan order_id dari DB
      });

      saveCart(cart);
      showToast(`${productInfo.name} berhasil ditambahkan ke keranjang!`);
    } catch (err) {
      console.error('Gagal insert ke DB:', err);
      showToast('Gagal menyimpan ke database', 'error');
      return;
    }
  }

  setTimeout(() => {
    window.location.href = '/keranjang';
  }, 800);
}

/* =========================
   5. UI CART BADGE
   ========================= */

function updateCartUI() {
  const cart   = loadCart();
  const totals = cartTotals(cart);

  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent   = totals.count;
    el.style.display = totals.count > 0 ? 'flex' : 'none';
  });
}

/* =========================
   6. BUTTON BINDING
   ========================= */

function bindAddToCartButtons() {
  document.querySelectorAll('.btn-cart').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      const el = e.currentTarget;
      const product = {
        id   : el.dataset.id,
        name : el.dataset.name,
        price: Number(el.dataset.price),
        img  : el.dataset.img || ''
      };

      if (!product.id || !product.name || !product.price) {
        showToast('Data produk tidak lengkap', 'error');
        return;
      }

      // Nonaktifkan tombol sementara agar tidak double-click
      el.disabled = true;
      await addToCart(product);
      el.disabled = false;
    });
  });
}

/* =========================
   7. CART PAGE
   ========================= */

function initCartPage() {
  const container = document.querySelector('.cart-container');
  const summary   = document.querySelector('.cart-summary');
  if (!container) return;

  function renderCart() {
    const cart = loadCart();
    container.innerHTML = '';

    if (cart.items.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;">
          <h3>Keranjang Kosong</h3>
          <p>Silakan pilih produk terlebih dahulu</p>
          <a href="/produk" class="btn-primary">Belanja</a>
        </div>
      `;
      if (summary) summary.style.display = 'none';
      updateCartUI();
      return;
    }

    cart.items.forEach((it, idx) => {
      const div     = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <img src="${it.img || '/static/images/produk/produk1.png'}" alt="${it.name}">
        <h4>${it.name}</h4>
        <span>${formatRp(it.price)}</span>
        <input type="number" min="1" value="${it.qty}" data-index="${idx}" class="qty">
        <span class="item-total">${formatRp(it.price * it.qty)}</span>
        <button class="remove-btn" data-index="${idx}" title="Hapus dari keranjang">
          <i class="fa fa-trash"></i>
        </button>
      `;
      container.appendChild(div);
    });

    if (summary) {
      const totals = cartTotals(cart);
      summary.querySelector('.subtotal').textContent     = formatRp(totals.total);
      summary.querySelector('.total-amount').textContent = formatRp(totals.total);
      summary.style.display = 'block';
    }

    // ── UPDATE QTY: ubah di localStorage DAN kirim ke DB (/edit-order) ──
    container.querySelectorAll('.qty').forEach(input => {
      input.addEventListener('change', async (e) => {
        const i      = Number(e.target.dataset.index);
        const newQty = Number(e.target.value);
        if (newQty < 1) return;

        const cart = loadCart();
        const item = cart.items[i];

        // 1) Update localStorage
        item.qty = newQty;
        saveCart(cart);

        // 2) Update DB jika order_id tersedia
        if (item.order_id) {
          try {
            const result = await apiEditOrder(item.order_id, newQty);
            if (result.ok) {
              console.log('DB qty updated:', result);
            } else {
              console.warn('Gagal update DB:', result.message);
            }
          } catch (err) {
            console.error('Edit order error:', err);
          }
        }

        renderCart();
      });
    });

    // ── HAPUS ITEM: hapus dari localStorage DAN DELETE dari DB ──
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target  = e.target.closest('[data-index]');
        const i       = Number(target.dataset.index);

        const cart    = loadCart();
        const removed = cart.items[i];

        // 1) Hapus dari localStorage
        cart.items.splice(i, 1);
        saveCart(cart);

        // 2) DELETE dari DB jika order_id tersedia
        if (removed.order_id) {
          try {
            const result = await apiDeleteOrder(removed.order_id);
            if (result.ok) {
              console.log('DB order deleted:', removed.order_id);
            } else {
              console.warn('Gagal delete dari DB:', result.message);
            }
          } catch (err) {
            console.error('Delete order error:', err);
          }
        }

        showToast(`${removed.name} dihapus dari keranjang`);
        renderCart();
      });
    });
  }

  renderCart();

  // ── KOSONGKAN KERANJANG ──
  document.querySelector('.btn-clear')?.addEventListener('click', () => {
    if (!confirm('Kosongkan keranjang?')) return;
    saveCart({ items: [] });
    renderCart();
    showToast('Keranjang dikosongkan');
  });

  // ── CHECKOUT: INSERT semua item ke DB ──
  document.querySelector('.checkout-btn')?.addEventListener('click', async () => {
    const cart = loadCart();

    if (cart.items.length === 0) {
      showToast('Keranjang kosong', 'error');
      return;
    }

    try {
      showToast('Memproses pesanan...');

      const dbItems = cart.items
        .filter(it => !isNaN(parseInt(it.id, 10)))
        .map(it => ({
          id   : parseInt(it.id, 10),
          name : it.name,
          price: it.price,
          qty  : it.qty
        }));

      if (dbItems.length > 0) {
        const result = await apiCheckout(dbItems);
        if (result.ok) {
          console.log('Checkout berhasil:', result);
        } else {
          console.warn('Checkout gagal:', result.message);
        }
      }

      showToast('Pesanan berhasil! Terima kasih.');
      saveCart({ items: [] });
      renderCart();

    } catch (err) {
      console.error('Checkout error:', err);
      showToast('Terjadi kesalahan saat checkout', 'error');
    }
  });
}

/* =========================
   8. MOBILE MENU
   ========================= */

function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger');
  const navbar    = document.querySelector('.navbar');
  if (!hamburger || !navbar) return;

  hamburger.addEventListener('click', () => {
    navbar.classList.toggle('nav-open');
  });
}

/* =========================
   9. INIT
   ========================= */

document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();
  bindAddToCartButtons();
  initMobileMenu();
  initCartPage();
});