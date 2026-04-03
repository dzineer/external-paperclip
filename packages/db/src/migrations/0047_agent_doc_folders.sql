ALTER TABLE "doc_folder_files" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "doc_folder_files" ADD CONSTRAINT "doc_folder_files_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_folder_files_agent_idx" ON "doc_folder_files" USING btree ("agent_id");
