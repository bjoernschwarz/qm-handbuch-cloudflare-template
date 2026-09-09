declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TEMPLATE_ASSETS: R2Bucket;
    QM_SINGLE_TENANT: string;
  }
}
