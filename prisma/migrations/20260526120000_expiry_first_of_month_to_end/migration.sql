-- Move expiry dates stored on the 1st (IST calendar) to the last day of that month.
-- Custom expiry dates (any day other than the 1st) are left unchanged.

UPDATE "InventoryLot"
SET "expiryDate" = (
  (
    date_trunc(
      'month',
      ("expiryDate" AT TIME ZONE 'Asia/Kolkata')::date
    ) + interval '1 month' - interval '1 day'
  )::date + time '12:00:00'
) AT TIME ZONE 'Asia/Kolkata'
WHERE extract(day from ("expiryDate" AT TIME ZONE 'Asia/Kolkata')::date) = 1;

UPDATE "PurchaseLine"
SET "expiryDate" = (
  (
    date_trunc(
      'month',
      ("expiryDate" AT TIME ZONE 'Asia/Kolkata')::date
    ) + interval '1 month' - interval '1 day'
  )::date + time '12:00:00'
) AT TIME ZONE 'Asia/Kolkata'
WHERE extract(day from ("expiryDate" AT TIME ZONE 'Asia/Kolkata')::date) = 1;
