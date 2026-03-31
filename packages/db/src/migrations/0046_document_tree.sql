CREATE TABLE "doc_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"owner_role" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_folder_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"display_name" text,
	"source_type" text DEFAULT 'upload' NOT NULL,
	"source_ref" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_parent_id_doc_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."doc_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folder_files" ADD CONSTRAINT "doc_folder_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folder_files" ADD CONSTRAINT "doc_folder_files_folder_id_doc_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folder_files" ADD CONSTRAINT "doc_folder_files_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_folders_company_parent_idx" ON "doc_folders" USING btree ("company_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_folders_company_path_uq" ON "doc_folders" USING btree ("company_id","path");--> statement-breakpoint
CREATE INDEX "doc_folder_files_folder_idx" ON "doc_folder_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "doc_folder_files_company_idx" ON "doc_folder_files" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_folder_files_asset_uq" ON "doc_folder_files" USING btree ("folder_id","asset_id");
