import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Chatbot Application",
  description: "Next.js chatbot application with shadcn/ui, powered by AWS Bedrock",
  keywords: ["chatbot", "AI", "Next.js", "AWS Bedrock", "shadcn/ui"],
  authors: [{ name: "Chatbot Team" }],
  viewport: "width=device-width, initial-scale=1",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-background font-sans antialiased">
          <div className="relative flex min-h-screen flex-col">
            <div className="flex-1">
              {children}
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}