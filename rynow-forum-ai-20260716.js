
async function loadPublishedRules() {
  try {
    const data = await api("/api/content?type=rules");
    const rules = data.items || [];
    const cards = $$(".rule-category");

    rules.slice(0, cards.length).forEach((rule, index) => {
      const card = cards[index];
      card.querySelector("h3").textContent = rule.title;
      card.querySelector("p").textContent = rule.content;
      const number = card.querySelector(".category-number");
      if (number) number.textContent = String(index + 1).padStart(2, "0");
    });
  } catch (error) {
    console.warn("Не удалось загрузить правила:", error.message);
  }
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let currentUser = null;
let toastTimer = null;

const DEFAULT_SETTINGS = {
  animations: true,
  compactAnswers: false,
  confirmClear: true,
  accentColor: "#ef2917",
  glow: 70
};

const DEMO_ANSWERS = [
  {
    keys: ["pg", "power gaming", "пг"],
    answer: "Power Gaming — нереалистичные действия ради получения игрового преимущества. Например, персонаж игнорирует тяжёлое ранение и продолжает бой без последствий.",
    short: "PG — нереалистичные действия ради преимущества."
  },
  {
    keys: ["dm", "death match", "дм"],
    answer: "Death Match — нанесение урона или убийство игрока без достаточной RP-причины. Конфликт должен иметь понятную игровую предысторию.",
    short: "DM — урон или убийство без достаточной RP-причины."
  },
  {
    keys: ["green zone", "зелён", "грин"],
    answer: "Green Zone — безопасная территория, где обычно запрещены нападения, похищения и провокации. Исключения зависят от правил конкретного проекта.",
    short: "Green Zone — безопасная территория с ограничениями на криминальные действия."
  },
  {
    keys: ["уход", "логаут"],
    answer: "Уход от RP-ситуации запрещён. Нельзя выходить из игры или использовать технические способы, чтобы избежать продолжения начатой ситуации.",
    short: "Нельзя выходить из игры, чтобы избежать RP-ситуации."
  }
];

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function userStorageKey(type) {
  const id = currentUser?.id || "guest";
  return `rynow:${id}:${type}`;
}

function readStorage(type, fallback) {
  try {
    const stored = localStorage.getItem(userStorageKey(type));
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(type, value) {
  localStorage.setItem(userStorageKey(type), JSON.stringify(value));
}

function getHistory() {
  return readStorage("history", []);
}

function getFavorites() {
  return readStorage("favorites", []);
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readStorage("settings", {}) };
}

function getProgress() {
  return {
    xp: 0,
    questions: 0,
    lastActivity: null,
    lastDailyLogin: null,
    ...readStorage("progress", {})
  };
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function levelStartXp(level) {
  return Math.pow(level - 1, 2) * 100;
}

function nextLevelXp(level) {
  return Math.pow(level, 2) * 100;
}

function addXp(amount) {
  if (!currentUser) return;

  const progress = getProgress();
  progress.xp += amount;
  progress.lastActivity = new Date().toISOString();
  writeStorage("progress", progress);
  renderProfile();
}

function registerQuestion(question, answer) {
  if (!currentUser) return;

  const history = getHistory();
  history.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    question,
    answer,
    createdAt: new Date().toISOString()
  });

  writeStorage("history", history.slice(0, 100));

  const progress = getProgress();
  progress.questions += 1;
  progress.xp += 20;
  progress.lastActivity = new Date().toISOString();
  writeStorage("progress", progress);

  renderProfile();
}

function addFavorite(title, content, source = "AI") {
  if (!currentUser) {
    openModal($("#authModal"));
    return false;
  }

  const favorites = getFavorites();
  const existing = favorites.find(item => item.content === content);

  if (existing) {
    showToast("Уже находится в избранном");
    return false;
  }

  favorites.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    title,
    content,
    source,
    createdAt: new Date().toISOString()
  });

  writeStorage("favorites", favorites.slice(0, 100));
  addXp(5);
  showToast("Добавлено в избранное");
  renderProfile();
  return true;
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}


function hexToRgb(hex) {
  const clean = String(hex || "#ef2917").replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map(char => char + char).join("")
    : clean;
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function applyTheme(color, glow) {
  const safeColor = color || "#ef2917";
  const safeGlow = Math.max(0, Math.min(100, Number(glow ?? 70)));
  const rgb = hexToRgb(safeColor);

  document.documentElement.style.setProperty("--user-accent", safeColor);
  document.documentElement.style.setProperty("--user-accent-rgb", `${rgb.r},${rgb.g},${rgb.b}`);
  document.documentElement.style.setProperty("--user-glow", String(safeGlow / 100));

  const colorInput = $("#settingAccentColor");
  const glowInput = $("#settingGlow");
  const colorText = $("#settingAccentHex");
  const glowText = $("#settingGlowValue");

  if (colorInput) colorInput.value = safeColor;
  if (glowInput) glowInput.value = String(safeGlow);
  if (colorText) colorText.textContent = safeColor.toUpperCase();
  if (glowText) glowText.textContent = `${safeGlow}%`;

  $$("[data-color]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.color.toLowerCase() === safeColor.toLowerCase()
    );
  });
}

function showToast(text) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

/* Cursor and reveal animations */
const cursorGlow = $("#cursorGlow");
window.addEventListener("pointermove", event => {
  if (!cursorGlow) return;
  cursorGlow.style.left = `${event.clientX}px`;
  cursorGlow.style.top = `${event.clientY}px`;
});

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  });
}, { threshold: 0.12 });

$$(".reveal").forEach(element => revealObserver.observe(element));

let countersStarted = false;
const stats = $(".stats");

if (stats) {
  const counterObserver = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || countersStarted) return;
    countersStarted = true;

    $$("[data-counter]").forEach(element => {
      const target = Number(element.dataset.counter);
      const startedAt = performance.now();
      const duration = 1200;

      const draw = now => {
        const progress = Math.min((now - startedAt) / duration, 1);
        element.textContent = Math.floor(target * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) requestAnimationFrame(draw);
      };

      requestAnimationFrame(draw);
    });
  }, { threshold: 0.3 });

  counterObserver.observe(stats);
}

$("#menuBtn")?.addEventListener("click", () => $("#nav")?.classList.toggle("open"));

$$(".nav a").forEach(link => {
  link.addEventListener("click", () => $("#nav")?.classList.remove("open"));
});

const sections = $$("main section[id]");
window.addEventListener("scroll", () => {
  let currentSection = "home";

  sections.forEach(section => {
    if (window.scrollY >= section.offsetTop - 180) {
      currentSection = section.id;
    }
  });

  $$(".nav a").forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === `#${currentSection}`);
  });
});

/* Modals */
function openModal(modal) {
  if (!modal) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");

  if (!$$(".modal.show").length) {
    document.body.classList.remove("modal-open");
  }
}

$$("[data-close-modal]").forEach(element => {
  element.addEventListener("click", () => closeModal($("#authModal")));
});

$$("[data-close-profile]").forEach(element => {
  element.addEventListener("click", () => closeModal($("#profileModal")));
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  closeModal($("#authModal"));
  closeModal($("#profileModal"));
});

/* Chat */
const messages = $("#messages");
const chatForm = $("#chatForm");
const chatInput = $("#chatInput");

function addMessage(text, type = "user", favoriteData = null) {
  if (!messages) return;

  const row = document.createElement("div");
  row.className = `message ${type}-message`;

  if (type === "ai") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";
    row.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (type === "ai" && favoriteData) {
    const favoriteButton = document.createElement("button");
    favoriteButton.className = "message-favorite-btn";
    favoriteButton.type = "button";
    favoriteButton.title = "Добавить в избранное";
    favoriteButton.textContent = "☆";

    favoriteButton.addEventListener("click", () => {
      if (addFavorite(favoriteData.title, text, "RYNOW Assistant")) {
        favoriteButton.textContent = "★";
        favoriteButton.classList.add("active");
      }
    });

    bubble.appendChild(favoriteButton);
  }

  row.appendChild(bubble);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

function answerQuestion(question) {
  const normalized = question.toLowerCase();
  const result = DEMO_ANSWERS.find(item =>
    item.keys.some(key => normalized.includes(key))
  );

  const settings = getSettings();
  const answer = result
    ? (settings.compactAnswers ? result.short : result.answer)
    : "В полной версии здесь будет подключён поиск по актуальной базе правил форума.";

  setTimeout(() => {
    addMessage(answer, "ai", { title: question });
    registerQuestion(question, answer);
  }, 450);
}

chatForm?.addEventListener("submit", event => {
  event.preventDefault();

  if (!currentUser) {
    openModal($("#authModal"));
    return;
  }

  const value = chatInput.value.trim();
  if (!value) return;

  addMessage(value);
  chatInput.value = "";
  chatInput.style.height = "auto";
  answerQuestion(value);
});

chatInput?.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 130)}px`;
});

chatInput?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

$$(".suggestions button").forEach(button => {
  button.addEventListener("click", () => {
    if (!currentUser) {
      openModal($("#authModal"));
      return;
    }

    chatInput.value = button.dataset.question;
    chatForm.requestSubmit();
  });
});

$("#clearChatBtn")?.addEventListener("click", () => {
  messages.innerHTML = "";
  addMessage("Чат очищен. Задайте новый вопрос.", "ai");
});

$("#newChatBtn")?.addEventListener("click", () => {
  messages.innerHTML = "";
  addMessage("Новый диалог создан.", "ai");
  showToast("Создан новый диалог");
});

$("#favoriteRuleBtn")?.addEventListener("click", event => {
  const button = event.currentTarget;
  const content = $("#featuredRuleCard p")?.textContent.trim() || "";

  if (addFavorite("Пункт 2.4 — Общие правила", content, "База правил")) {
    button.textContent = "★";
    button.classList.add("active");
  }
});

/* Profile rendering */

function renderProfilePreview() {
  try {
  const avatar = $("#previewAvatar");
  const cover = $("#previewCover");
  const name = $("#previewName");
  const rank = $("#previewRank");
  const questions = $("#previewQuestions");
  const favorites = $("#previewFavorites");
  const level = $("#previewLevel");
  const discordTitle = $("#previewDiscordTitle");
  const discordName = $("#previewDiscordName");
  const discordStatus = $("#previewDiscordStatus");
  const discordRow = $("#previewDiscordRow");

  if (!avatar || !name) return;

  if (!currentUser) {
    avatar.classList.remove("has-image");
    avatar.textContent = "RY";
    name.textContent = "RYNOW_User";
    rank.textContent = "MEMBER · LEVEL 01";
    questions.textContent = "0";
    favorites.textContent = "0";
    level.textContent = "1";
    discordTitle.textContent = "Discord не подключён";
    discordName.textContent = "Войдите в аккаунт";
    discordStatus.textContent = "—";
    discordRow.classList.remove("connected");
    cover.style.backgroundImage = "";
    cover.style.background = "";
    return;
  }

  const progress = typeof getProgress === "function"
    ? getProgress()
    : { xp: 0, questions: 0 };

  const savedFavorites = typeof getFavorites === "function"
    ? getFavorites()
    : [];

  const stats = {
    level: typeof levelFromXp === "function" ? levelFromXp(progress.xp || 0) : 1,
    questions: progress.questions || 0,
    favorites: savedFavorites.length || 0
  };

  if (currentUser.avatar) {
    avatar.classList.add("has-image");
    avatar.innerHTML = `<img src="${currentUser.avatar}" alt="${escapeHtml(currentUser.username)}">`;
  } else {
    avatar.classList.remove("has-image");
    avatar.textContent = currentUser.username.slice(0, 2).toUpperCase();
  }

  if (currentUser.banner) {
    cover.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.44)),url("${currentUser.banner}")`;
  } else if (currentUser.accentColor) {
    cover.style.background =
      `linear-gradient(135deg,#${Number(currentUser.accentColor).toString(16).padStart(6,"0")},#230000)`;
  }

  name.textContent = currentUser.username;
  rank.textContent =
    `${currentUser.role || "MEMBER"} · LEVEL ${String(stats.level || 1).padStart(2, "0")}`;
  questions.textContent = stats.questions || 0;
  favorites.textContent = stats.favorites || 0;
  level.textContent = stats.level || 1;
  discordTitle.textContent = "Discord подключён";
  discordName.textContent = currentUser.discordUsername || currentUser.username;
  discordStatus.textContent = "✓";
  discordRow.classList.add("connected");
  } catch (error) {
    console.warn("Profile preview render failed:", error);
  }
}

function renderProfile() {
  const loginButton = $("#loginBtn");
  const profileButton = $("#profileBtn");

  if (!currentUser) {
    if (loginButton) loginButton.style.display = "";
    if (profileButton) {
      profileButton.innerHTML = '<span class="status-dot"></span> Профиль';
    }
    renderProfilePreview();
    return;
  }

  if (loginButton) loginButton.style.display = "none";

  if (profileButton) {
    const avatar = currentUser.avatar
      ? `<img class="user-avatar-small" src="${currentUser.avatar}" alt="">`
      : '<span class="status-dot"></span>';

    profileButton.innerHTML = `${avatar}${escapeHtml(currentUser.username)}`;
  }

  const avatar = $("#profileAvatar");
  if (avatar) {
    if (currentUser.avatar) {
      avatar.classList.add("has-image");
      avatar.innerHTML = `<img src="${currentUser.avatar}" alt="${escapeHtml(currentUser.username)}">`;
    } else {
      avatar.classList.remove("has-image");
      avatar.textContent = currentUser.username.slice(0, 2).toUpperCase();
    }
  }

  $("#profileName").textContent = currentUser.username;
  $("#profileDiscordId").textContent = `Discord ID: ${currentUser.id}`;
  $("#profileDiscordStatus").textContent = currentUser.username;
  $("#profileRole").textContent = currentUser.role || (currentUser.isFounder ? "Основатель" : "Пользователь");
  $("#profileEmail").textContent = currentUser.email || "Discord";

  const founderBadge = $("#founderBadge");
  const adminPanelLink = $("#adminPanelLink");

  founderBadge.hidden = !currentUser.isFounder;
  adminPanelLink.hidden = !currentUser.isFounder;
  adminPanelLink.classList.toggle("show", Boolean(currentUser.isFounder));

  const history = getHistory();
  const favorites = getFavorites();
  const progress = getProgress();
  const level = levelFromXp(progress.xp);
  const startXp = levelStartXp(level);
  const targetXp = nextLevelXp(level);
  const levelProgress = Math.max(0, Math.min(100, ((progress.xp - startXp) / (targetXp - startXp)) * 100));

  $("#profileLevel").textContent = level;
  $("#profileXpText").textContent = `${progress.xp - startXp} / ${targetXp - startXp} XP`;
  $("#profileXpBar").style.width = `${levelProgress}%`;
  $("#profileQuestions").textContent = progress.questions;
  $("#profileFavorites").textContent = favorites.length;
  $("#profileLastActivity").textContent = formatDate(progress.lastActivity);
  $("#historyCountBadge").textContent = history.length;
  $("#favoritesCountBadge").textContent = favorites.length;

  renderHistory(history);
  renderFavorites(favorites);
  loadSettingsControls();
  renderProfilePreview();
}

function renderHistory(history = getHistory()) {
  const list = $("#profileHistoryList");
  if (!list) return;

  list.innerHTML = "";

  if (!history.length) {
    list.innerHTML = '<div class="profile-list-empty">История пока пуста.</div>';
    return;
  }

  history.forEach(item => {
    const row = document.createElement("div");
    row.className = "profile-list-item";

    row.innerHTML = `
      <div class="profile-list-icon">⌁</div>
      <div class="profile-list-copy">
        <strong>${escapeHtml(item.question)}</strong>
        <p>${escapeHtml(item.answer)}</p>
        <small>${formatDate(item.createdAt)}</small>
      </div>
      <button class="profile-list-remove" type="button" title="Удалить">×</button>
    `;

    row.querySelector(".profile-list-remove").addEventListener("click", () => {
      writeStorage("history", getHistory().filter(entry => entry.id !== item.id));
      renderProfile();
    });

    list.appendChild(row);
  });
}

function renderFavorites(favorites = getFavorites()) {
  const list = $("#profileFavoritesList");
  if (!list) return;

  list.innerHTML = "";

  if (!favorites.length) {
    list.innerHTML = '<div class="profile-list-empty">Добавляйте ответы и правила с помощью звёздочки.</div>';
    return;
  }

  favorites.forEach(item => {
    const row = document.createElement("div");
    row.className = "profile-list-item";

    row.innerHTML = `
      <div class="profile-list-icon">★</div>
      <div class="profile-list-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.content)}</p>
        <small>${escapeHtml(item.source)} · ${formatDate(item.createdAt)}</small>
      </div>
      <button class="profile-list-remove" type="button" title="Удалить">×</button>
    `;

    row.querySelector(".profile-list-remove").addEventListener("click", () => {
      writeStorage("favorites", getFavorites().filter(entry => entry.id !== item.id));
      renderProfile();
    });

    list.appendChild(row);
  });
}

$$("[data-profile-tab]").forEach(button => {
  button.addEventListener("click", () => {
    $$("[data-profile-tab]").forEach(tab => tab.classList.remove("active"));
    $$("[data-profile-panel]").forEach(panel => panel.classList.remove("active"));

    button.classList.add("active");
    $(`[data-profile-panel="${button.dataset.profileTab}"]`)?.classList.add("active");
  });
});

$("#clearHistoryBtn")?.addEventListener("click", () => {
  const settings = getSettings();

  if (settings.confirmClear && !window.confirm("Очистить всю историю запросов?")) {
    return;
  }

  writeStorage("history", []);
  renderProfile();
  showToast("История очищена");
});

function loadSettingsControls() {
  const settings = getSettings();

  $("#settingAnimations").checked = settings.animations;
  $("#settingCompact").checked = settings.compactAnswers;
  $("#settingConfirmClear").checked = settings.confirmClear;

  document.body.classList.toggle("animations-off", !settings.animations);
  applyTheme(settings.accentColor, settings.glow);
}

$("#saveSettingsBtn")?.addEventListener("click", () => {
  const settings = {
    animations: $("#settingAnimations").checked,
    compactAnswers: $("#settingCompact").checked,
    confirmClear: $("#settingConfirmClear").checked,
    accentColor: $("#settingAccentColor").value,
    glow: Number($("#settingGlow").value)
  };

  writeStorage("settings", settings);
  loadSettingsControls();
  showToast("Настройки сохранены");
});

/* Authentication */
async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "include"
    });

    const data = await response.json();
    currentUser = data.user || null;

    if (currentUser) {
      const progress = getProgress();
      const today = new Date().toISOString().slice(0, 10);

      if (progress.lastDailyLogin !== today) {
        progress.lastDailyLogin = today;
        progress.xp += 10;
        progress.lastActivity = new Date().toISOString();
        writeStorage("progress", progress);
      }
    }
  } catch {
    currentUser = null;
  }

  renderProfile();
  loadSettingsControls();
}

$("#loginBtn")?.addEventListener("click", () => openModal($("#authModal")));

$("#profileBtn")?.addEventListener("click", () => {
  if (!currentUser) {
    openModal($("#authModal"));
    return;
  }

  renderProfile();
  openModal($("#profileModal"));
});

$("#openProfileDemo")?.addEventListener("click", () => {
  if (!currentUser) {
    openModal($("#authModal"));
    return;
  }

  renderProfile();
  openModal($("#profileModal"));
});

$("#ctaRegister")?.addEventListener("click", () => openModal($("#authModal")));

$("#discordBtn")?.addEventListener("click", () => {
  window.location.href = "/api/auth/discord";
});

$("#logoutBtn")?.addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });

    currentUser = null;
    closeModal($("#profileModal"));
    renderProfile();
    showToast("Вы вышли из аккаунта");
  } catch {
    showToast("Не удалось выйти из аккаунта");
  }
});

const params = new URLSearchParams(window.location.search);
const authResult = params.get("auth");

const authMessages = {
  success: "Вход через Discord выполнен",
  cancelled: "Авторизация Discord отменена",
  invalid_state: "Не удалось проверить Discord-запрос",
  discord_error: "Ошибка Discord OAuth",
  config_error: "Не настроены секреты Discord"
};

if (authResult) {
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
  setTimeout(() => showToast(authMessages[authResult] || "Неизвестный результат авторизации"), 200);
}

loadCurrentUser();


async function loadPublishedNews() {
  const grid = $("#newsGrid");
  if (!grid) return;

  try {
    const response = await fetch("/api/content?type=news", {
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Не удалось загрузить новости");
    }

    const news = data.items || [];
    grid.innerHTML = "";

    if (!news.length) {
      grid.innerHTML = `
        <div class="news-empty">
          <div>
            <strong>Новостей пока нет</strong>
            <p>Опубликуйте первую новость через админ-панель.</p>
          </div>
        </div>
      `;
      return;
    }

    news.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = `news-card glass-card reveal ${index % 3 === 1 ? "delay-1" : index % 3 === 2 ? "delay-2" : ""}`;

      const date = new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date(item.created_at));

      card.innerHTML = `
        <span>НОВОСТЬ</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.content)}</p>
        <div class="news-meta">
          <time>${date}</time>
          <span>RYNOW</span>
        </div>
      `;

      grid.appendChild(card);
      if (typeof revealObserver !== "undefined") {
        revealObserver.observe(card);
      } else {
        card.classList.add("visible");
      }
    });
  } catch (error) {
    grid.innerHTML = `
      <div class="news-empty">
        <div>
          <strong>Не удалось загрузить новости</strong>
          <p>${escapeHtml(error.message)}</p>
        </div>
      </div>
    `;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadPublishedNews, { once: true });
} else {
  loadPublishedNews();
}


$("#settingAccentColor")?.addEventListener("input", event => {
  const settings = getSettings();
  applyTheme(event.target.value, settings.glow);
});

$("#settingGlow")?.addEventListener("input", event => {
  const settings = getSettings();
  applyTheme($("#settingAccentColor").value, Number(event.target.value));
});

$$("[data-color]").forEach(button => {
  button.addEventListener("click", () => {
    $("#settingAccentColor").value = button.dataset.color;
    applyTheme(button.dataset.color, Number($("#settingGlow").value));
  });
});

$("#resetThemeBtn")?.addEventListener("click", () => {
  $("#settingAccentColor").value = "#ef2917";
  $("#settingGlow").value = "70";
  applyTheme("#ef2917", 70);
  showToast("Стиль сброшен. Нажмите «Сохранить»");
});


/* ---------------- Forum-grounded AI ---------------- */

const serverSelect = $("#serverSelect");
const selectedServerForum = $("#selectedServerForum");
const answerPanelTitle = $(".answer-panel h3");
const featuredRuleCard = $("#featuredRuleCard");
const confidenceValue = $(".confidence strong");
const confidenceBar = $(".confidence div i");
const aiSourceList = $("#aiSourceList");
const answerSourceLink = $("#answerSourceLink");

const serverDirectory = {
  downtown: {
    name: "Downtown",
    forumUrl: "https://forum.gta5rp.com/forums/server-no1-downtown.14/"
  }
};

serverSelect?.addEventListener("change", () => {
  const server = serverDirectory[serverSelect.value];
  if (!server) return;

  selectedServerForum.href = server.forumUrl;
  showToast(`Выбран сервер ${server.name}`);
});

function setAiLoading(loading) {
  const sendButton = $(".send-btn");
  if (!sendButton) return;

  sendButton.disabled = loading;
  sendButton.textContent = loading ? "…" : "➤";
}

function renderForumSources(sources) {
  if (!aiSourceList) return;

  aiSourceList.innerHTML = "";

  if (!sources?.length) {
    aiSourceList.innerHTML = "<span>ТОЧНЫЙ ИСТОЧНИК НЕ НАЙДЕН</span>";
    if (answerSourceLink) answerSourceLink.href = "#rules";
    return;
  }

  sources.forEach((source, index) => {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `
      <strong>${escapeHtml(source.heading)}</strong>
      <small>${escapeHtml(source.title)}</small>
      <b>↗</b>
    `;
    aiSourceList.appendChild(link);

    if (index === 0 && answerSourceLink) {
      answerSourceLink.href = source.url;
      answerSourceLink.target = "_blank";
      answerSourceLink.rel = "noopener noreferrer";
    }
  });
}

function updateAnswerPanel(data) {
  const primarySource = data.sources?.[0];

  if (answerPanelTitle) {
    answerPanelTitle.textContent = primarySource?.title || `Сервер ${data.server.name}`;
  }

  if (featuredRuleCard) {
    const label = featuredRuleCard.querySelector("span");
    const text = featuredRuleCard.querySelector("p");

    if (label) {
      label.textContent = primarySource?.heading?.toUpperCase() || "ОТВЕТ ФОРУМА";
    }

    if (text) {
      text.textContent = primarySource?.excerpt || data.answer;
    }
  }

  if (confidenceValue) {
    confidenceValue.textContent = `${data.confidence || 0}%`;
  }

  if (confidenceBar) {
    confidenceBar.style.width = `${data.confidence || 0}%`;
  }

  renderForumSources(data.sources);
}

async function askForum(question) {
  setAiLoading(true);

  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serverId: serverSelect?.value || "downtown",
        question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Не удалось получить ответ");
    }

    addMessage(data.answer, "ai", {
      title: question
    });

    updateAnswerPanel(data);

    if (typeof registerQuestion === "function") {
      await registerQuestion(question, data.answer);
    }
  } catch (error) {
    addMessage(
      `Не удалось получить данные форума: ${error.message}`,
      "ai"
    );
    showToast(error.message);
  } finally {
    setAiLoading(false);
  }
}

/*
 * Старый обработчик формы удаляется клонированием формы.
 * Это гарантирует, что вопрос отправляется только в форумный API.
 */
const oldChatForm = $("#chatForm");

if (oldChatForm) {
  const newChatForm = oldChatForm.cloneNode(true);
  oldChatForm.replaceWith(newChatForm);

  const forumChatInput = $("#chatInput", newChatForm);

  newChatForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!currentUser) {
      openModal($("#authModal"));
      return;
    }

    const question = forumChatInput.value.trim();
    if (!question) return;

    addMessage(question);
    forumChatInput.value = "";
    forumChatInput.style.height = "auto";
    askForum(question);
  });

  forumChatInput.addEventListener("input", () => {
    forumChatInput.style.height = "auto";
    forumChatInput.style.height =
      `${Math.min(forumChatInput.scrollHeight, 130)}px`;
  });

  forumChatInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      newChatForm.requestSubmit();
    }
  });

  $$(".suggestions button").forEach(button => {
    const replacement = button.cloneNode(true);
    button.replaceWith(replacement);

    replacement.addEventListener("click", () => {
      if (!currentUser) {
        openModal($("#authModal"));
        return;
      }

      forumChatInput.value = replacement.dataset.question || replacement.textContent;
      newChatForm.requestSubmit();
    });
  });
}
