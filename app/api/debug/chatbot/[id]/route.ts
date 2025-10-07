import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatbot = await ChatbotService.getChatbotById(params.id);
    return NextResponse.json({
      success: true,
      data: chatbot,
      configuration_type: typeof chatbot?.configuration,
      configuration_value: chatbot?.configuration
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}