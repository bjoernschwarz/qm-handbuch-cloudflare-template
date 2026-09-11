"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, BookOpen, Building2, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardCopy,
  Clock3, Eye, FileEdit, Library, Mail, Menu, PanelLeftClose, Plus, Save, Search, Send,
  Settings, ShieldCheck, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type AdfNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: AdfNode[] };
type PageNode = { id: string; title: string; depth: number; body: string; children: PageNode[] };
type FlatPage = PageNode & { trail: string[]; parentSourceId: string | null };
type HandbookPage = {
  id: string; sourcePageId: string; parentSourceId: string | null; title: string; sourceContent: string;
  editedContent: string; publishedContent: string | null; status: "draft" | "published" | "revision" | "archived"; updatedAt: string; publishedAt: string | null;
};
type Role = "owner" | "editor" | "viewer";
type Practice = { id: string; name: string; contactName: string; qmResponsible: string; logoText: string };
type Member = { userId: string; email: string; role: Role; createdAt: string };
type Invitation = { id: string; email: string; role: "editor" | "viewer"; status: "pending"; createdAt: string };
type HandbookData = { practice: Practice; role: Role; currentUser: { id: string; email: string }; pages: HandbookPage[]; members: Member[]; invitations: Invitation[]; library?: PageNode | null; assets?: Record<string, Asset>; templateInstalled: boolean; templateVersion: number | null; templateInstalledAt: string | null };
type View = "library" | "handbook" | "team";
type Asset = { src: string; title: string; mime: string };
type EditorData = { id: string; title: string; mode: "source" | "html" | "plain"; content: string; sourceContent: string };
type TemplatePageInput = { id: string; parentSourceId: string | null; title: string; depth: number; body: string; sortOrder: number };
type TemplateAssetInput = { id: string; title: string; mime: string; data?: string; externalUrl?: string };
type TemplatePackage = { format: "heilmittel-qm-template"; version: number; rootPageId: string; pages: TemplatePageInput[]; assets: TemplateAssetInput[] };

const emptyTree: PageNode = { id: "", title: "QM-Handbuch", depth: 0, body: "", children: [] };
const SOURCE_CONTENT = "__QM_SOURCE_ADF__";
const HTML_CONTENT = "__QM_RICH_HTML__";
const roleLabels: Record<Role, string> = { owner: "Praxisinhaber:in", editor: "QM-Bearbeitung", viewer: "Nur lesen" };
const drawioAssets: Record<string, string> = {
  "524439": "/api/handbook?asset=drawio-524439.png",
  "655392": "/api/handbook?asset=drawio-655392.png",
  "589865": "/api/handbook?asset=drawio-589865.png",
  "229622": "/api/handbook?asset=drawio-229622.png",
  "524400": "/api/handbook?asset=drawio-524400.png",
  "459073": "/api/handbook?asset=drawio-459073.png",
  "655460": "/api/handbook?asset=drawio-655460.png",
};
function flatten(node: PageNode, trail: string[] = [], parentSourceId: string | null = null): FlatPage[] {
  const own = { ...node, trail, parentSourceId };
  return [own, ...node.children.flatMap((child) => flatten(child, [...trail, node.title], node.id))];
}

function parseBody(body: string): AdfNode | null { try { return JSON.parse(body) as AdfNode; } catch { return null; } }
function extractText(node?: AdfNode): string { return node?.text ?? node?.content?.map(extractText).join(" ") ?? ""; }
function plainText(node?: AdfNode): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  const joined = node.content?.map(plainText).join(node.type === "doc" ? "\n\n" : "") ?? "";
  if (["paragraph", "heading", "listItem", "blockquote", "tableRow"].includes(node.type)) return joined.trim() + "\n";
  return joined;
}
function pagePlain(page: PageNode) { return plainText(parseBody(page.body) ?? undefined).replace(/\n{3,}/g, "\n\n").trim(); }
function bodyPlain(body: string) { return plainText(parseBody(body) ?? undefined).replace(/\n{3,}/g, "\n\n").trim(); }
function isSourceBacked(content: string | null, sourceContent: string) {
  return Boolean(content && (content === SOURCE_CONTENT || content.trim() === bodyPlain(sourceContent)));
}
function storedContent(page: HandbookPage, view: View) {
  return view === "team" && page.publishedContent ? page.publishedContent : page.editedContent;
}

function macroValue(node: AdfNode, key: string): string {
  const parameters = node.attrs?.parameters as { macroParams?: Record<string, { value?: unknown }> } | undefined;
  return String(parameters?.macroParams?.[key]?.value ?? "");
}

function safeLink(value: unknown) {
  const href = String(value ?? "");
  return href.startsWith("https://") || href.startsWith("/") ? href : "#";
}

function renderInline(node: AdfNode, key: string): React.ReactNode {
  if (node.type !== "text") return node.content?.map((child, index) => renderInline(child, `${key}-${index}`));
  let value: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "strong") value = <strong>{value}</strong>;
    if (mark.type === "em") value = <em>{value}</em>;
    if (mark.type === "code") value = <code>{value}</code>;
    if (mark.type === "strike") value = <s>{value}</s>;
    if (mark.type === "underline") value = <u>{value}</u>;
    if (mark.type === "subsup") value = mark.attrs?.type === "sub" ? <sub>{value}</sub> : <sup>{value}</sup>;
    if (mark.type === "textColor") value = <span style={{ color: String(mark.attrs?.color ?? "inherit") }}>{value}</span>;
    if (mark.type === "link") value = <a href={safeLink(mark.attrs?.href)} target="_blank" rel="noreferrer">{value}</a>;
  }
  return <span key={key}>{value}</span>;
}
function renderAdf(node: AdfNode, key: string, assetMap: Record<string, Asset>): React.ReactNode {
  const children = node.content?.map((child, index) => renderAdf(child, `${key}-${index}`, assetMap));
  switch (node.type) {
    case "doc": return <>{children}</>;
    case "text": return renderInline(node, key);
    case "paragraph": return extractText(node).trim() ? <p key={key}>{children}</p> : <div key={key} className="h-3" />;
    case "heading": return Number(node.attrs?.level ?? 2) < 3 ? <h2 key={key}>{children}</h2> : <h3 key={key}>{children}</h3>;
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": return <ol key={key}>{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "rule": return <hr key={key} />;
    case "hardBreak": return <br key={key} />;
    case "codeBlock": return <pre key={key}><code>{extractText(node)}</code></pre>;
    case "panel": return <aside key={key} className={`content-panel ${String(node.attrs?.panelType ?? "info")}`}>{children}</aside>;
    case "table": return <div key={key} className="table-wrap"><table><tbody>{children}</tbody></table></div>;
    case "tableRow": return <tr key={key}>{children}</tr>;
    case "tableHeader": return <th key={key} colSpan={Number(node.attrs?.colspan ?? 1)} rowSpan={Number(node.attrs?.rowspan ?? 1)} style={node.attrs?.background ? { backgroundColor: String(node.attrs.background) } : undefined}>{children}</th>;
    case "tableCell": return <td key={key} colSpan={Number(node.attrs?.colspan ?? 1)} rowSpan={Number(node.attrs?.rowspan ?? 1)} style={node.attrs?.background ? { backgroundColor: String(node.attrs.background) } : undefined}>{children}</td>;
    case "taskList": return <ul key={key} className="task-list">{children}</ul>;
    case "taskItem": return <li key={key}><span className="task-check"><Check size={12} /></span><div>{children}</div></li>;
    case "expand": return <details key={key}><summary>{String(node.attrs?.title ?? "Mehr anzeigen")}</summary>{children}</details>;
    case "status": return <span key={key} className="status-chip">{String(node.attrs?.text ?? "")}</span>;
    case "layoutSection": return <div key={key} className="source-layout-section">{children}</div>;
    case "layoutColumn": return <div key={key} className="source-layout-column" style={{ flexBasis: `${Number(node.attrs?.width ?? 50)}%` }}>{children}</div>;
    case "mediaSingle": return <figure key={key} className="source-media-single">{children}</figure>;
    case "mediaGroup": return <div key={key} className="source-media-group">{children}</div>;
    case "media": {
      if (node.attrs?.type === "external") {
        const url = safeLink(node.attrs.url);
        return url === "#" ? <div key={key} className="asset-note">Externes Bild aus der Ursprungsquelle</div> : <img key={key} className="source-image" src={url} alt={String(node.attrs.alt ?? "Abbildung aus dem Musterhandbuch")} loading="lazy" />;
      }
      const asset = assetMap[String(node.attrs?.id ?? "")];
      if (!asset) return <div key={key} className="asset-note">Anlage aus der Ursprungsquelle</div>;
      if (asset.mime.startsWith("image/")) return <img key={key} className="source-image" src={asset.src} alt={String(node.attrs?.alt ?? asset.title)} loading="lazy" />;
      return <a key={key} className="attachment-card" href={asset.src} target="_blank" rel="noreferrer"><span aria-hidden="true">↓</span><span><strong>{asset.title}</strong><small>Anlage aus der Ursprungsquelle öffnen</small></span></a>;
    }
    case "mediaInline": {
      const asset = assetMap[String(node.attrs?.id ?? "")];
      return asset?.mime.startsWith("image/") ? <img key={key} className="source-image-inline" src={asset.src} alt={String(node.attrs?.alt ?? asset.title)} loading="lazy" /> : null;
    }
    case "extension": {
      const extensionKey = String(node.attrs?.extensionKey ?? "");
      if (extensionKey === "children") return null;
      if (extensionKey === "drawio") {
        const contentId = macroValue(node, "contentId") || macroValue(node, "custContentId");
        const title = macroValue(node, "diagramDisplayName") || macroValue(node, "diagramName") || "Prozessdarstellung";
        const src = drawioAssets[contentId];
        return src ? <figure key={key} className="process-diagram"><div className="diagram-scroll"><img src={src} alt={title} loading="lazy" /></div><figcaption>{title}</figcaption></figure> : <div key={key} className="asset-note">Eingebettete Prozessdarstellung: {title}</div>;
      }
      const title = String((node.attrs?.parameters as { macroMetadata?: { title?: unknown } } | undefined)?.macroMetadata?.title ?? "Eingebetteter Inhalt");
      return <div key={key} className="asset-note">{title} aus der Ursprungsquelle</div>;
    }
    case "bodiedExtension": return <section key={key} className="source-extension">{children}</section>;
    case "inlineExtension": return null;
    case "inlineCard": {
      const url = safeLink(node.attrs?.url);
      return <a key={key} className="inline-card" href={url} target="_blank" rel="noreferrer">{String(node.attrs?.url ?? "Verknüpfte Seite")}</a>;
    }
    case "caption": return <figcaption key={key}>{children}</figcaption>;
    case "mention": return <span key={key} className="mention">{String(node.attrs?.text ?? "")}</span>;
    case "emoji": return <span key={key}>{String(node.attrs?.text ?? node.attrs?.shortName ?? "")}</span>;
    case "date": return <time key={key}>{new Date(Number(node.attrs?.timestamp ?? 0)).toLocaleDateString("de-DE")}</time>;
    case "placeholder": return <span key={key} className="source-placeholder">{String(node.attrs?.text ?? "Bitte anpassen")}</span>;
    default: return children ? <div key={key}>{children}</div> : null;
  }
}

function PageContent({ page, view, assetMap }: { page: HandbookPage; view: View; assetMap: Record<string, Asset> }) {
  const content = storedContent(page, view);
  if (isSourceBacked(content, page.sourceContent)) return <div className="content">{renderAdf(parseBody(page.sourceContent) ?? { type: "doc" }, `${page.id}-source`, assetMap)}</div>;
  if (content.startsWith(HTML_CONTENT)) return <div className="content rich-content" dangerouslySetInnerHTML={{ __html: content.slice(HTML_CONTENT.length) }} />;
  return <div className="content plain-content">{content.split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}

function Status({ value }: { value: HandbookPage["status"] }) {
  const labels = { draft: "Noch nicht freigegeben", published: "Freigegeben", revision: "Überarbeitung läuft", archived: "Archiviert" };
  return <span className={`workflow-status ${value}`}>{labels[value]}</span>;
}

function TreeItem({ node, activeId, query, selected, copied, onSelect, onToggle }: {
  node: PageNode; activeId: string; query: string; selected: Set<string>; copied: Set<string>;
  onSelect: (id: string) => void; onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const allHere = flatten(node);
  const matches = !query || allHere.some((page) => page.title.toLocaleLowerCase("de").includes(query) || pagePlain(page).toLocaleLowerCase("de").includes(query));
  const [open, setOpen] = useState(node.depth < 2);
  if (!matches) return null;
  return <div className={node.depth ? "tree-branch" : ""}>
    <div className="tree-row selectable">
      {hasChildren ? <button className="tree-toggle" onClick={() => setOpen(!open)} aria-label="Unterkapitel ein- oder ausblenden">{open || query ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="tree-spacer" />}
      <button className={`select-box ${selected.has(node.id) ? "selected" : ""}`} onClick={() => onToggle(node.id)} aria-label={`${node.title} auswählen`} disabled={copied.has(node.id)}>{copied.has(node.id) ? <Check size={12} /> : selected.has(node.id) ? <Check size={12} /> : null}</button>
      <button className={`tree-link ${activeId === node.id ? "active" : ""}`} onClick={() => onSelect(node.id)}>{node.title}{copied.has(node.id) && <small>Im Handbuch</small>}</button>
    </div>
    {(open || query) && hasChildren && node.children.map((child) => <TreeItem key={child.id} node={child} activeId={activeId} query={query} selected={selected} copied={copied} onSelect={onSelect} onToggle={onToggle} />)}
  </div>;
}

function hasVisibleCopy(node: PageNode, copies: Map<string, HandbookPage>, query: string): boolean {
  const copy = copies.get(node.id);
  const ownMatch = copy && (!query || copy.title.toLocaleLowerCase("de").includes(query));
  return Boolean(ownMatch || node.children.some((child) => hasVisibleCopy(child, copies, query)));
}

function HandbookTreeItem({ node, copies, activeId, query, onSelect }: {
  node: PageNode; copies: Map<string, HandbookPage>; activeId: string | null; query: string; onSelect: (id: string) => void;
}) {
  const copy = copies.get(node.id);
  const visibleChildren = node.children.filter((child) => hasVisibleCopy(child, copies, query));
  const ownMatch = copy && (!query || copy.title.toLocaleLowerCase("de").includes(query));
  const [open, setOpen] = useState(true);
  if (!ownMatch && visibleChildren.length === 0) return null;
  return <div className={node.depth ? "handbook-tree-branch" : ""}>
    <div className={`handbook-tree-row ${copy ? "page" : "group"}`}>
      {visibleChildren.length > 0 ? <button className="tree-toggle" onClick={() => setOpen(!open)} aria-label="Unterkapitel ein- oder ausblenden">{open || query ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="tree-spacer" />}
      {copy ? <button className={`handbook-tree-link ${activeId === copy.id ? "active" : ""}`} onClick={() => onSelect(copy.id)}><span>{copy.title}</span><Status value={copy.status} /></button>
        : <span className="handbook-tree-group">{node.title}</span>}
    </div>
    {(open || query) && visibleChildren.map((child) => <HandbookTreeItem key={child.id} node={child} copies={copies} activeId={activeId} query={query} onSelect={onSelect} />)}
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("library");
  const [data, setData] = useState<HandbookData | null>(null);
  const [activeSourceId, setActiveSourceId] = useState("");
  const [activeCopyId, setActiveCopyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [editor, setEditor] = useState<EditorData | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"practice" | "team">("practice");
  const [practiceForm, setPracticeForm] = useState({ name: "", contactName: "", qmResponsible: "", logoText: "QM" });
  const [inviteForm, setInviteForm] = useState<{ email: string; role: "editor" | "viewer" }>({ email: "", role: "viewer" });
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStage, setImportStage] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState<"AUTH_REQUIRED" | "NOT_INVITED" | "OWNER_EMAIL_MISMATCH" | "OWNER_CONFIGURATION_REQUIRED" | "LOAD_FAILED" | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/handbook?includeLibrary=1", { cache: "no-store" });
      const next = await response.json() as HandbookData | { error?: string };
      if (response.ok) { setData(next as HandbookData); setLoadError(null); }
      else {
        const error = "error" in next ? next.error : undefined;
        setLoadError(error === "AUTH_REQUIRED" || error === "NOT_INVITED" || error === "OWNER_EMAIL_MISMATCH" || error === "OWNER_CONFIGURATION_REQUIRED" ? error : "LOAD_FAILED");
      }
    } catch {
      setLoadError("LOAD_FAILED");
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!data) return;
    if (data.role === "viewer") setView("team");
    if (!activeSourceId && data.library?.id) setActiveSourceId(data.library.id);
    setPracticeForm({ name: data.practice.name, contactName: data.practice.contactName, qmResponsible: data.practice.qmResponsible, logoText: data.practice.logoText });
  }, [data, activeSourceId]);
  const tree = data?.library ?? emptyTree;
  const assetMap = data?.assets ?? {};
  const libraryPages = useMemo(() => flatten(tree), [tree]);
  const libraryMap = useMemo(() => new Map(libraryPages.map((page) => [page.id, page])), [libraryPages]);
  const effectiveView: View = data?.role === "viewer" ? "team" : view;
  const activeLibrary = libraryMap.get(activeSourceId) ?? libraryPages[0] ?? null;
  const copiedIds = new Set(data?.pages.filter((page) => page.status !== "archived").map((page) => page.sourcePageId) ?? []);
  const visibleCopies = useMemo(() => (data?.pages ?? []).filter((page) => page.status !== "archived" && (effectiveView !== "team" || (page.status === "published" || (page.status === "revision" && page.publishedContent))) && (!query || page.title.toLocaleLowerCase("de").includes(query))), [data, effectiveView, query]);
  const visibleCopyMap = useMemo(() => new Map(visibleCopies.map((page) => [page.sourcePageId, page])), [visibleCopies]);
  const activeCopy = visibleCopies.find((page) => page.id === activeCopyId) ?? visibleCopies[0] ?? null;

  async function action(payload: Record<string, unknown>) {
    setBusy(true); setNotice("");
    const response = await fetch("/api/handbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const next = await response.json() as HandbookData | { error?: string };
    if (response.ok) setData((current) => {
      const incoming = next as HandbookData;
      return current ? { ...incoming, library: incoming.library ?? current.library, assets: incoming.assets ?? current.assets } : incoming;
    }); else {
      const messages: Record<string, string> = { INVALID_EMAIL: "Bitte gib eine gültige E-Mail-Adresse ein.", ALREADY_MEMBER: "Diese Person gehört bereits zum Praxisteam.", OWNER_REQUIRED: "Nur die Praxisinhaberin oder der Praxisinhaber kann das Team verwalten." };
      const error = "error" in next ? next.error : undefined;
      setNotice(error ? messages[error] ?? "Die Änderung konnte nicht gespeichert werden." : "Die Änderung konnte nicht gespeichert werden.");
    }
    setBusy(false);
    return response.ok;
  }
  async function copySelected(ids = [...selected]) {
    for (const id of ids) {
      const page = libraryMap.get(id);
      if (!page || copiedIds.has(id)) continue;
      await action({ action: "copy", sourcePageId: page.id });
    }
    setSelected(new Set()); setNotice(ids.length === 1 ? "Seite wurde als Entwurf übernommen." : `${ids.length} Seiten wurden als Entwürfe übernommen.`);
  }
  async function publish(page: HandbookPage) { if (await action({ action: "publish", id: page.id })) setNotice("Seite wurde für das Team freigegeben."); }
  function changeView(next: View) { setView(next); setQuery(""); setMobileNav(false); }
  async function savePractice() {
    if (!practiceForm.name.trim()) { setNotice("Bitte gib einen Praxisnamen ein."); return; }
    if (await action({ action: "savePractice", title: practiceForm.name, contactName: practiceForm.contactName, qmResponsible: practiceForm.qmResponsible, logoText: practiceForm.logoText })) setNotice("Praxisdaten wurden gespeichert.");
  }
  async function inviteMember() {
    if (!inviteForm.email.trim()) { setNotice("Bitte gib eine E-Mail-Adresse ein."); return; }
    if (await action({ action: "inviteMember", email: inviteForm.email, role: inviteForm.role })) {
      setInviteForm({ email: "", role: "viewer" });
      setNotice("Die Person wurde freigeschaltet und kann sich jetzt mit dieser E-Mail-Adresse anmelden.");
    }
  }
  async function importTemplate(file: File) {
    setBusy(true); setNotice("");
    try {
      if (file.size > 45_000_000) throw new Error("PACKAGE_TOO_LARGE");
      const templatePackage = JSON.parse(await file.text()) as Partial<TemplatePackage>;
      if (templatePackage.format !== "heilmittel-qm-template" || templatePackage.version !== 1 || typeof templatePackage.rootPageId !== "string" || !Array.isArray(templatePackage.pages) || !Array.isArray(templatePackage.assets)) throw new Error("INVALID_TEMPLATE_PACKAGE");
      const pages = templatePackage.pages;
      const assets = templatePackage.assets;
      const totalItems = pages.length + assets.length;
      let importedItems = 0;
      const updateProgress = (stage: string) => {
        setImportStage(stage);
        setImportProgress(Math.min(99, Math.round((importedItems / Math.max(totalItems, 1)) * 100)));
      };
      const postImport = async (payload: Record<string, unknown>) => {
        const response = await fetch("/api/handbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({ error: `HTTP_${response.status}` })) as { error?: string; importId?: string };
        if (!response.ok) throw new Error(result.error ?? "IMPORT_FAILED");
        return result;
      };

      updateProgress("Installation wird vorbereitet …");
      const started = await postImport({
        action: "beginTemplateImport",
        format: templatePackage.format,
        version: templatePackage.version,
        rootPageId: templatePackage.rootPageId,
        pageCount: pages.length,
        assetCount: assets.length,
      });
      if (!started.importId) throw new Error("IMPORT_FAILED");
      const importId = started.importId;

      let pageChunk: TemplatePageInput[] = [];
      let pageChunkBytes = 0;
      const uploadPageChunk = async () => {
        if (!pageChunk.length) return;
        updateProgress(`Seiten werden übertragen (${importedItems + 1} von ${totalItems}) …`);
        await postImport({ action: "importTemplatePages", importId, pages: pageChunk });
        importedItems += pageChunk.length;
        pageChunk = [];
        pageChunkBytes = 0;
      };
      for (const page of pages) {
        const pageBytes = new Blob([JSON.stringify(page)]).size;
        if (pageChunk.length && (pageChunk.length >= 4 || pageChunkBytes + pageBytes > 70_000)) await uploadPageChunk();
        pageChunk.push(page);
        pageChunkBytes += pageBytes;
      }
      await uploadPageChunk();

      const externalAssets = assets.filter((asset) => !asset.data);
      for (let index = 0; index < externalAssets.length; index += 20) {
        const chunk = externalAssets.slice(index, index + 20);
        updateProgress(`Verknüpfte Anlagen werden übertragen (${importedItems + 1} von ${totalItems}) …`);
        await postImport({ action: "importTemplateExternalAssets", importId, assets: chunk });
        importedItems += chunk.length;
      }

      const embeddedAssets = assets.filter((asset) => Boolean(asset.data));
      for (const asset of embeddedAssets) {
        updateProgress(`Bilder werden übertragen (${importedItems + 1} von ${totalItems}) …`);
        const binary = atob(asset.data ?? "");
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const params = new URLSearchParams({ action: "importTemplateAsset", importId, id: asset.id, title: asset.title, mime: asset.mime });
        const response = await fetch(`/api/handbook?${params}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: bytes.buffer });
        const result = await response.json().catch(() => ({ error: `HTTP_${response.status}` })) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "IMPORT_FAILED");
        importedItems += 1;
      }

      setImportProgress(99);
      setImportStage("Installation wird abgeschlossen …");
      await postImport({ action: "finalizeTemplateImport", importId });
      await load();
      setImportProgress(100);
      setNotice("Das Musterhandbuch wurde vollständig installiert.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "IMPORT_FAILED";
      setNotice(code === "PACKAGE_TOO_LARGE" ? "Das Vorlagenpaket ist zu groß." : code === "INVALID_TEMPLATE_PACKAGE" ? "Diese Datei ist kein gültiges QM-Vorlagenpaket." : "Die Installation wurde unterbrochen. Bitte wähle das Vorlagenpaket noch einmal aus.");
    } finally {
      setBusy(false);
      setImportStage("");
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  if (loadError) {
    const errorContent = {
      NOT_INVITED: ["Noch nicht für diese Praxis freigeschaltet", "Bitte lasse deine E-Mail-Adresse von der Praxisleitung im Bereich „Praxis & Team“ hinzufügen."],
      OWNER_EMAIL_MISMATCH: ["Andere Inhaber-E-Mail hinterlegt", "Diese neue Installation wurde für eine andere Inhaber-E-Mail eingerichtet. Melde dich mit der beim Installieren angegebenen Adresse an."],
      OWNER_CONFIGURATION_REQUIRED: ["Inhaber-E-Mail noch nicht eingerichtet", "Öffne die Einstellungen dieses Workers in Cloudflare und trage unter Variablen die Inhaber-E-Mail bei QM_OWNER_EMAIL ein."],
      AUTH_REQUIRED: ["Anmeldung erforderlich", "Diese Installation ist noch nicht mit Cloudflare Access geschützt oder die Anmeldung wurde nicht an das QM-Handbuch übermittelt."],
      LOAD_FAILED: ["Handbuch konnte nicht geladen werden", "Bitte prüfe deine Verbindung und versuche es erneut."],
    }[loadError];
    return <main className="access-error"><section><div className="brand-mark"><ShieldCheck size={22} /></div><p className="eyebrow">GESCHÜTZTES QM-HANDBUCH</p><h1>{errorContent[0]}</h1><p>{errorContent[1]}</p><button onClick={() => void load()}>Erneut versuchen</button></section></main>;
  }

  if (!data) return <main className="access-error"><section><div className="brand-mark"><BookOpen size={22} /></div><p className="eyebrow">QM-HANDBUCH</p><h1>Handbuch wird geladen</h1><p>Die geschützten Praxisdaten und Vorlagen werden vorbereitet.</p></section></main>;

  if (!data.templateInstalled) return <main className="template-setup"><section className="template-setup-card"><div className="brand-mark"><Library size={22} /></div><p className="eyebrow">EIGENE PRAXIS-INSTALLATION</p><h1>Musterhandbuch installieren</h1><p>Die Anwendung und die Praxisdaten liegen bereits in diesem Cloudflare-Konto. Installiere jetzt einmalig das geschützte Musterhandbuch mit allen Seiten, Hierarchien und Bildern.</p>{notice && <div className="setup-notice">{notice}</div>}{data.role === "owner" ? <><input ref={importInputRef} className="visually-hidden" type="file" accept=".json,.qmpackage,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTemplate(file); }} /><button disabled={busy} onClick={() => importInputRef.current?.click()}><ClipboardCopy size={17} /> {busy ? `Wird installiert … ${importProgress}%` : "Vorlagenpaket auswählen"}</button>{busy && <div className="import-progress" aria-live="polite"><span style={{ width: `${importProgress}%` }} /><small>{importStage}</small></div>}<small>Die Datei wird ausschließlich in diese Praxis-Installation übertragen.</small></> : <div className="setup-notice">Die Praxisinhaberin oder der Praxisinhaber muss das Vorlagenpaket zuerst installieren.</div>}</section></main>;

  const nav = <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
    <div className="sidebar-head">
      <div className="mobile-sidebar-title"><strong>{effectiveView === "library" ? "Musterhandbuch" : effectiveView === "handbook" ? "Mein Handbuch" : "Team-Handbuch"}</strong><button onClick={() => setMobileNav(false)}><PanelLeftClose size={20} /></button></div>
      <label className="searchbox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value.toLocaleLowerCase("de"))} placeholder="Seiten durchsuchen" /></label>
      <span className="result-count">{effectiveView === "library" ? `${libraryPages.length} Musterseiten` : `${visibleCopies.length} Seiten`}</span>
    </div>
    {effectiveView === "library" ? <nav className="tree-nav"><TreeItem node={tree} activeId={activeSourceId} query={query} selected={selected} copied={copiedIds} onSelect={(id) => { setActiveSourceId(id); setMobileNav(false); }} onToggle={(id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} /></nav>
      : <nav className="copy-list">{visibleCopies.length > 0 && <HandbookTreeItem node={tree} copies={visibleCopyMap} activeId={activeCopy?.id ?? null} query={query} onSelect={(id) => { setActiveCopyId(id); setMobileNav(false); }} />}{visibleCopies.length === 0 && <p className="empty-nav">{effectiveView === "team" ? "Noch keine Seiten freigegeben." : "Noch keine Seiten übernommen."}</p>}</nav>}
    {effectiveView === "library" && selected.size > 0 && <div className="selection-bar"><span>{selected.size} ausgewählt</span><button disabled={busy} onClick={() => copySelected()}><ClipboardCopy size={15} /> Übernehmen</button></div>}
  </aside>;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="brand-mark practice-monogram">{data?.practice.logoText ?? <BookOpen size={19} />}</div><div><strong>{data?.practice.name ?? "QM-Handbuch"}</strong><span>Qualitätsmanagement</span></div></div>
      <nav className="view-tabs">
        {data?.role !== "viewer" && <><button className={effectiveView === "library" ? "active" : ""} onClick={() => changeView("library")}><Library size={16} /> Musterhandbuch</button>
        <button className={effectiveView === "handbook" ? "active" : ""} onClick={() => changeView("handbook")}><FileEdit size={16} /> Mein Handbuch <b>{data?.pages.filter((p) => p.status !== "archived").length ?? 0}</b></button></>}
        <button className={effectiveView === "team" ? "active" : ""} onClick={() => changeView("team")}><Eye size={16} /> {data?.role === "viewer" ? "Praxis-Handbuch" : "Teamansicht"}</button>
      </nav>
      <div className="top-actions"><span className="role-badge">{data ? roleLabels[data.role] : "Wird geladen"}</span>{data?.role === "owner" && <button className="setup-button" onClick={() => setSettingsOpen(true)}><Settings size={16} /> {data.practice.name === "Meine Praxis" || !data.practice.qmResponsible ? "Praxis einrichten" : "Praxis & Team"}</button>}</div>
    </header>
    <div className="workspace">{nav}{mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} />}
      <section className="reading-pane">
        {notice && <div className="toast-notice"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")}><X size={15} /></button></div>}
        {effectiveView === "library" && activeLibrary && <article className="article">
          <div className="template-notice"><Library size={19} /><div><strong>Musterhandbuch</strong><p>Wähle einzelne Seiten links aus oder übernimm die geöffnete Seite. Jede Kopie startet in deinem Handbuch als „Noch nicht freigegeben“.</p></div></div>
          <p className="eyebrow">MUSTERVORLAGE</p><h1>{activeLibrary.title}</h1>
          <div className="page-meta"><span><BookOpen size={15} /> Original bleibt unverändert</span>{copiedIds.has(activeLibrary.id) ? <Status value="draft" /> : <span>Noch nicht übernommen</span>}</div>
          <div className="content">{renderAdf(parseBody(activeLibrary.body) ?? { type: "doc" }, activeLibrary.id, assetMap)}</div>
          <footer className="action-footer"><div><strong>{copiedIds.has(activeLibrary.id) ? "Bereits in deinem Handbuch" : "Diese Seite verwenden?"}</strong><p>Die Seite wird als eigenständige, bearbeitbare Kopie angelegt.</p></div><button disabled={busy || copiedIds.has(activeLibrary.id)} onClick={() => copySelected([activeLibrary.id])}>{copiedIds.has(activeLibrary.id) ? <><Check size={16} /> Übernommen</> : <><Plus size={16} /> In mein Handbuch</>}</button></footer>
        </article>}
        {effectiveView !== "library" && !activeCopy && <div className="empty-state">{effectiveView === "team" ? <Eye size={34} /> : <ClipboardCopy size={34} />}<h1>{effectiveView === "team" ? "Noch nichts freigegeben" : "Dein Handbuch ist noch leer"}</h1><p>{effectiveView === "team" ? "Sobald eine Seite freigegeben wurde, erscheint sie hier für Mitarbeitende." : "Wähle im Musterhandbuch die Seiten aus, die deine Praxis benötigt."}</p>{effectiveView === "handbook" && <button onClick={() => changeView("library")}>Zum Musterhandbuch</button>}</div>}
        {effectiveView !== "library" && activeCopy && <article className="article">
          {effectiveView === "team" && <div className="team-notice"><Eye size={18} /><div><strong>Verbindliches Praxis-Handbuch</strong><p>Diese Ansicht enthält ausschließlich freigegebene Inhalte und ist für Mitarbeitende nur lesbar.</p></div></div>}
          <div className="copy-heading"><div><p className="eyebrow">{effectiveView === "team" ? "TEAM-HANDBUCH" : "MEIN QM-HANDBUCH"}</p><h1>{activeCopy.title}</h1></div><Status value={activeCopy.status} /></div>
          <div className="page-meta"><span>Zuletzt geändert: {new Date(activeCopy.updatedAt).toLocaleDateString("de-DE")}</span>{activeCopy.publishedAt && <span>Freigegeben: {new Date(activeCopy.publishedAt).toLocaleDateString("de-DE")}</span>}</div>
          <PageContent page={activeCopy} view={effectiveView} assetMap={assetMap} />
          {effectiveView === "handbook" && data?.role !== "viewer" && <footer className="workflow-footer"><button className="secondary" onClick={() => { const value = activeCopy.editedContent; setEditor({ id: activeCopy.id, title: activeCopy.title, mode: isSourceBacked(value, activeCopy.sourceContent) ? "source" : value.startsWith(HTML_CONTENT) ? "html" : "plain", content: value.startsWith(HTML_CONTENT) ? value.slice(HTML_CONTENT.length) : value, sourceContent: activeCopy.sourceContent }); }}><FileEdit size={16} /> Bearbeiten</button><button className="secondary danger" disabled={busy} onClick={() => action({ action: "archive", id: activeCopy.id })}><Archive size={16} /> Archivieren</button><button className="publish" disabled={busy || activeCopy.status === "published"} onClick={() => publish(activeCopy)}><Send size={16} /> {activeCopy.status === "published" ? "Freigegeben" : "Freigeben"}</button></footer>}
        </article>}
      </section>
    </div>
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent side="right" className="management-panel" showCloseButton={false}>
        <SheetHeader className="management-head">
          <div className="management-title-row"><div className="management-icon"><Building2 size={19} /></div><div><SheetTitle>Praxis & Team</SheetTitle><SheetDescription>Richte dein QM-Handbuch für die eigene Praxis ein.</SheetDescription></div><SheetClose className="management-close" aria-label="Praxisverwaltung schließen"><X size={19} /></SheetClose></div>
        </SheetHeader>
        <div className="management-tabs" role="tablist"><button className={settingsTab === "practice" ? "active" : ""} onClick={() => setSettingsTab("practice")}><Building2 size={15} /> Praxisdaten</button><button className={settingsTab === "team" ? "active" : ""} onClick={() => setSettingsTab("team")}><Users size={15} /> Team <span>{(data?.members.length ?? 0) + (data?.invitations.length ?? 0)}</span></button></div>
        <div className="management-body">
          {settingsTab === "practice" && <section className="practice-settings">
            <div className="practice-preview"><div className="practice-preview-logo">{practiceForm.logoText || "QM"}</div><div><strong>{practiceForm.name || "Name deiner Praxis"}</strong><span>{practiceForm.qmResponsible ? `QM: ${practiceForm.qmResponsible}` : "QM-Verantwortung noch festlegen"}</span></div></div>
            <div className="management-section-head"><div><h3>Praxisprofil</h3><p>Diese Angaben erscheinen im Handbuch und helfen dem Team bei der Orientierung.</p></div></div>
            <div className="management-form">
              <label><span>Praxisname</span><input value={practiceForm.name} maxLength={120} onChange={(event) => setPracticeForm({ ...practiceForm, name: event.target.value })} placeholder="z. B. Physiotherapie Müller" /></label>
              <div className="management-form-row"><label><span>Ansprechpartner:in</span><input value={practiceForm.contactName} maxLength={120} onChange={(event) => setPracticeForm({ ...practiceForm, contactName: event.target.value })} placeholder="Name" /></label><label><span>Kürzel / Logo</span><input className="logo-input" value={practiceForm.logoText} maxLength={3} onChange={(event) => setPracticeForm({ ...practiceForm, logoText: event.target.value.toUpperCase() })} placeholder="QM" /></label></div>
              <label><span>QM-Verantwortliche Person</span><input value={practiceForm.qmResponsible} maxLength={120} onChange={(event) => setPracticeForm({ ...practiceForm, qmResponsible: event.target.value })} placeholder="Name oder Funktion" /></label>
            </div>
            <div className="management-actions"><button className="management-primary" disabled={busy} onClick={() => void savePractice()}><Save size={15} /> Praxisdaten speichern</button></div>
          </section>}
          {settingsTab === "team" && <section className="team-settings">
            <div className="invite-card"><div className="invite-heading"><div className="management-icon soft"><UserPlus size={18} /></div><div><h3>Person hinzufügen</h3><p>Lege fest, ob die Person bearbeiten oder ausschließlich lesen darf.</p></div></div><div className="invite-form"><label><span>E-Mail-Adresse</span><div className="email-input"><Mail size={15} /><input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="name@praxis.de" /></div></label><label><span>Rolle</span><select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value as "editor" | "viewer" })}><option value="viewer">Nur lesen</option><option value="editor">QM-Bearbeitung</option></select></label><button className="management-primary" disabled={busy} onClick={() => void inviteMember()}><UserPlus size={15} /> Einladen</button></div></div>
            <div className="permission-summary"><div><ShieldCheck size={16} /><span><strong>QM-Bearbeitung</strong> darf Seiten auswählen, bearbeiten und freigeben.</span></div><div><Eye size={16} /><span><strong>Nur lesen</strong> sieht ausschließlich das freigegebene Praxis-Handbuch.</span></div></div>
            <div className="management-section-head"><div><h3>Praxisteam</h3><p>{data?.members.length ?? 0} aktive {(data?.members.length ?? 0) === 1 ? "Person" : "Personen"}</p></div></div>
            <div className="member-list">{(data?.members ?? []).map((member) => <div className="member-row" key={member.userId}><div className="member-avatar">{member.email.slice(0, 2).toUpperCase()}</div><div className="member-info"><strong>{member.email === data?.currentUser.email ? "Du" : member.email}</strong><span>{member.email}</span></div>{member.role === "owner" ? <span className="owner-label">Praxisinhaber:in</span> : <><select aria-label={`Rolle von ${member.email}`} value={member.role} disabled={busy} onChange={(event) => void action({ action: "updateMemberRole", memberUserId: member.userId, role: event.target.value })}><option value="editor">QM-Bearbeitung</option><option value="viewer">Nur lesen</option></select><button className="icon-danger" aria-label={`${member.email} entfernen`} disabled={busy} onClick={() => { if (window.confirm(`${member.email} wirklich aus dem Praxisteam entfernen?`)) void action({ action: "removeMember", memberUserId: member.userId }); }}><Trash2 size={15} /></button></>}</div>)}</div>
            {(data?.invitations.length ?? 0) > 0 && <><div className="management-section-head pending-head"><div><h3>Noch nicht angemeldet</h3><p>Diese Personen werden bei ihrer ersten Anmeldung automatisch aktiviert.</p></div></div><div className="member-list">{data?.invitations.map((invitation) => <div className="member-row pending" key={invitation.id}><div className="member-avatar"><Clock3 size={15} /></div><div className="member-info"><strong>{invitation.email}</strong><span>{invitation.role === "editor" ? "QM-Bearbeitung" : "Nur lesen"}</span></div><span className="pending-label">Ausstehend</span><button className="icon-danger" aria-label={`Freigabe für ${invitation.email} zurückziehen`} disabled={busy} onClick={() => void action({ action: "cancelInvite", id: invitation.id })}><X size={15} /></button></div>)}</div></>}
            <div className="private-site-note"><ShieldCheck size={18} /><div><strong>Zugang vollständig hier verwalten</strong><p>Cloudflare bestätigt nur die E-Mail-Adresse. Wer das Handbuch sehen oder bearbeiten darf, legst du ausschließlich hier fest. Teile der Person anschließend einfach den Link zum Handbuch mit.</p></div></div>
          </section>}
        </div>
      </SheetContent>
    </Sheet>
    {editor && <div className="editor-overlay"><section className="editor-panel"><header><div><p className="eyebrow">SEITE BEARBEITEN</p><h2>{editor.title}</h2></div><button onClick={() => setEditor(null)}><X /></button></header><label>Titel<input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></label><label>Inhalt</label>{editor.mode === "html" ? <div ref={editorRef} className="content rich-editor" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: editor.content }} /> : <div ref={editorRef} className="content rich-editor" contentEditable suppressContentEditableWarning>{editor.mode === "source" ? renderAdf(parseBody(editor.sourceContent) ?? { type: "doc" }, `${editor.id}-editor`, assetMap) : editor.content.split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}<p className="editor-hint">Du kannst Texte direkt in der formatierten Seite ändern. Bilder, Tabellen und Prozessdarstellungen bleiben dabei erhalten. Beim Speichern einer freigegebenen Seite wechselt sie in „Überarbeitung läuft“; die bisher freigegebene Fassung bleibt für das Team sichtbar.</p><footer><button className="secondary" onClick={() => setEditor(null)}>Abbrechen</button><button className="publish" disabled={busy} onClick={async () => { const content = `${HTML_CONTENT}${editorRef.current?.innerHTML ?? ""}`; if (await action({ action: "save", id: editor.id, title: editor.title, content })) { setEditor(null); setNotice("Änderungen wurden gespeichert."); } }}><Save size={16} /> Speichern</button></footer></section></div>}
  </main>;
}
