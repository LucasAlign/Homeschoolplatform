CREATE TABLE "schedule_batches" (
	"key" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"assignment_ids" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_batches" ADD CONSTRAINT "schedule_batches_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;