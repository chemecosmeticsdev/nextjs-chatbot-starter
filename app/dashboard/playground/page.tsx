'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PlayCircle, Bot, ArrowRight } from 'lucide-react';

/**
 * General Playground Page
 * Redirects to the first available chatbot's playground or shows chatbot selection
 */
export default function PlaygroundPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [chatbots, setChatbots] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    async function fetchChatbots() {
      try {
        const response = await fetch('/api/v1/chatbots');

        if (!response.ok) {
          throw new Error('Failed to fetch chatbots');
        }

        const data = await response.json();
        const chatbotList = data.data || [];

        setChatbots(chatbotList);

        // If there's only one chatbot, redirect directly to its playground
        if (chatbotList.length === 1) {
          router.push(`/dashboard/chatbots/${chatbotList[0].id}/playground`);
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching chatbots:', err);
        setError('Failed to load chatbots');
        setLoading(false);
      }
    }

    fetchChatbots();
  }, [router]);

  const handleChatbotSelect = (chatbotId: string) => {
    router.push(`/dashboard/chatbots/${chatbotId}/playground`);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <PlayCircle className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Test Playground</h1>
        </div>

        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <PlayCircle className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Test Playground</h1>
        </div>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              className="mt-4"
              variant="outline"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (chatbots.length === 0) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <PlayCircle className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Test Playground</h1>
        </div>

        <Card>
          <CardContent className="p-6 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Chatbots Available</h3>
            <p className="text-muted-foreground mb-4">
              Create a chatbot first to test it in the playground.
            </p>
            <Button
              onClick={() => router.push('/dashboard/chatbots/create')}
              className="inline-flex items-center"
            >
              Create Chatbot
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <PlayCircle className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Test Playground</h1>
      </div>

      <p className="text-muted-foreground">
        Choose a chatbot to test in the playground:
      </p>

      <div className="grid gap-4">
        {chatbots.map((chatbot) => (
          <Card key={chatbot.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-50 rounded-md">
                    <Bot className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{chatbot.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {chatbot.description || 'AI chatbot ready for testing'}
                    </CardDescription>
                  </div>
                </div>
                <Button
                  onClick={() => handleChatbotSelect(chatbot.id)}
                  className="inline-flex items-center"
                >
                  Test
                  <PlayCircle className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}