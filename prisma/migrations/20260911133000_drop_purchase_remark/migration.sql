-- Reuse Purchase.notes as the bill remark; drop the extra column.
UPDATE "Purchase"
SET "notes" = "remark"
WHERE ("notes" IS NULL OR btrim("notes") = '')
  AND "remark" IS NOT NULL
  AND btrim("remark") <> '';

ALTER TABLE "Purchase" DROP COLUMN "remark";
