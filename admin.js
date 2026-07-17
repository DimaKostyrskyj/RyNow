const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let resource = "users";
let items = [];
let busy = false;

const labels = {
  users: {
    title: "Пользователи",
    description: "Пользователи, которые хотя бы один раз вошли после подключения Supabase."
  },
  news: {
    title: "Новости",
    description: "Опубликованные новости доступны через API сайта."
  },
  rules: {
    title: "Правила",
    description: "Эти правила отображаются на главной и участвуют в поиске AI."
  },
  knowledge: {
    title: "База знаний",
    description: "Материалы для ответов AI."
  }
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Ошибка ${response.status}`);
  }

  return data;
}

function toast(message, error = false) {
  const element = $("#adminToast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3000);
}

function setLoading(value) {
  busy = value;
  $("#adminLoading").hidden = !value;
  $("#createBtn").disabled = value;
}

function openModal() {
  $("#editModal").classList.add("show");
  $("#editModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal() {
  $("#editModal").classList.remove("show");
  $("#editModal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

$$("[data-close]").forEach(button => {
  button.addEventListener("click", closeModal);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

async function loadOverview() {
  try {
    const data = await api("/api/admin?resource=overview");

    $("#adminContent").hidden = false;
    $("#adminWelcome").textContent =
      `${data.user.username}, полный доступ основателя`;

    $("#countUsers").textContent = data.counts.users;
    $("#countNews").textContent = data.counts.news;
    $("#countRules").textContent = data.counts.rules;
    $("#countKnowledge").textContent = data.counts.knowledge;

    await loadResource("users");
  } catch (error) {
    $("#adminDenied").hidden = false;
    $("#adminDeniedText").textContent = error.message;
    toast(error.message, true);
  }
}

async function refreshCounters() {
  const data = await api("/api/admin?resource=overview");
  $("#countUsers").textContent = data.counts.users;
  $("#countNews").textContent = data.counts.news;
  $("#countRules").textContent = data.counts.rules;
  $("#countKnowledge").textContent = data.counts.knowledge;
}

async function loadResource(nextResource) {
  if (busy) return;

  resource = nextResource;

  $$("[data-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === resource);
  });

  $("#createBtn").hidden = resource === "users";
  $("#resourceTitle").textContent = labels[resource].title;
  $("#resourceDescription").textContent = labels[resource].description;

  setLoading(true);

  try {
    const data = await api(`/api/admin?resource=${resource}`);
    items = data.items || [];
    renderTable();
  } catch (error) {
    $("#tbody").innerHTML =
      `<tr><td colspan="5" class="admin-empty">${escapeHtml(error.message)}</td></tr>`;
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function renderTable() {
  const head = $("#thead");
  const body = $("#tbody");
  body.innerHTML = "";

  if (resource === "users") {
    head.innerHTML =
      "<tr><th>Пользователь</th><th>Роль</th><th>Уровень</th><th>Регистрация</th><th>Действие</th></tr>";

    if (!items.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="admin-empty">Пока нет пользователей. Выйдите и снова войдите через Discord — профиль добавится автоматически.</td></tr>';
      return;
    }

    items.forEach(item => {
      const level = Math.floor(Math.sqrt((item.xp || 0) / 100)) + 1;
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>
          <div class="admin-user-cell">
            <img src="${item.avatar_url || ""}" alt="">
            <div>
              <strong>${escapeHtml(item.username)}</strong>
              <small>${escapeHtml(item.discord_id)}</small>
            </div>
          </div>
        </td>
        <td>
          <select data-role="${item.id}">
            <option ${item.role === "Пользователь" ? "selected" : ""}>Пользователь</option>
            <option ${item.role === "Модератор" ? "selected" : ""}>Модератор</option>
            <option ${item.role === "Основатель" ? "selected" : ""}>Основатель</option>
          </select>
        </td>
        <td>${level}</td>
        <td>${new Date(item.registered_at).toLocaleDateString("ru-RU")}</td>
        <td><button type="button" class="table-action" data-save="${item.id}">Сохранить</button></td>
      `;

      body.appendChild(row);
    });
  } else {
    head.innerHTML =
      "<tr><th>Заголовок</th><th>Статус</th><th>Дата</th><th>Действия</th></tr>";

    if (!items.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="admin-empty">Записей пока нет. Нажмите «Добавить».</td></tr>';
      return;
    }

    items.forEach(item => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.category || "")}</small>
        </td>
        <td>
          <span class="status-pill ${item.published ? "published" : ""}">
            ${item.published ? "Опубликовано" : "Черновик"}
          </span>
        </td>
        <td>${new Date(item.created_at).toLocaleDateString("ru-RU")}</td>
        <td>
          <button type="button" class="table-action" data-edit="${item.id}">Изменить</button>
          <button type="button" class="table-action danger" data-delete="${item.id}">Удалить</button>
        </td>
      `;

      body.appendChild(row);
    });
  }

  bindTableActions();
}

function bindTableActions() {
  $$("[data-save]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.save;
      const role = $(`[data-role="${id}"]`).value;

      button.disabled = true;

      try {
        await api(`/api/admin?resource=users&id=${id}`, {
          method: "PUT",
          body: JSON.stringify({ role, isBanned: false })
        });

        toast("Роль пользователя сохранена");
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  });

  $$("[data-edit]").forEach(button => {
    button.addEventListener("click", () => openEditor(button.dataset.edit));
  });

  $$("[data-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Удалить эту запись?")) return;

      button.disabled = true;

      try {
        await api(`/api/admin?resource=${resource}&id=${button.dataset.delete}`, {
          method: "DELETE"
        });

        await loadResource(resource);
        await refreshCounters();
        toast("Запись удалена");
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

function openEditor(id = null) {
  const item = items.find(entry => entry.id === id);

  $("#editorHeading").textContent = item ? "Редактирование" : "Новая запись";
  $("#editId").value = item?.id || "";
  $("#editTitle").value = item?.title || "";
  $("#editContent").value = item?.content || "";
  $("#editCategory").value = item?.category || "Общие правила";
  $("#editTags").value = (item?.tags || []).join(", ");
  $("#editPublished").checked = item ? item.published : true;

  $("#catField").hidden = resource !== "rules";
  $("#tagsField").hidden = resource !== "knowledge";

  openModal();
  setTimeout(() => $("#editTitle").focus(), 50);
}

$("#createBtn").addEventListener("click", () => openEditor());

$("#editForm").addEventListener("submit", async event => {
  event.preventDefault();

  const id = $("#editId").value;
  const button = $("#saveContentBtn");

  const payload = {
    title: $("#editTitle").value.trim(),
    content: $("#editContent").value.trim(),
    category: $("#editCategory").value.trim(),
    tags: $("#editTags").value.split(",").map(x => x.trim()).filter(Boolean),
    published: $("#editPublished").checked
  };

  button.disabled = true;
  button.textContent = "Сохранение...";

  try {
    await api(`/api/admin?resource=${resource}${id ? `&id=${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });

    closeModal();
    await loadResource(resource);
    await refreshCounters();
    toast(id ? "Изменения сохранены" : "Запись создана");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Сохранить";
  }
});

$$("[data-tab]").forEach(button => {
  button.addEventListener("click", () => loadResource(button.dataset.tab));
});

loadOverview();