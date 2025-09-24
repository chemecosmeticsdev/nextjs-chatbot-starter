import { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Zap, Database, Shield, Globe, Code, Users } from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About - Chatbot Application",
  description: "Learn about our AI chatbot application built with Next.js, AWS Bedrock, and Neon PostgreSQL",
}

export default function AboutPage() {
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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">About Our Chatbot</h1>
          <p className="text-lg text-muted-foreground">
            A modern, scalable chatbot application built with cutting-edge technologies
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
          <Card>
            <CardHeader>
              <Zap className="h-8 w-8 mb-2 text-primary" />
              <CardTitle className="text-lg">AWS Bedrock Nova Micro</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Powered by AWS Bedrock's Nova Micro model, providing fast and cost-effective AI responses with enterprise-grade security.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Database className="h-8 w-8 mb-2 text-primary" />
              <CardTitle className="text-lg">Neon PostgreSQL</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Advanced PostgreSQL database with vector capabilities for storing conversation history and semantic search.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-primary" />
              <CardTitle className="text-lg">AWS Cognito</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Secure user authentication and authorization with AWS Cognito, ensuring data privacy and compliance.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Code className="h-8 w-8 mb-2 text-primary" />
              <CardTitle className="text-lg">Next.js 14</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Built with Next.js 14 App Router, TypeScript, and Tailwind CSS for optimal performance and developer experience.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Globe className="h-8 w-8 mb-2 text-primary" />
              <CardTitle className="text-lg">AWS Amplify</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Automated deployment and hosting with AWS Amplify, integrated with GitHub for continuous deployment.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-8 w-8 mb-2 text-primary" />
              <CardTitle className="text-lg">shadcn/ui</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Beautiful, accessible UI components built with Radix UI and styled with Tailwind CSS for consistency.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Technical Architecture</CardTitle>
            <CardDescription>
              Overview of our technology stack and infrastructure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Frontend</h3>
              <p className="text-sm text-muted-foreground">
                Next.js 14 with App Router, TypeScript, Tailwind CSS, and shadcn/ui components
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Backend Services</h3>
              <p className="text-sm text-muted-foreground">
                AWS Bedrock for AI inference, AWS Lambda for serverless functions, API Gateway for REST endpoints
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Database</h3>
              <p className="text-sm text-muted-foreground">
                Neon PostgreSQL with vector extensions for both relational data and semantic search capabilities
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Authentication</h3>
              <p className="text-sm text-muted-foreground">
                AWS Cognito for user management, authentication, and authorization
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Deployment</h3>
              <p className="text-sm text-muted-foreground">
                AWS Amplify with GitHub integration for continuous deployment and hosting
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-12">
          <Button asChild>
            <Link href="/chat">Try the Chatbot</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}