import { DlsData } from "../types/dls";
import { OcrApiError, RawOcrResponse } from './cnicApi';

export interface RawDlsResponse {
  success: boolean;
  text: string[];
  results: Array<{ text: string; confidence: number; bbox: number[][] }>;
  details: Array<{ text: string; confidence: number; bbox: number[][] }>;
  parsed?: DlsData;
  quality?: RawOcrResponse['quality'];
}

const MOCK_DLS_DATA: DlsData = {
  licenseNumber: "KHI-123456",
  fullName: "MUHAMMAD ASIM",
  fatherHusbandName: "MUHAMMAD IQBAL",
  dateOfBirth: "25-May-1986",
  category: "M CYCLE, M CAR",
  issueDate: "29-May-2013",
  validUpto: "27-May-2028",
  licensingAuthority: "DSP Munir Ahmed Awan, DL Saudabad Karachi",
};

/**
 * Mock scanning function for Driving License Sindh.
 */
export async function scanDlsMock(_file: File): Promise<DlsData> {
  await new Promise((res) => setTimeout(res, 1500));
  return { ...MOCK_DLS_DATA };
}

/**
 * Sends a Driving License Sindh image to /api/scan-dls.
 */
export async function scanDlsReal(imageFile: File): Promise<RawDlsResponse> {
  const formData = new FormData();
  formData.append("file", imageFile);

  const res = await fetch("/api/scan-dls", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new OcrApiError(res.status);
  }

  return (await res.json()) as RawDlsResponse;
}
