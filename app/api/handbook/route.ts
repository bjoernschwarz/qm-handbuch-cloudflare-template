import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import sanitizeHtml from "sanitize-html";

type Role = "owner" | "editor" | "viewer";
type User = { id: string; email: string };
type Context = { practiceId: string; role: Role; user: User };
type PageNode = { id: string; title: string; depth: number; body: string; children: PageNode[] };
type TemplatePageRow = { id: string; parentSourceId: string | null; title: string; depth: number; body: string; sortOrder: number };
type TemplateAssetInput = { id: string; title: string; mime: string; data?: string; externalUrl?: string };
type TemplatePackage = { format: "heilmittel-qm-template"; version: number; rootPageId: string; pages: TemplatePageRow[]; assets: TemplateAssetInput[] };
const SOURCE_CONTENT = "__QM_SOURCE_ADF__";
const HTML_CONTENT = "__QM_RICH_HTML__";

function buildTree(rows: TemplatePageRow[], rootPageId: string, includeBodies: boolean): PageNode | null {
  const nodes = new Map(rows.map((row) => [row.id, { id: row.id, title: row.title, depth: row.depth, body: includeBodies ? row.body : "", children: [] as PageNode[] }]));
  for (const row of rows) {
    if (!row.parentSourceId) continue;
    const parent = nodes.get(row.parentSourceId);
    const child = nodes.get(row.id);
    if (parent && child) parent.children.push(child);
  }
  return nodes.get(rootPageId) ?? nodes.get(rows[0]?.id ?? "") ?? null;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validatePackage(value: unknown): TemplatePackage {
  if (!value || typeof value !== "object") throw new Error("INVALID_TEMPLATE_PACKAGE");
  const candidate = value as Partial<TemplatePackage>;
  if (candidate.format !== "heilmittel-qm-template" || candidate.version !== 1 || typeof candidate.rootPageId !== "string" || !Array.isArray(candidate.pages) || !Array.isArray(candidate.assets)) throw new Error("INVALID_TEMPLATE_PACKAGE");
  if (candidate.pages.length < 1 || candidate.pages.length > 1000 || candidate.assets.length > 500) throw new Error("INVALID_TEMPLATE_PACKAGE");
  for (const page of candidate.pages) {
    if (!page || typeof page.id !== "string" || typeof page.title !== "string" || typeof page.body !== "string" || typeof page.depth !== "number" || typeof page.sortOrder !== "number") throw new Error("INVALID_TEMPLATE_PACKAGE");
  }
  for (const asset of candidate.assets) {
    if (!asset || typeof asset.id !== "string" || typeof asset.title !== "string" || typeof asset.mime !== "string") throw new Error("INVALID_TEMPLATE_PACKAGE");
    const hasData = typeof asset.data === "string" && asset.data.length > 0;
    const hasExternalUrl = typeof asset.externalUrl === "string" && asset.externalUrl.startsWith("https://");
    if (hasData === hasExternalUrl) throw new Error("INVALID_TEMPLATE_PACKAGE");
  }
  return candidate as TemplatePackage;
}

async function currentUser(): Promise<User> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  if (userId && email) return { id: userId, email: email.toLowerCase() };

  // Cloudflare Access validates the session before the request reaches this
  // Worker and forwards the authenticated address in this header.
  const accessEmail = requestHeaders.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (accessEmail) return { id: `cloudflare-access:${accessEmail}`, email: accessEmail };

  if (process.env.NODE_ENV !== "production") return { id: "local-owner", email: "praxisleitung@beispiel.de" };
  throw new Error("AUTH_REQUIRED");
}

function errorStatus(message: string) {
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "NOT_INVITED") return 403;
  return 500;
}

async function ensureSchema() {
  const db = env.DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS practices (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS practice_members (practice_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_members_practice_user ON practice_members(practice_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_practice_members_user_id ON practice_members(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_practice_members_practice_email ON practice_members(practice_id, email)"),
    db.prepare("CREATE TABLE IF NOT EXISTS practice_profiles (practice_id TEXT PRIMARY KEY, contact_name TEXT NOT NULL DEFAULT '', qm_responsible TEXT NOT NULL DEFAULT '', logo_text TEXT NOT NULL DEFAULT 'QM', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS practice_invitations (id TEXT PRIMARY KEY, practice_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', invited_by TEXT NOT NULL, created_at TEXT NOT NULL, accepted_at TEXT)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_invitations_practice_email ON practice_invitations(practice_id, email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_practice_invitations_email_status ON practice_invitations(email, status)"),
    db.prepare("CREATE TABLE IF NOT EXISTS handbook_pages (id TEXT PRIMARY KEY, practice_id TEXT NOT NULL, source_page_id TEXT NOT NULL, parent_source_id TEXT, title TEXT NOT NULL, source_content TEXT NOT NULL, edited_content TEXT NOT NULL, published_content TEXT, status TEXT NOT NULL DEFAULT 'draft', source_revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, updated_by TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_handbook_pages_practice_source ON handbook_pages(practice_id, source_page_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_handbook_pages_practice_status ON handbook_pages(practice_id, status)"),
    db.prepare("CREATE TABLE IF NOT EXISTS template_settings (practice_id TEXT PRIMARY KEY, root_page_id TEXT NOT NULL, package_version INTEGER NOT NULL, installed_at TEXT NOT NULL, installed_by TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS template_pages (practice_id TEXT NOT NULL, id TEXT NOT NULL, parent_source_id TEXT, title TEXT NOT NULL, depth INTEGER NOT NULL, body TEXT NOT NULL, sort_order INTEGER NOT NULL, PRIMARY KEY(practice_id, id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_template_pages_practice_order ON template_pages(practice_id, sort_order)"),
    db.prepare("CREATE TABLE IF NOT EXISTS template_assets (practice_id TEXT NOT NULL, id TEXT NOT NULL, r2_key TEXT, external_url TEXT, title TEXT NOT NULL, mime TEXT NOT NULL, PRIMARY KEY(practice_id, id))"),
  ]);
}

async function getContext(): Promise<Context> {
  await ensureSchema();
  const user = await currentUser();
  const now = new Date().toISOString();
  let member = await env.DB.prepare("SELECT practice_id AS practiceId, role FROM practice_members WHERE user_id = ? LIMIT 1")
    .bind(user.id).first<{ practiceId: string; role: Role }>();

  if (!member) {
    const invitation = await env.DB.prepare("SELECT id, practice_id AS practiceId, role FROM practice_invitations WHERE LOWER(email) = ? AND status = 'pending' ORDER BY created_at LIMIT 1")
      .bind(user.email).first<{ id: string; practiceId: string; role: "editor" | "viewer" }>();
    if (invitation) {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO practice_members (practice_id, user_id, email, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(practice_id, user_id) DO UPDATE SET email = excluded.email, role = excluded.role")
          .bind(invitation.practiceId, user.id, user.email, invitation.role, now),
        env.DB.prepare("UPDATE practice_invitations SET status = 'accepted', accepted_at = ? WHERE id = ?").bind(now, invitation.id),
      ]);
      member = { practiceId: invitation.practiceId, role: invitation.role };
    } else {
      if (env.QM_SINGLE_TENANT === "true") {
        const existingPractice = await env.DB.prepare("SELECT id FROM practices LIMIT 1").first<{ id: string }>();
        if (existingPractice) throw new Error("NOT_INVITED");
      }
      const practiceId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO practices (id, owner_user_id, name, created_at) VALUES (?, ?, ?, ?)").bind(practiceId, user.id, "Meine Praxis", now),
        env.DB.prepare("INSERT INTO practice_profiles (practice_id, contact_name, qm_responsible, logo_text, updated_at) VALUES (?, '', '', 'QM', ?)").bind(practiceId, now),
        env.DB.prepare("INSERT INTO practice_members (practice_id, user_id, email, role, created_at) VALUES (?, ?, ?, 'owner', ?)").bind(practiceId, user.id, user.email, now),
      ]);
      member = { practiceId, role: "owner" };
    }
  }
  return { ...member, user };
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function sanitizeContent(content: string) {
  if (!content.startsWith(HTML_CONTENT)) return content;
  const fragment = content.slice(HTML_CONTENT.length);
  const safe = sanitizeHtml(fragment, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "figure", "figcaption", "section", "details", "summary", "time", "s", "u", "sub", "sup"],
    allowedAttributes: {
      "*": ["class", "title", "style"],
      a: ["href", "target", "rel", "class", "title"],
      img: ["src", "alt", "title", "loading", "width", "height", "class"],
      th: ["colspan", "rowspan", "class"],
      td: ["colspan", "rowspan", "class"],
    },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "flex-basis": [/^\d+(?:\.\d+)?%$/],
        color: [/^#[0-9a-f]{3,8}$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i],
      },
    },
  });
  return `${HTML_CONTENT}${safe}`;
}

function logoText(value: string | undefined, name: string) {
  const supplied = (value ?? "").replace(/[^A-Za-zÄÖÜäöüß0-9]/g, "").slice(0, 3).toUpperCase();
  if (supplied) return supplied;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return initials || "QM";
}

async function handbookResponse(context: Context, includeLibrary = false) {
  const pageQuery = context.role === "viewer"
    ? "SELECT id, source_page_id AS sourcePageId, parent_source_id AS parentSourceId, title, source_content AS sourceContent, published_content AS editedContent, published_content AS publishedContent, 'published' AS status, source_revision AS sourceRevision, created_at AS createdAt, updated_at AS updatedAt, published_at AS publishedAt FROM handbook_pages WHERE practice_id = ? AND published_content IS NOT NULL AND status IN ('published', 'revision') ORDER BY created_at"
    : "SELECT id, source_page_id AS sourcePageId, parent_source_id AS parentSourceId, title, source_content AS sourceContent, edited_content AS editedContent, published_content AS publishedContent, status, source_revision AS sourceRevision, created_at AS createdAt, updated_at AS updatedAt, published_at AS publishedAt FROM handbook_pages WHERE practice_id = ? ORDER BY created_at";
  const [practice, pages, members, invitations, templateSettings] = await Promise.all([
    env.DB.prepare("SELECT p.id, p.name, COALESCE(pp.contact_name, '') AS contactName, COALESCE(pp.qm_responsible, '') AS qmResponsible, COALESCE(pp.logo_text, 'QM') AS logoText FROM practices p LEFT JOIN practice_profiles pp ON pp.practice_id = p.id WHERE p.id = ?").bind(context.practiceId).first(),
    env.DB.prepare(pageQuery).bind(context.practiceId).all(),
    context.role === "owner" ? env.DB.prepare("SELECT user_id AS userId, email, role, created_at AS createdAt FROM practice_members WHERE practice_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, email").bind(context.practiceId).all() : Promise.resolve({ results: [] }),
    context.role === "owner" ? env.DB.prepare("SELECT id, email, role, status, created_at AS createdAt FROM practice_invitations WHERE practice_id = ? AND status = 'pending' ORDER BY created_at DESC").bind(context.practiceId).all() : Promise.resolve({ results: [] }),
    env.DB.prepare("SELECT root_page_id AS rootPageId, package_version AS packageVersion, installed_at AS installedAt FROM template_settings WHERE practice_id = ?").bind(context.practiceId).first<{ rootPageId: string; packageVersion: number; installedAt: string }>(),
  ]);
  let library: PageNode | null | undefined;
  let assets: Record<string, { src: string; title: string; mime: string }> | undefined;
  if (includeLibrary && templateSettings) {
    const [templatePages, templateAssets] = await Promise.all([
      env.DB.prepare("SELECT id, parent_source_id AS parentSourceId, title, depth, body, sort_order AS sortOrder FROM template_pages WHERE practice_id = ? ORDER BY sort_order").bind(context.practiceId).all<TemplatePageRow>(),
      env.DB.prepare("SELECT id, title, mime, external_url AS externalUrl FROM template_assets WHERE practice_id = ? ORDER BY id").bind(context.practiceId).all<{ id: string; title: string; mime: string; externalUrl: string | null }>(),
    ]);
    library = buildTree(templatePages.results, templateSettings.rootPageId, context.role !== "viewer");
    assets = Object.fromEntries(templateAssets.results.map((asset) => [asset.id, { src: asset.externalUrl ?? `/api/handbook?asset=${encodeURIComponent(asset.id)}`, title: asset.title, mime: asset.mime }]));
  } else if (includeLibrary) {
    library = null;
    assets = {};
  }
  return json({
    practice,
    role: context.role,
    currentUser: context.user,
    pages: pages.results,
    members: members.results,
    invitations: invitations.results,
    templateInstalled: Boolean(templateSettings),
    templateVersion: templateSettings?.packageVersion ?? null,
    templateInstalledAt: templateSettings?.installedAt ?? null,
    library,
    assets,
  });
}

async function templateAssetResponse(context: Context, assetId: string) {
  const metadata = await env.DB.prepare("SELECT r2_key AS r2Key, external_url AS externalUrl, title, mime FROM template_assets WHERE practice_id = ? AND id = ? LIMIT 1")
    .bind(context.practiceId, assetId).first<{ r2Key: string | null; externalUrl: string | null; title: string; mime: string }>();
  if (!metadata) return json({ error: "ASSET_NOT_FOUND" }, 404);
  if (metadata.externalUrl) return Response.redirect(metadata.externalUrl, 302);
  if (!metadata.r2Key) return json({ error: "ASSET_NOT_FOUND" }, 404);
  const object = await env.TEMPLATE_ASSETS.get(metadata.r2Key);
  if (!object) return json({ error: "ASSET_NOT_FOUND" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": metadata.mime,
      "cache-control": "private, max-age=3600",
      "content-disposition": `inline; filename="${metadata.title.replace(/["\\]/g, "_")}"`,
    },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await getContext();
    const assetId = url.searchParams.get("asset");
    if (assetId) return templateAssetResponse(context, assetId);
    const includeLibrary = url.searchParams.get("includeLibrary") === "1";
    return handbookResponse(context, includeLibrary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: message }, errorStatus(message));
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext();
    if (context.role === "viewer") return json({ error: "FORBIDDEN" }, 403);
    const body = await request.json() as {
      action: "importTemplate" | "copy" | "save" | "publish" | "unpublish" | "archive" | "renamePractice" | "savePractice" | "inviteMember" | "cancelInvite" | "updateMemberRole" | "removeMember";
      id?: string;
      sourcePageId?: string;
      parentSourceId?: string | null;
      title?: string;
      content?: string;
      sourceContent?: string;
      contactName?: string;
      qmResponsible?: string;
      logoText?: string;
      email?: string;
      role?: "editor" | "viewer";
      memberUserId?: string;
      templatePackage?: unknown;
    };
    const now = new Date().toISOString();
    const ownerActions = new Set(["importTemplate", "renamePractice", "savePractice", "inviteMember", "cancelInvite", "updateMemberRole", "removeMember"]);
    if (ownerActions.has(body.action) && context.role !== "owner") return json({ error: "OWNER_REQUIRED" }, 403);

    if (body.action === "importTemplate") {
      const templatePackage = validatePackage(body.templatePackage);
      const uniquePageIds = new Set(templatePackage.pages.map((page) => page.id));
      const uniqueAssetIds = new Set(templatePackage.assets.map((asset) => asset.id));
      if (uniquePageIds.size !== templatePackage.pages.length || uniqueAssetIds.size !== templatePackage.assets.length || !uniquePageIds.has(templatePackage.rootPageId)) return json({ error: "INVALID_TEMPLATE_PACKAGE" }, 400);

      const embeddedAssets = templatePackage.assets.filter((asset) => asset.data);
      for (let index = 0; index < embeddedAssets.length; index += 8) {
        await Promise.all(embeddedAssets.slice(index, index + 8).map(async (asset) => {
          if (!/^[-\w.]+$/.test(asset.id) || !/^[-\w.+/]+$/.test(asset.mime) || !asset.data || asset.data.length > 12_000_000) throw new Error("INVALID_TEMPLATE_PACKAGE");
          const key = `${context.practiceId}/${asset.id}`;
          await env.TEMPLATE_ASSETS.put(key, decodeBase64(asset.data), { httpMetadata: { contentType: asset.mime } });
        }));
      }

      await env.DB.batch([
        env.DB.prepare("DELETE FROM template_pages WHERE practice_id = ?").bind(context.practiceId),
        env.DB.prepare("DELETE FROM template_assets WHERE practice_id = ?").bind(context.practiceId),
      ]);
      const pageStatements = templatePackage.pages.map((page) => env.DB.prepare("INSERT INTO template_pages (practice_id, id, parent_source_id, title, depth, body, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(context.practiceId, page.id.slice(0, 160), page.parentSourceId?.slice(0, 160) ?? null, page.title.slice(0, 300), page.depth, page.body, page.sortOrder));
      const assetStatements = templatePackage.assets.map((asset) => env.DB.prepare("INSERT INTO template_assets (practice_id, id, r2_key, external_url, title, mime) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(context.practiceId, asset.id, asset.data ? `${context.practiceId}/${asset.id}` : null, asset.externalUrl ?? null, asset.title.slice(0, 300), asset.mime));
      for (let index = 0; index < pageStatements.length; index += 50) await env.DB.batch(pageStatements.slice(index, index + 50));
      for (let index = 0; index < assetStatements.length; index += 50) await env.DB.batch(assetStatements.slice(index, index + 50));
      await env.DB.prepare("INSERT INTO template_settings (practice_id, root_page_id, package_version, installed_at, installed_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(practice_id) DO UPDATE SET root_page_id = excluded.root_page_id, package_version = excluded.package_version, installed_at = excluded.installed_at, installed_by = excluded.installed_by")
        .bind(context.practiceId, templatePackage.rootPageId, templatePackage.version, now, context.user.id).run();
    } else if (body.action === "copy" && body.sourcePageId) {
      const sourcePage = await env.DB.prepare("SELECT id, parent_source_id AS parentSourceId, title, body FROM template_pages WHERE practice_id = ? AND id = ? LIMIT 1")
        .bind(context.practiceId, body.sourcePageId).first<{ id: string; parentSourceId: string | null; title: string; body: string }>();
      if (!sourcePage) return json({ error: "UNKNOWN_SOURCE_PAGE" }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO handbook_pages (id, practice_id, source_page_id, parent_source_id, title, source_content, edited_content, status, source_revision, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?) ON CONFLICT(practice_id, source_page_id) DO NOTHING")
        .bind(id, context.practiceId, sourcePage.id, sourcePage.parentSourceId, sourcePage.title, sourcePage.body, SOURCE_CONTENT, now, now, context.user.id).run();
    } else if (body.action === "save" && body.id && body.title && body.content !== undefined) {
      const content = await sanitizeContent(body.content);
      await env.DB.prepare("UPDATE handbook_pages SET title = ?, edited_content = ?, status = CASE WHEN status = 'published' THEN 'revision' ELSE status END, updated_at = ?, updated_by = ? WHERE id = ? AND practice_id = ?")
        .bind(body.title, content, now, context.user.id, body.id, context.practiceId).run();
    } else if (body.action === "publish" && body.id) {
      await env.DB.prepare("UPDATE handbook_pages SET status = 'published', published_content = edited_content, published_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND practice_id = ?")
        .bind(now, now, context.user.id, body.id, context.practiceId).run();
    } else if (body.action === "unpublish" && body.id) {
      await env.DB.prepare("UPDATE handbook_pages SET status = 'revision', updated_at = ?, updated_by = ? WHERE id = ? AND practice_id = ?")
        .bind(now, context.user.id, body.id, context.practiceId).run();
    } else if (body.action === "archive" && body.id) {
      await env.DB.prepare("UPDATE handbook_pages SET status = 'archived', updated_at = ?, updated_by = ? WHERE id = ? AND practice_id = ?")
        .bind(now, context.user.id, body.id, context.practiceId).run();
    } else if ((body.action === "renamePractice" || body.action === "savePractice") && body.title?.trim()) {
      const name = body.title.trim().slice(0, 120);
      await env.DB.batch([
        env.DB.prepare("UPDATE practices SET name = ? WHERE id = ?").bind(name, context.practiceId),
        env.DB.prepare("INSERT INTO practice_profiles (practice_id, contact_name, qm_responsible, logo_text, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(practice_id) DO UPDATE SET contact_name = excluded.contact_name, qm_responsible = excluded.qm_responsible, logo_text = excluded.logo_text, updated_at = excluded.updated_at")
          .bind(context.practiceId, (body.contactName ?? "").trim().slice(0, 120), (body.qmResponsible ?? "").trim().slice(0, 120), logoText(body.logoText, name), now),
      ]);
    } else if (body.action === "inviteMember" && body.email && (body.role === "editor" || body.role === "viewer")) {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "INVALID_EMAIL" }, 400);
      const existing = await env.DB.prepare("SELECT 1 FROM practice_members WHERE practice_id = ? AND LOWER(email) = ? LIMIT 1").bind(context.practiceId, email).first();
      if (existing) return json({ error: "ALREADY_MEMBER" }, 409);
      await env.DB.prepare("INSERT INTO practice_invitations (id, practice_id, email, role, status, invited_by, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(practice_id, email) DO UPDATE SET role = excluded.role, status = 'pending', invited_by = excluded.invited_by, created_at = excluded.created_at, accepted_at = NULL")
        .bind(crypto.randomUUID(), context.practiceId, email, body.role, context.user.id, now).run();
    } else if (body.action === "cancelInvite" && body.id) {
      await env.DB.prepare("UPDATE practice_invitations SET status = 'cancelled' WHERE id = ? AND practice_id = ? AND status = 'pending'").bind(body.id, context.practiceId).run();
    } else if (body.action === "updateMemberRole" && body.memberUserId && (body.role === "editor" || body.role === "viewer")) {
      await env.DB.prepare("UPDATE practice_members SET role = ? WHERE practice_id = ? AND user_id = ? AND role <> 'owner'").bind(body.role, context.practiceId, body.memberUserId).run();
    } else if (body.action === "removeMember" && body.memberUserId) {
      await env.DB.prepare("DELETE FROM practice_members WHERE practice_id = ? AND user_id = ? AND role <> 'owner'").bind(context.practiceId, body.memberUserId).run();
    } else {
      return json({ error: "INVALID_ACTION" }, 400);
    }
    return handbookResponse(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: message }, errorStatus(message) === 500 ? 400 : errorStatus(message));
  }
}
