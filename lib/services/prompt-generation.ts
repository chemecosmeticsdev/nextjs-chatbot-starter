import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

interface PromptGenerationParams {
  chatbotId: string;
  businessContext: string;
  targetAudience?: string;
  communicationStyle: string;
  keyTopics?: string[];
  constraints?: string[];
  existingPrompt?: string | null;
  documentContext?: string[];
}

export class PromptGenerationService {
  private static client: BedrockRuntimeClient;

  private static getClient(): BedrockRuntimeClient {
    if (!this.client) {
      this.client = new BedrockRuntimeClient({
        region: process.env.BEDROCK_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.client;
  }

  /**
   * Generate a system prompt using AWS Bedrock Nova Micro
   */
  static async generatePrompt(params: PromptGenerationParams): Promise<string> {
    try {
      const prompt = this.buildGenerationPrompt(params);

      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-micro-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                }
              ]
            }
          ],
          max_tokens: 2000,
          temperature: 0.7,
          top_p: 0.9,
          anthropic_version: 'bedrock-2023-05-31'
        })
      });

      const response = await this.getClient().send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (!responseBody.content || !responseBody.content[0] || !responseBody.content[0].text) {
        throw new Error('Invalid response format from Bedrock');
      }

      const generatedPrompt = responseBody.content[0].text.trim();

      // Post-process the generated prompt
      return this.postProcessPrompt(generatedPrompt);

    } catch (error) {
      console.error('Error generating prompt with Bedrock:', error);

      // Fallback to template-based generation if Bedrock fails
      console.log('Falling back to template-based prompt generation');
      return this.generateTemplatePrompt(params);
    }
  }

  /**
   * Build the generation prompt for the AI model
   */
  private static buildGenerationPrompt(params: PromptGenerationParams): string {
    const sections = [
      '# System Prompt Generation Task',
      '',
      'Generate a comprehensive system prompt for a chatbot based on the following requirements:',
      '',
      '## Business Context:',
      params.businessContext,
      ''
    ];

    if (params.targetAudience) {
      sections.push('## Target Audience:');
      sections.push(params.targetAudience);
      sections.push('');
    }

    sections.push('## Communication Style:');
    sections.push(this.getCommunicationStyleDescription(params.communicationStyle));
    sections.push('');

    if (params.keyTopics && params.keyTopics.length > 0) {
      sections.push('## Key Topics to Cover:');
      params.keyTopics.forEach(topic => sections.push(`- ${topic}`));
      sections.push('');
    }

    if (params.constraints && params.constraints.length > 0) {
      sections.push('## Constraints and Guidelines:');
      params.constraints.forEach(constraint => sections.push(`- ${constraint}`));
      sections.push('');
    }

    if (params.documentContext && params.documentContext.length > 0) {
      sections.push('## Relevant Document Context:');
      params.documentContext.forEach((doc, index) => {
        sections.push(`### Document ${index + 1}:`);
        sections.push(doc.substring(0, 500) + '...');
        sections.push('');
      });
    }

    if (params.existingPrompt) {
      sections.push('## Current System Prompt (for reference):');
      sections.push('```');
      sections.push(params.existingPrompt);
      sections.push('```');
      sections.push('');
    }

    sections.push('## Instructions:');
    sections.push('Create a system prompt that:');
    sections.push('1. Clearly defines the chatbot\'s role and purpose');
    sections.push('2. Establishes the appropriate tone and communication style');
    sections.push('3. Provides specific guidelines for handling customer inquiries');
    sections.push('4. Includes relevant domain knowledge and context');
    sections.push('5. Sets appropriate boundaries and limitations');
    sections.push('6. Is between 100-800 words in length');
    sections.push('');
    sections.push('Generate ONLY the system prompt content, without any explanatory text or markdown formatting.');

    return sections.join('\n');
  }

  /**
   * Get description for communication style
   */
  private static getCommunicationStyleDescription(style: string): string {
    const descriptions = {
      professional: 'Maintain a professional, business-appropriate tone with clear and concise communication',
      friendly: 'Use a warm, approachable tone that makes customers feel welcome and valued',
      casual: 'Adopt a relaxed, conversational style that feels natural and easy-going',
      formal: 'Use formal language with proper etiquette and structured responses',
      conversational: 'Engage in natural dialogue that feels like talking to a knowledgeable friend',
      authoritative: 'Demonstrate expertise and confidence while being helpful and informative'
    };

    return descriptions[style as keyof typeof descriptions] || descriptions.professional;
  }

  /**
   * Post-process the generated prompt to ensure quality
   */
  private static postProcessPrompt(prompt: string): string {
    // Remove any markdown formatting that might have been included
    let processed = prompt
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/#+\s*/g, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .trim();

    // Ensure the prompt starts with a clear role definition if it doesn't already
    if (!processed.toLowerCase().includes('you are') && !processed.toLowerCase().includes('your role')) {
      processed = 'You are a helpful customer service chatbot. ' + processed;
    }

    // Ensure proper sentence structure
    processed = processed
      .replace(/\.\s*([a-z])/g, '. $1') // Fix spacing after periods
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    return processed;
  }

  /**
   * Fallback template-based prompt generation
   */
  private static generateTemplatePrompt(params: PromptGenerationParams): string {
    const templates = {
      professional: 'You are a professional customer service representative',
      friendly: 'You are a friendly and helpful customer service assistant',
      casual: 'You are a relaxed and approachable customer service helper',
      formal: 'You are a formal customer service specialist',
      conversational: 'You are a conversational customer service assistant',
      authoritative: 'You are an expert customer service representative'
    };

    const roleIntro = templates[params.communicationStyle as keyof typeof templates] || templates.professional;

    const sections = [
      `${roleIntro} for ${params.businessContext}.`,
      ''
    ];

    if (params.targetAudience) {
      sections.push(`Your primary audience consists of ${params.targetAudience}.`);
      sections.push('');
    }

    sections.push('Your main responsibilities include:');

    if (params.keyTopics && params.keyTopics.length > 0) {
      params.keyTopics.forEach(topic => {
        sections.push(`- Providing information about ${topic}`);
      });
    } else {
      sections.push('- Answering customer questions accurately and helpfully');
      sections.push('- Providing product and service information');
      sections.push('- Assisting with general inquiries');
    }

    sections.push('');
    sections.push('Guidelines for interactions:');
    sections.push('- Always be helpful and courteous');
    sections.push('- Provide accurate information based on available knowledge');
    sections.push('- If you don\'t know something, admit it and offer to help find the information');
    sections.push('- Keep responses relevant and concise');

    if (params.constraints && params.constraints.length > 0) {
      sections.push('');
      sections.push('Important constraints:');
      params.constraints.forEach(constraint => {
        sections.push(`- ${constraint}`);
      });
    }

    sections.push('');
    sections.push('Always maintain a ' + params.communicationStyle + ' tone throughout your interactions.');

    return sections.join('\n');
  }

  /**
   * Validate generated prompt quality
   */
  static validatePromptQuality(prompt: string): {
    isValid: boolean;
    issues: string[];
    score: number;
  } {
    const issues: string[] = [];
    let score = 100;

    // Check length
    if (prompt.length < 50) {
      issues.push('Prompt is too short (minimum 50 characters)');
      score -= 30;
    } else if (prompt.length > 4000) {
      issues.push('Prompt is too long (maximum 4000 characters)');
      score -= 20;
    }

    // Check for role definition
    if (!prompt.toLowerCase().includes('you are') && !prompt.toLowerCase().includes('your role')) {
      issues.push('Prompt lacks clear role definition');
      score -= 25;
    }

    // Check for guidelines or instructions
    if (!prompt.toLowerCase().includes('guideline') &&
        !prompt.toLowerCase().includes('instruction') &&
        !prompt.toLowerCase().includes('should') &&
        !prompt.toLowerCase().includes('must')) {
      issues.push('Prompt lacks specific guidelines or instructions');
      score -= 20;
    }

    // Check for constraints or boundaries
    if (!prompt.toLowerCase().includes('don\'t') &&
        !prompt.toLowerCase().includes('cannot') &&
        !prompt.toLowerCase().includes('not') &&
        !prompt.toLowerCase().includes('avoid')) {
      issues.push('Prompt lacks clear boundaries or constraints');
      score -= 15;
    }

    return {
      isValid: issues.length === 0,
      issues,
      score: Math.max(0, score)
    };
  }
}