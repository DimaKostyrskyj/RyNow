# RYNOW AI — рабочая авторизация + Discord OAuth2

## Что реализовано

- Регистрация по имени, почте и паролю.
- Вход по имени пользователя или почте.
- Хеширование пароля через bcrypt.
- Авторизация через защищённую HttpOnly cookie.
- PostgreSQL вместо файловой базы.
- Вход и создание аккаунта через Discord.
- Привязка Discord к существующему профилю.
- Отвязка Discord.
- Проверка OAuth `state`.
- Ограничение частоты запросов.
- Поддержка Vercel.

## 1. PostgreSQL

Создайте PostgreSQL-базу в Neon, Supabase или у другого провайдера.

Скопируйте строку подключения вида:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Таблица `users` создаётся автоматически при первом запросе API.
При желании можно выполнить `schema.sql` вручную.

## 2. Discord

Откройте Discord Developer Portal:

1. Создайте **New Application**.
2. В разделе **General Information** скопируйте `Application ID`.
3. В разделе **OAuth2** скопируйте или сбросьте `Client Secret`.
4. В **OAuth2 → Redirects** добавьте:
   - локально: `http://localhost:3000/api/auth/discord/callback`
   - Vercel: `https://ВАШ-ДОМЕН/api/auth/discord/callback`
5. Сохраните изменения.

## 3. Локальный запуск

Скопируйте `.env.example` в `.env` и заполните значения.

```bash
npm install
npm start
```

Откройте:

```text
http://localhost:3000
```

## 4. Настройка Vercel

Vercel → Project → Settings → Environment Variables.

Добавьте:

```text
APP_URL
DATABASE_URL
DATABASE_SSL
JWT_SECRET
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI
NODE_ENV
```

Для Production:

```env
APP_URL=https://ВАШ-ДОМЕН
DATABASE_SSL=true
DISCORD_REDIRECT_URI=https://ВАШ-ДОМЕН/api/auth/discord/callback
NODE_ENV=production
```

После добавления переменных выполните новый Deploy.

## Важно

Не загружайте `.env` в GitHub.

В архиве специально нет `package-lock.json`, чтобы Vercel не использовал внутренние ссылки на чужой npm registry. Файл `.npmrc` принудительно указывает публичный registry npm.
