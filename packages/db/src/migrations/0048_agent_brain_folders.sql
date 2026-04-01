CREATE TABLE "agent_brain_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_brain_folders" ADD CONSTRAINT "agent_brain_folders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_brain_folders" ADD CONSTRAINT "agent_brain_folders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_brain_folders" ADD CONSTRAINT "agent_brain_folders_folder_id_doc_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_brain_folders_agent_idx" ON "agent_brain_folders" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_brain_folders_agent_folder_uq" ON "agent_brain_folders" USING btree ("agent_id","folder_id");
