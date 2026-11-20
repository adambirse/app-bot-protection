-- Least-privilege group roles. Login users (one per app) are made members of these
-- by scripts/create-login-roles.mjs, or by your database provider in production.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cms_app') THEN
    CREATE ROLE cms_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'site_app') THEN
    CREATE ROLE site_app NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA cms FROM PUBLIC;
REVOKE ALL ON SCHEMA site FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA cms FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA site FROM PUBLIC;

-- CMS: manage its own pages, write the publish log, and replace the site's published pages.
GRANT USAGE ON SCHEMA cms TO cms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cms.pages TO cms_app;
GRANT USAGE ON SEQUENCE cms.pages_id_seq TO cms_app;
GRANT SELECT, INSERT ON cms.publish_log TO cms_app;
GRANT USAGE ON SEQUENCE cms.publish_log_id_seq TO cms_app;
GRANT USAGE ON SCHEMA site TO cms_app;
GRANT SELECT, INSERT, DELETE ON site.pages TO cms_app;

-- Site: read published pages only.
GRANT USAGE ON SCHEMA site TO site_app;
GRANT SELECT ON site.pages TO site_app;
