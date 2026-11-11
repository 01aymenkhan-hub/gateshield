import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const {
      visitInfo,
      documentType,
      documentData,
      phoneNumber,
      visitorCardNo,
      visitorPhotoPreview,
    } = body;

    if (!documentType || !documentData) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing document information in submission payload.",
        },
        { status: 400 }
      );
    }

    // Generate unique registration record ID
    const recordId = `VIS-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const timestamp = new Date().toISOString();

    // Do not log personal data (phone numbers, host names) to server logs.
    console.log(
      `[Visitor Submission] ${recordId} - Doc: ${String(documentType).slice(0, 16)} - Visit info: ${Boolean(
        visitInfo
      )} - Phone: ${Boolean(phoneNumber)} - Photo: ${Boolean(visitorPhotoPreview)}`
    );

    return NextResponse.json({
      success: true,
      message: "Visitor record submitted successfully.",
      recordId,
      visitorCardNo: visitorCardNo || "",
      submittedAt: timestamp,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing visitor submission:", message);
    return NextResponse.json(
      {
        success: false,
        error: "Submission failed.",
      },
      { status: 500 }
    );
  }
}
