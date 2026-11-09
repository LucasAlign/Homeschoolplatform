CREATE TABLE "grading_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"rubric_snapshot" text NOT NULL,
	"provider" text,
	"status" text NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"feedback" text,
	"score" integer,
	"grounding" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "grading_draft_id" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "draft_action" text;--> statement-breakpoint
ALTER TABLE "grading_drafts" ADD CONSTRAINT "grading_drafts_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grading_submission_idx" ON "grading_drafts" USING btree ("submission_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_grading_draft_id_grading_drafts_id_fk" FOREIGN KEY ("grading_draft_id") REFERENCES "public"."grading_drafts"("id") ON DELETE restrict ON UPDATE no action;