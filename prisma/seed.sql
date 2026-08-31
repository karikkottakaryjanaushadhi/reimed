-- Fresh minimal data for first production deploy (replace this file when restoring from backup).
-- Run: npm run db:seed   (uses prisma db execute against DATABASE_URL)
-- Logins: admin@reimed / 19233 | cashier@reimed / 19233

BEGIN;

TRUNCATE TABLE
  "SaleLine",
  "Sale",
  "PurchaseLine",
  "Purchase",
  "InventoryLot",
  "Product",
  "Brand",
  "Supplier",
  "StoreUser",
  "StoreSettings",
  "Store",
  "User"
CASCADE;

INSERT INTO "User" ("id", "email", "passwordHash", "name", "active", "createdAt")
VALUES
  (
    'seed_u_admin',
    'admin@reimed',
    $pwd$$2b$12$pJARZlxPJK/2ujo3gJhHauxWXQuYfPOqQhk8M7XkatmgDZuKv7qIK$pwd$,
    'STORE ADMIN',
    true,
    NOW()
  ),
  (
    'seed_u_cashier',
    'cashier@reimed',
    $pwd$$2b$12$pJARZlxPJK/2ujo3gJhHauxWXQuYfPOqQhk8M7XkatmgDZuKv7qIK$pwd$,
    'FRONT CASHIER',
    true,
    NOW()
  );

INSERT INTO "Store" (
  "id",
  "name",
  "billShopName",
  "address",
  "phone",
  "gstin",
  "email",
  "drugLicenseLine",
  "createdAt"
)
VALUES (
  'seed_store_main',
  'REIMED',
  'REIMED',
  '10/417,Chelimparamba, Eruvessy, Taliparamba, Kannur, Kerala, India - 670632',
  '8281182828, 9633058038',
  NULL,
  'janaushadhichelimparamba@gmail.com',
  'RLF20KL2025002347, RLF21KL2025002336',
  NOW()
);

INSERT INTO "StoreSettings" ("storeId", "nextBillNo")
VALUES ('seed_store_main', 1001);

INSERT INTO "StoreUser" ("id", "userId", "storeId", "role", "createdAt")
VALUES
  ('seed_su_mgr', 'seed_u_admin', 'seed_store_main', 'MANAGER', NOW()),
  ('seed_su_cash', 'seed_u_cashier', 'seed_store_main', 'CASHIER', NOW());

INSERT INTO "Brand" ("id", "name", "createdAt")
VALUES ('seed_brand_demo', 'DEMOPHARMA', NOW());

INSERT INTO "Supplier" ("id", "name", "phone", "createdAt")
VALUES ('seed_supplier_1', 'MEDLINE DISTRIBUTORS', '+1 555-9000', NOW());

INSERT INTO "Product" (
  "id",
  "sku",
  "name",
  "brandId",
  "genericName",
  "packSize",
  "unit",
  "gstPct",
  "reorderMin",
  "createdAt"
)
VALUES
  (
    'seed_p_par500',
    'PAR500',
    'PARACETAMOL 500MG',
    'seed_brand_demo',
    'ACETAMINOPHEN',
    10,
    'STRIP',
    5,
    20,
    NOW()
  ),
  (
    'seed_p_amox250',
    'AMOX250',
    'AMOXICILLIN 250MG',
    NULL,
    NULL,
    10,
    'STRIP',
    5,
    10,
    NOW()
  );

INSERT INTO "InventoryLot" (
  "id",
  "storeId",
  "productId",
  "batchNo",
  "expiryDate",
  "quantity",
  "costPrice",
  "mrp",
  "saleRate",
  "salesDiscountPct",
  "salesDiscountRs",
  "stockCorrected",
  "createdAt",
  "updatedAt",
  "pricingUpdatedAt"
)
VALUES
  (
    'seed_lot_1',
    'seed_store_main',
    'seed_p_par500',
    'B001',
    TIMESTAMP '2026-07-15 00:00:00',
    120,
    12,
    24,
    24,
    0,
    0,
    false,
    NOW(),
    NOW(),
    NOW()
  ),
  (
    'seed_lot_2',
    'seed_store_main',
    'seed_p_par500',
    'B003',
    TIMESTAMP '2028-05-08 00:00:00',
    80,
    11.5,
    24,
    24,
    0,
    0,
    false,
    NOW(),
    NOW(),
    NOW()
  ),
  (
    'seed_lot_3',
    'seed_store_main',
    'seed_p_amox250',
    'AX-22',
    TIMESTAMP '2028-05-08 00:00:00',
    40,
    180,
    320,
    320,
    0,
    0,
    false,
    NOW(),
    NOW(),
    NOW()
  ),
  (
    'seed_lot_4',
    'seed_store_main',
    'seed_p_amox250',
    'AX-23',
    TIMESTAMP '2026-07-15 00:00:00',
    25,
    175,
    295,
    295,
    0,
    0,
    false,
    NOW(),
    NOW(),
    NOW()
  );

COMMIT;
