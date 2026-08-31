-- Purchase edit lock: incomplete (open) by default; set complete=true to lock header/line edits.
ALTER TABLE "Purchase" ADD COLUMN "complete" BOOLEAN NOT NULL DEFAULT false;
