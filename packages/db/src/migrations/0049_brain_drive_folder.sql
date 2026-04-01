ALTER TABLE "agent_brain_folders" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "agent_brain_folders" ADD COLUMN "drive_folder_name" text;--> statement-breakpoint
ALTER TABLE "agent_brain_folders" ALTER COLUMN "folder_id" DROP NOT NULL;
