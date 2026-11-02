import { CnicData } from "./cnic";
import { DlsData, DocumentType } from "./dls";

export type SubmissionStatus = "idle" | "submitting" | "success" | "error";

export interface VisitInfoData {
  /** Person the visitor is here to meet */
  meetName: string;
  /** Department of the person being visited (historical snapshot name) */
  department: string;
  /** Database ID of the selected Department */
  departmentId?: string;
  /** Delivery Source / Company Name (used for DELIVERY category) */
  deliverySource?: string;
}

export interface VisitorStepData {
  /** Captured or uploaded visitor photo (Data URL or Object URL for display) */
  photoPreview: string | null;
  /** Actual photo file if available */
  photoFile: File | null;
  /** Captured delivery document image (Data URL or Object URL for display, used for DELIVERY category) */
  deliveryDocumentPreview?: string | null;
  /** Actual delivery document file if available */
  deliveryDocumentFile?: File | null;
  /** Visitor phone number (11 digits, starts with 03) */
  phoneNumber: string;
  /** Physical visitor card number assigned by guard (used for standard categories) */
  visitorCardNo: string;
  /** Vehicle registration number (required for DELIVERY category) */
  vehicleNo?: string;
  /** Whether the visitor is carrying belongings/items (default false) */
  hasBelongings?: boolean;
  /** Description of carried belongings/items */
  belongings?: string;
}

export interface CompleteVisitorRecord {
  id?: string;
  visitInfo: VisitInfoData;
  documentType: DocumentType;
  documentData: CnicData | DlsData;
  visitorPhotoPreview: string | null;
  phoneNumber: string;
  visitorCardNo: string;
  belongings?: string;
  submittedAt: string;
}
