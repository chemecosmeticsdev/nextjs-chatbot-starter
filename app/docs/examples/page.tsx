'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { apiExamples, getExamplesByCategory, getExamplesByLanguage, getExamplesByTag } from '@/lib/docs/api-examples';

/**
 * API Examples and Tutorials Page
 */
export default function ApiExamplesPage() {
  const [selectedExample, setSelectedExample] = useState(apiExamples[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Get unique languages and categories
  const languages = ['all', ...new Set(apiExamples.map(ex => ex.language))];
  const categories = ['all', 'basic', 'intermediate', 'advanced'];

  // Filter examples
  const filteredExamples = apiExamples.filter(example => {
    const matchesSearch = example.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         example.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         example.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesLanguage = selectedLanguage === 'all' || example.language === selectedLanguage;
    const matchesCategory = selectedCategory === 'all' || example.category === selectedCategory;

    return matchesSearch && matchesLanguage && matchesCategory;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'basic': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLanguageIcon = (language: string) => {
    switch (language) {
      case 'javascript': return '🟨';
      case 'python': return '🐍';
      case 'php': return '🐘';
      case 'go': return '🐹';
      case 'curl': return '🌐';
      default: return '📄';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">API Examples & Tutorials</h1>
              <p className="mt-2 text-gray-600">
                Learn how to integrate with the Chatbot API through practical examples
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/docs/api"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                API Reference
              </a>
              <a
                href="/portal"
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Developer Portal
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar with examples list */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {/* Filters */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Search
                    </label>
                    <Input
                      placeholder="Search examples..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Language
                    </label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {languages.map(lang => (
                        <option key={lang} value={lang}>
                          {lang === 'all' ? 'All Languages' : lang}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Difficulty
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat === 'all' ? 'All Levels' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Examples list */}
              <Card>
                <CardHeader>
                  <CardTitle>Examples ({filteredExamples.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredExamples.map((example) => (
                      <div
                        key={example.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedExample.id === example.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedExample(example)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{getLanguageIcon(example.language)}</span>
                              <h3 className="font-medium text-sm">{example.title}</h3>
                            </div>
                            <p className="text-xs text-gray-600 mb-2">
                              {example.description}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={`text-xs ${getCategoryColor(example.category)}`}
                              >
                                {example.category}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {example.language}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Main content area */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-3">
                      <span className="text-2xl">{getLanguageIcon(selectedExample.language)}</span>
                      {selectedExample.title}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {selectedExample.description}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getCategoryColor(selectedExample.category)}>
                      {selectedExample.category}
                    </Badge>
                    <Badge variant="outline">
                      {selectedExample.language}
                    </Badge>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {selectedExample.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="code" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="code">Code</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                    <TabsTrigger value="dependencies">Setup</TabsTrigger>
                  </TabsList>

                  <TabsContent value="code" className="space-y-4">
                    <div className="relative">
                      <div className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 rounded-t-lg">
                        <span className="text-sm font-medium">
                          {selectedExample.title} ({selectedExample.language})
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(selectedExample.code)}
                          className="text-white hover:bg-gray-700"
                        >
                          📋 Copy
                        </Button>
                      </div>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-b-lg overflow-x-auto text-sm">
                        <code>{selectedExample.code}</code>
                      </pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="notes" className="space-y-4">
                    {selectedExample.notes && selectedExample.notes.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="font-semibold text-gray-900">Important Notes</h3>
                        <ul className="space-y-2">
                          {selectedExample.notes.map((note, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                              <p className="text-gray-700">{note}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        No additional notes for this example.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="dependencies" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Dependencies */}
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Dependencies</h3>
                        {selectedExample.dependencies && selectedExample.dependencies.length > 0 ? (
                          <ul className="space-y-2">
                            {selectedExample.dependencies.map((dep, index) => (
                              <li key={index} className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                  {dep}
                                </code>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500">No additional dependencies required.</p>
                        )}
                      </div>

                      {/* Setup Instructions */}
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Setup Instructions</h3>
                        <div className="space-y-3">
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-medium text-blue-900 mb-2">1. Get API Key</h4>
                            <p className="text-blue-700 text-sm">
                              Sign up at the <a href="/portal" className="underline">Developer Portal</a> to get your API key.
                            </p>
                          </div>

                          {selectedExample.language === 'javascript' && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                              <h4 className="font-medium text-green-900 mb-2">2. Install Dependencies</h4>
                              <code className="text-green-700 text-sm">
                                npm install {selectedExample.dependencies?.join(' ') || 'node-fetch'}
                              </code>
                            </div>
                          )}

                          {selectedExample.language === 'python' && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                              <h4 className="font-medium text-green-900 mb-2">2. Install Dependencies</h4>
                              <code className="text-green-700 text-sm">
                                pip install {selectedExample.dependencies?.join(' ') || 'requests'}
                              </code>
                            </div>
                          )}

                          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <h4 className="font-medium text-yellow-900 mb-2">3. Replace Placeholders</h4>
                            <p className="text-yellow-700 text-sm">
                              Update the code with your actual API key and chatbot ID.
                            </p>
                          </div>

                          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <h4 className="font-medium text-purple-900 mb-2">4. Run the Code</h4>
                            <p className="text-purple-700 text-sm">
                              Execute the example and check the console output.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Related Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <a
                    href="/docs/api"
                    className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <h3 className="font-semibold text-gray-900 mb-2">📖 API Reference</h3>
                    <p className="text-gray-600 text-sm">
                      Complete API documentation with interactive examples
                    </p>
                  </a>

                  <a
                    href="/docs/guides"
                    className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <h3 className="font-semibold text-gray-900 mb-2">🚀 Getting Started</h3>
                    <p className="text-gray-600 text-sm">
                      Step-by-step guide to your first integration
                    </p>
                  </a>

                  <a
                    href="/docs/sdks"
                    className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <h3 className="font-semibold text-gray-900 mb-2">🛠️ SDKs</h3>
                    <p className="text-gray-600 text-sm">
                      Official SDKs for popular programming languages
                    </p>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}