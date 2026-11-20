-- One database, separate schemas per app so each app only touches its own tables.

-- CMS: the editable source of truth.
CREATE SCHEMA IF NOT EXISTS cms;
CREATE TABLE IF NOT EXISTS cms.pages (
  id          serial PRIMARY KEY,
  path        text NOT NULL UNIQUE,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Site: the published copy the public site reads from.
CREATE SCHEMA IF NOT EXISTS site;
CREATE TABLE IF NOT EXISTS site.pages (
  path          text PRIMARY KEY,
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  published_at  timestamptz NOT NULL DEFAULT now()
);
