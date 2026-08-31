-- Chelimparamba shop profile (run against existing DB without full re-seed).
--   pnpm prisma db execute --file prisma/update-store-chelimparamba.sql --schema prisma/schema.prisma
-- Default targets the dev seed store id. If your store id differs, edit the WHERE clause.

UPDATE "Store"
SET
  "name" = 'Chelimparamba',
  "billShopName" = 'PRADHANMANTRI BHARTIYA JANAUSHADHI KENDRA',
  "address" = '10/417,Chelimparamba, Eruvessy, Taliparamba, Kannur, Kerala, India - 670632',
  "drugLicenseLine" = 'RLF20KL2025002347, RLF21KL2025002336',
  "phone" = '8281182828, 9633058038',
  "email" = 'janaushadhichelimparamba@gmail.com'
WHERE "id" = 'seed_store_main';
