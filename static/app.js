const $ = (s) => document.querySelector(s),
  money = (n) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let menu = [],
  cart = {},
  user = null,
  tab = "dashboard",
  productsAdmin = [],
  suppliesAdmin = [];
async function api(path, method = "GET", data) {
  const r = await fetch("/api" + path, {
    method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}) },
    credentials: "same-origin",
    body: data ? JSON.stringify(data) : undefined,
  });
  let j;
  try {
    j = await r.json();
  } catch {
    throw Error("Respuesta inesperada");
  }
  if (!r.ok) throw Error(j.error || "Error de conexión");
  return j;
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function handle(e) {
  toast(e.message || String(e));
}
const open = (id) => $("#" + id).classList.remove("hidden"),
  close = (id) => $("#" + id).classList.add("hidden");
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-close]");
  if (el) close(el.dataset.close);
});
async function loadMenu() {
  menu = await api("/menu");
  renderMenu();
}
let filter = "Todos";
function renderMenu() {
  const cats = ["Todos", ...new Set(menu.map((x) => x.category))];
  $("#filters").innerHTML = cats
    .map(
      (c) =>
        `<button class="${filter === c ? "active" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`,
    )
    .join("");
  const selected = menu.filter(
    (p) => filter === "Todos" || p.category === filter,
  );
  $("#products").innerHTML =
    selected
      .map(
        (p) =>
          `<article class="product"><div class="product-art">${esc(p.emoji)}</div><div class="product-info"><small>${esc(p.category)}</small><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="product-footer"><span class="price">${money(p.price)}</span><button class="mini-btn" data-add="${p.id}" ${p.stock < 1 ? "disabled" : ""}>${p.stock ? "＋ Agregar" : "Agotado"}</button></div><span class="stock">${p.stock > 0 ? `Disponibles: ${p.stock}` : "Sin existencias"}</span></div></article>`,
      )
      .join("") || "<p>No hay productos en esta categoría.</p>";
  updateCart();
}
$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (b) {
    filter = b.dataset.filter;
    renderMenu();
  }
});
$("#products").addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]");
  if (!b) return;
  const id = +b.dataset.add,
    p = menu.find((x) => x.id === id);
  if ((cart[id] || 0) >= p.stock) {
    toast("No quedan más unidades disponibles");
    return;
  }
  cart[id] = (cart[id] || 0) + 1;
  updateCart();
  toast("Agregado al carrito");
});
function updateCart() {
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  $("#cartCount").textContent = count;
  $("#cartItems").innerHTML =
    Object.entries(cart)
      .map(([id, q]) => {
        const p = menu.find((x) => x.id == id);
        return p
          ? `<div class="cart-line"><div><b>${esc(p.name)}</b><small>${money(p.price)} c/u</small></div><div class="qty"><button data-qty="${id}" data-delta="-1">−</button>${q}<button data-qty="${id}" data-delta="1">+</button></div></div>`
          : "";
      })
      .join("") || '<p class="muted">Tu carrito está vacío.</p>';
  $("#cartTotal").textContent = money(
    Object.entries(cart).reduce(
      (sum, [id, q]) => sum + (menu.find((p) => p.id == id)?.price || 0) * q,
      0,
    ),
  );
}
$("#cartItems").addEventListener("click", (e) => {
  const b = e.target.closest("[data-qty]");
  if (!b) return;
  const id = +b.dataset.qty,
    delta = +b.dataset.delta,
    p = menu.find((x) => x.id === id);
  const next = (cart[id] || 0) + delta;
  if (next > p.stock) {
    toast("Inventario insuficiente");
    return;
  }
  if (next <= 0) delete cart[id];
  else cart[id] = next;
  updateCart();
});
$("#cartBtn").onclick = () => {
  updateCart();
  open("cartOverlay");
};
$("#adminNav").onclick = async () => {
  try {
    user = (await api("/me")).user;
    if (user) showAdmin();
    else open("loginOverlay");
  } catch (e) {
    handle(e);
  }
};
$("#delivery").onchange = () => {
  const pickup = $("#delivery").value === "recoger";
  $("#addressLabel").classList.toggle("hidden", pickup);
  $("#address").required = !pickup;
};
$("#checkout").onsubmit = async (e) => {
  e.preventDefault();
  if (!Object.keys(cart).length) return toast("Agrega productos al carrito");
  const f = new FormData(e.target),
    mode = f.get("mode");
  const body = {
    customer: f.get("customer"),
    phone: f.get("phone"),
    address: mode === "recoger" ? "Recoger en el local" : f.get("address"),
    mode,
    notes: f.get("notes"),
    items: Object.entries(cart).map(([product_id, quantity]) => ({
      product_id: +product_id,
      quantity,
    })),
  };
  try {
    const r = await api("/orders", "POST", body);
    cart = {};
    e.target.reset();
    $("#addressLabel").classList.remove("hidden");
    $("#address").required = true;
    close("cartOverlay");
    toast(
      `Pedido #${r.id} registrado. Total: ${money(r.total)}. Pendiente de confirmación.`,
    );
    await loadMenu();
  } catch (err) {
    handle(err);
  }
};
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api("/login", "POST", {
      username: f.get("username"),
      password: f.get("password"),
    });
    user = r.user;
    close("loginOverlay");
    e.target.reset();
    showAdmin();
  } catch (err) {
    handle(err);
  }
};
function showAdmin() {
  $("#publicView").classList.add("hidden");
  $("#adminView").classList.remove("hidden");
  $("#who").textContent =
    user.name + " · " + (user.role === "admin" ? "Administrador" : "Empleado");
  document
    .querySelectorAll(".admin-only")
    .forEach((x) => x.classList.toggle("hidden", user.role !== "admin"));
  selectTab("dashboard");
  scrollTo(0, 0);
}
$("#backPublic").onclick = async () => {
  $("#adminView").classList.add("hidden");
  $("#publicView").classList.remove("hidden");
  await loadMenu();
  scrollTo(0, 0);
};
$("#logoutBtn").onclick = async () => {
  try {
    await api("/logout", "POST", {});
    user = null;
    $("#adminView").classList.add("hidden");
    $("#publicView").classList.remove("hidden");
    toast("Sesión cerrada");
  } catch (e) {
    handle(e);
  }
};
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => selectTab(b.dataset.tab)));
async function selectTab(t) {
  if (
    ["employees", "reports", "products", "supplies"].includes(t) &&
    user?.role !== "admin" &&
    t !== "products" &&
    t !== "supplies"
  )
    return;
  tab = t;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#tabTitle").textContent = {
    dashboard: "Resumen general",
    orders: "Gestión de pedidos",
    products: "Gestión de productos",
    supplies: "Inventario de insumos",
    employees: "Personal y accesos",
    reports: "Reporte de ventas",
  }[t];
  $("#adminPanel").innerHTML = '<p class="muted">Cargando información…</p>';
  try {
    await {
      dashboard: dashboard,
      orders: ordersPage,
      products: productsPage,
      supplies: suppliesPage,
      employees: employeesPage,
      reports: reportsPage,
    }[t]();
  } catch (err) {
    $("#adminPanel").innerHTML = `<p class="out">${esc(err.message)}</p>`;
  }
}
function table(headers, items) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${items.join("") || `<tr><td colspan="${headers.length}">Sin registros</td></tr>`}</tbody></table></div>`;
}
function statusLabel(s) {
  return (
    {
      pendiente: "Pendiente",
      preparacion: "En preparación",
      listo: "Listo",
      entregado: "Entregado",
      cancelado: "Cancelado",
    }[s] || s
  );
}
async function dashboard() {
  const o = await api("/orders");
  let r = null;
  if (user.role === "admin") r = await api("/reports");
  $("#adminPanel").innerHTML =
    `<div class="stats"><div class="stat"><small>Pedidos registrados</small><strong>${o.length}</strong></div><div class="stat"><small>En proceso</small><strong>${o.filter((x) => !["entregado", "cancelado"].includes(x.status)).length}</strong></div><div class="stat"><small>Ventas entregadas</small><strong>${r ? money(r.revenue) : "—"}</strong></div></div><div class="panel-card"><h3>Últimos pedidos</h3>${table(
      ["Pedido", "Cliente", "Estado", "Valor"],
      o
        .slice(0, 6)
        .map(
          (x) =>
            `<tr><td>#${x.id}</td><td>${esc(x.customer)}</td><td><span class="status ${x.status}">${statusLabel(x.status)}</span></td><td>${money(x.total)}</td></tr>`,
        ),
    )}</div>`;
}
async function ordersPage() {
  const o = await api("/orders");
  const next = {
    pendiente: ["preparacion", "cancelado"],
    preparacion: ["listo", "cancelado"],
    listo: ["entregado", "cancelado"],
  };
  $("#adminPanel").innerHTML =
    `<div class="notice">Los pedidos entregados cuentan como ventas. Los pedidos cancelados restituyen las unidades al menú.</div><div class="panel-card">${table(
      ["Pedido", "Cliente / Entrega", "Detalle", "Total", "Estado", "Acción"],
      o.map(
        (x) =>
          `<tr><td><b>#${x.id}</b><br><small>${esc(x.created_at.slice(0, 16).replace("T", " "))} UTC</small></td><td><b>${esc(x.customer)}</b><br>${esc(x.phone)}<br>${esc(x.mode)}: ${esc(x.address)}<br><small>${esc(x.notes)}</small></td><td>${x.items.map((i) => `${esc(i.product_name)} × ${i.quantity}`).join("<br>")}</td><td>${money(x.total)}</td><td><span class="status ${x.status}">${statusLabel(x.status)}</span></td><td>${next[x.status] ? `<select class="select-small" data-order="${x.id}"><option value="">Cambiar estado</option>${next[x.status].map((s) => `<option value="${s}">${statusLabel(s)}</option>`).join("")}</select>` : "Cerrado"}</td></tr>`,
      ),
    )}</div>`;
  document.querySelectorAll("[data-order]").forEach(
    (el) =>
      (el.onchange = async () => {
        if (!el.value) return;
        try {
          await api("/orders/" + el.dataset.order, "PATCH", {
            status: el.value,
          });
          toast("Pedido actualizado");
          await ordersPage();
        } catch (err) {
          handle(err);
        }
      }),
  );
}
async function productsPage() {
  productsAdmin = await api("/products");
  let admin = user.role === "admin";
  $("#adminPanel").innerHTML =
    `${admin ? `<div class="panel-card"><h3>Agregar producto</h3><form id="productForm" class="form-grid"><label>Nombre<input name="name" required></label><label>Categoría<input name="category" required></label><label>Precio COP<input type="number" min="0" name="price" required></label><label>Unidades disponibles<input type="number" min="0" name="stock" required></label><label>Emoji<input name="emoji" value="🍗" maxlength="8"></label><label>Descripción<input name="description"></label><button class="btn red wide">Guardar producto</button></form></div>` : ""}<div class="panel-card"><h3>Catálogo</h3>${table(
      [
        "Producto",
        "Categoría",
        "Precio",
        "Stock",
        "Estado",
        ...(admin ? ["Acción"] : []),
      ],
      productsAdmin.map(
        (p) =>
          `<tr><td>${esc(p.emoji)} ${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${p.active ? "Activo" : "Oculto"}</td>${admin ? `<td><button class="mini-btn" data-edit-product="${p.id}">Editar</button></td>` : ""}</tr>`,
      ),
    )}</div><div id="editor"></div>`;
  if (admin) {
    $("#productForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api("/products", "POST", {
          name: f.get("name"),
          category: f.get("category"),
          description: f.get("description"),
          price: +f.get("price"),
          stock: +f.get("stock"),
          emoji: f.get("emoji"),
        });
        toast("Producto agregado");
        await productsPage();
        await loadMenu();
      } catch (err) {
        handle(err);
      }
    };
    document
      .querySelectorAll("[data-edit-product]")
      .forEach((b) => (b.onclick = () => editProduct(+b.dataset.editProduct)));
  }
}
function editProduct(id) {
  const p = productsAdmin.find((x) => x.id === id);
  $("#editor").innerHTML =
    `<div class="panel-card"><h3>Editar ${esc(p.name)}</h3><form id="editProduct" class="form-grid"><label>Nombre<input name="name" value="${esc(p.name)}" required></label><label>Categoría<input name="category" value="${esc(p.category)}" required></label><label>Precio<input type="number" min="0" name="price" value="${p.price}" required></label><label>Stock<input type="number" min="0" name="stock" value="${p.stock}" required></label><label>Emoji<input name="emoji" value="${esc(p.emoji)}"></label><label>Visibilidad<select name="active"><option value="true" ${p.active ? "selected" : ""}>Activo</option><option value="false" ${!p.active ? "selected" : ""}>Oculto</option></select></label><label class="wide">Descripción<input name="description" value="${esc(p.description)}"></label><button class="btn red wide">Guardar cambios</button></form></div>`;
  $("#editor").scrollIntoView({ behavior: "smooth" });
  $("#editProduct").onsubmit = async (e) => {
    e.preventDefault();
    let f = new FormData(e.target);
    try {
      await api("/products/" + id, "PATCH", {
        name: f.get("name"),
        category: f.get("category"),
        price: +f.get("price"),
        stock: +f.get("stock"),
        emoji: f.get("emoji"),
        description: f.get("description"),
        active: f.get("active") === "true",
      });
      toast("Producto actualizado");
      await productsPage();
      await loadMenu();
    } catch (err) {
      handle(err);
    }
  };
}
async function suppliesPage() {
  suppliesAdmin = await api("/supplies");
  let admin = user.role === "admin";
  $("#adminPanel").innerHTML =
    `<div class="notice">Inventario de materias primas separado del stock del menú. En esta versión no existe receta automatizada que descuente ingredientes.</div>${admin ? `<div class="panel-card"><h3>Registrar insumo</h3><form id="supplyForm" class="form-grid"><label>Insumo<input name="name" required></label><label>Unidad (kg, litro, unidad)<input name="unit" required></label><label>Cantidad inicial<input type="number" min="0" step="0.01" name="quantity" required></label><label>Mínimo de alerta<input type="number" min="0" step="0.01" name="minimum" required></label><button class="btn red wide">Agregar insumo</button></form></div>` : ""}<div class="panel-card"><h3>Existencias de insumos</h3>${table(
      [
        "Insumo",
        "Cantidad",
        "Mínimo",
        "Estado",
        ...(admin ? ["Movimiento"] : []),
      ],
      suppliesAdmin.map(
        (s) =>
          `<tr><td>${esc(s.name)}</td><td>${s.quantity} ${esc(s.unit)}</td><td>${s.minimum}</td><td class="${s.quantity <= s.minimum ? "out" : ""}">${s.quantity <= s.minimum ? "Existencias bajas" : "Normal"}</td>${admin ? `<td><button class="mini-btn" data-move="${s.id}">Entrada / salida</button></td>` : ""}</tr>`,
      ),
    )}</div><div id="moveEditor"></div>`;
  if (admin) {
    $("#supplyForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api("/supplies", "POST", {
          name: f.get("name"),
          unit: f.get("unit"),
          quantity: +f.get("quantity"),
          minimum: +f.get("minimum"),
        });
        toast("Insumo agregado");
        await suppliesPage();
      } catch (err) {
        handle(err);
      }
    };
    document.querySelectorAll("[data-move]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.move,
            s = suppliesAdmin.find((x) => x.id == id);
          $("#moveEditor").innerHTML =
            `<div class="panel-card"><h3>Movimiento: ${esc(s.name)}</h3><form id="movement"><label>Cantidad (+ entrada / - salida)<input name="change" type="number" step="0.01" required></label><label>Motivo<input name="reason" required></label><button class="btn red">Registrar movimiento</button></form></div>`;
          $("#movement").onsubmit = async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            try {
              await api("/supplies/" + id + "/move", "POST", {
                change: +f.get("change"),
                reason: f.get("reason"),
              });
              toast("Movimiento registrado");
              await suppliesPage();
            } catch (err) {
              handle(err);
            }
          };
        }),
    );
  }
}
async function employeesPage() {
  const people = await api("/employees");
  $("#adminPanel").innerHTML =
    `<div class="panel-card"><h3>Agregar empleado</h3><form id="employeeForm" class="form-grid"><label>Nombre<input name="name" required></label><label>Usuario<input name="username" required></label><label>Contraseña (mínimo 10 caracteres)<input name="password" type="password" minlength="10" required></label><label>Rol<select name="role"><option value="empleado">Empleado</option><option value="admin">Administrador</option></select></label><button class="btn red wide">Crear acceso</button></form></div><div class="panel-card"><h3>Usuarios registrados</h3>${table(
      ["Nombre", "Usuario", "Rol", "Estado"],
      people.map(
        (p) =>
          `<tr><td>${esc(p.name)}</td><td>${esc(p.username)}</td><td>${esc(p.role)}</td><td>${p.active ? "Activo" : "Inactivo"}</td></tr>`,
      ),
    )}</div>`;
  $("#employeeForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api("/employees", "POST", Object.fromEntries(f.entries()));
      toast("Empleado creado");
      await employeesPage();
    } catch (err) {
      handle(err);
    }
  };
}
async function reportsPage() {
  const r = await api("/reports");
  $("#adminPanel").innerHTML =
    `<div class="stats"><div class="stat"><small>Pedidos entregados</small><strong>${r.orders}</strong></div><div class="stat"><small>Ventas registradas</small><strong>${money(r.revenue)}</strong></div><div class="stat"><small>Pedidos en curso</small><strong>${r.pending}</strong></div></div><div class="panel-card"><h3>Productos más vendidos</h3>${table(
      ["Producto", "Unidades"],
      r.top.map(
        (x) => `<tr><td>${esc(x.name)}</td><td>${x.quantity}</td></tr>`,
      ),
    )}</div><div class="panel-card"><h3>Ventas por fecha (UTC)</h3>${table(
      ["Fecha", "Valor"],
      r.by_day.map(
        (x) => `<tr><td>${esc(x.day)}</td><td>${money(x.total)}</td></tr>`,
      ),
    )}</div><p class="muted">Los reportes reflejan exclusivamente pedidos marcados como entregados. No representan pagos verificados.</p>`;
}
loadMenu().catch(handle);
