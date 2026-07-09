const STORAGE_KEY = "glamCatalogProducts.v3";
const FAVORITES_KEY = "glamEventFavorites.v1";
const FAVORITES_INTRO_KEY = "glamFavoritesIntroShown.v1";
const SUPABASE_URL = "https://hhqpzvsmymsxvmnzduyt.supabase.co";
const SUPABASE_KEY = "sb_publishable_VM6iy9G4vBlBoNQNs80XcA_tn9Q9Xon";

let originalProducts = [];
let products = [];
let catalogCategories = [];
let selectedCategory = "Todas";
let dataSource = "local";
let favoriteIds = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
let favoriteIntroShown = localStorage.getItem(FAVORITES_INTRO_KEY) === "true";
let favoritePanelOpen = false;

const grid = document.querySelector("#productGrid");
const nav = document.querySelector("#categoryNav");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#searchInput");
const categorySearchInput = document.querySelector("#categorySearchInput");
const categoryList = document.querySelector("#categoryList");
const dialog = document.querySelector("#detailDialog");
const detailContent = document.querySelector("#detailContent");
const statusEl = document.querySelector("#importStatus");
const adminDialog = document.querySelector("#adminDialog");
const editDialog = document.querySelector("#editDialog");
const editForm = document.querySelector("#editForm");
const editPreview = document.querySelector("#editPreview");
const catalogTitle = document.querySelector("#catalogTitle");
const favoritesPanel = document.querySelector("#favoritesPanel");
const favoritesToggle = document.querySelector("#favoritesToggle");
const favoritesList = document.querySelector("#favoritesList");
const favoritesEmpty = document.querySelector("#favoritesEmpty");
const favoriteCount = document.querySelector("#favoriteCount");
const downloadFavoritesPdf = document.querySelector("#downloadFavoritesPdf");
let editingProductId = null;

init();

async function init() {
  originalProducts = await fetch("products.json").then(r => r.json());
  const saved = localStorage.getItem(STORAGE_KEY);
  const [cloudProducts, cloudCategories] = await Promise.all([loadSupabaseProducts(), loadSupabaseCategories()]);
  products = cloudProducts.length ? cloudProducts : (saved ? JSON.parse(saved) : originalProducts);
  catalogCategories = cloudCategories.length ? cloudCategories : categoryNamesFromProducts(products);
  dataSource = cloudProducts.length ? "supabase" : "local";
  wireEvents();
  render();
}

async function loadSupabaseProducts() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/products?select=id,legacy_id,name,category_name,subcategory,price,stock,dimensions,description,main_image_url,sort_order,product_images(image_url,alt_text,sort_order)&active=eq.true&order=sort_order.asc`;
    const response = await fetch(url, { headers: supabaseHeaders() });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    const rows = await response.json();
    return rows.map(row => ({
      id: row.legacy_id || row.id,
      dbId: row.id,
      name: row.name || "",
      category: row.category_name || "",
      subcategory: row.subcategory || "",
      price: row.price || "Consultar",
      stock: row.stock || "",
      dimensions: row.dimensions || "",
      description: row.description || "",
      image: row.main_image_url || "",
      gallery: (row.product_images || [])
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(image => image.image_url)
        .filter(Boolean)
    }));
  } catch (error) {
    console.warn("No se pudo cargar Supabase, usando datos locales.", error);
    return [];
  }
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function loadSupabaseCategories() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=name&order=sort_order.asc,name.asc`, { headers: supabaseHeaders() });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    const rows = await response.json();
    return rows.map(row => row.name).filter(Boolean);
  } catch (error) {
    console.warn("No se pudieron cargar categorias de Supabase.", error);
    return [];
  }
}

function wireEvents() {
  searchInput.addEventListener("input", renderProducts);
  categorySearchInput.addEventListener("input", renderCategories);
  document.querySelector("#productForm").addEventListener("submit", addSingleProduct);
  document.querySelector("#categoryForm").addEventListener("submit", createCategory);
  editForm.addEventListener("submit", saveEditedProduct);
  document.querySelector("#importButton").addEventListener("click", importBulk);
  document.querySelector("#exportButton").addEventListener("click", exportData);
  document.querySelector("#downloadInventoryReport").addEventListener("click", downloadInventoryReport);
  document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
  document.querySelector("#closeAdminDialog").addEventListener("click", () => adminDialog.close());
  document.querySelector("#closeEditDialog").addEventListener("click", () => editDialog.close());
  document.querySelector("#openAdminButton").addEventListener("click", openAdminDialog);
  document.querySelector("#openAdminHero").addEventListener("click", openAdminDialog);
  downloadFavoritesPdf.addEventListener("click", downloadFavorites);
  favoritesToggle.addEventListener("click", () => {
    favoritePanelOpen = !favoritePanelOpen;
    if (!favoritePanelOpen) rememberFavoritesIntro();
    renderFavorites();
  });
  document.querySelectorAll(".adminTabs button").forEach(button => {
    button.addEventListener("click", () => showAdminPanel(button.dataset.panel));
  });
}

function render() {
  renderHeroImages();
  renderCategories();
  renderCategorySelects();
  renderReportCategorySelect();
  renderProducts();
}

function renderHeroImages() {
  const hero = document.querySelector(".hero__visual--collage img");
  if (hero) hero.src = "assets/header-glam-events.png?v=1";
}

function openAdminDialog() {
  renderCategorySelects();
  renderReportCategorySelect();
  adminDialog.showModal();
}

function renderCategories() {
  const categories = ["Todas", ...allCategoryNames()];
  nav.innerHTML = categories.map(cat => (
    `<button class="${cat === selectedCategory ? "active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
  )).join("");
  nav.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      render();
      document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  categoryList.innerHTML = categories.filter(c => c !== "Todas").map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
}

function filteredProducts() {
  const term = normalize(searchInput.value);
  return products.filter(product => {
    const categoryMatch = selectedCategory === "Todas" || product.category === selectedCategory;
    const haystack = normalize([product.name, product.category, product.subcategory, product.price, product.stock, product.dimensions, product.description].join(" "));
    return categoryMatch && (!term || haystack.includes(term));
  });
}

function renderProducts() {
  const list = filteredProducts();
  catalogTitle.textContent = selectedCategory === "Todas" ? "Todos los artículos" : selectedCategory;
  summary.textContent = `${list.length} artículos visibles de ${products.length} en total · ${dataSource === "supabase" ? "Conectado a Supabase" : "Datos locales"}`;
  grid.innerHTML = list.map(product => `
    <article class="card">
      <button class="card__media" data-id="${product.id}" aria-label="Ver detalle de ${escapeHtml(product.name)}">
        <img src="${product.image || ""}" alt="${escapeHtml(product.name)}" loading="lazy">
      </button>
      <div class="card__body">
        <div class="card__topline">
          <span>${escapeHtml(product.subcategory || product.category || "Colección")}</span>
          <span class="price">${escapeHtml(product.price || "Consultar")}</span>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="meta">
          <span class="pill">${escapeHtml(product.category || "Sin categoría")}</span>
          ${product.subcategory ? `<span class="pill">${escapeHtml(product.subcategory)}</span>` : ""}
        </div>
        <span>${escapeHtml(product.stock || "")}</span>
        <div class="cardActions">
          <button class="detailLink" data-id="${product.id}">Ver detalle</button>
          <button class="editLink" data-edit-id="${product.id}">Editar</button>
        </div>
      </div>
    </article>
  `).join("");
  grid.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => openDetail(button.dataset.id));
  });
  grid.querySelectorAll("[data-edit-id]").forEach(button => {
    button.addEventListener("click", () => openEdit(button.dataset.editId));
  });
}

function openDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const gallery = productImages(product);
  const thumbnails = gallery.length > 1 ? `
    <div class="detailThumbs" aria-label="Imagenes de referencia">
      ${gallery.map((src, index) => `
        <button class="${index === 0 ? "active" : ""}" type="button" data-gallery-src="${escapeHtml(src)}">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} referencia ${index + 1}">
        </button>
      `).join("")}
    </div>
  ` : "";
  detailContent.innerHTML = `
    <div class="detail">
      <div class="detailMedia">
        <img id="detailMainImage" src="${gallery[0] || ""}" alt="${escapeHtml(product.name)}">
        ${thumbnails}
      </div>
      <div class="detailInfo">
        <p class="eyebrow">${escapeHtml(product.category || "")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        <p><strong>Subcategoria:</strong> ${escapeHtml(product.subcategory || "Sin dato")}</p>
        <p><strong>Precio:</strong> ${escapeHtml(product.price || "Consultar")}</p>
        <p><strong>Disponibilidad:</strong> ${escapeHtml(product.stock || "Sin dato")}</p>
        <p><strong>Medidas:</strong> ${escapeHtml(product.dimensions || "Sin dato")}</p>
        ${product.description ? `<p><strong>Descripcion:</strong> ${escapeHtml(product.description)}</p>` : ""}
        <button class="primaryAction detailEditButton" type="button" data-edit-id="${product.id}">Editar articulo</button>
      </div>
    </div>
  `;
  detailContent.querySelectorAll("[data-gallery-src]").forEach(button => {
    button.addEventListener("click", () => {
      detailContent.querySelector("#detailMainImage").src = button.dataset.gallerySrc;
      detailContent.querySelectorAll("[data-gallery-src]").forEach(item => item.classList.toggle("active", item === button));
    });
  });
  detailContent.querySelector("[data-edit-id]").addEventListener("click", () => openEdit(product.id));
  if (!dialog.open) dialog.showModal();
}

async function addSingleProduct(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const file = data.get("imageFile");
  const image = file && file.size ? await fileToDataUrl(file) : "";
  products.unshift({
    id: `nuevo-${Date.now()}`,
    name: data.get("name").trim(),
    category: data.get("category").trim(),
    subcategory: data.get("subcategory").trim(),
    price: data.get("price").trim() || "Consultar",
    stock: data.get("stock").trim(),
    dimensions: data.get("dimensions").trim(),
    image,
    gallery: []
  });
  persist();
  event.currentTarget.reset();
  statusEl.textContent = "Artículo añadido.";
}

async function createCategory(event) {
  event.preventDefault();
  const input = event.currentTarget.categoryName;
  const name = input.value.trim();
  if (!name) return;
  if (allCategoryNames().some(category => normalize(category) === normalize(name))) {
    statusEl.textContent = "Esa categoria ya existe.";
    input.value = "";
    return;
  }
  try {
    const payload = {
      name,
      slug: categorySlug(name),
      sort_order: allCategoryNames().length
    };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error("La categoria ya existe en Supabase.");
      throw new Error(`Supabase ${response.status}`);
    }
    catalogCategories = [...allCategoryNames(), name];
    input.value = "";
    selectedCategory = name;
    statusEl.textContent = "Categoria creada en Supabase.";
    render();
  } catch (error) {
    statusEl.textContent = `No se pudo crear la categoria: ${error.message}`;
  }
}

function openEdit(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  editingProductId = id;
  editForm.name.value = product.name || "";
  editForm.category.value = product.category || "";
  editForm.subcategory.value = product.subcategory || "";
  editForm.price.value = product.price || "";
  editForm.stock.value = product.stock || "";
  editForm.dimensions.value = product.dimensions || "";
  editForm.imageFile.value = "";
  editForm.galleryFiles.value = "";
  const galleryCount = productImages(product).length;
  editPreview.innerHTML = `
    <img src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name)}">
    <div>
      <strong>${escapeHtml(product.name)}</strong>
      <span>${galleryCount} imagen${galleryCount === 1 ? "" : "es"} en la ficha</span>
    </div>
  `;
  editDialog.showModal();
}

async function saveEditedProduct(event) {
  event.preventDefault();
  const product = products.find(p => p.id === editingProductId);
  if (!product) return;
  const data = new FormData(event.currentTarget);
  const mainFile = data.get("imageFile");
  const galleryFiles = data.getAll("galleryFiles").filter(file => file && file.size);
  product.name = data.get("name").trim();
  product.category = data.get("category").trim();
  product.subcategory = data.get("subcategory").trim();
  product.price = data.get("price").trim() || "Consultar";
  product.stock = data.get("stock").trim();
  product.dimensions = data.get("dimensions").trim();
  if (mainFile && mainFile.size) product.image = await fileToDataUrl(mainFile);
  if (galleryFiles.length) {
    const newImages = [];
    for (const file of galleryFiles) newImages.push(await fileToDataUrl(file));
    product.gallery = [...(Array.isArray(product.gallery) ? product.gallery : []), ...newImages];
  }
  persist();
  editDialog.close();
  if (dialog.open) openDetail(product.id);
}

function renderCategories() {
  const term = normalize(categorySearchInput.value);
  const allCategories = allCategoryNames();
  const filtered = term ? allCategories.filter(category => normalize(category).includes(term)) : allCategories;
  const categories = ["Todas", ...filtered];
  nav.innerHTML = categories.map(cat => (
    `<button class="${cat === selectedCategory ? "active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
  )).join("");
  nav.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      render();
      document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  categoryList.innerHTML = allCategories.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
}

function renderProducts() {
  const list = filteredProducts();
  catalogTitle.textContent = selectedCategory === "Todas" ? "Todos los articulos" : selectedCategory;
  summary.textContent = `${list.length} articulos visibles de ${products.length} en total · ${dataSource === "supabase" ? "Conectado a Supabase" : "Datos locales"}`;
  grid.innerHTML = list.map(product => {
    const isFavorite = favoriteIds.has(product.id);
    return `
      <article class="card">
        <button class="card__media" data-id="${product.id}" aria-label="Ver detalle de ${escapeHtml(product.name)}">
          <img src="${product.image || ""}" alt="${escapeHtml(product.name)}" loading="lazy">
        </button>
        <div class="card__body">
          <div class="card__topline">
            <span>${escapeHtml(product.subcategory || product.category || "Coleccion")}</span>
            <span class="price">${escapeHtml(product.price || "Consultar")}</span>
          </div>
          <h3>${escapeHtml(product.name)}</h3>
          <div class="cardActions">
            <button class="favoriteLink ${isFavorite ? "active" : ""}" data-favorite-id="${product.id}">${isFavorite ? "En favoritos" : "Agregar a favoritos"}</button>
            <button class="editLink" data-edit-id="${product.id}">Editar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
  grid.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => openDetail(button.dataset.id));
  });
  grid.querySelectorAll("[data-edit-id]").forEach(button => {
    button.addEventListener("click", () => openEdit(button.dataset.editId));
  });
  grid.querySelectorAll("[data-favorite-id]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteId));
  });
}

function detailLine(label, value) {
  const clean = String(value || "").trim();
  return clean ? `<p><strong>${label}:</strong> ${escapeHtml(clean)}</p>` : "";
}

function openDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const gallery = productImages(product);
  const isFavorite = favoriteIds.has(product.id);
  const thumbnails = gallery.length > 1 ? `
    <div class="detailThumbs" aria-label="Imagenes de referencia">
      ${gallery.map((src, index) => `
        <button class="${index === 0 ? "active" : ""}" type="button" data-gallery-src="${escapeHtml(src)}">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} referencia ${index + 1}">
        </button>
      `).join("")}
    </div>
  ` : "";
  detailContent.innerHTML = `
    <div class="detail">
      <div class="detailMedia">
        <img id="detailMainImage" src="${gallery[0] || ""}" alt="${escapeHtml(product.name)}">
        ${thumbnails}
      </div>
      <div class="detailInfo">
        <p class="eyebrow">${escapeHtml(product.category || "")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        ${detailLine("Subcategoria", product.subcategory)}
        ${detailLine("Precio", product.price)}
        ${detailLine("Disponibilidad", product.stock)}
        ${detailLine("Medidas", product.dimensions)}
        ${detailLine("Descripcion", product.description)}
        <div class="detailActions">
          <button class="favoriteStar ${isFavorite ? "active" : ""}" type="button" data-favorite-id="${product.id}" aria-label="${isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}">★</button>
          <button class="secondaryAction detailEditButton" type="button" data-edit-id="${product.id}">Editar articulo</button>
        </div>
      </div>
    </div>
  `;
  detailContent.querySelectorAll("[data-gallery-src]").forEach(button => {
    button.addEventListener("click", () => {
      detailContent.querySelector("#detailMainImage").src = button.dataset.gallerySrc;
      detailContent.querySelectorAll("[data-gallery-src]").forEach(item => item.classList.toggle("active", item === button));
    });
  });
  detailContent.querySelector("[data-edit-id]").addEventListener("click", () => openEdit(product.id));
  detailContent.querySelector("[data-favorite-id]").addEventListener("click", () => {
    toggleFavorite(product.id);
    openDetail(product.id);
  });
  if (!dialog.open) dialog.showModal();
}

function groupedFavorites(favorites) {
  const groups = new Map();
  favorites.forEach(product => {
    const category = product.category || "Sin categoria";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
}

async function buildFavoritesPdf(favorites) {
  const pages = await drawGroupedFavoritesPages(groupedFavorites(favorites));
  return assembleImagePdf(pages);
}

async function drawGroupedFavoritesPages(groups) {
  const pages = [];
  let canvas = createFavoritesCanvas();
  let ctx = canvas.getContext("2d");
  let pageNumber = 1;
  let y = await drawPdfHeader(ctx, pageNumber);
  const newPage = async () => {
    pages.push(canvas.toDataURL("image/jpeg", 0.92));
    canvas = createFavoritesCanvas();
    ctx = canvas.getContext("2d");
    pageNumber += 1;
    y = await drawPdfHeader(ctx, pageNumber);
  };
  for (const [category, items] of groups) {
    if (y > 1390) await newPage();
    drawCategorySubtitle(ctx, category, y);
    y += 70;
    for (let i = 0; i < items.length; i += 2) {
      if (y > 1340) await newPage();
      await drawPdfFavoriteCard(ctx, items[i], 110, y);
      if (items[i + 1]) await drawPdfFavoriteCard(ctx, items[i + 1], 640, y);
      y += 395;
    }
  }
  pages.push(canvas.toDataURL("image/jpeg", 0.92));
  return pages;
}

function createFavoritesCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(74, 74, 1092, 1606);
  ctx.strokeStyle = "#ded9d1";
  ctx.lineWidth = 2;
  ctx.strokeRect(74, 74, 1092, 1606);
  return canvas;
}

async function drawPdfHeader(ctx, pageNumber) {
  const logo = await loadDrawableImage("assets/logo-glam.png");
  if (logo) drawContainedImage(ctx, logo, 100, 98, 260, 120);
  ctx.fillStyle = "#171412";
  ctx.font = "48px Georgia, serif";
  ctx.fillText("QUIERO ESTO PARA MI EVENTO", 100, 270);
  ctx.fillStyle = "#746f68";
  ctx.font = "22px Segoe UI, Arial";
  ctx.fillText(`Seleccion de favoritos · Pagina ${pageNumber}`, 100, 314);
  ctx.strokeStyle = "#b9a16f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(100, 350);
  ctx.lineTo(1140, 350);
  ctx.stroke();
  return 405;
}

function drawCategorySubtitle(ctx, category, y) {
  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(100, y, 1040, 48);
  ctx.strokeStyle = "#ded9d1";
  ctx.strokeRect(100, y, 1040, 48);
  ctx.fillStyle = "#6a3431";
  ctx.font = "bold 25px Segoe UI, Arial";
  ctx.fillText(category.toUpperCase(), 122, y + 32);
}

async function drawPdfFavoriteCard(ctx, product, x, y) {
  const cardW = 490;
  const cardH = 340;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, cardW, cardH);
  ctx.strokeStyle = "#ded9d1";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, cardW, cardH);
  const image = await loadDrawableImage(product.image);
  if (image) drawContainedImage(ctx, image, x + 22, y + 22, cardW - 44, 230);
  ctx.fillStyle = "#171412";
  ctx.font = "bold 28px Segoe UI, Arial";
  wrapCanvasText(ctx, product.name, x + 28, y + 292, cardW - 56, 32, 2);
}

function render() {
  renderHeroImages();
  renderCategories();
  renderCategorySelects();
  renderProducts();
  renderFavorites();
}

function renderProducts() {
  const list = filteredProducts();
  catalogTitle.textContent = selectedCategory === "Todas" ? "Todos los articulos" : selectedCategory;
  summary.textContent = `${list.length} articulos visibles de ${products.length} en total · ${dataSource === "supabase" ? "Conectado a Supabase" : "Datos locales"}`;
  grid.innerHTML = list.map(product => {
    const isFavorite = favoriteIds.has(product.id);
    return `
      <article class="card">
        <button class="card__media" data-id="${product.id}" aria-label="Ver detalle de ${escapeHtml(product.name)}">
          <img src="${product.image || ""}" alt="${escapeHtml(product.name)}" loading="lazy">
        </button>
        <div class="card__body">
          <div class="card__topline">
            <span>${escapeHtml(product.subcategory || product.category || "Coleccion")}</span>
            <span class="price">${escapeHtml(product.price || "Consultar")}</span>
          </div>
          <h3>${escapeHtml(product.name)}</h3>
          <div class="meta">
            <span class="pill">${escapeHtml(product.category || "Sin categoria")}</span>
            ${product.subcategory ? `<span class="pill">${escapeHtml(product.subcategory)}</span>` : ""}
          </div>
          <span>${escapeHtml(product.stock || "")}</span>
          <div class="cardActions">
            <button class="detailLink" data-id="${product.id}">Ver detalle</button>
            <button class="favoriteLink ${isFavorite ? "active" : ""}" data-favorite-id="${product.id}">${isFavorite ? "En favoritos" : "Agregar a favoritos"}</button>
            <button class="editLink" data-edit-id="${product.id}">Editar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
  grid.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => openDetail(button.dataset.id));
  });
  grid.querySelectorAll("[data-edit-id]").forEach(button => {
    button.addEventListener("click", () => openEdit(button.dataset.editId));
  });
  grid.querySelectorAll("[data-favorite-id]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteId));
  });
}

function openDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const gallery = productImages(product);
  const isFavorite = favoriteIds.has(product.id);
  const thumbnails = gallery.length > 1 ? `
    <div class="detailThumbs" aria-label="Imagenes de referencia">
      ${gallery.map((src, index) => `
        <button class="${index === 0 ? "active" : ""}" type="button" data-gallery-src="${escapeHtml(src)}">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} referencia ${index + 1}">
        </button>
      `).join("")}
    </div>
  ` : "";
  detailContent.innerHTML = `
    <div class="detail">
      <div class="detailMedia">
        <img id="detailMainImage" src="${gallery[0] || ""}" alt="${escapeHtml(product.name)}">
        ${thumbnails}
      </div>
      <div class="detailInfo">
        <p class="eyebrow">${escapeHtml(product.category || "")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        <p><strong>Subcategoria:</strong> ${escapeHtml(product.subcategory || "Sin dato")}</p>
        <p><strong>Precio:</strong> ${escapeHtml(product.price || "Consultar")}</p>
        <p><strong>Disponibilidad:</strong> ${escapeHtml(product.stock || "Sin dato")}</p>
        <p><strong>Medidas:</strong> ${escapeHtml(product.dimensions || "Sin dato")}</p>
        ${product.description ? `<p><strong>Descripcion:</strong> ${escapeHtml(product.description)}</p>` : ""}
        <div class="detailActions">
          <button class="primaryAction favoriteDetailButton" type="button" data-favorite-id="${product.id}">${isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}</button>
          <button class="secondaryAction detailEditButton" type="button" data-edit-id="${product.id}">Editar articulo</button>
        </div>
      </div>
    </div>
  `;
  detailContent.querySelectorAll("[data-gallery-src]").forEach(button => {
    button.addEventListener("click", () => {
      detailContent.querySelector("#detailMainImage").src = button.dataset.gallerySrc;
      detailContent.querySelectorAll("[data-gallery-src]").forEach(item => item.classList.toggle("active", item === button));
    });
  });
  detailContent.querySelector("[data-edit-id]").addEventListener("click", () => openEdit(product.id));
  detailContent.querySelector("[data-favorite-id]").addEventListener("click", () => {
    toggleFavorite(product.id);
    openDetail(product.id);
  });
  if (!dialog.open) dialog.showModal();
}

function selectedFavoriteProducts() {
  return [...favoriteIds].map(id => products.find(product => product.id === id)).filter(Boolean);
}

function toggleFavorite(id) {
  const wasEmpty = favoriteIds.size === 0;
  const wasFavorite = favoriteIds.has(id);
  if (wasFavorite) favoriteIds.delete(id);
  else {
    favoriteIds.add(id);
    if (wasEmpty && !favoriteIntroShown) {
      favoritePanelOpen = true;
      rememberFavoritesIntro();
    } else if (!favoritePanelOpen) {
      pulseFavoriteCounter();
    }
  }
  if (favoriteIds.size === 0) favoritePanelOpen = false;
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
  renderProducts();
  renderFavorites();
}

function rememberFavoritesIntro() {
  favoriteIntroShown = true;
  localStorage.setItem(FAVORITES_INTRO_KEY, "true");
}

function pulseFavoriteCounter() {
  favoritesToggle.classList.remove("has-update");
  void favoritesToggle.offsetWidth;
  favoritesToggle.classList.add("has-update");
  window.setTimeout(() => favoritesToggle.classList.remove("has-update"), 900);
}

function renderFavorites() {
  const favorites = selectedFavoriteProducts();
  favoritesPanel.classList.toggle("is-open", favoritePanelOpen);
  document.body.classList.toggle("favorites-open", favoritePanelOpen);
  favoritesToggle.setAttribute("aria-expanded", String(favoritePanelOpen));
  favoriteCount.textContent = favorites.length;
  favoritesEmpty.style.display = favoritePanelOpen && !favorites.length ? "block" : "none";
  downloadFavoritesPdf.disabled = favorites.length === 0;
  favoritesList.innerHTML = favorites.map(product => `
    <article class="favoriteItem">
      <img src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name)}">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.category || "")}</span>
      </div>
      <button type="button" aria-label="Quitar ${escapeHtml(product.name)}" data-remove-favorite="${product.id}">×</button>
    </article>
  `).join("");
  favoritesList.querySelectorAll("[data-remove-favorite]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.removeFavorite));
  });
}

async function downloadFavorites() {
  const favorites = selectedFavoriteProducts();
  if (!favorites.length) return;
  downloadFavoritesPdf.disabled = true;
  downloadFavoritesPdf.textContent = "Preparando lista...";
  try {
    await registerFavoriteList(favorites);
    const pdfBytes = await buildFavoritesPdf(favorites);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "QUIERO ESTO PARA MI EVENTO.pdf";
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    downloadFavoritesPdf.disabled = false;
    downloadFavoritesPdf.textContent = "Descargar mi lista";
  }
}

async function registerFavoriteList(favorites) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/favorite_lists`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        title: "QUIERO ESTO PARA MI EVENTO",
        item_count: favorites.length,
        items: favorites.map(product => ({
          id: product.id,
          dbId: product.dbId || null,
          name: product.name,
          image: product.image || "",
          category: product.category || ""
        }))
      })
    });
  } catch (error) {
    console.warn("No se pudo registrar la lista de favoritos.", error);
  }
}

async function buildFavoritesPdf(favorites) {
  const pageImages = [];
  const perPage = 6;
  for (let start = 0; start < favorites.length; start += perPage) {
    pageImages.push(await drawFavoritesPage(favorites.slice(start, start + perPage), start / perPage + 1, Math.ceil(favorites.length / perPage)));
  }
  return assembleImagePdf(pageImages);
}

async function drawFavoritesPage(items, pageNumber, totalPages) {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(74, 74, 1092, 1606);
  ctx.strokeStyle = "#ded9d1";
  ctx.lineWidth = 2;
  ctx.strokeRect(74, 74, 1092, 1606);

  const logo = await loadDrawableImage("assets/logo-glam.png");
  if (logo) drawContainedImage(ctx, logo, 100, 98, 260, 120);

  ctx.fillStyle = "#171412";
  ctx.font = "48px Georgia, serif";
  ctx.fillText("QUIERO ESTO PARA MI EVENTO", 100, 270);
  ctx.fillStyle = "#746f68";
  ctx.font = "22px Segoe UI, Arial";
  ctx.fillText(`Seleccion de favoritos · Pagina ${pageNumber} de ${totalPages}`, 100, 314);
  ctx.strokeStyle = "#b9a16f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(100, 350);
  ctx.lineTo(1140, 350);
  ctx.stroke();

  const cardW = 500;
  const cardH = 330;
  const positions = [
    [100, 410], [640, 410],
    [100, 780], [640, 780],
    [100, 1150], [640, 1150]
  ];
  for (let i = 0; i < items.length; i++) {
    const product = items[i];
    const [x, y] = positions[i];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = "#ded9d1";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cardW, cardH);
    const image = await loadDrawableImage(product.image);
    if (image) drawContainedImage(ctx, image, x + 24, y + 24, 190, 190);
    ctx.fillStyle = "#6a3431";
    ctx.font = "16px Segoe UI, Arial";
    ctx.fillText((product.category || "Articulo").toUpperCase(), x + 240, y + 74);
    ctx.fillStyle = "#171412";
    ctx.font = "bold 30px Segoe UI, Arial";
    wrapCanvasText(ctx, product.name, x + 240, y + 116, 220, 36, 3);
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let lineCount = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
      lineCount++;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lineCount < maxLines) ctx.fillText(line, x, y);
}

async function loadDrawableImage(src) {
  if (!src) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawContainedImage(ctx, image, x, y, w, h) {
  const ratio = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const drawW = image.naturalWidth * ratio;
  const drawH = image.naturalHeight * ratio;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function assembleImagePdf(pageDataUrls) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const addText = text => addBytes(encoder.encode(text));
  const addBytes = bytes => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const objects = [];
  const addObject = content => {
    objects.push(content);
    return objects.length;
  };
  addText("%PDF-1.4\n");
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pageDataUrls.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pageDataUrls.length} >>`);
  pageDataUrls.forEach((dataUrl, index) => {
    const imageObj = 5 + index * 3;
    const contentObj = 4 + index * 3;
    addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${index} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    const stream = `q\n595 0 0 842 0 0 cm\n/Im${index} Do\nQ\n`;
    addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    addObject({ image: bytes });
  });
  objects.forEach((object, index) => {
    offsets.push(length);
    addText(`${index + 1} 0 obj\n`);
    if (object.image) {
      addText(`<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${object.image.length} >>\nstream\n`);
      addBytes(object.image);
      addText("\nendstream");
    } else {
      addText(object);
    }
    addText("\nendobj\n");
  });
  const xrefOffset = length;
  addText(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => addText(`${String(offset).padStart(10, "0")} 00000 n \n`));
  addText(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(chunks).arrayBuffer();
}

async function importBulk() {
  const file = document.querySelector("#bulkFile").files[0];
  if (!file) {
    statusEl.textContent = "Selecciona un archivo Excel o CSV.";
    return;
  }
  try {
    const imageFiles = [...document.querySelector("#bulkImages").files];
    const imageMap = await buildImageMap(imageFiles);
    const rows = file.name.toLowerCase().endsWith(".xlsx") ? await readXlsx(file) : parseCsv(await file.text());
    const imported = rows.map(row => rowToProduct(row, imageMap)).filter(p => p.name && p.category);
    products = [...imported, ...products];
    persist();
    statusEl.textContent = `${imported.length} artículos importados.`;
  } catch (error) {
    statusEl.textContent = `No se pudo importar: ${error.message}`;
  }
}

function rowToProduct(row, imageMap) {
  const get = (...names) => {
    for (const name of names) {
      const value = row[name] ?? row[name.toLowerCase()] ?? row[name.toUpperCase()];
      if (value !== undefined) return String(value).trim();
    }
    return "";
  };
  const name = get("nombre", "name", "articulo", "producto");
  const imageName = get("imagen", "image", "archivo");
  const image = imageMap.get(normalize(imageName)) || imageMap.get(normalize(name)) || imageName;
  return {
    id: `masivo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    category: get("categoria", "category"),
    subcategory: get("subcategoria", "subcategory"),
    price: get("precio", "price") || "Consultar",
    stock: get("unidades", "stock", "cantidad"),
    dimensions: get("medidas", "dimensions", "dimensiones"),
    image,
    gallery: []
  };
}

async function buildImageMap(files) {
  const map = new Map();
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const base = file.name.replace(/\.[^.]+$/, "");
    map.set(normalize(base), dataUrl);
    map.set(normalize(file.name), dataUrl);
  }
  return map;
}

function parseCsv(text) {
  const rows = [];
  let current = "", row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { current += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === ";") && !quoted) { row.push(current); current = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (current || row.length) { row.push(current); rows.push(row); row = []; current = ""; }
      if (ch === "\r" && next === "\n") i++;
    } else current += ch;
  }
  if (current || row.length) { row.push(current); rows.push(row); }
  const headers = rows.shift().map(h => normalizeHeader(h));
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
}

async function readXlsx(file) {
  const zip = await unzip(await file.arrayBuffer());
  const shared = parseSharedStrings(zip.get("xl/sharedStrings.xml") || "");
  const sheetName = [...zip.keys()].find(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("No encontré una hoja dentro del Excel.");
  const xml = new DOMParser().parseFromString(zip.get(sheetName), "application/xml");
  const rows = [...xml.querySelectorAll("sheetData row")].map(row => {
    const values = [];
    row.querySelectorAll("c").forEach(cell => {
      const ref = cell.getAttribute("r") || "";
      const col = columnIndex(ref.replace(/\d/g, ""));
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "s") value = shared[Number(cell.querySelector("v")?.textContent || 0)] || "";
      else if (type === "inlineStr") value = cell.querySelector("t")?.textContent || "";
      else value = cell.querySelector("v")?.textContent || "";
      values[col] = value;
    });
    return values;
  }).filter(r => r.some(Boolean));
  const headers = rows.shift().map(h => normalizeHeader(h));
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
}

function parseSharedStrings(xmlText) {
  if (!xmlText) return [];
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return [...xml.querySelectorAll("si")].map(si => [...si.querySelectorAll("t")].map(t => t.textContent).join(""));
}

function renderReportCategorySelect() {
  const select = document.querySelector("#reportCategorySelect");
  if (!select) return;
  const current = select.value;
  const options = ["Todas", ...allCategoryNames()].map(category => (
    `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  )).join("");
  select.innerHTML = options;
  if (current && [...select.options].some(option => option.value === current)) select.value = current;
}

async function downloadInventoryReport() {
  const button = document.querySelector("#downloadInventoryReport");
  const select = document.querySelector("#reportCategorySelect");
  const category = select?.value || "Todas";
  const reportProducts = category === "Todas" ? products : products.filter(product => product.category === category);
  if (!reportProducts.length) {
    statusEl.textContent = "No hay artículos para generar el informe.";
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando informe...";
  try {
    const xlsxBytes = await buildInventoryReportXlsx(reportProducts, category);
    const blob = new Blob([xlsxBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-catalogo-glam-${categorySlug(category)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = `Informe generado: ${category === "Todas" ? "todos los artículos" : category}.`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function buildInventoryReportHtml(items, category) {
  const rows = await Promise.all(items.map(async product => {
    const image = await reportImageSource(product.image);
    return `
      <tr>
        <td class="imageCell">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}">` : ""}</td>
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.stock || "")}</td>
        <td>${escapeHtml(product.price || "")}</td>
        <td>${escapeHtml(product.dimensions || "")}</td>
        <td>${escapeHtml(product.category || "")}</td>
      </tr>
    `;
  }));
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; }
          th { background: #171412; color: #ffffff; font-weight: 700; }
          th, td { border: 1px solid #ded9d1; padding: 8px; vertical-align: middle; }
          td { color: #171412; }
          .title { background: #f7f4ef; color: #6a3431; font-size: 18px; font-weight: 700; }
          .imageCell { width: 120px; height: 100px; text-align: center; }
          img { max-width: 105px; max-height: 88px; object-fit: contain; }
        </style>
      </head>
      <body>
        <table>
          <tr><td class="title" colspan="6">Informe catálogo Glam - ${escapeHtml(category === "Todas" ? "Todos los artículos" : category)}</td></tr>
          <tr>
            <th>Imagen</th>
            <th>Nombre</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Medida</th>
            <th>Categoría</th>
          </tr>
          ${rows.join("")}
        </table>
      </body>
    </html>
  `;
}

async function reportImageSource(src) {
  if (!src) return "";
  if (/^data:/i.test(src)) return src;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error("No se pudo cargar la imagen.");
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    return src;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildInventoryReportXlsx(items, category) {
  const images = [];
  for (let index = 0; index < items.length; index++) {
    images.push(await inventoryImageFile(items[index].image, index + 1));
  }
  const rows = inventorySheetRows(items, category);
  const hasImages = images.some(Boolean);
  const entries = [
    { path: "[Content_Types].xml", text: inventoryContentTypes(images) },
    { path: "_rels/.rels", text: xlsxRootRels() },
    { path: "xl/workbook.xml", text: xlsxWorkbook() },
    { path: "xl/_rels/workbook.xml.rels", text: xlsxWorkbookRels() },
    { path: "xl/styles.xml", text: xlsxStyles() },
    { path: "xl/worksheets/sheet1.xml", text: xlsxWorksheet(rows, hasImages) },
    { path: "xl/worksheets/_rels/sheet1.xml.rels", text: xlsxSheetRels(hasImages) }
  ];
  if (hasImages) {
    entries.push({ path: "xl/drawings/drawing1.xml", text: inventoryDrawingXml(images) });
    entries.push({ path: "xl/drawings/_rels/drawing1.xml.rels", text: xlsxDrawingRels(images) });
    images.filter(Boolean).forEach(image => {
      entries.push({ path: `xl/media/${image.name}`, data: image.bytes });
    });
  }
  return createZip(entries);
}

function inventorySheetRows(items, category) {
  const title = category === "Todas" ? "Todos los articulos" : category;
  const rows = [
    { values: [`Informe catalogo Glam - ${title}`, "", "", "", "", ""], height: 30, style: 1 },
    { values: ["Imagen", "Nombre", "Cantidad", "Precio", "Medida", "Categoria"], height: 24, style: 2 }
  ];
  items.forEach(product => {
    rows.push({
      values: ["", product.name, product.stock || "", product.price || "", product.dimensions || "", product.category || ""],
      height: 78,
      style: 0
    });
  });
  return rows;
}

async function inventoryImageFile(src, index) {
  if (!src) return null;
  try {
    let bytes;
    let mime = "";
    if (/^data:/i.test(src)) {
      const parsed = dataUrlToBytes(src);
      bytes = parsed.bytes;
      mime = parsed.mime;
    } else {
      const response = await fetch(src);
      if (!response.ok) return null;
      const blob = await response.blob();
      bytes = new Uint8Array(await blob.arrayBuffer());
      mime = blob.type || "";
    }
    if (!bytes?.length) return null;
    const ext = mime.includes("png") ? "png" : "jpg";
    return { bytes, ext, name: `image${index}.${ext}`, rowIndex: index + 1 };
  } catch (error) {
    return null;
  }
}

function dataUrlToBytes(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return { bytes: new Uint8Array(), mime: "" };
  const mime = match[1] || "";
  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { bytes, mime };
}

function xlsxWorksheet(rows, hasDrawing) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.values.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      const style = row.style ? ` s="${row.style}"` : "";
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}" ht="${row.height}" customHeight="1">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:F${rows.length}"/>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="34" customWidth="1"/>
    <col min="3" max="3" width="14" customWidth="1"/>
    <col min="4" max="4" width="16" customWidth="1"/>
    <col min="5" max="5" width="22" customWidth="1"/>
    <col min="6" max="6" width="28" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells>
  ${hasDrawing ? '<drawing r:id="rId1"/>' : ""}
</worksheet>`;
}

function inventoryDrawingXml(images) {
  const validImages = images.filter(Boolean);
  const anchors = validImages.map((image, index) => `
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>90000</xdr:colOff><xdr:row>${image.rowIndex}</xdr:row><xdr:rowOff>90000</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${image.rowIndex + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="${index + 2}" name="Imagen ${index + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}
</xdr:wsDr>`;
}

function inventoryContentTypes(images) {
  const imageDefaults = [...new Set(images.filter(Boolean).map(image => image.ext))]
    .map(ext => `<Default Extension="${ext}" ContentType="image/${ext === "jpg" ? "jpeg" : ext}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imageDefaults}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`;
}

function xlsxRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function xlsxWorkbook() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Informe" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function xlsxWorkbookRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function xlsxSheetRels(hasDrawing) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${hasDrawing ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' : ""}
</Relationships>`;
}

function xlsxDrawingRels(images) {
  const rels = images.filter(Boolean).map((image, index) => (
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${image.name}"/>`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function xlsxStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF6A3431"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF171412"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFDED9D1"/></left><right style="thin"><color rgb="FFDED9D1"/></right><top style="thin"><color rgb="FFDED9D1"/></top><bottom style="thin"><color rgb="FFDED9D1"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;
}

function createZip(entries) {
  const files = entries.map(entry => {
    const name = textBytes(entry.path);
    const data = entry.data || textBytes(entry.text || "");
    const crc = crc32(data);
    return { name, data, crc };
  });
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const local = concatBytes(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(file.crc), u32(file.data.length), u32(file.data.length), u16(file.name.length), u16(0), file.name, file.data);
    localParts.push(local);
    centralParts.push(concatBytes(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(file.crc), u32(file.data.length), u32(file.data.length), u16(file.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), file.name));
    offset += local.length;
  }
  const central = concatBytes(...centralParts);
  const end = concatBytes(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0));
  return concatBytes(...localParts, central, end);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function textBytes(text) {
  return new TextEncoder().encode(text);
}

function concatBytes(...chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach(chunk => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function columnName(index) {
  let name = "";
  let current = index + 1;
  while (current) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&'"]/g, ch => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;"
  }[ch]));
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El archivo no parece ser un .xlsx válido.");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map();
  for (let i = 0; i < entries; i++) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.slice(dataStart, dataStart + compressedSize);
    if (name.endsWith(".xml")) files.set(name, await inflate(data, method));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function inflate(data, method) {
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8 || !("DecompressionStream" in window)) {
    throw new Error("Este navegador no puede descomprimir el Excel. Prueba con CSV.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function exportData() {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "catalogo-glam-articulos.json";
  a.click();
  URL.revokeObjectURL(url);
}

function resetData() {
  products = originalProducts;
  localStorage.removeItem(STORAGE_KEY);
  selectedCategory = "Todas";
  statusEl.textContent = "Catálogo restaurado con los artículos del PDF.";
  render();
}

function showAdminPanel(panelName) {
  if (panelName === "reportsPanel") renderReportCategorySelect();
  document.querySelectorAll(".adminTabs button").forEach(button => {
    button.classList.toggle("active", button.dataset.panel === panelName);
  });
  document.querySelectorAll("[data-admin-panel]").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.adminPanel === panelName);
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function productImages(product) {
  return [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(Boolean);
}

function allCategoryNames() {
  return [...new Set([...catalogCategories, ...categoryNamesFromProducts(products)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
}

function categoryNamesFromProducts(list) {
  return [...new Set(list.map(product => product.category).filter(Boolean))];
}

function categorySlug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `categoria-${Date.now()}`;
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function normalizeHeader(value) {
  return normalize(value).replace(/\s+/g, "_");
}

function columnIndex(letters) {
  return [...letters].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function renderCategorySelects() {
  const options = [`<option value="">Selecciona una categoria</option>`, ...allCategoryNames().map(category => (
    `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  ))].join("");
  document.querySelectorAll("[data-category-select]").forEach(select => {
    const current = select.value;
    select.innerHTML = options;
    if (current && isValidCategory(current)) select.value = current;
  });
}

function isValidCategory(category) {
  return allCategoryNames().some(item => normalize(item) === normalize(category));
}

function categoryIdForName(category) {
  const match = products.find(product => product.category === category && product.categoryId);
  return match?.categoryId || null;
}

function productPayload(product) {
  return {
    legacy_id: product.id,
    name: product.name,
    category_name: product.category,
    subcategory: product.subcategory || "",
    price: product.price || "Consultar",
    stock: product.stock || "",
    dimensions: product.dimensions || "",
    description: product.description || "",
    main_image_url: product.image || "",
    active: true,
    sort_order: products.findIndex(item => item.id === product.id)
  };
}

async function saveNewProductToSupabase(product) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,legacy_id,name,category_name,subcategory,price,stock,dimensions,description,main_image_url`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(productPayload(product))
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    const [row] = await response.json();
    return {
      ...product,
      dbId: row.id,
      id: row.legacy_id || product.id,
      description: row.description || product.description || ""
    };
  } catch (error) {
    console.warn("No se pudo guardar el articulo en Supabase.", error);
    return null;
  }
}

async function updateProductInSupabase(product) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !product.dbId) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(product.dbId)}`, {
      method: "PATCH",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(productPayload(product))
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    return true;
  } catch (error) {
    console.warn("No se pudo actualizar el articulo en Supabase.", error);
    return false;
  }
}

async function addSingleProduct(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const category = data.get("category").trim();
  if (!isValidCategory(category)) {
    statusEl.textContent = "Selecciona una categoria valida.";
    return;
  }
  const file = data.get("imageFile");
  const image = file && file.size ? await fileToDataUrl(file) : "";
  const product = {
    id: `nuevo-${Date.now()}`,
    name: data.get("name").trim(),
    category,
    subcategory: data.get("subcategory").trim(),
    price: data.get("price").trim() || "Consultar",
    stock: data.get("stock").trim(),
    dimensions: data.get("dimensions").trim(),
    description: data.get("description").trim(),
    image,
    gallery: []
  };
  const savedProduct = await saveNewProductToSupabase(product);
  products.unshift(savedProduct || product);
  persist();
  event.currentTarget.reset();
  statusEl.textContent = savedProduct ? "Articulo añadido en Supabase." : "Articulo añadido localmente.";
}

function openEdit(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  editingProductId = id;
  renderCategorySelects();
  editForm.name.value = product.name || "";
  editForm.category.value = product.category || "";
  editForm.subcategory.value = product.subcategory || "";
  editForm.price.value = product.price || "";
  editForm.stock.value = product.stock || "";
  editForm.dimensions.value = product.dimensions || "";
  editForm.description.value = product.description || "";
  editForm.imageFile.value = "";
  editForm.galleryFiles.value = "";
  const galleryCount = productImages(product).length;
  editPreview.innerHTML = `
    <img src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name)}">
    <div>
      <strong>${escapeHtml(product.name)}</strong>
      <span>${galleryCount} imagen${galleryCount === 1 ? "" : "es"} en la ficha</span>
    </div>
  `;
  editDialog.showModal();
}

async function saveEditedProduct(event) {
  event.preventDefault();
  const product = products.find(p => p.id === editingProductId);
  if (!product) return;
  const data = new FormData(event.currentTarget);
  const category = data.get("category").trim();
  if (!isValidCategory(category)) {
    statusEl.textContent = "Selecciona una categoria valida.";
    return;
  }
  const mainFile = data.get("imageFile");
  const galleryFiles = data.getAll("galleryFiles").filter(file => file && file.size);
  product.name = data.get("name").trim();
  product.category = category;
  product.subcategory = data.get("subcategory").trim();
  product.price = data.get("price").trim() || "Consultar";
  product.stock = data.get("stock").trim();
  product.dimensions = data.get("dimensions").trim();
  product.description = data.get("description").trim();
  if (mainFile && mainFile.size) product.image = await fileToDataUrl(mainFile);
  if (galleryFiles.length) {
    const newImages = [];
    for (const file of galleryFiles) newImages.push(await fileToDataUrl(file));
    product.gallery = [...(Array.isArray(product.gallery) ? product.gallery : []), ...newImages];
  }
  const cloudSaved = await updateProductInSupabase(product);
  persist();
  editDialog.close();
  statusEl.textContent = cloudSaved ? "Articulo actualizado en Supabase." : "Articulo actualizado localmente.";
  if (dialog.open) openDetail(product.id);
}

function renderProducts() {
  const list = filteredProducts();
  catalogTitle.textContent = selectedCategory === "Todas" ? "Todos los articulos" : selectedCategory;
  summary.textContent = `${list.length} articulos visibles de ${products.length} en total · ${dataSource === "supabase" ? "Conectado a Supabase" : "Datos locales"}`;
  grid.innerHTML = list.map(product => {
    const isFavorite = favoriteIds.has(product.id);
    return `
      <article class="card">
        <button class="card__media" data-id="${product.id}" aria-label="Ver detalle de ${escapeHtml(product.name)}">
          <img src="${product.image || ""}" alt="${escapeHtml(product.name)}" loading="lazy">
        </button>
        <div class="card__body">
          <div class="card__topline">
            <span>${escapeHtml(product.subcategory || product.category || "Coleccion")}</span>
            <span class="price">${escapeHtml(product.price || "Consultar")}</span>
          </div>
          <h3>${escapeHtml(product.name)}</h3>
          <div class="cardActions">
            <button class="favoriteLink ${isFavorite ? "active" : ""}" data-favorite-id="${product.id}">${isFavorite ? "En favoritos" : "Agregar a favoritos"}</button>
            <button class="editLink" data-edit-id="${product.id}">Editar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
  grid.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => openDetail(button.dataset.id));
  });
  grid.querySelectorAll("[data-edit-id]").forEach(button => {
    button.addEventListener("click", () => openEdit(button.dataset.editId));
  });
  grid.querySelectorAll("[data-favorite-id]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteId));
  });
}

function detailLine(label, value) {
  const clean = String(value || "").trim();
  return clean ? `<p><strong>${label}:</strong> ${escapeHtml(clean)}</p>` : "";
}

function openDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const gallery = productImages(product);
  const isFavorite = favoriteIds.has(product.id);
  const thumbnails = gallery.length > 1 ? `
    <div class="detailThumbs" aria-label="Imagenes de referencia">
      ${gallery.map((src, index) => `
        <button class="${index === 0 ? "active" : ""}" type="button" data-gallery-src="${escapeHtml(src)}">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} referencia ${index + 1}">
        </button>
      `).join("")}
    </div>
  ` : "";
  detailContent.innerHTML = `
    <div class="detail">
      <div class="detailMedia">
        <img id="detailMainImage" src="${gallery[0] || ""}" alt="${escapeHtml(product.name)}">
        ${thumbnails}
      </div>
      <div class="detailInfo">
        <p class="eyebrow">${escapeHtml(product.category || "")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        ${detailLine("Subcategoria", product.subcategory)}
        ${detailLine("Precio", product.price)}
        ${detailLine("Disponibilidad", product.stock)}
        ${detailLine("Medidas", product.dimensions)}
        ${detailLine("Descripcion", product.description)}
        <div class="detailActions">
          <button class="favoriteStar ${isFavorite ? "active" : ""}" type="button" data-favorite-id="${product.id}" aria-label="${isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}">★</button>
          <button class="secondaryAction detailEditButton" type="button" data-edit-id="${product.id}">Editar articulo</button>
        </div>
      </div>
    </div>
  `;
  detailContent.querySelectorAll("[data-gallery-src]").forEach(button => {
    button.addEventListener("click", () => {
      detailContent.querySelector("#detailMainImage").src = button.dataset.gallerySrc;
      detailContent.querySelectorAll("[data-gallery-src]").forEach(item => item.classList.toggle("active", item === button));
    });
  });
  detailContent.querySelector("[data-edit-id]").addEventListener("click", () => openEdit(product.id));
  detailContent.querySelector("[data-favorite-id]").addEventListener("click", () => {
    toggleFavorite(product.id);
    openDetail(product.id);
  });
  if (!dialog.open) dialog.showModal();
}

function groupedFavorites(favorites) {
  const groups = new Map();
  favorites.forEach(product => {
    const category = product.category || "Sin categoria";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
}

async function buildFavoritesPdf(favorites) {
  const pages = await drawGroupedFavoritesPages(groupedFavorites(favorites));
  return assembleImagePdf(pages);
}

async function drawGroupedFavoritesPages(groups) {
  const pages = [];
  let canvas = createFavoritesCanvas();
  let ctx = canvas.getContext("2d");
  let pageNumber = 1;
  let y = await drawPdfHeader(ctx, pageNumber);
  const newPage = async () => {
    pages.push(canvas.toDataURL("image/jpeg", 0.92));
    canvas = createFavoritesCanvas();
    ctx = canvas.getContext("2d");
    pageNumber += 1;
    y = await drawPdfHeader(ctx, pageNumber);
  };
  for (const [category, items] of groups) {
    if (y > 1390) await newPage();
    drawCategorySubtitle(ctx, category, y);
    y += 70;
    for (let i = 0; i < items.length; i += 2) {
      if (y > 1340) await newPage();
      await drawPdfFavoriteCard(ctx, items[i], 110, y);
      if (items[i + 1]) await drawPdfFavoriteCard(ctx, items[i + 1], 640, y);
      y += 395;
    }
  }
  pages.push(canvas.toDataURL("image/jpeg", 0.92));
  return pages;
}

function createFavoritesCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(74, 74, 1092, 1606);
  ctx.strokeStyle = "#ded9d1";
  ctx.lineWidth = 2;
  ctx.strokeRect(74, 74, 1092, 1606);
  return canvas;
}

async function drawPdfHeader(ctx, pageNumber) {
  const logo = await loadDrawableImage("assets/logo-glam.png");
  if (logo) drawContainedImage(ctx, logo, 100, 98, 260, 120);
  ctx.fillStyle = "#171412";
  ctx.font = "48px Georgia, serif";
  ctx.fillText("QUIERO ESTO PARA MI EVENTO", 100, 270);
  ctx.fillStyle = "#746f68";
  ctx.font = "22px Segoe UI, Arial";
  ctx.fillText(`Seleccion de favoritos · Pagina ${pageNumber}`, 100, 314);
  ctx.strokeStyle = "#b9a16f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(100, 350);
  ctx.lineTo(1140, 350);
  ctx.stroke();
  return 405;
}

function drawCategorySubtitle(ctx, category, y) {
  ctx.fillStyle = "#f7f4ef";
  ctx.fillRect(100, y, 1040, 48);
  ctx.strokeStyle = "#ded9d1";
  ctx.strokeRect(100, y, 1040, 48);
  ctx.fillStyle = "#6a3431";
  ctx.font = "bold 25px Segoe UI, Arial";
  ctx.fillText(category.toUpperCase(), 122, y + 32);
}

async function drawPdfFavoriteCard(ctx, product, x, y) {
  const cardW = 490;
  const cardH = 340;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, cardW, cardH);
  ctx.strokeStyle = "#ded9d1";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, cardW, cardH);
  const image = await loadDrawableImage(product.image);
  if (image) drawContainedImage(ctx, image, x + 22, y + 22, cardW - 44, 230);
  ctx.fillStyle = "#171412";
  ctx.font = "bold 28px Segoe UI, Arial";
  wrapCanvasText(ctx, product.name, x + 28, y + 292, cardW - 56, 32, 2);
}
