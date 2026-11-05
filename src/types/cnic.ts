/**
 * Represents the extracted data from a Pakistani CNIC (Front Side).
 * Strictly contains the 8 essential fields (no addresses or signatures):
 * 1. Full Name (fullName / name)
 * 2. Father / Husband Name (fatherHusbandName / fatherName)
 * 3. CNIC Number (cnicNumber / cnic)
 * 4. Gender (gender: "Male" | "Female" | "")
 * 5. Date of Birth (dateOfBirth)
 * 6. Date of Issue (dateOfIssue)
 * 7. Date of Expiry (dateOfExpiry)
 * 8. CNIC Identification (cnicIdentification)
 */
export interface CnicData {
  name: string;
  fatherName: string;
  /** Original OCR text for reviewing English spelling suggestions. */
  nameUrdu?: string;
  fatherNameUrdu?: string;
  gender: "Male" | "Female" | "";
  countryOfStay?: string;
  cnic: string;
  dateOfBirth: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  cnicIdentification?: string;

  // Compatibility aliases
  fullName?: string;
  fatherHusbandName?: string;
  cnicNumber?: string;
}

/**
 * Possible states of the CNIC scanning process.
 */
export type ScanStatus = "idle" | "selected" | "scanning" | "success" | "error";
