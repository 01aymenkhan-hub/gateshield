import { CnicData } from "../types/cnic";

// ============================================================================
// Types for Backend OCR Response
// ============================================================================

export interface OcrDetailItem {
  text: string;
  confidence: number;
  bbox: number[][];
}

export interface RawOcrResponse {
  success: boolean;
  text: string[];
  results: OcrDetailItem[];
  details: OcrDetailItem[];
  parsed?: CnicData;
  quality?: {
    documentType: string;
    needsReview: boolean;
    missingFields: string[];
    meanTextConfidence: number;
    warnings: string[];
    nameRecognition?: Record<string, string>;
    nameTransliteration?: Record<string, string>;
  };
}

// ============================================================================
// 1. MOCK SCANNING FUNCTION
// ============================================================================

const MOCK_CNIC_DATA: CnicData = {
  name: "MUHAMMAD ASIM",
  fatherName: "MUHAMMAD IQBAL",
  gender: "Male",
  countryOfStay: "Pakistan",
  cnic: "42101-1234567-1",
  dateOfBirth: "2002-01-01",
  dateOfIssue: "2020-05-10",
  dateOfExpiry: "2030-05-10",
  cnicIdentification: "",
  fullName: "MUHAMMAD ASIM",
  fatherHusbandName: "MUHAMMAD IQBAL",
  cnicNumber: "42101-1234567-1",
};

const MOCK_DELAY_MS = 2000;

/**
 * Mock scanning function that returns static dummy data after a simulated delay.
 * Preserved for offline development or testing without the Python backend.
 */
export async function scanCnicMock(_imageFile: File): Promise<CnicData> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return { ...MOCK_CNIC_DATA };
}

// ============================================================================
// 2. REAL OCR API FUNCTION
// ============================================================================

// Relative Next.js API route that proxies internally to FastAPI on http://127.0.0.1:8000
const SCAN_API_ENDPOINT = "/api/scan-cnic";

export class OcrApiError extends Error {
  constructor(public readonly status: number) {
    super(`OCR request failed (${status})`);
    this.name = 'OcrApiError';
  }
}

/**
 * Sends a CNIC image to the Next.js API route at POST /api/scan-cnic.
 * Next.js proxies the request internally to FastAPI (127.0.0.1:8000),
 * allowing mobile devices accessing via ngrok to scan without network errors.
 */
export async function scanCnicReal(imageFile: File): Promise<RawOcrResponse> {
  const formData = new FormData();
  formData.append("file", imageFile);

  const res = await fetch(SCAN_API_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new OcrApiError(res.status);
  }

  return (await res.json()) as RawOcrResponse;
}

// Default export uses mock by default until field extraction phase is ready
export const scanCnic = scanCnicMock;
