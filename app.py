from flask import Flask, render_template, request, jsonify
import sqlite3

app = Flask(__name__)

# ============================================================
# DATABASE CONNECTION
# ============================================================
def get_db_connection():
    conn = sqlite3.connect('benihcandi.db')
    conn.row_factory = sqlite3.Row
    return conn


# ============================================================
# HALAMAN-HALAMAN
# ============================================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/artikel')
def artikel():
    return render_template('artikel.html')

@app.route('/produk')
def produk():
    conn     = get_db_connection()
    products = conn.execute('SELECT * FROM products').fetchall()
    conn.close()
    return render_template('produk.html', products=products)

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/keranjang')
def keranjang():
    return render_template('keranjang.html')

@app.route('/titik3')
def titik3():
    return render_template('titik3.html')

@app.route('/tentangkami')
def tentangkami():
    return render_template('tentangkami.html')

@app.route('/pengembang')
def pengembang():
    return render_template('pengembang.html')

@app.route('/konsultasi')
def konsultasi():
    return render_template('konsultasi.html')

@app.route('/kebijakan-privasi')
def kebijakan_privasi():
    return render_template('kebijakan_privasi.html')

@app.route('/syaratdanketentuan')
def syaratdanketentuan():
    return render_template('syaratdanketentuan.html')


# ============================================================
# API: BELI (CREATE)
# INSERT order baru ke tabel orders.
# Dipanggil script.js saat tombol "Beli" diklik.
# ============================================================
@app.route('/buy', methods=['POST'])
def buy():
    conn = get_db_connection()
    try:
        data = request.get_json()

        product_id = data.get('id')
        name       = data.get('name')
        price      = data.get('price')
        qty        = int(data.get('qty', 1))

        if not product_id or not name or not price:
            return jsonify({"ok": False, "message": "Data tidak lengkap"}), 400

        product_id = int(product_id)
        price      = int(price)
        total      = price * qty

        product = conn.execute(
            'SELECT id FROM products WHERE id = ?', (product_id,)
        ).fetchone()

        if not product:
            return jsonify({"ok": False, "message": "Produk tidak ditemukan"}), 404

        cursor = conn.execute("""
            INSERT INTO orders (product_id, product_name, price, qty, total, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (product_id, name, price, qty, total))

        order_id = cursor.lastrowid
        conn.commit()

        return jsonify({
            "ok"      : True,
            "message" : "Pembelian berhasil disimpan",
            "order_id": order_id,
            "total"   : total
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "message": "Error", "error": str(e)}), 500
    finally:
        conn.close()


# ============================================================
# API: CHECKOUT (CREATE BULK)
# INSERT semua item keranjang sekaligus.
# Dipanggil saat tombol "Lanjut ke Pembayaran" diklik.
# ============================================================
@app.route('/checkout', methods=['POST'])
def checkout():
    conn = get_db_connection()
    try:
        data  = request.get_json()
        items = data.get('items', [])

        if not items:
            return jsonify({"ok": False, "message": "Keranjang kosong"}), 400

        order_ids = []

        for item in items:
            product_id = int(item.get('id'))
            name       = item.get('name')
            price      = int(item.get('price', 0))
            qty        = int(item.get('qty', 1))
            total      = price * qty

            product = conn.execute(
                'SELECT id FROM products WHERE id = ?', (product_id,)
            ).fetchone()

            if not product:
                continue

            cursor = conn.execute("""
                INSERT INTO orders (product_id, product_name, price, qty, total, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
            """, (product_id, name, price, qty, total))

            order_ids.append(cursor.lastrowid)

        conn.commit()

        return jsonify({
            "ok"       : True,
            "message"  : f"{len(order_ids)} pesanan berhasil disimpan",
            "order_ids": order_ids
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "message": "Error", "error": str(e)}), 500
    finally:
        conn.close()


# ============================================================
# API: EDIT ORDER (UPDATE)
# Ubah qty dan hitung ulang total.
# Hanya bisa edit order yang masih 'pending'.
# Bisa juga diubah langsung di DBeaver:
#   UPDATE orders SET qty=3, total=price*3 WHERE id=X;
# ============================================================
@app.route('/edit-order', methods=['POST'])
def edit_order():
    conn = get_db_connection()
    try:
        data     = request.get_json()
        order_id = data.get('order_id')
        new_qty  = data.get('qty')

        if not order_id or not new_qty:
            return jsonify({"ok": False, "message": "Data tidak lengkap"}), 400

        order_id = int(order_id)
        new_qty  = int(new_qty)

        if new_qty < 1:
            return jsonify({"ok": False, "message": "Jumlah minimal 1"}), 400

        order = conn.execute(
            'SELECT id, price, status FROM orders WHERE id = ?', (order_id,)
        ).fetchone()

        if not order:
            return jsonify({"ok": False, "message": "Order tidak ditemukan"}), 404

        if order['status'] != 'pending':
            return jsonify({
                "ok"     : False,
                "message": f"Order tidak bisa diedit, status: {order['status']}"
            }), 400

        new_total = order['price'] * new_qty

        conn.execute(
            "UPDATE orders SET qty = ?, total = ? WHERE id = ?",
            (new_qty, new_total, order_id)
        )
        conn.commit()

        return jsonify({
            "ok"       : True,
            "message"  : "Order berhasil diupdate",
            "new_qty"  : new_qty,
            "new_total": new_total
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "message": "Error", "error": str(e)}), 500
    finally:
        conn.close()


# ============================================================
# API: HAPUS ORDER (DELETE)
# Hapus order dari database sepenuhnya.
# Dipanggil saat ikon sampah di keranjang diklik.
# Bisa juga dilakukan di DBeaver:
#   DELETE FROM orders WHERE id = X;
# ============================================================
@app.route('/delete-order', methods=['POST'])
def delete_order():
    conn = get_db_connection()
    try:
        data     = request.get_json()
        order_id = data.get('order_id')

        if not order_id:
            return jsonify({"ok": False, "message": "ID order tidak ada"}), 400

        conn.execute("DELETE FROM orders WHERE id = ?", (int(order_id),))
        conn.commit()

        return jsonify({"ok": True, "message": "Order berhasil dihapus"})

    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "message": "Error", "error": str(e)}), 500
    finally:
        conn.close()


# ============================================================
# API: BATALKAN ORDER (UPDATE STATUS)
# Ubah status menjadi 'cancelled' (data tetap di DB).
# Bisa juga dilakukan di DBeaver:
#   UPDATE orders SET status='cancelled' WHERE id = X;
# ============================================================
@app.route('/cancel-order', methods=['POST'])
def cancel_order():
    conn = get_db_connection()
    try:
        data     = request.get_json()
        order_id = data.get('order_id')

        if not order_id:
            return jsonify({"ok": False, "message": "ID order tidak ada"}), 400

        order = conn.execute(
            'SELECT id, status FROM orders WHERE id = ?', (int(order_id),)
        ).fetchone()

        if not order:
            return jsonify({"ok": False, "message": "Order tidak ditemukan"}), 404

        if order['status'] != 'pending':
            return jsonify({
                "ok"     : False,
                "message": f"Order tidak bisa dibatalkan, status: {order['status']}"
            }), 400

        conn.execute(
            "UPDATE orders SET status = 'cancelled' WHERE id = ?",
            (int(order_id),)
        )
        conn.commit()

        return jsonify({"ok": True, "message": "Order berhasil dibatalkan"})

    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "message": "Error", "error": str(e)}), 500
    finally:
        conn.close()


# ============================================================
# RUN SERVER
# ============================================================
if __name__ == '__main__':
    app.run(debug=True)