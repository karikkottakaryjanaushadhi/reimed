/** Used when POS leaves customer/doctor blank — still stored for lists & receipts */

const CUSTOMERS = [
  "AMAL",
  "MINI",
  "THOMAS",
  "JOSEPH",
  "FATHIMA",
  "MOHAMMED",
  "TOMY",
  "ROHITH",
  "RAJU",
  "JACOB",
  "VISHNU",
  "RADHA",
];

const DOCTORS = [
  "DR. PHC",
  "DR. JOSE ANTONY",
  "DR. DEEPAK RAJU",
  "DR. REVATHI",
  "DR. MOHAN KUMAR",
  "DR. ASHRAF P",
  "DR. PRIYA MENON",
  "DR. MANU MATHEW",
  "DR. LALY D.C",
  "DR. SABU KG",
];

export function randomPlaceholderCustomerName(): string {
  return CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)]!;
}

export function randomPlaceholderDoctorName(): string {
  return DOCTORS[Math.floor(Math.random() * DOCTORS.length)]!;
}

export function isPlaceholderCustomerName(name: string | null | undefined): boolean {
  if (!name) return true;
  return CUSTOMERS.includes(name.toUpperCase());
}

export function isPlaceholderDoctorName(name: string | null | undefined): boolean {
  if (!name) return true;
  return DOCTORS.includes(name.toUpperCase());
}
