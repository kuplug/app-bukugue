/**
 * app.js - logika bersama untuk index.html & ebook.html
 * Semua teks/label diambil dari config.json (pola DonatJS-core: config-driven UI).
 */

const AppState = {
  config: null,
  token: localStorage.getItem("ebook_token") || null,
  user: JSON.parse(localStorage.getItem("ebook_user") || "null"),
};

async function loadConfig() {
  const res = await fetch("config.json", { cache: "no-store" });
  AppState.config = await res.json();
  return AppState.config;
}

function apiUrl(path) {
  return `${AppState.config.api_base}${path}`;
}

async function apiGet(path) {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Gagal memuat data");
  return res.json();
}

async function apiPost(path, body, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth && AppState.token) headers["Authorization"] = `Bearer ${AppState.token}`;
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Terjadi kesalahan");
  return res.json();
}

function setSession(token, user) {
  AppState.token = token;
  AppState.user = user;
  localStorage.setItem("ebook_token", token);
  localStorage.setItem("ebook_user", JSON.stringify(user));
}

function clearSession() {
  AppState.token = null;
  AppState.user = null;
  localStorage.removeItem("ebook_token");
  localStorage.removeItem("ebook_user");
}

function isLoggedIn() {
  return !!AppState.token;
}

/**
 * Inisialisasi tombol Google Sign-In (Google Identity Services).
 * Memanggil onSuccess(user) setelah backend berhasil memverifikasi token.
 */
function initGoogleSignIn(containerId, onSuccess) {
  if (!window.google || !google.accounts) {
    console.warn("Google Identity Services script belum termuat.");
    return;
  }
  google.accounts.id.initialize({
    client_id: AppState.config.auth.google_client_id,
    callback: async (response) => {
      try {
        const data = await apiPost("/api/auth/google", { id_token: response.credential });
        setSession(data.token, data.user);
        onSuccess && onSuccess(data.user);
      } catch (e) {
        alert(`Login gagal: ${e.message}`);
      }
    },
  });
  const el = document.getElementById(containerId);
  if (el) {
    google.accounts.id.renderButton(el, { theme: "outline", size: "large", text: "signin_with" });
  }
}

function renderWhatsappButton(container) {
  const wa = AppState.config.whatsapp;
  if (!wa || !wa.enabled) return;
  const link = document.createElement("a");
  link.className = "wa-button";
  link.target = "_blank";
  link.rel = "noopener";
  link.href = `https://wa.me/${wa.number}?text=${encodeURIComponent(wa.message_template)}`;
  link.textContent = wa.button_text;
  container.appendChild(link);
}

function renderNewsletterForm(container, sourceTag) {
  const nl = AppState.config.newsletter;
  if (!nl || !nl.enabled) return;
  const wrap = document.createElement("div");
  wrap.className = "newsletter-box";
  wrap.innerHTML = `
    <h3>${nl.title}</h3>
    <p>${nl.subtitle}</p>
    <form class="newsletter-form">
      <input type="email" name="email" placeholder="Email kamu" required />
      <input type="text" name="whatsapp" placeholder="No. WhatsApp (opsional)" />
      <button type="submit">${nl.button_text}</button>
    </form>
    <p class="newsletter-status" style="display:none;"></p>
  `;
  container.appendChild(wrap);

  const form = wrap.querySelector("form");
  const status = wrap.querySelector(".newsletter-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const whatsapp = form.whatsapp.value.trim();
    try {
      await apiPost("/api/subscribe", { email, whatsapp, source: sourceTag || "unknown" });
      status.style.display = "block";
      status.textContent = "Terima kasih! Kamu sudah terdaftar.";
      form.reset();
    } catch (err) {
      status.style.display = "block";
      status.textContent = `Gagal: ${err.message}`;
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
