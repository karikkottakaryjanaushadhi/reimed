/** Used when POS leaves customer/doctor blank — still stored for lists & receipts */

const CUSTOMERS = [
  "WALK-IN CUSTOMER",
  "RETAIL SALE",
  "COUNTER CUSTOMER",
  "GENERAL BUYER",
  "OPD WALK-IN",
  "CASH CUSTOMER",
  "OPEN SALE",
  "UNREGISTERED BUYER",
];

const DOCTORS = [
  "DR. A. SHARMA",
  "DR. MEERA NAIR",
  "DR. VIKRAM PATEL",
  "DR. S. IYER",
  "DR. ANANYA BOSE",
  "DR. R. KHAN",
  "DR. PRIYA MENON",
  "GENERAL PHYSICIAN",
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
