import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const practices = sqliteTable("practices", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_practices_owner_user_id").on(table.ownerUserId),
]);

export const practiceMembers = sqliteTable("practice_members", {
  practiceId: text("practice_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_practice_members_practice_user").on(table.practiceId, table.userId),
  index("idx_practice_members_user_id").on(table.userId),
  index("idx_practice_members_practice_email").on(table.practiceId, table.email),
]);

export const practiceProfiles = sqliteTable("practice_profiles", {
  practiceId: text("practice_id").primaryKey(),
  contactName: text("contact_name").notNull().default(""),
  qmResponsible: text("qm_responsible").notNull().default(""),
  logoText: text("logo_text").notNull().default("QM"),
  updatedAt: text("updated_at").notNull(),
});

export const practiceInvitations = sqliteTable("practice_invitations", {
  id: text("id").primaryKey(),
  practiceId: text("practice_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  invitedBy: text("invited_by").notNull(),
  createdAt: text("created_at").notNull(),
  acceptedAt: text("accepted_at"),
}, (table) => [
  uniqueIndex("idx_practice_invitations_practice_email").on(table.practiceId, table.email),
  index("idx_practice_invitations_email_status").on(table.email, table.status),
]);

export const handbookPages = sqliteTable("handbook_pages", {
  id: text("id").primaryKey(),
  practiceId: text("practice_id").notNull(),
  sourcePageId: text("source_page_id").notNull(),
  parentSourceId: text("parent_source_id"),
  title: text("title").notNull(),
  sourceContent: text("source_content").notNull(),
  editedContent: text("edited_content").notNull(),
  publishedContent: text("published_content"),
  status: text("status").notNull().default("draft"),
  sourceRevision: integer("source_revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
  updatedBy: text("updated_by").notNull(),
}, (table) => [
  uniqueIndex("idx_handbook_pages_practice_source").on(table.practiceId, table.sourcePageId),
  index("idx_handbook_pages_practice_status").on(table.practiceId, table.status),
]);
