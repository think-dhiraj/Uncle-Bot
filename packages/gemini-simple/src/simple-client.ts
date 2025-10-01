import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';

export interface SimpleGeminiMessage {
  role: 'user' | 'model';
  content: string;
}

export interface SimpleGeminiResponse {
  text: string;
  id?: string;
  createdAt?: string;
}

export class SimpleGeminiClient {
  private model: GenerativeModel;

  constructor(
    private projectId: string,
    private location: string = 'us-central1',
    private modelName: string = 'gemini-1.5-pro'
  ) {
    const vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });

    this.model = vertexAI.getGenerativeModel({
      model: modelName,
    });
  }

  async sendMessage(message: string): Promise<SimpleGeminiResponse> {
    try {
      const result = await this.model.generateContent(message);
      const response = await result.response;
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        text,
        id: `msg_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Failed to generate content: ${error}`);
    }
  }

  async sendMessages(messages: SimpleGeminiMessage[]): Promise<SimpleGeminiResponse> {
    try {
      // Convert messages to the format expected by Vertex AI
      const contents = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      const result = await this.model.generateContent({
        contents: contents as any, // Temporarily bypass type issues
      });

      const response = await result.response;
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        text,
        id: `msg_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Failed to generate content: ${error}`);
    }
  }
}
