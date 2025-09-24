import { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MessageSquare, ArrowLeft } from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Chat - Chatbot Application",
  description: "Start a conversation with our AI chatbot powered by AWS Bedrock",
}

export default function ChatPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </Button>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <MessageSquare className="h-16 w-16 mx-auto mb-4 text-primary" />
          <h1 className="text-4xl font-bold mb-4">AI Chat Interface</h1>
          <p className="text-lg text-muted-foreground">
            Chat interface coming soon! This will be powered by AWS Bedrock Nova Micro.
          </p>
        </div>

        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Development Status</CardTitle>
            <CardDescription>
              The chat interface is currently under development
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Planned Features:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Real-time chat interface with AWS Bedrock Nova Micro</li>
                <li>Conversation history stored in Neon PostgreSQL</li>
                <li>Vector embeddings for context-aware responses</li>
                <li>User authentication via AWS Cognito</li>
                <li>Message persistence and retrieval</li>
                <li>Responsive design for mobile and desktop</li>
              </ul>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                This chatbot application is built with Next.js 14, shadcn/ui components,
                and integrated with AWS services including Bedrock, Cognito, and Neon PostgreSQL.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}