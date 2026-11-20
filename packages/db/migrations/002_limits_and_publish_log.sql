-- Size and format limits enforced by the database as well as the app.
ALTER TABLE cms.pages
  ADD CONSTRAINT cms_pages_path_format CHECK (char_length(path) <= 255 AND path ~ '^/([a-z0-9._~-]+(/[a-z0-9._~-]+)*)?$'),
  ADD CONSTRAINT cms_pages_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  ADD CONSTRAINT cms_pages_body_length CHECK (char_length(body) <= 10000);

ALTER TABLE site.pages
  ADD CONSTRAINT site_pages_path_length CHECK (char_length(path) <= 255),
  ADD CONSTRAINT site_pages_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  ADD CONSTRAINT site_pages_body_length CHECK (char_length(body) <= 10000);

-- Audit record of every publish.
CREATE TABLE cms.publish_log (
  id            bigserial PRIMARY KEY,
  published_at  timestamptz NOT NULL DEFAULT now(),
  published_by  text NOT NULL CHECK (char_length(published_by) <= 200),
  page_count    integer NOT NULL
);
